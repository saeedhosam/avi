package com.example.ui.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.data.FlightRepository
import com.example.data.local.RecentSearchEntity
import com.example.data.local.ScheduledNotificationEntity
import com.example.data.preferences.ThemeMode
import com.example.data.preferences.ThemePreferences
import com.example.data.remote.DataSourceMode
import com.example.model.*
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

enum class SearchMode(val title: String) {
    FLIGHT_NUMBER("Flight # / Airline"),
    ROUTE("Route Lookup")
}

data class FlightSearchFilters(
    val query: String = "",
    val status: FlightStatus? = null,
    val mode: SearchMode = SearchMode.FLIGHT_NUMBER,
    val routeOrigin: String = "JFK",
    val routeDestination: String = "LHR",
    val onlyTracked: Boolean = false
)

class FlightViewModel(application: Application) : AndroidViewModel(application) {

    val repository = FlightRepository(application)
    private val themePreferences = ThemePreferences(application)

    val themeMode: StateFlow<ThemeMode> = themePreferences.themeMode
        .stateIn(viewModelScope, SharingStarted.Eagerly, ThemeMode.SYSTEM)

    val dataSourceMode: StateFlow<DataSourceMode> = repository.dataSourceMode
    val isLiveLoading: StateFlow<Boolean> = repository.isLiveLoading

    private val _searchFilters = MutableStateFlow(FlightSearchFilters())
    val searchFilters: StateFlow<FlightSearchFilters> = _searchFilters.asStateFlow()

    private var liveFlightLookupJob: Job? = null
    private var liveAirportBoardJob: Job? = null

    val searchQuery: StateFlow<String> = _searchFilters.map { it.query }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), "")
    val statusFilter: StateFlow<FlightStatus?> = _searchFilters.map { it.status }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)
    val searchMode: StateFlow<SearchMode> = _searchFilters.map { it.mode }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), SearchMode.FLIGHT_NUMBER)
    val routeOrigin: StateFlow<String> = _searchFilters.map { it.routeOrigin }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), "JFK")
    val routeDestination: StateFlow<String> = _searchFilters.map { it.routeDestination }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), "LHR")
    val onlyTrackedFilter: StateFlow<Boolean> = _searchFilters.map { it.onlyTracked }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)

    private val _selectedAirportCode = MutableStateFlow("JFK")
    val selectedAirportCode: StateFlow<String> = _selectedAirportCode.asStateFlow()

    private val _isDepartureBoard = MutableStateFlow(true)
    val isDepartureBoard: StateFlow<Boolean> = _isDepartureBoard.asStateFlow()

    private val _airportAirlineFilter = MutableStateFlow("All")
    val airportAirlineFilter: StateFlow<String> = _airportAirlineFilter.asStateFlow()

    private val _selectedFlightId = MutableStateFlow<String?>("AA100")
    val selectedFlightId: StateFlow<String?> = _selectedFlightId.asStateFlow()

    val flights: StateFlow<List<Flight>> = repository.flights
    val alerts: StateFlow<List<FlightAlert>> = repository.alerts
    val userAccount: StateFlow<UserAccount> = repository.userAccount
    val scheduledNotifications: StateFlow<List<ScheduledNotificationEntity>> = repository.scheduledNotifications
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val recentSearches: StateFlow<List<RecentSearchEntity>> = repository.recentSearches
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    val unreadAlertCount: StateFlow<Int> = alerts.map { list ->
        list.count { !it.isRead }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)

    val filteredFlights: StateFlow<List<Flight>> = combine(
        flights,
        _searchFilters
    ) { allFlights, filters ->
        allFlights.filter { flight ->
            val matchesMode = when (filters.mode) {
                SearchMode.FLIGHT_NUMBER -> {
                    val q = filters.query.trim().lowercase()
                    val qCompact = q.replace(" ", "")
                    if (q.isEmpty()) true else {
                        flight.flightNumber.lowercase().contains(q) ||
                            flight.flightNumber.replace(" ", "").lowercase().contains(qCompact) ||
                            flight.airline.lowercase().contains(q) ||
                            flight.airlineCode.lowercase().contains(q) ||
                            flight.origin.code.lowercase().contains(q) ||
                            flight.origin.city.lowercase().contains(q) ||
                            flight.destination.code.lowercase().contains(q) ||
                            flight.destination.city.lowercase().contains(q) ||
                            flight.aircraft.model.lowercase().contains(q)
                    }
                }
                SearchMode.ROUTE -> {
                    val origQ = filters.routeOrigin.trim().lowercase()
                    val destQ = filters.routeDestination.trim().lowercase()
                    val originMatch = origQ.isBlank() || origQ == "all" ||
                        flight.origin.code.lowercase().contains(origQ) ||
                        flight.origin.city.lowercase().contains(origQ) ||
                        flight.origin.name.lowercase().contains(origQ)
                    val destMatch = destQ.isBlank() || destQ == "all" ||
                        flight.destination.code.lowercase().contains(destQ) ||
                        flight.destination.city.lowercase().contains(destQ) ||
                        flight.destination.name.lowercase().contains(destQ)
                    originMatch && destMatch
                }
            }
            val matchesStatus = filters.status == null || flight.status == filters.status
            val matchesWatchlist = !filters.onlyTracked || flight.isFavorite
            matchesMode && matchesStatus && matchesWatchlist
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val watchlistFlights: StateFlow<List<Flight>> = flights.map { all ->
        all.filter { it.isFavorite }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val selectedFlight: StateFlow<Flight?> = combine(flights, selectedFlightId) { all, id ->
        if (id == null) null else all.find { it.id.equals(id, ignoreCase = true) || it.flightNumber.replace(" ", "").equals(id.replace(" ", ""), ignoreCase = true) }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val airportBoardFlights: StateFlow<List<Flight>> = combine(
        flights,
        selectedAirportCode,
        isDepartureBoard,
        airportAirlineFilter
    ) { allFlights, airportCode, isDep, airlineFilter ->
        allFlights.filter { flight ->
            val airportMatch = if (isDep) {
                flight.origin.code.equals(airportCode, ignoreCase = true)
            } else {
                flight.destination.code.equals(airportCode, ignoreCase = true)
            }
            val airlineMatch = airlineFilter == "All" || flight.airline.equals(airlineFilter, ignoreCase = true)
            airportMatch && airlineMatch
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    fun setSearchQuery(query: String) {
        _searchFilters.value = _searchFilters.value.copy(query = query)
        triggerDebouncedLiveFlightLookup(query)
    }

    private fun triggerDebouncedLiveFlightLookup(query: String) {
        liveFlightLookupJob?.cancel()
        val trimmed = query.trim()
        if (trimmed.length < 3) return
        liveFlightLookupJob = viewModelScope.launch {
            delay(450)
            repository.fetchLiveFlightByNumber(trimmed)
        }
    }

    fun setStatusFilter(status: FlightStatus?) {
        _searchFilters.value = _searchFilters.value.copy(status = status)
    }

    fun setSearchMode(mode: SearchMode) {
        _searchFilters.value = _searchFilters.value.copy(mode = mode)
    }

    fun setRouteOrigin(origin: String) {
        _searchFilters.value = _searchFilters.value.copy(routeOrigin = origin)
    }

    fun setRouteDestination(dest: String) {
        _searchFilters.value = _searchFilters.value.copy(routeDestination = dest)
    }

    fun swapRoute() {
        val curr = _searchFilters.value
        _searchFilters.value = curr.copy(routeOrigin = curr.routeDestination, routeDestination = curr.routeOrigin)
    }

    fun setOnlyTrackedFilter(onlyTracked: Boolean) {
        _searchFilters.value = _searchFilters.value.copy(onlyTracked = onlyTracked)
    }

    fun toggleTrackFlight(flight: Flight, customNotes: String = "") {
        repository.toggleTrackFlight(flight, customNotes)
    }

    fun deleteTrackedFlight(flightNumber: String) {
        repository.deleteTrackedFlight(flightNumber)
    }

    fun selectAirport(code: String) {
        _selectedAirportCode.value = code
        liveAirportBoardJob?.cancel()
        liveAirportBoardJob = viewModelScope.launch {
            repository.fetchLiveAirportBoard(code)
        }
    }

    fun setAirportBoardDirection(isDeparture: Boolean) {
        _isDepartureBoard.value = isDeparture
    }

    fun setAirportAirlineFilter(airline: String) {
        _airportAirlineFilter.value = airline
    }

    fun selectFlight(id: String?) {
        _selectedFlightId.value = id
    }

    fun toggleFavorite(flightNumber: String, customNotes: String = "") {
        repository.toggleFavorite(flightNumber, customNotes)
    }

    fun updateNotes(flightNumber: String, notes: String) {
        repository.updateFlightNotes(flightNumber, notes)
    }

    fun recordRecentSearch(flight: Flight) {
        repository.saveRecentSearch(flight)
    }

    fun deleteRecentSearch(flightNumber: String) {
        repository.deleteRecentSearch(flightNumber)
    }

    fun clearRecentSearches() {
        repository.clearRecentSearches()
    }

    fun simulateAlert(flightNumber: String, type: AlertType) {
        repository.simulateRealtimeEvent(flightNumber, type)
    }

    fun scheduleLocalAlert(
        flightNumber: String,
        type: AlertType,
        title: String,
        message: String,
        delaySeconds: Int
    ): String {
        return repository.scheduleAlert(flightNumber, type, title, message, delaySeconds)
    }

    fun cancelScheduledAlert(scheduleId: String) {
        repository.cancelSchedule(scheduleId)
    }

    fun deleteScheduledAlert(scheduleId: String) {
        repository.deleteSchedule(scheduleId)
    }

    fun getFcmToken(): String {
        return repository.getFcmToken()
    }

    fun markAlertRead(alertId: String) {
        repository.markAlertRead(alertId)
    }

    fun markAllAlertsRead() {
        repository.markAllAlertsRead()
    }

    fun toggleOfflineMode() {
        repository.toggleOfflineMode()
    }

    fun triggerBackgroundSync() {
        repository.triggerBackgroundSync()
    }

    fun getLastSyncTime(): String = repository.getLastSyncTimeString()

    fun getLastSyncStatus(): String = repository.getLastSyncStatus()

    fun refreshData() {
        repository.refreshAll()
    }

    suspend fun getDestinationWeather(airport: Airport, arrivalTime: String): DestinationArrivalForecast {
        return repository.getDestinationWeather(airport, arrivalTime)
    }

    fun observeDestinationWeather(airportCode: String): Flow<DestinationArrivalForecast?> {
        return repository.observeDestinationWeather(airportCode)
    }

    fun signInWithGoogle(activity: android.app.Activity, onResult: (Boolean, String?) -> Unit = { _, _ -> }) {
        viewModelScope.launch {
            val res = com.example.util.GoogleAuthManager.signInWithGoogle(activity)
            if (res.isSuccess) {
                val userName = res.getOrNull() ?: "Google Aviator"
                repository.addAlert(
                    FlightAlert(
                        id = java.util.UUID.randomUUID().toString(),
                        flightNumber = "ACCOUNT",
                        type = AlertType.BOARDING,
                        title = "Google Sign-In Connected",
                        message = "Welcome aboard, $userName. Your tracked flights and alerts are now backed by Supabase.",
                        timestamp = "Just now",
                        isRead = false
                    ),
                    triggerSystemPush = true
                )
                onResult(true, null)
            } else {
                val errorMsg = res.exceptionOrNull()?.message ?: "Google Sign-In cancelled or failed"
                onResult(false, errorMsg)
            }
        }
    }

    fun signInWithOAuth(provider: String = "Google Aviation SSO") {
        viewModelScope.launch {
            repository.addAlert(
                FlightAlert(
                    id = java.util.UUID.randomUUID().toString(),
                    flightNumber = "ACCOUNT",
                    type = AlertType.BOARDING,
                    title = "OAuth Login Prompt",
                    message = "Please tap 'Sign in with Google' to authenticate with Supabase.",
                    timestamp = "Just now",
                    isRead = false
                ),
                triggerSystemPush = false
            )
        }
    }

    fun signOut() {
        viewModelScope.launch {
            com.example.util.GoogleAuthManager.signOut()
        }
    }

    fun setThemeMode(mode: ThemeMode) {
        viewModelScope.launch {
            themePreferences.setThemeMode(mode)
        }
    }

    fun cycleNextThemeMode() {
        val next = when (themeMode.value) {
            ThemeMode.SYSTEM -> ThemeMode.DARK
            ThemeMode.DARK -> ThemeMode.LIGHT
            ThemeMode.LIGHT -> ThemeMode.SYSTEM
        }
        setThemeMode(next)
    }
}
