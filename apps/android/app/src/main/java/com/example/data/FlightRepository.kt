package com.example.data

import android.content.Context
import android.util.Log
import com.example.data.cloud.CloudAlert
import com.example.data.cloud.CloudPlanState
import com.example.data.cloud.CloudTrackedFlight
import com.example.data.cloud.CloudUserProfile
import com.example.data.cloud.toCloudSnapshot
import com.example.data.cloud.toFlight
import com.example.data.cloud.toJsonObject
import com.example.data.MockFlightData
import com.example.data.local.*
import com.example.data.remote.ApiConfig
import com.example.data.remote.DataSourceMode
import com.example.data.remote.gateway.GatewayNetworkClient
import com.example.data.remote.gateway.toDomainFlight
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

    private val _flights = MutableStateFlow<List<Flight>>(emptyList())
    val flights: StateFlow<List<Flight>> = _flights.asStateFlow()

    private val _alerts = MutableStateFlow<List<FlightAlert>>(emptyList())
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

    private val _planState = MutableStateFlow(CloudPlanState())
    val planState: StateFlow<CloudPlanState> = _planState.asStateFlow()

    /** Number of currently watchlisted flights (single unified concept). */
    val watchlistCount: Int
        get() = _flights.value.count { it.isWatchlisted }

    init {
        FlightNotificationManager.createNotificationChannel(context)

        com.example.sync.FlightSyncManager.scheduleConnectivitySync(context)
        com.example.sync.FlightSyncManager.schedulePeriodicSync(context)
        com.example.sync.FlightSyncManager.registerConnectivityRestoredMonitor(context)

        repositoryScope.launch {
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

        if (!ApiConfig.isGatewayConfigured) {
            _dataSourceMode.value = DataSourceMode.DEMO_CACHE_NO_KEY
            return@withContext emptyList()
        }

        _isLiveLoading.value = true
        try {
            val response = GatewayNetworkClient.apiService.lookupFlight(cleaned.uppercase(Locale.ROOT))
            when {
                response.code() == 429 -> {
                    _dataSourceMode.value = DataSourceMode.QUOTA_FALLBACK
                    emptyList()
                }
                response.isSuccessful -> {
                    _dataSourceMode.value = DataSourceMode.LIVE_AERODATABOX
                    val mappedFlights = response.body()?.flights.orEmpty().mapNotNull { it.toDomainFlight() }
                    if (mappedFlights.isNotEmpty()) {
                        mergeAndCacheLiveFlights(mappedFlights)
                    }
                    mappedFlights
                }
                else -> emptyList()
            }
        } catch (e: Exception) {
            Log.d("FlightRepository", "Gateway flight lookup fallback for $cleaned: ${e.message}")
            emptyList()
        } finally {
            _isLiveLoading.value = false
        }
    }

    /**
     * Queries the live AeroDataBox Airport FIDS endpoint (`/flights/airports/iata/{code}`)
     * for departures and arrivals at the selected airport hub.
     */
    suspend fun fetchLiveAirportBoard(airportCode: String): List<Flight> = withContext(Dispatchers.IO) {
        val code = airportCode.trim().uppercase(Locale.ROOT)
        if (code.length != 3) return@withContext emptyList()

        if (_userAccount.value.isOfflineMode) {
            _dataSourceMode.value = DataSourceMode.OFFLINE_ROOM_CACHE
            return@withContext emptyList()
        }

        if (!ApiConfig.isGatewayConfigured) {
            _dataSourceMode.value = DataSourceMode.DEMO_CACHE_NO_KEY
            return@withContext emptyList()
        }

        _isLiveLoading.value = true
        try {
            val response = GatewayNetworkClient.apiService.getAirportFlights(code)
            when {
                response.code() == 429 -> {
                    _dataSourceMode.value = DataSourceMode.QUOTA_FALLBACK
                    emptyList()
                }
                response.isSuccessful -> {
                    _dataSourceMode.value = DataSourceMode.LIVE_AERODATABOX
                    val mappedFlights = response.body()?.flights.orEmpty().mapNotNull { it.toDomainFlight() }
                    if (mappedFlights.isNotEmpty()) {
                        mergeAndCacheLiveFlights(mappedFlights)
                    }
                    mappedFlights
                }
                else -> emptyList()
            }
        } catch (e: Exception) {
            Log.d("FlightRepository", "Gateway FIDS lookup fallback for $code: ${e.message}")
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
                        val user = status.session.user ?: return@collect
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
                        cloudRepository.fetchPlan().onSuccess { plan ->
                            _planState.value = plan
                        }.onFailure {
                            _planState.value = CloudPlanState(plan = "FREE", concurrentLimit = 3)
                        }
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
        _flights.value.filter { it.isWatchlisted }.forEach { flight ->
            cloudRepository.saveWatchlistItem(
                CloudTrackedFlight(
                    id = flight.id,
                    flightDate = flight.flightDate,
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
        val remoteRows = cloudRepository.fetchWatchlistItems().getOrNull().orEmpty()
        val remoteFlights = remoteRows.mapNotNull { row ->
            row.snapshot?.let { snapshot ->
                runCatching {
                    Json.decodeFromJsonElement<CloudFlightSnapshot>(snapshot).toFlight()
                }.getOrNull()
            }?.copy(
                isFavorite = true,
                isTracked = true,
                customNotes = row.notes
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
                val updated = cachedList.map { entity ->
                    val parsedStatus = try {
                        FlightStatus.valueOf(entity.status)
                    } catch (_: Exception) {
                        FlightStatus.SCHEDULED
                    }

                    // Home airports fall back to neutral coordinates when no
                    // cached reference exists (mock data is never reloaded).
                    val baseOrigin = MockFlightData.getAirport(entity.originCode)
                    val baseDest = MockFlightData.getAirport(entity.destCode)

                    Flight(
                        id = entity.id,
                        flightNumber = entity.flightNumber,
                        airline = entity.airline,
                        airlineCode = entity.airlineCode,
                        origin = Airport(
                            code = entity.originCode,
                            name = entity.originName,
                            city = entity.originCity,
                            country = baseOrigin.country,
                            timezone = baseOrigin.timezone,
                            latitude = baseOrigin.latitude,
                            longitude = baseOrigin.longitude,
                            weather = baseOrigin.weather
                        ),
                        destination = Airport(
                            code = entity.destCode,
                            name = entity.destName,
                            city = entity.destCity,
                            country = baseDest.country,
                            timezone = baseDest.timezone,
                            latitude = baseDest.latitude,
                            longitude = baseDest.longitude,
                            weather = baseDest.weather
                        ),
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
                        aircraft = AircraftInfo(
                            model = entity.aircraftModel,
                            registration = entity.aircraftRegistration,
                            age = "Not reported",
                            wifiAvailable = false,
                            powerOutlets = false,
                            seatLayout = "Not reported by the live feed"
                        ),
                        telemetry = FlightTelemetry(
                            currentLatitude = baseOrigin.latitude,
                            currentLongitude = baseOrigin.longitude,
                            altitudeFeet = entity.altitudeFeet,
                            groundSpeedKnots = entity.groundSpeedKnots,
                            headingDegrees = entity.headingDegrees,
                            verticalSpeedFpm = 0,
                            mach = 0.0,
                            progressPercent = entity.progressPercent,
                            distanceCoveredNm = 0,
                            distanceRemainingNm = 0,
                            etaMinutesRemaining = 0,
                            waypoints = emptyList()
                        ),
                        timeline = emptyList(),
                        isFavorite = entity.isFavorite,
                        customNotes = entity.customNotes
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

    /** Server plan-cap check: returns null when the add is allowed. */
    private fun planCapLimitReached(): String? {
        val limit = _planState.value.concurrentLimit
        if (watchlistCount < limit) return null
        return "Your ${_planState.value.plan} plan allows $limit concurrently live-tracked " +
            "flights. Remove one from the watchlist or upgrade for more."
    }

    /**
     * One unified watchlist toggle (web parity): "favorite" and "tracked" are
     * legacy aliases of the same membership — both flags mirror each other and
     * one date-scoped cloud row is written per toggle.
     */
    private fun setWatchlistState(flight: Flight, watchlisted: Boolean, notes: String = "") {
        val currentKey = flight.flightNumber
        _flights.value = _flights.value.map {
            if (it.flightNumber.equals(currentKey, ignoreCase = true)) {
                it.copy(isFavorite = watchlisted, isTracked = watchlisted, customNotes = notes.ifBlank { it.customNotes })
            } else it
        }

        repositoryScope.launch {
            if (watchlisted) {
                subscribeToFlightPush(flight.flightNumber)
                // One Room write per table keeps the periodic sync worker and the
                // favorites filter working while the duality is retired in UI.
                flightDao.addFavorite(
                    FavoriteFlightEntity(
                        flightNumber = flight.flightNumber,
                        customNotes = notes.ifBlank { flight.customNotes }
                    )
                )
                flightDao.insertTrackedFlight(
                    TrackedFlightEntity(
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
                        terminalGate = "T${flight.terminalDeparture} · ${flight.gateDeparture}",
                        trackedSinceMillis = System.currentTimeMillis(),
                        notes = notes.ifBlank { flight.customNotes },
                        isAutoAlertEnabled = true
                    )
                )
                val userId = cloudRepository.currentUserId()
                if (userId != null) {
                    cloudRepository.saveWatchlistItem(
                        CloudTrackedFlight(
                            id = flight.id,
                            flightDate = flight.flightDate,
                            userId = userId,
                            flightNumber = flight.flightNumber,
                            airline = flight.airline,
                            originCode = flight.origin.code,
                            destCode = flight.destination.code,
                            status = flight.status.name,
                            customNotes = notes.ifBlank { flight.customNotes },
                            isFavorite = true
                        ),
                        snapshot = flight.toCloudSnapshot().toJsonObject()
                    )
                }
                addAlert(
                    FlightAlert(
                        id = UUID.randomUUID().toString(),
                        flightNumber = flight.flightNumber,
                        type = AlertType.BOARDING,
                        title = "Saved to Watchlist: ${flight.flightNumber}",
                        message = "Live gate change, delay, and boarding-call alerts are active for ${flight.flightNumber}.",
                        timestamp = "Just now",
                        isRead = false
                    ),
                    triggerSystemPush = true
                )
            } else {
                unsubscribeFromFlightPush(flight.flightNumber)
                flightDao.removeFavorite(flight.flightNumber)
                flightDao.deleteTrackedFlight(flight.flightNumber)
                val userId = cloudRepository.currentUserId()
                if (userId != null) {
                    cloudRepository.deleteWatchlistItem(flight.watchRowId())
                }
            }
        }
    }

    /** Watchlist toggle from the flight card. */
    fun toggleFavorite(flightNumber: String, customNotes: String = "") {
        val flight = _flights.value.find { it.flightNumber.equals(flightNumber, ignoreCase = true) } ?: return
        val willWatch = !flight.isWatchlisted
        if (willWatch) {
            planCapLimitReached()?.let { message ->
                addAlert(
                    FlightAlert(
                        id = UUID.randomUUID().toString(),
                        flightNumber = flightNumber,
                        type = AlertType.DELAY,
                        title = "Plan limit reached · $flightNumber",
                        message = message,
                        timestamp = "Just now",
                        isRead = false
                    ),
                    triggerSystemPush = true
                )
                return
            }
        }
        setWatchlistState(flight, willWatch, customNotes)
    }

    /** Date-aware watchlist toggle (used by Search / detail flows). */
    fun toggleTrackFlight(flight: Flight, customNotes: String = "") {
        val existing = _flights.value.find { it.flightNumber.equals(flight.flightNumber, ignoreCase = true) }
            ?: flight
        val willWatch = !existing.isWatchlisted
        if (willWatch) {
            planCapLimitReached()?.let { message ->
                addAlert(
                    FlightAlert(
                        id = UUID.randomUUID().toString(),
                        flightNumber = flight.flightNumber,
                        type = AlertType.DELAY,
                        title = "Plan limit reached · ${flight.flightNumber}",
                        message = message,
                        timestamp = "Just now",
                        isRead = false
                    ),
                    triggerSystemPush = true
                )
                return
            }
        }
        setWatchlistState(existing, willWatch, customNotes)
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
            if (userId != null && flight != null) {
                cloudRepository.saveWatchlistItem(
                    CloudTrackedFlight(
                        id = flight.id,
                        flightDate = flight.flightDate,
                        userId = userId,
                        flightNumber = flight.flightNumber,
                        airline = flight.airline,
                        originCode = flight.origin.code,
                        destCode = flight.destination.code,
                        status = flight.status.name,
                        customNotes = notes,
                        isFavorite = flight.isFavorite
                    ),
                    snapshot = flight.toCloudSnapshot().toJsonObject()
                )
            }
        }
    }

    fun deleteWatchlistItem(flightNumber: String) {
        val flight = _flights.value.find { it.flightNumber.equals(flightNumber, ignoreCase = true) }
        _flights.value = _flights.value.map {
            if (it.flightNumber.equals(flightNumber, ignoreCase = true)) {
                it.copy(isFavorite = false, isTracked = false)
            } else it
        }
        repositoryScope.launch {
            unsubscribeFromFlightPush(flightNumber)
            flightDao.removeFavorite(flightNumber)
            flightDao.deleteTrackedFlight(flightNumber)
            if (flight != null) {
                cloudRepository.deleteWatchlistItem(flight.watchRowId())
            }
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
                            statusNote = "Delayed $extraMinutes mins Ã‚Â· ATC flow management"
                        )
                    } else it
                }
                repositoryScope.launch {
                    flightDao.updateFlightDelay(
                        flightNumber = flightNumber,
                        status = "DELAYED",
                        delayMinutes = extraMinutes,
                        delayReason = "ATC Flow Restriction & Thunderstorms",
                        statusNote = "Delayed $extraMinutes mins Ã‚Â· ATC flow management"
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
                            statusNote = "Boarding Group 1 & 2 Ã‚Â· Gate ${it.gateDeparture}"
                        )
                    } else it
                }
                repositoryScope.launch {
                    flightDao.updateFlightStatus(
                        flightNumber = flightNumber,
                        status = "BOARDING",
                        statusNote = "Boarding Group 1 & 2 Ã‚Â· Gate ${flight.gateDeparture}"
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
                            statusNote = "Cancelled Ã‚Â· Technical Inspection Required",
                            delayReason = "Aircraft Maintenance"
                        )
                    } else it
                }
                repositoryScope.launch {
                    flightDao.updateFlightStatus(
                        flightNumber = flightNumber,
                        status = "CANCELLED",
                        statusNote = "Cancelled Ã‚Â· Technical Inspection Required"
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
            if (!_userAccount.value.isOfflineMode && ApiConfig.isGatewayConfigured) {
                val trackedNumbers = _flights.value.filter { it.isTracked || it.isFavorite }.map { it.flightNumber }.take(5)
                trackedNumbers.forEach { num -> fetchLiveFlightByNumber(num) }
            }
            cacheAllFlights(_flights.value)
        }
        com.example.sync.FlightSyncManager.enqueueImmediateSync(context)
    }
}


