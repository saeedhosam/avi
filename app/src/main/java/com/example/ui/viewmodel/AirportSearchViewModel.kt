package com.example.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.data.RealtimeAirportRepository
import com.example.model.RealtimeAirportInfo
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface AirportSearchUiState {
    data class Idle(
        val featuredAirports: List<RealtimeAirportInfo>,
        val recentSearches: List<String>
    ) : AirportSearchUiState

    data class Loading(
        val message: String = "Querying live air traffic control telemetry & METAR..."
    ) : AirportSearchUiState

    data class Success(
        val airports: List<RealtimeAirportInfo>,
        val totalCount: Int,
        val delayedCount: Int
    ) : AirportSearchUiState

    data class Empty(
        val query: String,
        val suggestions: List<String> = listOf("JFK", "LHR", "HND", "DXB", "SFO", "SIN", "CDG")
    ) : AirportSearchUiState

    data class Error(
        val message: String
    ) : AirportSearchUiState
}

class AirportSearchViewModel(
    private val repository: RealtimeAirportRepository = RealtimeAirportRepository(),
    private val simulateNetworkDelay: Boolean = true
) : ViewModel() {

    private val _searchQuery = MutableStateFlow("")
    val searchQuery: StateFlow<String> = _searchQuery.asStateFlow()

    private val _selectedRegion = MutableStateFlow("All")
    val selectedRegion: StateFlow<String> = _selectedRegion.asStateFlow()

    private val _selectedStatusFilter = MutableStateFlow("All")
    val selectedStatusFilter: StateFlow<String> = _selectedStatusFilter.asStateFlow()

    private val _uiState = MutableStateFlow<AirportSearchUiState>(
        AirportSearchUiState.Loading("Loading global hubs...")
    )
    val uiState: StateFlow<AirportSearchUiState> = _uiState.asStateFlow()

    private val _selectedAirport = MutableStateFlow<RealtimeAirportInfo?>(null)
    val selectedAirport: StateFlow<RealtimeAirportInfo?> = _selectedAirport.asStateFlow()

    private var searchJob: Job? = null
    private val recentSearchQueries = mutableListOf("JFK", "London Heathrow", "Tokyo Haneda", "Dubai")

    init {
        loadInitialFeaturedAirports()
    }

    fun loadInitialFeaturedAirports() {
        viewModelScope.launch {
            _uiState.value = AirportSearchUiState.Loading("Loading global aviation hubs...")
            val result = repository.searchAirports(query = "", simulateNetworkDelay = false)
            result.onSuccess { airports ->
                _uiState.value = AirportSearchUiState.Idle(
                    featuredAirports = airports.take(6),
                    recentSearches = recentSearchQueries.toList()
                )
            }.onFailure { e ->
                _uiState.value = AirportSearchUiState.Error(
                    message = e.localizedMessage ?: "Unable to fetch global hubs"
                )
            }
        }
    }

    fun onSearchQueryChanged(newQuery: String) {
        _searchQuery.value = newQuery
        triggerSearch(debounceMs = 300)
    }

    fun onRegionSelected(region: String) {
        _selectedRegion.value = region
        triggerSearch(debounceMs = 0)
    }

    fun onStatusFilterSelected(status: String) {
        _selectedStatusFilter.value = status
        triggerSearch(debounceMs = 0)
    }

    fun clearSearch() {
        _searchQuery.value = ""
        _selectedRegion.value = "All"
        _selectedStatusFilter.value = "All"
        loadInitialFeaturedAirports()
    }

    fun selectRecentSearch(query: String) {
        _searchQuery.value = query
        triggerSearch(debounceMs = 0)
    }

    fun selectAirport(airport: RealtimeAirportInfo?) {
        _selectedAirport.value = airport
    }

    fun retry() {
        triggerSearch(debounceMs = 0)
    }

    private fun triggerSearch(debounceMs: Long) {
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            if (simulateNetworkDelay && debounceMs > 0) {
                delay(debounceMs)
            }

            val query = _searchQuery.value.trim()
            val region = _selectedRegion.value
            val status = _selectedStatusFilter.value

            if (query.isEmpty() && region == "All" && status == "All") {
                loadInitialFeaturedAirports()
                return@launch
            }

            _uiState.value = AirportSearchUiState.Loading("Fetching real-time airport telemetry...")

            val result = repository.searchAirports(
                query = query,
                region = region,
                statusFilter = status,
                simulateNetworkDelay = simulateNetworkDelay
            )

            result.onSuccess { airports ->
                if (query.isNotBlank() && !recentSearchQueries.contains(query)) {
                    recentSearchQueries.add(0, query)
                    if (recentSearchQueries.size > 8) {
                        recentSearchQueries.removeLast()
                    }
                }

                if (airports.isEmpty()) {
                    _uiState.value = AirportSearchUiState.Empty(
                        query = query,
                        suggestions = listOf("JFK", "LHR", "HND", "DXB", "SFO", "SIN", "CDG")
                    )
                } else {
                    _uiState.value = AirportSearchUiState.Success(
                        airports = airports,
                        totalCount = airports.size,
                        delayedCount = airports.count { it.isDelayed }
                    )
                }
            }.onFailure { err ->
                _uiState.value = AirportSearchUiState.Error(
                    message = err.localizedMessage ?: "Failed to fetch real-time airport data"
                )
            }
        }
    }
}
