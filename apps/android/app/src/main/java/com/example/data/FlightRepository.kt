package com.example.data

import android.content.Context
import android.util.Log
import com.example.data.cloud.CloudAlert
import com.example.data.cloud.CloudTrackedFlight
import com.example.data.cloud.CloudUserProfile
import com.example.data.cloud.toCloudSnapshot
import com.example.data.cloud.toJsonObject
import com.example.data.local.*
import com.example.data.remote.ApiConfig
import com.example.data.remote.DataSourceMode
import com.example.data.remote.aerodatabox.AeroDataBoxMapper
import com.example.data.remote.aerodatabox.AeroDataBoxNetworkClient
import com.example.data.remote.aerodatabox.FlightStateDiffer
import com.example.model.*
import com.example.data.supabase.CloudFlightSnapshot
import com.example.data.supabase.SupabaseClientProvider
import com.example.data.supabase.SupabaseUserRepository
import com.example.notifications.FlightNotificationManager
import com.example.notifications.FlightNotificationScheduler
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.status.SessionStatus
import kotlinx.coroutines.CoroutineScope
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

class FlightRepository(private val context: Context) {

    private val database = SkyTrackDatabase.getDatabase(context)
    private val flightDao = database.flightDao()
    private val repositoryScope = CoroutineScope(Dispatchers.IO)
    val scheduler = FlightNotificationScheduler(context)
    val weatherService = com.example.data.weather.DestinationWeatherService(context)
    val cloudRepository = SupabaseUserRepository()

    private val _flights = MutableStateFlow<List<Flight>>(MockFlightData.initialFlights)
    val flights: StateFlow<List<Flight>> = _flights.asStateFlow()

    private val _alerts = MutableStateFlow<List<FlightAlert>>(MockFlightData.sampleAlerts)
    val alerts: StateFlow<List<FlightAlert>> = _alerts.asStateFlow()

    private val _dataSourceMode = MutableStateFlow(
        ApiConfig.resolveInitialMode(isOffline = false)
    )
    val dataSourceMode: StateFlow<DataSourceMode> = _dataSourceMode.asStateFlow()

    private val _isLiveLoading = MutableStateFlow(false)
    val isLiveLoading: StateFlow<Boolean> = _isLiveLoading.asStateFlow()

    val scheduledNotifications: Flow<List<ScheduledNotificationEntity>> = scheduler.scheduledNotifications
    val recentSearches: Flow<List<RecentSearchEntity>> = flightDao.getRecentSearches()
    val trackedFlights: Flow<List<TrackedFlightEntity>> = flightDao.getAllTrackedFlights()

    private val _userAccount = MutableStateFlow(
        UserAccount(
            name = "Guest Aviator",
            email = "Sign in with Google to sync",
            avatarInitial = "G",
            isSignedIn = false,
            isOfflineMode = false,
            lastSyncTime = "Local Room Cache Active"
        )
    )
    val userAccount: StateFlow<UserAccount> = _userAccount.asStateFlow()

    init {
        FlightNotificationManager.createNotificationChannel(context)

        com.example.sync.FlightSyncManager.scheduleConnectivitySync(context)
        com.example.sync.FlightSyncManager.schedulePeriodicSync(context)
        com.example.sync.FlightSyncManager.registerConnectivityRestoredMonitor(context)

        repositoryScope.launch {
            cacheAllFlights(_flights.value)
            loadRoomFavorites()
            observeRoomAlerts()
            observeTrackedFlights()
            observeRoomCachedFlights()
        }

        setupSupabaseAuthObserver()

        // Smooth geodesic interpolation for airborne flights between network polls
        repositoryScope.launch {
            while (true) {
                delay(4000)
                updateLiveTelemetry()
            }
        }
    }

    /**
     * Queries the live AeroDataBox API for a flight number (e.g., "AA100", "BA 178")
     * when a valid API key is present and the app is online. Results are merged into
     * the Room Single Source of Truth cache and diffed for real-time status alerts.
     */
    suspend fun fetchLiveFlightByNumber(rawQuery: String): List<Flight> = withContext(Dispatchers.IO) {
        val cleaned = rawQuery.trim().replace(" ", "").replace("-", "")
        val flightNumberRegex = Regex("^[A-Za-z0-9]{2,3}[0-9]{1,4}[A-Za-z]?$")
        if (!flightNumberRegex.matches(cleaned)) {
            return@withContext emptyList()
        }

        if (_userAccount.value.isOfflineMode) {
            _dataSourceMode.value = DataSourceMode.OFFLINE_ROOM_CACHE
            return@withContext emptyList()
        }

        if (!ApiConfig.hasValidAeroDataBoxKey()) {
            _dataSourceMode.value = DataSourceMode.DEMO_CACHE_NO_KEY
            return@withContext emptyList()
        }

        _isLiveLoading.value = true
        try {
            val response = AeroDataBoxNetworkClient.apiService.getFlightByNumber(cleaned.uppercase(Locale.ROOT))
            when {
                response.code() == 429 -> {
                    _dataSourceMode.value = DataSourceMode.QUOTA_FALLBACK
                    emptyList()
                }
                response.isSuccessful && !response.body().isNullOrEmpty() -> {
                    _dataSourceMode.value = DataSourceMode.LIVE_AERODATABOX
                    val mappedFlights = response.body()!!.mapNotNull { dto ->
                        AeroDataBoxMapper.mapDtoToFlight(dto)
                    }
                    if (mappedFlights.isNotEmpty()) {
                        mergeAndCacheLiveFlights(mappedFlights)
                    }
                    mappedFlights
                }
                else -> emptyList()
            }
        } catch (e: Exception) {
            Log.d("FlightRepository", "AeroDataBox flight lookup fallback for $cleaned: ${e.message}")
            emptyList()
        } finally {
            _isLiveLoading.value = false
        }
    }

    /**
     * Queries the live AeroDataBox Airport FIDS endpoint (`/airports/iata/{code}/flights`)
     * for departures and arrivals at the selected airport hub.
     */
    suspend fun fetchLiveAirportBoard(airportCode: String): List<Flight> = withContext(Dispatchers.IO) {
        val code = airportCode.trim().uppercase(Locale.ROOT)
        if (code.length != 3) return@withContext emptyList()

        if (_userAccount.value.isOfflineMode) {
            _dataSourceMode.value = DataSourceMode.OFFLINE_ROOM_CACHE
            return@withContext emptyList()
        }

        if (!ApiConfig.hasValidAeroDataBoxKey()) {
            _dataSourceMode.value = DataSourceMode.DEMO_CACHE_NO_KEY
            return@withContext emptyList()
        }

        _isLiveLoading.value = true
        try {
            val response = AeroDataBoxNetworkClient.apiService.getAirportFlights(code)
            when {
                response.code() == 429 -> {
                    _dataSourceMode.value = DataSourceMode.QUOTA_FALLBACK
                    emptyList()
                }
                response.isSuccessful && response.body() != null -> {
                    _dataSourceMode.value = DataSourceMode.LIVE_AERODATABOX
                    val mappedFlights = AeroDataBoxMapper.mapFidsToFlights(code, response.body()!!)
                    if (mappedFlights.isNotEmpty()) {
                        mergeAndCacheLiveFlights(mappedFlights)
                    }
                    mappedFlights
                }
                else -> emptyList()
            }
        } catch (e: Exception) {
            Log.d("FlightRepository", "AeroDataBox FIDS lookup fallback for $code: ${e.message}")
            emptyList()
        } finally {
            _isLiveLoading.value = false
        }
    }

    private suspend fun mergeAndCacheLiveFlights(incomingFlights: List<Flight>) {
        val currentMap = _flights.value.associateBy {
            it.flightNumber.replace(" ", "").lowercase(Locale.ROOT)
        }.toMutableMap()

        for (incoming in incomingFlights) {
            val key = incoming.flightNumber.replace(" ", "").lowercase(Locale.ROOT)
            val existing = currentMap[key]
            if (existing != null) {
                if (existing.isTracked || existing.isFavorite) {
                    val alerts = FlightStateDiffer.diffFlights(existing, incoming)
                    alerts.forEach { alert -> addAlert(alert, triggerSystemPush = true) }
                }
                currentMap[key] = incoming.copy(
                    isFavorite = existing.isFavorite,
                    isTracked = existing.isTracked,
                    customNotes = existing.customNotes
                )
            } else {
                currentMap[key] = incoming
            }
        }

        val updatedList = currentMap.values.toList()
        _flights.value = updatedList
        cacheAllFlights(updatedList)
    }

    private fun setupSupabaseAuthObserver() {
        if (!cloudRepository.isAvailable) {
            setGuestAccount()
            return
        }

        repositoryScope.launch {
            SupabaseClientProvider.auth.sessionStatus.collect { status ->
                when (status) {
                    is SessionStatus.Authenticated -> {
                        val user = status.session.user
                        val metadataName = (user.userMetadata?.get("full_name") as? JsonPrimitive)?.content
                            ?: (user.userMetadata?.get("name") as? JsonPrimitive)?.content
                        val name = metadataName ?: ("Capt. " + (user.email?.substringBefore("@") ?: "Aviator"))
                        _userAccount.value = UserAccount(
                            name = name,
                            email = user.email ?: "pilot@aviation.aero",
                            avatarInitial = (name.firstOrNull() ?: 'A').uppercaseChar().toString(),
                            isSignedIn = true,
                            isOfflineMode = _userAccount.value.isOfflineMode,
                            lastSyncTime = "Cloud Sync Active (Supabase)"
                        )
                        cloudRepository.saveUserProfile(
                            CloudUserProfile(
                                id = user.id,
                                userId = user.id,
                                displayName = name,
                                email = user.email ?: "",
                                photoUrl = (user.userMetadata?.get("avatar_url") as? JsonPrimitive)?.content ?: ""
                            )
                        )
                        syncFavoritesToCloud(user.id)
                        syncCloudTrackingToLocal(user.id)
                    }

                    is SessionStatus.NotAuthenticated -> setGuestAccount()
                    else -> Unit
                }
            }
        }
    }

    private fun setGuestAccount() {
        _userAccount.value = UserAccount(
            name = "Guest Aviator",
            email = "Sign in with Google to sync",
            avatarInitial = "G",
            isSignedIn = false,
            isOfflineMode = _userAccount.value.isOfflineMode,
            lastSyncTime = "Local Room Cache Active"
        )
    }

    private suspend fun syncFavoritesToCloud(userId: String) {
        _flights.value.filter { it.isFavorite || it.isTracked }.forEach { flight ->
            cloudRepository.saveTrackedFlight(
                CloudTrackedFlight(
                    id = flight.id,
                    userId = userId,
                    flightNumber = flight.flightNumber,
                    airline = flight.airline,
                    originCode = flight.origin.code,
                    destCode = flight.destination.code,
                    status = flight.status.name,
                    customNotes = flight.customNotes,
                    isFavorite = flight.isFavorite
                ),
                snapshot = flight.toCloudSnapshot().toJsonObject()
            )
        }
    }

    private suspend fun syncCloudTrackingToLocal(userId: String) {
        val remoteRows = cloudRepository.fetchTrackedFlights().getOrNull().orEmpty()
        val remoteFlights = remoteRows.mapNotNull { row ->
            row.snapshot?.let { snapshot ->
                runCatching {
                    Json.decodeFromJsonElement<CloudFlightSnapshot>(snapshot).toFlight()
                }.getOrNull()
            }?.copy(
                isFavorite = row.isFavorite,
                isTracked = true,
                customNotes = row.customNotes
            )
        }
        if (remoteFlights.isNotEmpty()) {
            val merged = _flights.value.toMutableList()
            remoteFlights.forEach { remote ->
                val index = merged.indexOfFirst {
                    it.id == remote.id || it.flightNumber.equals(remote.flightNumber, ignoreCase = true)
                }
                if (index >= 0) {
                    merged[index] = merged[index].copy(
                        isFavorite = remote.isFavorite || merged[index].isFavorite,
                        isTracked = true,
                        customNotes = remote.customNotes.ifBlank { merged[index].customNotes }
                    )
                } else {
                    merged.add(remote)
                }
            }
            _flights.value = merged
            cacheAllFlights(remoteFlights)
        }

        cloudRepository.fetchAlerts().getOrNull().orEmpty().forEach { alert ->
            flightDao.insertAlert(
                FlightAlertEntity(
                    id = alert.id,
                    flightNumber = alert.flightNumber,
                    type = alert.alertType,
                    title = alert.title,
                    message = alert.message,
                    timestamp = alert.timestamp.ifBlank { "Recently" },
                    isRead = alert.isRead
                )
            )
        }
    }

    private suspend fun cacheAllFlights(flightList: List<Flight>) {
        val entities = flightList.map { flight ->
            CachedFlightEntity(
                id = flight.id,
                flightNumber = flight.flightNumber,
                airline = flight.airline,
                airlineCode = flight.airlineCode,
                originCode = flight.origin.code,
                originCity = flight.origin.city,
                originName = flight.origin.name,
                destCode = flight.destination.code,
                destCity = flight.destination.city,
                destName = flight.destination.name,
                departureTimeScheduled = flight.departureTimeScheduled,
                departureTimeEstimated = flight.departureTimeEstimated,
                arrivalTimeScheduled = flight.arrivalTimeScheduled,
                arrivalTimeEstimated = flight.arrivalTimeEstimated,
                status = flight.status.name,
                statusNote = flight.statusNote,
                delayMinutes = flight.delayMinutes,
                delayReason = flight.delayReason,
                terminalDeparture = flight.terminalDeparture,
                gateDeparture = flight.gateDeparture,
                checkInCounter = flight.checkInCounter,
                terminalArrival = flight.terminalArrival,
                gateArrival = flight.gateArrival,
                baggageCarousel = flight.baggageCarousel,
                aircraftModel = flight.aircraft.model,
                aircraftRegistration = flight.aircraft.registration,
                altitudeFeet = flight.telemetry.altitudeFeet,
                groundSpeedKnots = flight.telemetry.groundSpeedKnots,
                headingDegrees = flight.telemetry.headingDegrees,
                progressPercent = flight.telemetry.progressPercent,
                isFavorite = flight.isFavorite,
                customNotes = flight.customNotes
            )
        }
        flightDao.insertFlights(entities)
    }

    private suspend fun loadRoomFavorites() {
        flightDao.getAllFavorites().collect { favorites ->
            val favMap = favorites.associateBy({ it.flightNumber }, { it.customNotes })
            _flights.value = _flights.value.map { flight ->
                if (favMap.containsKey(flight.flightNumber)) {
                    flight.copy(isFavorite = true, customNotes = favMap[flight.flightNumber] ?: flight.customNotes)
                } else {
                    flight
                }
            }
        }
    }

    private suspend fun observeRoomAlerts() {
        flightDao.getAllAlerts().collect { alertEntities ->
            if (alertEntities.isNotEmpty()) {
                val mapped = alertEntities.map { entity ->
                    val type = try {
                        AlertType.valueOf(entity.type)
                    } catch (e: Exception) {
                        AlertType.GATE_CHANGE
                    }
                    FlightAlert(
                        id = entity.id,
                        flightNumber = entity.flightNumber,
                        type = type,
                        title = entity.title,
                        message = entity.message,
                        timestamp = entity.timestamp,
                        isRead = entity.isRead
                    )
                }
                val existingIds = mapped.map { it.id }.toSet()
                val merged = mapped + _alerts.value.filter { it.id !in existingIds }
                _alerts.value = merged
            }
        }
    }

    private suspend fun observeTrackedFlights() {
        flightDao.getAllTrackedFlights().collect { trackedList ->
            val trackedMap = trackedList.associateBy({ it.flightNumber.replace(" ", "").lowercase() }, { it.notes })
            _flights.value = _flights.value.map { flight ->
                val key = flight.flightNumber.replace(" ", "").lowercase()
                val isTracked = trackedMap.containsKey(key)
                flight.copy(
                    isTracked = isTracked,
                    customNotes = if (isTracked && trackedMap[key]?.isNotBlank() == true) trackedMap[key]!! else flight.customNotes
                )
            }
        }
    }

    private suspend fun observeRoomCachedFlights() {
        flightDao.getAllCachedFlights().collect { cachedList ->
            if (cachedList.isNotEmpty()) {
                val currentFlights = _flights.value
                val updated = cachedList.map { entity ->
                    val existing = currentFlights.find { it.flightNumber.equals(entity.flightNumber, ignoreCase = true) }
                        ?: MockFlightData.initialFlights.find { it.flightNumber.equals(entity.flightNumber, ignoreCase = true) }

                    val originAirport = MockFlightData.getAirport(entity.originCode).let { base ->
                        if (base.code.equals(entity.originCode, ignoreCase = true)) base
                        else base.copy(code = entity.originCode, city = entity.originCity, name = entity.originName)
                    }
                    val destAirport = MockFlightData.getAirport(entity.destCode).let { base ->
                        if (base.code.equals(entity.destCode, ignoreCase = true)) base
                        else base.copy(code = entity.destCode, city = entity.destCity, name = entity.destName)
                    }

                    val parsedStatus = try {
                        FlightStatus.valueOf(entity.status)
                    } catch (_: Exception) {
                        existing?.status ?: FlightStatus.SCHEDULED
                    }

                    val template = existing ?: currentFlights.first()

                    template.copy(
                        id = entity.id,
                        flightNumber = entity.flightNumber,
                        airline = entity.airline,
                        airlineCode = entity.airlineCode,
                        origin = originAirport,
                        destination = destAirport,
                        departureTimeScheduled = entity.departureTimeScheduled,
                        departureTimeEstimated = entity.departureTimeEstimated,
                        arrivalTimeScheduled = entity.arrivalTimeScheduled,
                        arrivalTimeEstimated = entity.arrivalTimeEstimated,
                        status = parsedStatus,
                        statusNote = entity.statusNote,
                        delayMinutes = entity.delayMinutes,
                        delayReason = entity.delayReason,
                        terminalDeparture = entity.terminalDeparture,
                        gateDeparture = entity.gateDeparture,
                        checkInCounter = entity.checkInCounter,
                        terminalArrival = entity.terminalArrival,
                        gateArrival = entity.gateArrival,
                        baggageCarousel = entity.baggageCarousel,
                        aircraft = template.aircraft.copy(
                            model = entity.aircraftModel,
                            registration = entity.aircraftRegistration
                        ),
                        telemetry = template.telemetry.copy(
                            altitudeFeet = entity.altitudeFeet,
                            groundSpeedKnots = entity.groundSpeedKnots,
                            headingDegrees = entity.headingDegrees,
                            progressPercent = entity.progressPercent
                        ),
                        isFavorite = entity.isFavorite || (existing?.isFavorite == true),
                        customNotes = entity.customNotes.ifBlank { existing?.customNotes ?: "" }
                    )
                }
                _flights.value = updated
            }
        }
    }

    private fun updateLiveTelemetry() {
        _flights.value = _flights.value.map { flight ->
            if (flight.status == FlightStatus.DEPARTED) {
                val currentProgress = flight.telemetry.progressPercent
                val newProgress = if (currentProgress >= 0.99f) 0.99f else (currentProgress + 0.003f)
                val newDistCovered = (flight.telemetry.distanceCoveredNm + 4)
                val newDistRemaining = maxOf(0, flight.telemetry.distanceRemainingNm - 4)
                val speedJitter = (-5..5).random()
                val newSpeed = (flight.telemetry.groundSpeedKnots + speedJitter).coerceIn(480, 565)
                val etaMinutes = maxOf(1, (newDistRemaining / (newSpeed / 60.0)).toInt())

                val dLat = (flight.destination.latitude - flight.origin.latitude) * 0.003
                val dLon = (flight.destination.longitude - flight.origin.longitude) * 0.003

                val updatedTelemetry = flight.telemetry.copy(
                    currentLatitude = flight.telemetry.currentLatitude + dLat,
                    currentLongitude = flight.telemetry.currentLongitude + dLon,
                    progressPercent = newProgress,
                    groundSpeedKnots = newSpeed,
                    distanceCoveredNm = newDistCovered,
                    distanceRemainingNm = newDistRemaining,
                    etaMinutesRemaining = etaMinutes
                )
                flight.copy(telemetry = updatedTelemetry)
            } else {
                flight
            }
        }
    }

    fun toggleFavorite(flightNumber: String, customNotes: String = "") {
        val current = _flights.value
        val flight = current.find { it.flightNumber.equals(flightNumber, ignoreCase = true) } ?: return
        val newFav = !flight.isFavorite

        _flights.value = current.map {
            if (it.flightNumber.equals(flightNumber, ignoreCase = true)) {
                it.copy(isFavorite = newFav, customNotes = customNotes.ifBlank { it.customNotes })
            } else it
        }

        repositoryScope.launch {
            if (newFav) {
                subscribeToFlightPush(flightNumber)
                flightDao.addFavorite(
                    FavoriteFlightEntity(
                        flightNumber = flightNumber,
                        customNotes = customNotes
                    )
                )
                val userId = cloudRepository.currentUserId()
                if (userId != null) {
                    cloudRepository.saveTrackedFlight(
                        CloudTrackedFlight(
                            id = flight.id,
                            userId = userId ?: "",
                            flightNumber = flight.flightNumber,
                            airline = flight.airline,
                            originCode = flight.origin.code,
                            destCode = flight.destination.code,
                            status = flight.status.name,
                            customNotes = customNotes.ifBlank { flight.customNotes },
                            isFavorite = true
                        )
                    )
                }
                addAlert(
                    FlightAlert(
                        id = UUID.randomUUID().toString(),
                        flightNumber = flightNumber,
                        type = AlertType.BOARDING,
                        title = "Saved to Watchlist: $flightNumber",
                        message = "FCM push alerts enabled for gate changes, delays, and boarding calls for $flightNumber.",
                        timestamp = "Just now",
                        isRead = false
                    ),
                    triggerSystemPush = true
                )
            } else {
                unsubscribeFromFlightPush(flightNumber)
                flightDao.removeFavorite(flightNumber)
                val userId = cloudRepository.currentUserId()
                if (userId != null) {
                    if (!flight.isTracked) {
                        cloudRepository.deleteTrackedFlight(flight.id)
                    } else {
                        cloudRepository.saveTrackedFlight(
                            CloudTrackedFlight(
                                id = flight.id,
                                userId = userId ?: "",
                                flightNumber = flight.flightNumber,
                                airline = flight.airline,
                                originCode = flight.origin.code,
                                destCode = flight.destination.code,
                                status = flight.status.name,
                                customNotes = flight.customNotes,
                                isFavorite = false
                            )
                        )
                    }
                }
            }
        }
    }

    fun updateFlightNotes(flightNumber: String, notes: String) {
        _flights.value = _flights.value.map {
            if (it.flightNumber.equals(flightNumber, ignoreCase = true)) {
                it.copy(customNotes = notes)
            } else it
        }
        repositoryScope.launch {
            flightDao.addFavorite(
                FavoriteFlightEntity(
                    flightNumber = flightNumber,
                    customNotes = notes
                )
            )
            val userId = cloudRepository.currentUserId()
            val flight = _flights.value.find { it.flightNumber.equals(flightNumber, ignoreCase = true) }
            if (user != null && flight != null) {
                cloudRepository.saveTrackedFlight(
                    CloudTrackedFlight(
                        id = flight.id,
                        userId = userId ?: "",
                        flightNumber = flight.flightNumber,
                        airline = flight.airline,
                        originCode = flight.origin.code,
                        destCode = flight.destination.code,
                        status = flight.status.name,
                        customNotes = notes,
                        isFavorite = flight.isFavorite
                    )
                )
            }
        }
    }

    fun toggleTrackFlight(flight: Flight, customNotes: String = "") {
        val willBeTracked = !flight.isTracked
        _flights.value = _flights.value.map {
            if (it.flightNumber.equals(flight.flightNumber, ignoreCase = true)) {
                it.copy(isTracked = willBeTracked)
            } else it
        }

        repositoryScope.launch {
            if (willBeTracked) {
                subscribeToFlightPush(flight.flightNumber)
                val entity = TrackedFlightEntity(
                    flightNumber = flight.flightNumber,
                    airline = flight.airline,
                    airlineCode = flight.airlineCode,
                    originCode = flight.origin.code,
                    originCity = flight.origin.city,
                    destCode = flight.destination.code,
                    destCity = flight.destination.city,
                    departureTimeScheduled = flight.departureTimeScheduled,
                    arrivalTimeScheduled = flight.arrivalTimeScheduled,
                    status = flight.status.name,
                    terminalGate = "T${flight.terminalDeparture} Â· ${flight.gateDeparture}",
                    trackedSinceMillis = System.currentTimeMillis(),
                    notes = customNotes,
                    isAutoAlertEnabled = true
                )
                flightDao.insertTrackedFlight(entity)
                val userId = cloudRepository.currentUserId()
                if (userId != null) {
                    cloudRepository.saveTrackedFlight(
                        CloudTrackedFlight(
                            id = flight.id,
                            userId = userId ?: "",
                            flightNumber = flight.flightNumber,
                            airline = flight.airline,
                            originCode = flight.origin.code,
                            destCode = flight.destination.code,
                            status = flight.status.name,
                            customNotes = customNotes,
                            isFavorite = flight.isFavorite
                        )
                    )
                }
                addAlert(
                    FlightAlert(
                        id = UUID.randomUUID().toString(),
                        flightNumber = flight.flightNumber,
                        type = AlertType.BOARDING,
                        title = "Saved to Room Tracking: ${flight.flightNumber}",
                        message = "Flight ${flight.flightNumber} (${flight.origin.code} âž” ${flight.destination.code}) saved to local Room database for tracking. FCM push alerts active.",
                        timestamp = "Just now",
                        isRead = false
                    ),
                    triggerSystemPush = true
                )
            } else {
                unsubscribeFromFlightPush(flight.flightNumber)
                flightDao.deleteTrackedFlight(flight.flightNumber)
                val userId = cloudRepository.currentUserId()
                if (userId != null) {
                    if (!flight.isFavorite) {
                        cloudRepository.deleteTrackedFlight(flight.id)
                    } else {
                        cloudRepository.saveTrackedFlight(
                            CloudTrackedFlight(
                                id = flight.id,
                                userId = userId ?: "",
                                flightNumber = flight.flightNumber,
                                airline = flight.airline,
                                originCode = flight.origin.code,
                                destCode = flight.destination.code,
                                status = flight.status.name,
                                customNotes = "",
                                isFavorite = true
                            )
                        )
                    }
                }
            }
        }
    }

    fun deleteTrackedFlight(flightNumber: String) {
        _flights.value = _flights.value.map {
            if (it.flightNumber.equals(flightNumber, ignoreCase = true)) {
                it.copy(isTracked = false)
            } else it
        }
        repositoryScope.launch {
            unsubscribeFromFlightPush(flightNumber)
            flightDao.deleteTrackedFlight(flightNumber)
        }
    }

    fun getFlightById(id: String): Flight? {
        return _flights.value.find { it.id.equals(id, ignoreCase = true) || it.flightNumber.replace(" ", "").equals(id.replace(" ", ""), ignoreCase = true) }
    }

    fun searchFlights(query: String, statusFilter: FlightStatus? = null): List<Flight> {
        val q = query.trim().lowercase(Locale.ROOT)
        return _flights.value.filter { flight ->
            val matchesQuery = if (q.isEmpty()) {
                true
            } else {
                flight.flightNumber.lowercase(Locale.ROOT).contains(q) ||
                    flight.airline.lowercase(Locale.ROOT).contains(q) ||
                    flight.airlineCode.lowercase(Locale.ROOT).contains(q) ||
                    flight.origin.code.lowercase(Locale.ROOT).contains(q) ||
                    flight.origin.city.lowercase(Locale.ROOT).contains(q) ||
                    flight.destination.code.lowercase(Locale.ROOT).contains(q) ||
                    flight.destination.city.lowercase(Locale.ROOT).contains(q) ||
                    flight.aircraft.model.lowercase(Locale.ROOT).contains(q) ||
                    flight.aircraft.registration.lowercase(Locale.ROOT).contains(q)
            }

            val matchesStatus = statusFilter == null || flight.status == statusFilter
            matchesQuery && matchesStatus
        }
    }

    fun getAirportFlights(airportCode: String, isDeparture: Boolean): List<Flight> {
        return _flights.value.filter { flight ->
            if (isDeparture) {
                flight.origin.code.equals(airportCode, ignoreCase = true)
            } else {
                flight.destination.code.equals(airportCode, ignoreCase = true)
            }
        }
    }

    fun addAlert(alert: FlightAlert, triggerSystemPush: Boolean = true) {
        val updated = listOf(alert) + _alerts.value.filter { it.id != alert.id }
        _alerts.value = updated

        repositoryScope.launch {
            flightDao.insertAlert(
                FlightAlertEntity(
                    id = alert.id,
                    flightNumber = alert.flightNumber,
                    type = alert.type.name,
                    title = alert.title,
                    message = alert.message,
                    timestamp = alert.timestamp,
                    isRead = alert.isRead
                )
            )
            val userId = cloudRepository.currentUserId()
            if (userId != null) {
                cloudRepository.saveAlert(
                    CloudAlert(
                        id = alert.id,
                        userId = userId ?: "",
                        flightNumber = alert.flightNumber,
                        alertType = alert.type.name,
                        title = alert.title,
                        message = alert.message,
                        isRead = alert.isRead
                    )
                )
            }
        }

        if (triggerSystemPush) {
            val notificationId = (alert.flightNumber + alert.id).hashCode()
            FlightNotificationManager.showFlightAlertNotification(
                context = context,
                notificationId = notificationId,
                flightNumber = alert.flightNumber,
                type = alert.type,
                title = alert.title,
                message = alert.message
            )
        }
    }

    fun markAlertRead(alertId: String) {
        _alerts.value = _alerts.value.map {
            if (it.id == alertId) it.copy(isRead = true) else it
        }
        repositoryScope.launch {
            flightDao.markAlertRead(alertId)
            val userId = cloudRepository.currentUserId()
            if (userId != null) {
                cloudRepository.markAlertRead(alertId)
            }
        }
    }

    fun markAllAlertsRead() {
        _alerts.value = _alerts.value.map { it.copy(isRead = true) }
        repositoryScope.launch {
            flightDao.markAllAlertsRead()
        }
    }

    // Diagnostic Trigger: Test real-time alert notification pipeline
    fun simulateRealtimeEvent(flightNumber: String, eventType: AlertType) {
        val flight = _flights.value.find { it.flightNumber.equals(flightNumber, ignoreCase = true) } ?: return

        when (eventType) {
            AlertType.GATE_CHANGE -> {
                val newGate = "Gate B" + (10..45).random()
                _flights.value = _flights.value.map {
                    if (it.flightNumber == flightNumber) it.copy(gateDeparture = newGate) else it
                }
                repositoryScope.launch {
                    flightDao.updateFlightGate(flightNumber, newGate)
                }
                addAlert(
                    FlightAlert(
                        id = UUID.randomUUID().toString(),
                        flightNumber = flightNumber,
                        type = AlertType.GATE_CHANGE,
                        title = "Gate Change: $flightNumber",
                        message = "${flight.airline} $flightNumber gate changed to $newGate (Terminal ${flight.terminalDeparture}). Please proceed promptly.",
                        timestamp = "Just now",
                        isRead = false
                    ),
                    triggerSystemPush = true
                )
            }
            AlertType.DELAY -> {
                val extraMinutes = listOf(20, 35, 50).random()
                _flights.value = _flights.value.map {
                    if (it.flightNumber == flightNumber) {
                        it.copy(
                            status = FlightStatus.DELAYED,
                            delayMinutes = extraMinutes,
                            delayReason = "ATC Flow Restriction & Thunderstorms",
                            statusNote = "Delayed $extraMinutes mins Â· ATC flow management"
                        )
                    } else it
                }
                repositoryScope.launch {
                    flightDao.updateFlightDelay(
                        flightNumber = flightNumber,
                        status = "DELAYED",
                        delayMinutes = extraMinutes,
                        delayReason = "ATC Flow Restriction & Thunderstorms",
                        statusNote = "Delayed $extraMinutes mins Â· ATC flow management"
                    )
                }
                addAlert(
                    FlightAlert(
                        id = UUID.randomUUID().toString(),
                        flightNumber = flightNumber,
                        type = AlertType.DELAY,
                        title = "Schedule Delay Alert: $flightNumber",
                        message = "Flight $flightNumber has been delayed by $extraMinutes minutes due to air traffic control metering.",
                        timestamp = "Just now",
                        isRead = false
                    ),
                    triggerSystemPush = true
                )
            }
            AlertType.BOARDING -> {
                _flights.value = _flights.value.map {
                    if (it.flightNumber == flightNumber) {
                        it.copy(
                            status = FlightStatus.BOARDING,
                            statusNote = "Boarding Group 1 & 2 Â· Gate ${it.gateDeparture}"
                        )
                    } else it
                }
                repositoryScope.launch {
                    flightDao.updateFlightStatus(
                        flightNumber = flightNumber,
                        status = "BOARDING",
                        statusNote = "Boarding Group 1 & 2 Â· Gate ${flight.gateDeparture}"
                    )
                }
                addAlert(
                    FlightAlert(
                        id = UUID.randomUUID().toString(),
                        flightNumber = flightNumber,
                        type = AlertType.BOARDING,
                        title = "Boarding Now: $flightNumber",
                        message = "Priority boarding has commenced for ${flight.airline} $flightNumber at ${flight.gateDeparture}.",
                        timestamp = "Just now",
                        isRead = false
                    ),
                    triggerSystemPush = true
                )
            }
            AlertType.BAGGAGE -> {
                val carousel = "Carousel " + (1..12).random()
                _flights.value = _flights.value.map {
                    if (it.flightNumber == flightNumber) it.copy(baggageCarousel = carousel) else it
                }
                addAlert(
                    FlightAlert(
                        id = UUID.randomUUID().toString(),
                        flightNumber = flightNumber,
                        type = AlertType.BAGGAGE,
                        title = "Baggage Claim Update: $flightNumber",
                        message = "Luggage for $flightNumber is now arriving on $carousel at ${flight.destination.code}.",
                        timestamp = "Just now",
                        isRead = false
                    ),
                    triggerSystemPush = true
                )
            }
            AlertType.CANCELLATION -> {
                _flights.value = _flights.value.map {
                    if (it.flightNumber == flightNumber) {
                        it.copy(
                            status = FlightStatus.CANCELLED,
                            statusNote = "Cancelled Â· Technical Inspection Required",
                            delayReason = "Aircraft Maintenance"
                        )
                    } else it
                }
                repositoryScope.launch {
                    flightDao.updateFlightStatus(
                        flightNumber = flightNumber,
                        status = "CANCELLED",
                        statusNote = "Cancelled Â· Technical Inspection Required"
                    )
                }
                addAlert(
                    FlightAlert(
                        id = UUID.randomUUID().toString(),
                        flightNumber = flightNumber,
                        type = AlertType.CANCELLATION,
                        title = "Flight Cancelled: $flightNumber",
                        message = "We regret to inform you that $flightNumber has been cancelled. Automated rebooking options are ready in the app.",
                        timestamp = "Just now",
                        isRead = false
                    ),
                    triggerSystemPush = true
                )
            }
        }
    }

    fun scheduleAlert(
        flightNumber: String,
        type: AlertType,
        title: String,
        message: String,
        delaySeconds: Int
    ): String {
        return scheduler.scheduleAlert(flightNumber, type, title, message, delaySeconds)
    }

    fun cancelSchedule(scheduleId: String) {
        scheduler.cancelSchedule(scheduleId)
    }

    fun deleteSchedule(scheduleId: String) {
        scheduler.deleteSchedule(scheduleId)
    }

    // Push delivery is wired in the notification phase; keep the existing UI contract.
    fun subscribeToFlightPush(flightNumber: String) = Unit

    fun unsubscribeFromFlightPush(flightNumber: String) = Unit

    fun getFcmToken(): String =
        context.getSharedPreferences("skytrack_prefs", Context.MODE_PRIVATE)
            .getString("fcm_token", "")
            .orEmpty()

    fun updateAccount(account: UserAccount) {
        _userAccount.value = account
    }

    fun toggleOfflineMode() {
        val current = _userAccount.value
        val willBeOffline = !current.isOfflineMode
        val updated = current.copy(
            isOfflineMode = willBeOffline,
            lastSyncTime = if (willBeOffline) "Offline Mode (Local Cache Active)" else "Connected (WorkManager Sync Active)"
        )
        _userAccount.value = updated
        _dataSourceMode.value = ApiConfig.resolveInitialMode(isOffline = willBeOffline)

        if (!willBeOffline) {
            com.example.sync.FlightSyncManager.enqueueImmediateSync(context)
        }
    }

    fun triggerBackgroundSync() {
        com.example.sync.FlightSyncManager.enqueueImmediateSync(context)
    }

    fun getLastSyncTimeString(): String = com.example.sync.FlightSyncManager.getLastSyncTimeString(context)

    fun getLastSyncStatus(): String = com.example.sync.FlightSyncManager.getLastSyncStatus(context)

    fun getLastSyncCount(): Int = com.example.sync.FlightSyncManager.getLastSyncCount(context)

    suspend fun getDestinationWeather(airport: Airport, arrivalTime: String): DestinationArrivalForecast {
        return weatherService.getDestinationForecast(airport, arrivalTime)
    }

    fun observeDestinationWeather(airportCode: String): Flow<DestinationArrivalForecast?> {
        return weatherService.observeDestinationWeather(airportCode)
    }

    fun saveRecentSearch(flight: Flight) {
        repositoryScope.launch {
            flightDao.insertRecentSearch(
                RecentSearchEntity(
                    flightNumber = flight.flightNumber,
                    airline = flight.airline,
                    originCode = flight.origin.code,
                    originCity = flight.origin.city,
                    destCode = flight.destination.code,
                    destCity = flight.destination.city,
                    status = flight.status.name,
                    searchTimestamp = System.currentTimeMillis()
                )
            )
            flightDao.trimRecentSearches()
        }
    }

    fun deleteRecentSearch(flightNumber: String) {
        repositoryScope.launch {
            flightDao.deleteRecentSearch(flightNumber)
        }
    }

    fun clearRecentSearches() {
        repositoryScope.launch {
            flightDao.clearRecentSearches()
        }
    }

    fun refreshAll() {
        val timeStr = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date())
        _userAccount.value = _userAccount.value.copy(lastSyncTime = "Synced at $timeStr")
        repositoryScope.launch {
            if (!_userAccount.value.isOfflineMode && ApiConfig.hasValidAeroDataBoxKey()) {
                val trackedNumbers = _flights.value.filter { it.isTracked || it.isFavorite }.map { it.flightNumber }.take(5)
                trackedNumbers.forEach { num -> fetchLiveFlightByNumber(num) }
            }
            cacheAllFlights(_flights.value)
        }
        com.example.sync.FlightSyncManager.enqueueImmediateSync(context)
    }
}

