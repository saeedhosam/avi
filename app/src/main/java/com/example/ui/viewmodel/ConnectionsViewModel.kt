package com.example.ui.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.data.AirportConnectionsRepository
import com.example.data.remote.DataSourceMode
import com.example.model.*
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.util.Locale

data class ConnectionsFilterState(
    val direction: ConnectionDirection = ConnectionDirection.ALL,
    val selectedAirlineCode: String? = null,
    val haulCategory: HaulCategory = HaulCategory.ALL,
    val region: RouteRegion = RouteRegion.ALL,
    val destinationQuery: String = ""
)

class ConnectionsViewModel(application: Application) : AndroidViewModel(application) {

    private val repository = AirportConnectionsRepository(application)

    val isLoadingRoutes: StateFlow<Boolean> = repository.isLoadingRoutes
    val routeDataSourceMode: StateFlow<DataSourceMode> = repository.routeDataSourceMode

    private val _originIata = MutableStateFlow("JFK")
    val originIata: StateFlow<String> = _originIata.asStateFlow()

    private val _departureInput = MutableStateFlow("JFK · New York")
    val departureInput: StateFlow<String> = _departureInput.asStateFlow()

    private val _destinationInput = MutableStateFlow("")
    val destinationInput: StateFlow<String> = _destinationInput.asStateFlow()

    private val _departureSuggestions = MutableStateFlow<List<AirportNode>>(emptyList())
    val departureSuggestions: StateFlow<List<AirportNode>> = _departureSuggestions.asStateFlow()

    private val _destinationSuggestions = MutableStateFlow<List<AirportNode>>(emptyList())
    val destinationSuggestions: StateFlow<List<AirportNode>> = _destinationSuggestions.asStateFlow()

    private val _pivotHistory = MutableStateFlow<List<String>>(emptyList())
    val pivotHistory: StateFlow<List<String>> = _pivotHistory.asStateFlow()

    private val _networkSummary = MutableStateFlow<AirportRouteNetworkSummary?>(null)
    val networkSummary: StateFlow<AirportRouteNetworkSummary?> = _networkSummary.asStateFlow()

    private val _filterState = MutableStateFlow(ConnectionsFilterState())
    val filterState: StateFlow<ConnectionsFilterState> = _filterState.asStateFlow()

    private val _selectedDestinationIata = MutableStateFlow<String?>(null)
    val selectedDestinationIata: StateFlow<String?> = _selectedDestinationIata.asStateFlow()

    private val _hubSearchQuery = MutableStateFlow("")
    val hubSearchQuery: StateFlow<String> = _hubSearchQuery.asStateFlow()

    private val _hubSearchResults = MutableStateFlow<List<AirportNode>>(repository.getAllAirports())
    val hubSearchResults: StateFlow<List<AirportNode>> = _hubSearchResults.asStateFlow()

    private var searchJob: Job? = null
    private var destSearchJob: Job? = null
    private var loadJob: Job? = null

    val filteredConnections: StateFlow<List<DirectFlightConnection>> = combine(
        _networkSummary,
        _filterState
    ) { summary, filters ->
        val rawList = summary?.connections.orEmpty()
        rawList.filter { conn ->
            val matchesDirection = when (filters.direction) {
                ConnectionDirection.ALL -> true
                ConnectionDirection.DEPARTURES -> conn.hasDepartures
                ConnectionDirection.ARRIVALS -> conn.hasArrivals
            }
            val matchesAirline = filters.selectedAirlineCode == null ||
                conn.operatingCarriers.any { it.airlineCode.equals(filters.selectedAirlineCode, ignoreCase = true) }
            val matchesHaul = filters.haulCategory == HaulCategory.ALL ||
                conn.haulCategory == filters.haulCategory
            val matchesRegion = filters.region == RouteRegion.ALL ||
                conn.destination.region == filters.region
            val q = filters.destinationQuery.trim().lowercase(Locale.ROOT)
            val matchesQuery = q.isEmpty() ||
                conn.destination.iata.lowercase(Locale.ROOT).contains(q) ||
                conn.destination.city.lowercase(Locale.ROOT).contains(q) ||
                conn.destination.country.lowercase(Locale.ROOT).contains(q) ||
                conn.operatingCarriers.any {
                    it.airlineName.lowercase(Locale.ROOT).contains(q) ||
                        it.airlineCode.lowercase(Locale.ROOT).contains(q)
                }

            matchesDirection && matchesAirline && matchesHaul && matchesRegion && matchesQuery
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val selectedConnection: StateFlow<DirectFlightConnection?> = combine(
        filteredConnections,
        _selectedDestinationIata
    ) { connections, selectedIata ->
        if (connections.isEmpty()) {
            null
        } else if (selectedIata != null) {
            connections.find { it.destination.iata.equals(selectedIata, ignoreCase = true) }
                ?: connections.firstOrNull()
        } else {
            connections.firstOrNull()
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val quickSelectHubs: List<AirportNode> = listOf(
        repository.getAirportNode("CAI"),
        repository.getAirportNode("DXB"),
        repository.getAirportNode("LHR"),
        repository.getAirportNode("IST"),
        repository.getAirportNode("JFK"),
        repository.getAirportNode("DOH"),
        repository.getAirportNode("FRA"),
        repository.getAirportNode("CDG"),
        repository.getAirportNode("JED"),
        repository.getAirportNode("SIN"),
        repository.getAirportNode("HND"),
        repository.getAirportNode("SFO")
    )

    init {
        loadOriginHub("JFK", recordHistory = false)
    }

    fun updateDepartureInput(query: String) {
        _departureInput.value = query
        val trimmed = query.trim()
        if (trimmed.length == 3) {
            val directNode = repository.getAllAirports().find { it.iata.equals(trimmed, ignoreCase = true) }
            if (directNode != null) {
                _departureSuggestions.value = emptyList()
                selectOriginHub(directNode.iata)
                return
            }
        }
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            if (trimmed.length >= 2) {
                delay(150)
                val results = repository.searchAirports(trimmed)
                _departureSuggestions.value = results.take(6)
                // If user typed the exact city name, resolve to that airport
                val exactCity = results.find { it.city.equals(trimmed, ignoreCase = true) }
                if (exactCity != null && exactCity.iata != _originIata.value) {
                    selectOriginHub(exactCity.iata)
                }
            } else {
                _departureSuggestions.value = emptyList()
            }
        }
    }

    fun selectDepartureAirport(airport: AirportNode) {
        _departureInput.value = "${airport.iata} · ${airport.city}"
        _departureSuggestions.value = emptyList()
        selectOriginHub(airport.iata)
    }

    fun clearDepartureInput() {
        _departureInput.value = ""
        _departureSuggestions.value = emptyList()
    }

    fun updateDestinationInput(query: String) {
        _destinationInput.value = query
        setDestinationQuery(query)
        val trimmed = query.trim()
        if (trimmed.isBlank()) {
            _destinationSuggestions.value = emptyList()
            _selectedDestinationIata.value = null
            return
        }

        destSearchJob?.cancel()
        destSearchJob = viewModelScope.launch {
            delay(150)
            val connections = _networkSummary.value?.connections.orEmpty()
            val matchedDests = connections.filter { conn ->
                conn.destination.iata.contains(trimmed, ignoreCase = true) ||
                    conn.destination.city.contains(trimmed, ignoreCase = true) ||
                    conn.destination.name.contains(trimmed, ignoreCase = true)
            }.map { it.destination }

            if (matchedDests.isNotEmpty()) {
                _destinationSuggestions.value = matchedDests.take(6)
                _selectedDestinationIata.value = matchedDests.first().iata
            } else {
                // If not in current direct routes, search all airports to show them
                val allAirports = repository.searchAirports(trimmed)
                _destinationSuggestions.value = allAirports.take(6)
            }
        }
    }

    fun selectDestinationAirport(airport: AirportNode) {
        _destinationInput.value = "${airport.iata} · ${airport.city}"
        _destinationSuggestions.value = emptyList()
        setDestinationQuery(airport.iata)
        _selectedDestinationIata.value = airport.iata
    }

    fun clearDestinationInput() {
        _destinationInput.value = ""
        _destinationSuggestions.value = emptyList()
        setDestinationQuery("")
        _selectedDestinationIata.value = null
    }

    fun swapDepartureAndDestination() {
        val currDestIata = _selectedDestinationIata.value
        val oldOrigin = _originIata.value
        if (currDestIata != null && currDestIata != oldOrigin) {
            val oldOriginNode = repository.getAirportNode(oldOrigin)
            val destNode = repository.getAirportNode(currDestIata)
            _departureInput.value = "${destNode.iata} · ${destNode.city}"
            _destinationInput.value = "${oldOriginNode.iata} · ${oldOriginNode.city}"
            loadOriginHub(destNode.iata, recordHistory = true, preferredHighlightDest = oldOrigin)
            setDestinationQuery(oldOrigin)
        }
    }

    fun selectOriginHub(iata: String) {
        val cleaned = iata.trim().uppercase(Locale.ROOT)
        if (cleaned.length != 3) return
        if (cleaned == _originIata.value && _networkSummary.value != null) return
        loadOriginHub(cleaned, recordHistory = true)
    }

    /**
     * Pivots the Flight Connections map so the tapped destination airport becomes the new
     * origin hub, loading all direct flight connections radiating from that airport.
     */
    fun pivotToDestinationHub(destinationIata: String) {
        val cleaned = destinationIata.trim().uppercase(Locale.ROOT)
        if (cleaned.length != 3 || cleaned == _originIata.value) return
        val previousOrigin = _originIata.value
        loadOriginHub(cleaned, recordHistory = true, preferredHighlightDest = previousOrigin)
    }

    fun popPreviousHub() {
        val history = _pivotHistory.value
        if (history.isEmpty()) return
        val previous = history.last()
        _pivotHistory.value = history.dropLast(1)
        loadOriginHub(previous, recordHistory = false)
    }

    fun refreshCurrentHub() {
        loadOriginHub(_originIata.value, recordHistory = false)
    }

    private fun loadOriginHub(
        iata: String,
        recordHistory: Boolean,
        preferredHighlightDest: String? = null
    ) {
        val current = _originIata.value
        if (recordHistory && current != iata) {
            _pivotHistory.value = (_pivotHistory.value + current).takeLast(6)
        }
        _originIata.value = iata
        val node = repository.getAirportNode(iata)
        _departureInput.value = "${node.iata} · ${node.city}"
        _departureSuggestions.value = emptyList()

        // Reset airline filter when switching origin hubs so routes aren't hidden
        _filterState.value = _filterState.value.copy(
            selectedAirlineCode = null,
            destinationQuery = _destinationInput.value.trim().takeIf { it.isNotBlank() } ?: ""
        )

        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            val summary = repository.loadRouteNetwork(iata)
            _networkSummary.value = summary
            val defaultDest = preferredHighlightDest?.takeIf { pref ->
                summary.connections.any { it.destination.iata.equals(pref, ignoreCase = true) }
            } ?: summary.connections.firstOrNull()?.destination?.iata
            _selectedDestinationIata.value = defaultDest
        }
    }

    fun selectDestinationOnMap(destinationIata: String) {
        val cleaned = destinationIata.uppercase(Locale.ROOT)
        _selectedDestinationIata.value = cleaned
        val destNode = repository.getAirportNode(cleaned)
        _destinationInput.value = "${destNode.iata} · ${destNode.city}"
        _destinationSuggestions.value = emptyList()
    }

    fun setDirectionFilter(direction: ConnectionDirection) {
        _filterState.value = _filterState.value.copy(direction = direction)
    }

    fun setAirlineFilter(airlineCode: String?) {
        val current = _filterState.value.selectedAirlineCode
        val updated = if (current != null && current.equals(airlineCode, ignoreCase = true)) {
            null
        } else {
            airlineCode
        }
        _filterState.value = _filterState.value.copy(selectedAirlineCode = updated)
    }

    fun setHaulFilter(haul: HaulCategory) {
        _filterState.value = _filterState.value.copy(haulCategory = haul)
    }

    fun setRegionFilter(region: RouteRegion) {
        _filterState.value = _filterState.value.copy(region = region)
    }

    fun setDestinationQuery(query: String) {
        _filterState.value = _filterState.value.copy(destinationQuery = query)
    }

    fun clearAllFilters() {
        _filterState.value = ConnectionsFilterState()
    }

    fun updateHubSearchQuery(query: String) {
        _hubSearchQuery.value = query
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            if (query.trim().length >= 2) {
                delay(200)
            }
            _hubSearchResults.value = repository.searchAirports(query)
        }
    }
}
