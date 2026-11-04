package com.example.data

import android.content.Context
import android.util.Log
import com.example.data.local.*
import com.example.model.*
import com.example.notifications.FlightNotificationManager
import com.example.notifications.FlightNotificationScheduler
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
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

    private val _flights = MutableStateFlow<List<Flight>>(MockFlightData.initialFlights)
    val flights: StateFlow<List<Flight>> = _flights.asStateFlow()

    private val _alerts = MutableStateFlow<List<FlightAlert>>(MockFlightData.sampleAlerts)
    val alerts: StateFlow<List<FlightAlert>> = _alerts.asStateFlow()

    val scheduledNotifications: Flow<List<ScheduledNotificationEntity>> = scheduler.scheduledNotifications
    val recentSearches: Flow<List<RecentSearchEntity>> = flightDao.getRecentSearches()
    val trackedFlights: Flow<List<TrackedFlightEntity>> = flightDao.getAllTrackedFlights()

    private val _userAccount = MutableStateFlow(
        UserAccount(
            name = "Capt. Alex Mercer",
            email = "alex.mercer@aviation.aero",
            avatarInitial = "A",
            isSignedIn = true,
            isOfflineMode = false,
            lastSyncTime = "Cached 2m ago"
        )
    )
    val userAccount: StateFlow<UserAccount> = _userAccount.asStateFlow()

    init {
        // Initialize Notification Channels
        FlightNotificationManager.createNotificationChannel(context)

        // Initialize Firebase Cloud Messaging registration token
        initFcmToken()

        // Initialize WorkManager background sync service for connectivity restore
        com.example.sync.FlightSyncManager.scheduleConnectivitySync(context)
        com.example.sync.FlightSyncManager.schedulePeriodicSync(context)
        com.example.sync.FlightSyncManager.registerConnectivityRestoredMonitor(context)

        // Initialize Room cache in background
        repositoryScope.launch {
            cacheAllFlights(_flights.value)
            loadRoomFavorites()
            observeRoomAlerts()
            observeTrackedFlights()
            observeRoomCachedFlights()
        }

        // Live simulation loop: continuously updates active flights slightly
        repositoryScope.launch {
            while (true) {
                delay(4000)
                updateLiveTelemetry()
            }
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
                // Merge Room alerts with sample alerts (avoiding duplicates)
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
                        ?: currentFlights.first()

                    val parsedStatus = try {
                        FlightStatus.valueOf(entity.status)
                    } catch (_: Exception) {
                        existing.status
                    }

                    existing.copy(
                        id = entity.id,
                        flightNumber = entity.flightNumber,
                        airline = entity.airline,
                        airlineCode = entity.airlineCode,
                        origin = MockFlightData.getAirport(entity.originCode),
                        destination = MockFlightData.getAirport(entity.destCode),
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
                        aircraft = existing.aircraft.copy(
                            model = entity.aircraftModel,
                            registration = entity.aircraftRegistration
                        ),
                        telemetry = existing.telemetry.copy(
                            altitudeFeet = entity.altitudeFeet,
                            groundSpeedKnots = entity.groundSpeedKnots,
                            headingDegrees = entity.headingDegrees,
                            progressPercent = entity.progressPercent
                        ),
                        isFavorite = entity.isFavorite || existing.isFavorite,
                        customNotes = entity.customNotes.ifBlank { existing.customNotes }
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

                // Interpolate latitude and longitude slightly towards destination
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
                // Generate a notification confirming favorite alert subscription
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
                    terminalGate = "T${flight.terminalDeparture} · ${flight.gateDeparture}",
                    trackedSinceMillis = System.currentTimeMillis(),
                    notes = customNotes,
                    isAutoAlertEnabled = true
                )
                flightDao.insertTrackedFlight(entity)
                addAlert(
                    FlightAlert(
                        id = UUID.randomUUID().toString(),
                        flightNumber = flight.flightNumber,
                        type = AlertType.BOARDING,
                        title = "Saved to Room Tracking: ${flight.flightNumber}",
                        message = "Flight ${flight.flightNumber} (${flight.origin.code} ➔ ${flight.destination.code}) saved to local Room database for tracking. FCM push alerts active.",
                        timestamp = "Just now",
                        isRead = false
                    ),
                    triggerSystemPush = true
                )
            } else {
                unsubscribeFromFlightPush(flight.flightNumber)
                flightDao.deleteTrackedFlight(flight.flightNumber)
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
        }
    }

    fun markAllAlertsRead() {
        _alerts.value = _alerts.value.map { it.copy(isRead = true) }
        repositoryScope.launch {
            flightDao.markAllAlertsRead()
        }
    }

    // Interactive Trigger: Simulate real-time flight changes and post system push notification
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
                            statusNote = "Delayed $extraMinutes mins · ATC flow management"
                        )
                    } else it
                }
                repositoryScope.launch {
                    flightDao.updateFlightDelay(
                        flightNumber = flightNumber,
                        status = "DELAYED",
                        delayMinutes = extraMinutes,
                        delayReason = "ATC Flow Restriction & Thunderstorms",
                        statusNote = "Delayed $extraMinutes mins · ATC flow management"
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
                            statusNote = "Boarding Group 1 & 2 · Gate ${it.gateDeparture}"
                        )
                    } else it
                }
                repositoryScope.launch {
                    flightDao.updateFlightStatus(
                        flightNumber = flightNumber,
                        status = "BOARDING",
                        statusNote = "Boarding Group 1 & 2 · Gate ${flight.gateDeparture}"
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
                            statusNote = "Cancelled · Technical Inspection Required",
                            delayReason = "Aircraft Maintenance"
                        )
                    } else it
                }
                repositoryScope.launch {
                    flightDao.updateFlightStatus(
                        flightNumber = flightNumber,
                        status = "CANCELLED",
                        statusNote = "Cancelled · Technical Inspection Required"
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

    // Schedule a local alert stored in Room and queued with AlarmManager
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

    private fun initFcmToken() {
        try {
            FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                if (task.isSuccessful) {
                    val token = task.result
                    val prefs = context.getSharedPreferences("skytrack_prefs", Context.MODE_PRIVATE)
                    prefs.edit().putString("fcm_token", token).apply()
                    Log.d("SkyTrackFCM", "Firebase Messaging Token registered: $token")
                }
            }
        } catch (e: Exception) {
            Log.d("SkyTrackFCM", "FCM token registration deferred: ${e.message}")
        }
    }

    fun subscribeToFlightPush(flightNumber: String) {
        val topic = "flight_" + flightNumber.replace(" ", "").lowercase(Locale.ROOT)
        try {
            FirebaseMessaging.getInstance().subscribeToTopic(topic).addOnCompleteListener {
                Log.d("SkyTrackFCM", "Subscribed to FCM topic: $topic")
            }
        } catch (e: Exception) {
            Log.d("SkyTrackFCM", "FCM topic subscription simulated for: $topic")
        }
    }

    fun unsubscribeFromFlightPush(flightNumber: String) {
        val topic = "flight_" + flightNumber.replace(" ", "").lowercase(Locale.ROOT)
        try {
            FirebaseMessaging.getInstance().unsubscribeFromTopic(topic).addOnCompleteListener {
                Log.d("SkyTrackFCM", "Unsubscribed from FCM topic: $topic")
            }
        } catch (e: Exception) {
            Log.d("SkyTrackFCM", "FCM topic unsubscription simulated for: $topic")
        }
    }

    fun getFcmToken(): String {
        val prefs = context.getSharedPreferences("skytrack_prefs", Context.MODE_PRIVATE)
        var token = prefs.getString("fcm_token", null)
        if (token == null) {
            token = "fcm_skytrack_device_${UUID.randomUUID().toString().take(12)}"
            prefs.edit().putString("fcm_token", token).apply()
        }
        return token
    }

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

        // Whenever connectivity is restored (offline mode turned off), immediately trigger WorkManager background sync
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
            cacheAllFlights(_flights.value)
        }
        com.example.sync.FlightSyncManager.enqueueImmediateSync(context)
    }
}
