package com.example.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.*
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.model.*
import com.example.ui.theme.*
import com.example.ui.viewmodel.ConnectionsFilterState
import com.example.ui.viewmodel.ConnectionsViewModel
import kotlin.math.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConnectionsScreen(
    connectionsViewModel: ConnectionsViewModel = viewModel(),
    onOpenRouteFlights: (originIata: String, destinationIata: String) -> Unit = { _, _ -> },
    onOpenAirportBoard: (airportIata: String) -> Unit = {},
    modifier: Modifier = Modifier
) {
    val originIata by connectionsViewModel.originIata.collectAsStateWithLifecycle()
    val departureInput by connectionsViewModel.departureInput.collectAsStateWithLifecycle()
    val destinationInput by connectionsViewModel.destinationInput.collectAsStateWithLifecycle()
    val departureSuggestions by connectionsViewModel.departureSuggestions.collectAsStateWithLifecycle()
    val destinationSuggestions by connectionsViewModel.destinationSuggestions.collectAsStateWithLifecycle()
    val pivotHistory by connectionsViewModel.pivotHistory.collectAsStateWithLifecycle()
    val summary by connectionsViewModel.networkSummary.collectAsStateWithLifecycle()
    val filterState by connectionsViewModel.filterState.collectAsStateWithLifecycle()
    val filteredConnections by connectionsViewModel.filteredConnections.collectAsStateWithLifecycle()
    val selectedConnection by connectionsViewModel.selectedConnection.collectAsStateWithLifecycle()
    val isLoading by connectionsViewModel.isLoadingRoutes.collectAsStateWithLifecycle()
    val hubSearchQuery by connectionsViewModel.hubSearchQuery.collectAsStateWithLifecycle()
    val hubSearchResults by connectionsViewModel.hubSearchResults.collectAsStateWithLifecycle()

    var showHubPickerSheet by remember { mutableStateOf(false) }
    var showFilterSheet by remember { mutableStateOf(false) }
    var isFilterDrawerExpanded by remember { mutableStateOf(false) }
    var isInspectorExpanded by remember { mutableStateOf(false) }

    val hasActiveFilters = filterState.direction != ConnectionDirection.ALL ||
        filterState.haulCategory != HaulCategory.ALL ||
        filterState.region != RouteRegion.ALL ||
        filterState.selectedAirlineCode != null

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(CockpitDark)
            .testTag("connections_screen")
    ) {
        // 1. Full-Screen Interactive FlightConnections.com + OpenStreetMap World Map
        FlightConnectionsOsmMapCanvas(
            originAirport = summary?.originAirport,
            connections = filteredConnections,
            selectedConnection = selectedConnection,
            direction = filterState.direction,
            onSelectDestination = { destIata ->
                if (selectedConnection?.destination?.iata == destIata && isInspectorExpanded) {
                    // Second tap on an already-inspected destination pivots the map hub
                    connectionsViewModel.pivotToDestinationHub(destIata)
                } else if (summary?.originAirport == null) {
                    // In global all-routes view, tapping an airport dot sets it as the origin hub (like Nice NCE)
                    connectionsViewModel.selectOriginHub(destIata)
                } else {
                    connectionsViewModel.selectDestinationOnMap(destIata)
                    isInspectorExpanded = true
                }
            },
            onClearOriginHub = {
                connectionsViewModel.clearDepartureInput()
                isInspectorExpanded = false
            },
            onClearSelectedDestination = {
                connectionsViewModel.clearDestinationInput()
                isInspectorExpanded = false
            },
            onTapEmptyMap = {
                if (isInspectorExpanded) {
                    isInspectorExpanded = false
                }
                if (isFilterDrawerExpanded) {
                    isFilterDrawerExpanded = false
                }
            },
            modifier = Modifier.fillMaxSize()
        )

        // 2. Compact Floating Top Overlay with Departure & Destination Input Fields
        Column(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Surface(
                shape = RoundedCornerShape(16.dp),
                color = CockpitDark.copy(alpha = 0.94f),
                border = BorderStroke(1.dp, InstrumentBorder),
                shadowElevation = 8.dp,
                modifier = Modifier.fillMaxWidth().testTag("origin_hub_selector_bar")
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(10.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // Header Status & Quick Actions Bar
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = RadarCyan
                            ) {
                                Text(
                                    text = summary?.originAirport?.iata ?: if (departureInput.isNotBlank()) departureInput.take(3).uppercase() else "ALL",
                                    color = DeepSpace,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    fontFamily = FontFamily.Monospace,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                            }
                            Text(
                                text = if (selectedConnection != null && (destinationInput.isNotBlank() || departureInput.isNotBlank())) {
                                    "${selectedConnection!!.origin.iata} ➔ ${selectedConnection!!.destination.iata} · ${selectedConnection!!.destination.city}"
                                } else if (summary?.originAirport != null) {
                                    "${filteredConnections.size} Direct Routes from ${summary!!.originAirport!!.city}"
                                } else {
                                    "${filteredConnections.size} Global Routes Worldwide"
                                },
                                color = TextWhite,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }

                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            if (pivotHistory.isNotEmpty()) {
                                Surface(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(8.dp))
                                        .border(1.dp, RadarCyan.copy(alpha = 0.45f), RoundedCornerShape(8.dp))
                                        .clickable { connectionsViewModel.popPreviousHub() }
                                        .testTag("connections_back_hub_btn"),
                                    color = InstrumentSurface
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 4.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(3.dp)
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.Undo,
                                            contentDescription = "Previous Airport Hub",
                                            tint = RadarCyan,
                                            modifier = Modifier.size(12.dp)
                                        )
                                        Text(
                                            text = pivotHistory.last(),
                                            color = RadarCyan,
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                }
                            }

                            // Quick Airport Search Sheet Button
                            IconButton(
                                onClick = {
                                    connectionsViewModel.updateHubSearchQuery("")
                                    showHubPickerSheet = true
                                },
                                modifier = Modifier
                                    .size(30.dp)
                                    .testTag("open_hub_search_btn")
                            ) {
                                Icon(
                                    imageVector = Icons.Default.TravelExplore,
                                    contentDescription = "Search Worldwide Airports",
                                    tint = RadarCyan,
                                    modifier = Modifier.size(16.dp)
                                )
                            }

                            // Filter Drawer Toggle Button
                            Surface(
                                modifier = Modifier
                                    .size(30.dp)
                                    .clip(RoundedCornerShape(8.dp))
                                    .border(
                                        1.dp,
                                        if (isFilterDrawerExpanded || hasActiveFilters) RadarCyan else InstrumentBorder,
                                        RoundedCornerShape(8.dp)
                                    )
                                    .clickable { isFilterDrawerExpanded = !isFilterDrawerExpanded }
                                    .testTag("toggle_top_filters_btn"),
                                color = if (isFilterDrawerExpanded || hasActiveFilters) {
                                    RadarCyan.copy(alpha = 0.18f)
                                } else {
                                    InstrumentSurface
                                }
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        imageVector = if (isFilterDrawerExpanded) Icons.Default.ExpandLess else Icons.Default.FilterList,
                                        contentDescription = "Toggle Filters",
                                        tint = if (isFilterDrawerExpanded || hasActiveFilters) RadarCyan else TextWhite,
                                        modifier = Modifier.size(16.dp)
                                    )
                                }
                            }

                            // Region & Haul Filter Sheet Button
                            IconButton(
                                onClick = { showFilterSheet = true },
                                modifier = Modifier
                                    .size(30.dp)
                                    .testTag("open_connections_filters_btn")
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Tune,
                                    contentDescription = "Filter Routes by Distance or Region",
                                    tint = if (hasActiveFilters) RadarCyan else TextMuted,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                        }
                    }

                    // Direct Departure & Destination Input Fields Row
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        // Departure Input Field (Enter code e.g. JFK or city name e.g. New York)
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = InstrumentSurface,
                            border = BorderStroke(
                                1.dp,
                                if (departureInput.isNotEmpty()) RadarCyan else InstrumentBorder
                            ),
                            modifier = Modifier
                                .weight(1f)
                                .height(38.dp)
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .padding(horizontal = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.FlightTakeoff,
                                    contentDescription = "Departure",
                                    tint = RadarCyan,
                                    modifier = Modifier.size(15.dp)
                                )
                                Box(
                                    modifier = Modifier.weight(1f),
                                    contentAlignment = Alignment.CenterStart
                                ) {
                                    if (departureInput.isEmpty()) {
                                        Text(
                                            text = "Departure (code/city)",
                                            fontSize = 11.sp,
                                            color = TextSubtle,
                                            maxLines = 1,
                                            softWrap = false
                                        )
                                    }
                                    BasicTextField(
                                        value = departureInput,
                                        onValueChange = { connectionsViewModel.updateDepartureInput(it) },
                                        singleLine = true,
                                        textStyle = TextStyle(
                                            fontSize = 12.sp,
                                            color = TextWhite,
                                            fontWeight = FontWeight.SemiBold
                                        ),
                                        cursorBrush = SolidColor(RadarCyan),
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .testTag("departure_input_field")
                                    )
                                }
                                if (departureInput.isNotEmpty()) {
                                    Icon(
                                        imageVector = Icons.Default.Close,
                                        contentDescription = "Clear Departure",
                                        tint = TextMuted,
                                        modifier = Modifier
                                            .size(15.dp)
                                            .clickable { connectionsViewModel.clearDepartureInput() }
                                    )
                                }
                            }
                        }

                        // Swap Button between Departure and Destination
                        Surface(
                            shape = CircleShape,
                            color = InstrumentSurfaceElevated,
                            border = BorderStroke(1.dp, RadarCyan.copy(alpha = 0.45f)),
                            modifier = Modifier
                                .size(32.dp)
                                .clickable { connectionsViewModel.swapDepartureAndDestination() }
                                .testTag("swap_connections_btn")
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    imageVector = Icons.Default.SwapHoriz,
                                    contentDescription = "Swap Departure & Destination",
                                    tint = RadarCyan,
                                    modifier = Modifier.size(18.dp)
                                )
                            }
                        }

                        // Destination Input Field (Enter code e.g. LHR or city name e.g. London)
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = InstrumentSurface,
                            border = BorderStroke(
                                1.dp,
                                if (destinationInput.isNotEmpty()) AeroBlue else InstrumentBorder
                            ),
                            modifier = Modifier
                                .weight(1f)
                                .height(38.dp)
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .padding(horizontal = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.FlightLand,
                                    contentDescription = "Destination",
                                    tint = AeroBlue,
                                    modifier = Modifier.size(15.dp)
                                )
                                Box(
                                    modifier = Modifier.weight(1f),
                                    contentAlignment = Alignment.CenterStart
                                ) {
                                    if (destinationInput.isEmpty()) {
                                        Text(
                                            text = "Destination (code/city)",
                                            fontSize = 11.sp,
                                            color = TextSubtle,
                                            maxLines = 1,
                                            softWrap = false
                                        )
                                    }
                                    BasicTextField(
                                        value = destinationInput,
                                        onValueChange = { connectionsViewModel.updateDestinationInput(it) },
                                        singleLine = true,
                                        textStyle = TextStyle(
                                            fontSize = 12.sp,
                                            color = TextWhite,
                                            fontWeight = FontWeight.SemiBold
                                        ),
                                        cursorBrush = SolidColor(AeroBlue),
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .testTag("destination_input_field")
                                    )
                                }
                                if (destinationInput.isNotEmpty()) {
                                    Icon(
                                        imageVector = Icons.Default.Close,
                                        contentDescription = "Clear Destination",
                                        tint = TextMuted,
                                        modifier = Modifier
                                            .size(15.dp)
                                            .clickable { connectionsViewModel.clearDestinationInput() }
                                    )
                                }
                            }
                        }
                    }

                    // Autocomplete Suggestion Chips for Departure Input
                    if (departureSuggestions.isNotEmpty()) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Text("Departure matches:", fontSize = 10.sp, color = TextSubtle, fontWeight = FontWeight.Bold)
                            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                items(departureSuggestions, key = { it.iata }) { airport ->
                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = InstrumentSurface,
                                        border = BorderStroke(1.dp, RadarCyan.copy(alpha = 0.5f)),
                                        modifier = Modifier.clickable { connectionsViewModel.selectDepartureAirport(airport) }
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                                        ) {
                                            Text(airport.iata, color = RadarCyan, fontSize = 11.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
                                            Text(airport.city, color = TextWhite, fontSize = 10.sp)
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Autocomplete Suggestion Chips for Destination Input
                    if (destinationSuggestions.isNotEmpty()) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Text("Destination matches:", fontSize = 10.sp, color = TextSubtle, fontWeight = FontWeight.Bold)
                            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                items(destinationSuggestions, key = { it.iata }) { airport ->
                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = InstrumentSurface,
                                        border = BorderStroke(1.dp, AeroBlue.copy(alpha = 0.5f)),
                                        modifier = Modifier.clickable { connectionsViewModel.selectDestinationAirport(airport) }
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                                        ) {
                                            Text(airport.iata, color = AeroBlue, fontSize = 11.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
                                            Text(airport.city, color = TextWhite, fontSize = 10.sp)
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Collapsible Route Filter Drawer (Direction, Haul, Airline filters)
                    AnimatedVisibility(
                        visible = isFilterDrawerExpanded,
                        enter = expandVertically() + fadeIn(),
                        exit = shrinkVertically() + fadeOut()
                    ) {
                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            HorizontalDivider(
                                color = InstrumentBorder.copy(alpha = 0.6f),
                                modifier = Modifier.padding(vertical = 4.dp)
                            )
                            ConnectionsFilterStrip(
                                filterState = filterState,
                                availableAirlines = summary?.availableAirlines.orEmpty(),
                                onDirectionChange = { connectionsViewModel.setDirectionFilter(it) },
                                onAirlineSelect = { connectionsViewModel.setAirlineFilter(it) },
                                onHaulSelect = { connectionsViewModel.setHaulFilter(it) },
                                onClearFilters = { connectionsViewModel.clearAllFilters() }
                            )
                        }
                    }
                }
            }

            // Live Sync Indicator (when fetching routes)
            if (isLoading) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Surface(
                        shape = RoundedCornerShape(20.dp),
                        color = CockpitDark.copy(alpha = 0.90f),
                        border = BorderStroke(1.dp, RadarCyan)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            CircularProgressIndicator(
                                color = RadarCyan,
                                strokeWidth = 1.8.dp,
                                modifier = Modifier.size(11.dp)
                            )
                            Text(
                                text = if (originIata.isNotBlank()) "Syncing $originIata..." else "Loading routes...",
                                color = TextWhite,
                                fontSize = 10.sp,
                                maxLines = 1
                            )
                        }
                    }
                }
            }
        }

        // 3. Compact Floating Bottom Bar That Expands on Route Tap
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .padding(horizontal = 10.dp, vertical = 8.dp)
        ) {
            SelectedRouteInspectorPanel(
                originAirport = summary?.originAirport,
                connections = filteredConnections,
                selectedConnection = selectedConnection,
                isInspectorExpanded = isInspectorExpanded,
                onToggleExpand = { isInspectorExpanded = !isInspectorExpanded },
                onSelectDestination = { destIata ->
                    connectionsViewModel.selectDestinationOnMap(destIata)
                    isInspectorExpanded = true
                },
                onPivotToDestination = { destIata ->
                    connectionsViewModel.pivotToDestinationHub(destIata)
                },
                onViewRouteFlights = { orig, dest ->
                    onOpenRouteFlights(orig, dest)
                },
                onOpenOriginBoard = { orig ->
                    onOpenAirportBoard(orig)
                }
            )
        }
    }

    // Modal Bottom Sheet: Enter / Search Any Airport (e.g., CAI, LHR, DXB, JFK...)
    if (showHubPickerSheet) {
        ModalBottomSheet(
            onDismissRequest = { showHubPickerSheet = false },
            containerColor = CockpitDark,
            contentColor = TextWhite
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
                    .padding(bottom = 28.dp)
            ) {
                Text(
                    text = "Select Origin Airport Hub",
                    color = TextWhite,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "Enter any airport IATA code (e.g. CAI, DXB, LHR, JFK) or city name to display all direct flight connections radiating from it.",
                    color = TextMuted,
                    fontSize = 12.sp,
                    modifier = Modifier.padding(top = 4.dp, bottom = 12.dp)
                )

                OutlinedTextField(
                    value = hubSearchQuery,
                    onValueChange = { connectionsViewModel.updateHubSearchQuery(it) },
                    placeholder = {
                        Text(
                            text = "Type airport code or city (e.g. CAI, Cairo, LHR)...",
                            color = TextSubtle,
                            fontSize = 13.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    },
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Default.FlightTakeoff,
                            contentDescription = null,
                            tint = RadarCyan
                        )
                    },
                    trailingIcon = {
                        if (hubSearchQuery.isNotEmpty()) {
                            IconButton(onClick = { connectionsViewModel.updateHubSearchQuery("") }) {
                                Icon(
                                    imageVector = Icons.Default.Clear,
                                    contentDescription = "Clear search",
                                    tint = TextMuted
                                )
                            }
                        }
                    },
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = RadarCyan,
                        unfocusedBorderColor = InstrumentBorder,
                        focusedTextColor = TextWhite,
                        unfocusedTextColor = TextWhite,
                        focusedContainerColor = InstrumentSurface,
                        unfocusedContainerColor = InstrumentSurface
                    ),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("connections_airport_search_input")
                )

                Spacer(modifier = Modifier.height(12.dp))

                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 360.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(hubSearchResults, key = { it.iata }) { airport ->
                        val isCurrent = airport.iata == originIata
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .border(
                                    1.dp,
                                    if (isCurrent) RadarCyan else InstrumentBorder,
                                    RoundedCornerShape(12.dp)
                                )
                                .clickable {
                                    connectionsViewModel.selectOriginHub(airport.iata)
                                    showHubPickerSheet = false
                                }
                                .testTag("hub_search_result_${airport.iata}"),
                            color = if (isCurrent) InstrumentSurfaceElevated else InstrumentSurface
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 14.dp, vertical = 12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = RadarCyan.copy(alpha = 0.16f),
                                        border = BorderStroke(1.dp, RadarCyan.copy(alpha = 0.4f))
                                    ) {
                                        Text(
                                            text = airport.iata,
                                            color = RadarCyan,
                                            fontSize = 14.sp,
                                            fontWeight = FontWeight.ExtraBold,
                                            fontFamily = FontFamily.Monospace,
                                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                                        )
                                    }
                                    Column {
                                        Text(
                                            text = "${airport.city}, ${airport.country}",
                                            color = TextWhite,
                                            fontSize = 14.sp,
                                            fontWeight = FontWeight.Bold,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                        Text(
                                            text = airport.name,
                                            color = TextMuted,
                                            fontSize = 11.sp,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                    }
                                }
                                Text(
                                    text = airport.region.label,
                                    color = AeroBlue,
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 1
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    // Modal Bottom Sheet: Region & Distance Range Filters
    if (showFilterSheet) {
        ModalBottomSheet(
            onDismissRequest = { showFilterSheet = false },
            containerColor = CockpitDark,
            contentColor = TextWhite
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
                    .padding(bottom = 28.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Filter Route Network",
                        color = TextWhite,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold
                    )
                    TextButton(
                        onClick = { connectionsViewModel.clearAllFilters() },
                        modifier = Modifier.testTag("reset_connections_filters_btn")
                    ) {
                        Text("Reset All", color = RadarCyan, fontWeight = FontWeight.Bold)
                    }
                }

                Text(
                    text = "DISTANCE / HAUL RANGE",
                    color = TextSubtle,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold
                )
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(HaulCategory.entries) { haul ->
                        val selected = filterState.haulCategory == haul
                        FilterChip(
                            selected = selected,
                            onClick = { connectionsViewModel.setHaulFilter(haul) },
                            label = {
                                Text(
                                    text = "${haul.label} (${haul.rangeDescription})",
                                    fontSize = 12.sp,
                                    maxLines = 1
                                )
                            },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = RadarCyan.copy(alpha = 0.22f),
                                selectedLabelColor = RadarCyan,
                                containerColor = InstrumentSurface,
                                labelColor = TextMuted
                            ),
                            modifier = Modifier.testTag("haul_filter_${haul.name.lowercase()}")
                        )
                    }
                }

                Text(
                    text = "DESTINATION REGION",
                    color = TextSubtle,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold
                )
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(RouteRegion.entries) { region ->
                        val selected = filterState.region == region
                        FilterChip(
                            selected = selected,
                            onClick = { connectionsViewModel.setRegionFilter(region) },
                            label = { Text(region.label, fontSize = 12.sp, maxLines = 1) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = AeroBlue.copy(alpha = 0.25f),
                                selectedLabelColor = AeroBlue,
                                containerColor = InstrumentSurface,
                                labelColor = TextMuted
                            ),
                            modifier = Modifier.testTag("region_filter_${region.name.lowercase()}")
                        )
                    }
                }

                Button(
                    onClick = { showFilterSheet = false },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = RadarCyan,
                        contentColor = DeepSpace
                    ),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("apply_connections_filters_btn")
                ) {
                    Text(
                        text = "Show ${filteredConnections.size} Direct Connections",
                        fontWeight = FontWeight.Bold,
                        maxLines = 1
                    )
                }
            }
        }
    }
}


@Composable
private fun ConnectionsFilterStrip(
    filterState: ConnectionsFilterState,
    availableAirlines: List<AirlineFilterChipItem>,
    onDirectionChange: (ConnectionDirection) -> Unit,
    onAirlineSelect: (String?) -> Unit,
    onHaulSelect: (HaulCategory) -> Unit,
    onClearFilters: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 10.dp, vertical = 2.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        // Row 1: Departures / Arrivals / All Toggle + Haul Range Pills
        LazyRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            items(ConnectionDirection.entries) { dir ->
                val selected = filterState.direction == dir
                Surface(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .border(
                            1.dp,
                            if (selected) RadarCyan else InstrumentBorder,
                            RoundedCornerShape(8.dp)
                        )
                        .clickable { onDirectionChange(dir) }
                        .testTag("direction_toggle_${dir.name.lowercase()}"),
                    color = if (selected) RadarCyan.copy(alpha = 0.2f) else InstrumentSurface
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Icon(
                            imageVector = when (dir) {
                                ConnectionDirection.ALL -> Icons.Default.SyncAlt
                                ConnectionDirection.DEPARTURES -> Icons.Default.FlightTakeoff
                                ConnectionDirection.ARRIVALS -> Icons.Default.FlightLand
                            },
                            contentDescription = null,
                            tint = if (selected) RadarCyan else TextMuted,
                            modifier = Modifier.size(12.dp)
                        )
                        Text(
                            text = dir.shortLabel,
                            color = if (selected) RadarCyan else TextMuted,
                            fontSize = 11.sp,
                            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium
                        )
                    }
                }
            }

            item {
                Box(
                    modifier = Modifier
                        .height(18.dp)
                        .width(1.dp)
                        .background(InstrumentBorder)
                )
            }

            items(HaulCategory.entries.filter { it != HaulCategory.ALL }) { haul ->
                val selected = filterState.haulCategory == haul
                Surface(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .border(
                            1.dp,
                            if (selected) AeroBlue else InstrumentBorder,
                            RoundedCornerShape(8.dp)
                        )
                        .clickable {
                            onHaulSelect(if (selected) HaulCategory.ALL else haul)
                        }
                        .testTag("quick_haul_chip_${haul.name.lowercase()}"),
                    color = if (selected) AeroBlue.copy(alpha = 0.22f) else InstrumentSurface
                ) {
                    Text(
                        text = haul.label,
                        color = if (selected) AeroBlue else TextMuted,
                        fontSize = 11.sp,
                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
            }
        }

        // Row 2: Operating Airline Filter Chips
        if (availableAirlines.isNotEmpty()) {
            LazyRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                item {
                    val allSelected = filterState.selectedAirlineCode == null
                    Surface(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .border(
                                1.dp,
                                if (allSelected) RadarCyan else InstrumentBorder,
                                RoundedCornerShape(8.dp)
                            )
                            .clickable { onAirlineSelect(null) }
                            .testTag("airline_chip_all"),
                        color = if (allSelected) RadarCyan.copy(alpha = 0.18f) else InstrumentSurface
                    ) {
                        Text(
                            text = "All Airlines (${availableAirlines.size})",
                            color = if (allSelected) RadarCyan else TextMuted,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                }

                items(availableAirlines, key = { it.code }) { airline ->
                    val isSelected = filterState.selectedAirlineCode.equals(airline.code, ignoreCase = true)
                    Surface(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .border(
                                1.dp,
                                if (isSelected) RadarCyan else InstrumentBorder,
                                RoundedCornerShape(8.dp)
                            )
                            .clickable { onAirlineSelect(airline.code) }
                            .testTag("airline_chip_${airline.code}"),
                        color = if (isSelected) RadarCyan.copy(alpha = 0.22f) else InstrumentSurface
                    ) {
                        Text(
                            text = "${airline.code} · ${airline.name} (${airline.destinationCount})",
                            color = if (isSelected) RadarCyan else TextWhite,
                            fontSize = 10.sp,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                }
            }
        }
    }
}



/**
 * Compact floating bottom bar over the full-screen map that expands into the full
 * Route Inspector Card when a route is tapped.
 */
@Composable
private fun SelectedRouteInspectorPanel(
    originAirport: AirportNode?,
    connections: List<DirectFlightConnection>,
    selectedConnection: DirectFlightConnection?,
    isInspectorExpanded: Boolean,
    onToggleExpand: () -> Unit,
    onSelectDestination: (String) -> Unit,
    onPivotToDestination: (String) -> Unit,
    onViewRouteFlights: (String, String) -> Unit,
    onOpenOriginBoard: (String) -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = CockpitDark.copy(alpha = 0.92f),
        border = BorderStroke(1.dp, InstrumentBorder),
        shadowElevation = 10.dp
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 10.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            if (connections.isEmpty()) {
                Row(
                    modifier = Modifier.padding(horizontal = 4.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Info,
                        contentDescription = null,
                        tint = RadarCyan,
                        modifier = Modifier.size(16.dp)
                    )
                    Text(
                        text = "No direct routes match active filters. Tap Reset All in filters.",
                        color = TextMuted,
                        fontSize = 11.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                return@Surface
            }

            // Compact Horizontal Strip of Connected Destinations (Single-Line Pills)
            LazyRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                items(connections, key = { it.id }) { conn ->
                    val isSelected = conn.destination.iata == selectedConnection?.destination?.iata
                    Surface(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .border(
                                1.dp,
                                if (isSelected) RadarCyan else InstrumentBorder,
                                RoundedCornerShape(8.dp)
                            )
                            .clickable { onSelectDestination(conn.destination.iata) }
                            .testTag("dest_route_chip_${conn.destination.iata}"),
                        color = if (isSelected) InstrumentSurfaceElevated else InstrumentSurface.copy(alpha = 0.85f)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(5.dp)
                        ) {
                            Text(
                                text = if (originAirport != null) conn.destination.iata else "${conn.origin.iata}➔${conn.destination.iata}",
                                color = if (isSelected) RadarCyan else TextWhite,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.ExtraBold,
                                fontFamily = FontFamily.Monospace,
                                maxLines = 1,
                                softWrap = false
                            )
                            Text(
                                text = "${conn.destination.city} · ${conn.durationFormatted}",
                                color = if (isSelected) TextWhite else TextMuted,
                                fontSize = 10.sp,
                                fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                                maxLines = 1,
                                softWrap = false
                            )
                        }
                    }
                }
            }

            // Active Route Bar (Compact 1-line bar by default, expands into full Route Inspector on route tap)
            selectedConnection?.let { route ->
                if (!isInspectorExpanded) {
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(10.dp))
                            .border(1.dp, RadarCyan.copy(alpha = 0.45f), RoundedCornerShape(10.dp))
                            .clickable { onToggleExpand() }
                            .testTag("selected_connection_card"),
                        color = InstrumentSurfaceElevated.copy(alpha = 0.92f)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 10.dp, vertical = 6.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                modifier = Modifier.weight(1f)
                            ) {
                                Text(
                                    text = "${route.origin.iata} ➔ ${route.destination.iata}",
                                    color = RadarCyan,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    fontFamily = FontFamily.Monospace,
                                    maxLines = 1,
                                    softWrap = false
                                )
                                Text(
                                    text = "${route.destination.city} · ${route.durationFormatted}",
                                    color = TextWhite,
                                    fontSize = 11.sp,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }

                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Surface(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(6.dp))
                                        .clickable { onPivotToDestination(route.destination.iata) }
                                        .testTag("pivot_to_destination_btn"),
                                    color = RadarCyan.copy(alpha = 0.18f),
                                    border = BorderStroke(0.8.dp, RadarCyan.copy(alpha = 0.5f))
                                ) {
                                    Text(
                                        text = "Pivot ${route.destination.iata}",
                                        color = RadarCyan,
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        maxLines = 1,
                                        softWrap = false,
                                        modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp)
                                    )
                                }

                                Surface(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(6.dp))
                                        .clickable { onToggleExpand() }
                                        .testTag("toggle_route_inspector_btn"),
                                    color = InstrumentSurface,
                                    border = BorderStroke(0.8.dp, InstrumentBorder)
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(2.dp)
                                    ) {
                                        Text(
                                            text = "Details",
                                            color = RadarCyan,
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Bold,
                                            maxLines = 1,
                                            softWrap = false
                                        )
                                        Icon(
                                            imageVector = Icons.Default.ExpandLess,
                                            contentDescription = "Expand Route Details",
                                            tint = RadarCyan,
                                            modifier = Modifier.size(14.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                } else {
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .border(1.dp, RadarCyan.copy(alpha = 0.55f), RoundedCornerShape(12.dp))
                            .testTag("selected_connection_card"),
                        color = InstrumentSurfaceElevated.copy(alpha = 0.96f)
                    ) {
                        Column(
                            modifier = Modifier.padding(10.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            // Header: Origin -> Destination + Daily Frequency + Collapse Toggle
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Text(
                                        text = "${route.origin.iata} ➔ ${route.destination.iata}",
                                        color = RadarCyan,
                                        fontSize = 14.sp,
                                        fontWeight = FontWeight.ExtraBold,
                                        fontFamily = FontFamily.Monospace,
                                        maxLines = 1,
                                        softWrap = false
                                    )
                                    Text(
                                        text = "${route.origin.city} to ${route.destination.city}, ${route.destination.country}",
                                        color = TextWhite,
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                        modifier = Modifier.weight(1f)
                                    )
                                }

                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Surface(
                                        shape = RoundedCornerShape(6.dp),
                                        color = AeroBlue.copy(alpha = 0.18f),
                                        border = BorderStroke(1.dp, AeroBlue.copy(alpha = 0.45f))
                                    ) {
                                        Text(
                                            text = "${route.dailyFlightsCount}x DAILY",
                                            color = AeroBlue,
                                            fontSize = 9.sp,
                                            fontWeight = FontWeight.Bold,
                                            maxLines = 1,
                                            softWrap = false,
                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                        )
                                    }

                                    Surface(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(6.dp))
                                            .clickable { onToggleExpand() }
                                            .testTag("toggle_route_inspector_btn"),
                                        color = InstrumentSurface,
                                        border = BorderStroke(0.8.dp, InstrumentBorder)
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(2.dp)
                                        ) {
                                            Text(
                                                text = "Minimize",
                                                color = RadarCyan,
                                                fontSize = 9.sp,
                                                fontWeight = FontWeight.Bold,
                                                maxLines = 1,
                                                softWrap = false
                                            )
                                            Icon(
                                                imageVector = Icons.Default.ExpandMore,
                                                contentDescription = "Collapse Route Details",
                                                tint = RadarCyan,
                                                modifier = Modifier.size(13.dp)
                                            )
                                        }
                                    }
                                }
                            }

                            // Evenly weighted 3-column Route Telemetry Metrics Row (Zero vertical wrapping!)
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                RouteMetricPill(
                                    icon = Icons.Default.Schedule,
                                    label = "FLIGHT TIME",
                                    value = route.durationFormatted,
                                    modifier = Modifier.weight(0.9f)
                                )
                                RouteMetricPill(
                                    icon = Icons.Default.Straighten,
                                    label = "DISTANCE",
                                    value = "${route.distanceKm} km (${route.distanceNm} NM)",
                                    modifier = Modifier.weight(1.25f)
                                )
                                RouteMetricPill(
                                    icon = Icons.Default.Public,
                                    label = "HAUL CLASS",
                                    value = route.haulCategory.label,
                                    modifier = Modifier.weight(1f)
                                )
                            }

                            // Operating Airlines & Flight Numbers List
                            LazyRow(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                items(route.operatingCarriers, key = { it.airlineCode }) { carrier ->
                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = CockpitDark,
                                        border = BorderStroke(1.dp, InstrumentBorder)
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                                        ) {
                                            Surface(
                                                shape = RoundedCornerShape(5.dp),
                                                color = RadarCyan.copy(alpha = 0.16f)
                                            ) {
                                                Text(
                                                    text = carrier.airlineCode,
                                                    color = RadarCyan,
                                                    fontSize = 10.sp,
                                                    fontWeight = FontWeight.ExtraBold,
                                                    fontFamily = FontFamily.Monospace,
                                                    maxLines = 1,
                                                    softWrap = false,
                                                    modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp)
                                                )
                                            }
                                            Column {
                                                Text(
                                                    text = "${carrier.airlineName} (${carrier.dailyFrequencies}x/d)",
                                                    color = TextWhite,
                                                    fontSize = 10.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    maxLines = 1,
                                                    softWrap = false
                                                )
                                                Text(
                                                    text = "${carrier.flightNumbers.take(2).joinToString(", ")} · ${carrier.aircraftTypes.firstOrNull() ?: "Jet"}",
                                                    color = TextMuted,
                                                    fontSize = 9.sp,
                                                    maxLines = 1,
                                                    softWrap = false
                                                )
                                            }
                                        }
                                    }
                                }
                            }

                            // Action Buttons: Pivot Hub to Destination | View Flights on Route
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Button(
                                    onClick = { onPivotToDestination(route.destination.iata) },
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = RadarCyan,
                                        contentColor = DeepSpace
                                    ),
                                    shape = RoundedCornerShape(10.dp),
                                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                                    modifier = Modifier
                                        .weight(1f)
                                        .height(34.dp)
                                        .testTag("pivot_to_destination_btn")
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Hub,
                                        contentDescription = null,
                                        modifier = Modifier.size(14.dp)
                                    )
                                    Spacer(modifier = Modifier.width(5.dp))
                                    Text(
                                        text = "Pivot Map to ${route.destination.iata}",
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold,
                                        maxLines = 1,
                                        softWrap = false,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }

                                OutlinedButton(
                                    onClick = { onViewRouteFlights(route.origin.iata, route.destination.iata) },
                                    border = BorderStroke(1.dp, RadarCyan.copy(alpha = 0.65f)),
                                    shape = RoundedCornerShape(10.dp),
                                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                                    modifier = Modifier
                                        .weight(1f)
                                        .height(34.dp)
                                        .testTag("view_route_flights_btn")
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.FlightTakeoff,
                                        contentDescription = null,
                                        tint = RadarCyan,
                                        modifier = Modifier.size(14.dp)
                                    )
                                    Spacer(modifier = Modifier.width(5.dp))
                                    Text(
                                        text = "View ${route.origin.iata}➔${route.destination.iata} Flights",
                                        color = RadarCyan,
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold,
                                        maxLines = 1,
                                        softWrap = false,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RouteMetricPill(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    value: String,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(8.dp),
        color = CockpitDark,
        border = BorderStroke(0.8.dp, InstrumentBorder)
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp),
            verticalArrangement = Arrangement.spacedBy(1.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = RadarCyan,
                    modifier = Modifier.size(11.dp)
                )
                Text(
                    text = label,
                    color = TextSubtle,
                    fontSize = 8.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    softWrap = false,
                    overflow = TextOverflow.Ellipsis
                )
            }
            Text(
                text = value,
                color = TextWhite,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                softWrap = false,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}
