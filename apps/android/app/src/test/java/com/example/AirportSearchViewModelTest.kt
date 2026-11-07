package com.example

import com.example.data.RealtimeAirportRepository
import com.example.ui.viewmodel.AirportSearchUiState
import com.example.ui.viewmodel.AirportSearchViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AirportSearchViewModelTest {

    private val testDispatcher = UnconfinedTestDispatcher()
    private lateinit var repository: RealtimeAirportRepository
    private lateinit var viewModel: AirportSearchViewModel

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        repository = RealtimeAirportRepository(
            ioDispatcher = testDispatcher,
            enableLiveNetwork = false,
        )
        viewModel = AirportSearchViewModel(repository, simulateNetworkDelay = false)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun initialState_loadsFeaturedAirports() = runTest {
        val state = viewModel.uiState.value
        assertTrue("Initial state should be Idle", state is AirportSearchUiState.Idle)
        val idleState = state as AirportSearchUiState.Idle
        assertTrue("Featured airports should not be empty", idleState.featuredAirports.isNotEmpty())
    }

    @Test
    fun onSearchQueryChanged_findsAirportByCode() = runTest {
        viewModel.onSearchQueryChanged("JFK")

        val state = viewModel.uiState.value
        assertTrue("Should produce Success state", state is AirportSearchUiState.Success)
        val success = state as AirportSearchUiState.Success
        assertTrue("Found at least JFK", success.airports.any { it.code == "JFK" })
    }

    @Test
    fun onSearchQueryChanged_findsAirportByCity() = runTest {
        viewModel.onSearchQueryChanged("Tokyo")

        val state = viewModel.uiState.value
        assertTrue("Should produce Success state", state is AirportSearchUiState.Success)
        val success = state as AirportSearchUiState.Success
        assertTrue("Found Tokyo Haneda", success.airports.any { it.city.contains("Tokyo") })
    }

    @Test
    fun onSearchQueryChanged_noMatch_producesEmptyState() = runTest {
        viewModel.onSearchQueryChanged("NONEXISTENT_AIRPORT_XYZ")

        val state = viewModel.uiState.value
        assertTrue("Should produce Empty state", state is AirportSearchUiState.Empty)
        val empty = state as AirportSearchUiState.Empty
        assertEquals("NONEXISTENT_AIRPORT_XYZ", empty.query)
        assertTrue(empty.suggestions.isNotEmpty())
    }

    @Test
    fun onRegionSelected_filtersByRegion() = runTest {
        viewModel.onRegionSelected("Europe")

        val state = viewModel.uiState.value
        assertTrue("Should produce Success state", state is AirportSearchUiState.Success)
        val success = state as AirportSearchUiState.Success
        assertTrue("All results should be in Europe", success.airports.all { it.region == "Europe" })
    }

    @Test
    fun onStatusFilterSelected_filtersDelayedAirports() = runTest {
        viewModel.onStatusFilterSelected("Delayed")

        val state = viewModel.uiState.value
        assertTrue("Should produce Success state", state is AirportSearchUiState.Success)
        val success = state as AirportSearchUiState.Success
        assertTrue("All results should be marked delayed", success.airports.all { it.isDelayed })
    }
}
