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
        // 1. Full-Screen Interactive Geodesic Flight Connections Map
        summary?.originAirport?.let { originNode ->
            FlightConnectionsMapCanvas(
                originAirport = originNode,
                connections = filteredConnections,
                selectedConnection = selectedConnection,
                direction = filterState.direction,
                onSelectDestination = { destIata ->
                    if (selectedConnection?.destination?.iata == destIata && isInspectorExpanded) {
                        // Second tap on an already-inspected destination pivots the map hub
                        connectionsViewModel.pivotToDestinationHub(destIata)
                    } else {
                        connectionsViewModel.selectDestinationOnMap(destIata)
                        isInspectorExpanded = true
                    }
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
        }

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
                                    text = summary?.originAirport?.iata ?: originIata,
                                    color = DeepSpace,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    fontFamily = FontFamily.Monospace,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                            }
                            Text(
                                text = if (selectedConnection != null && destinationInput.isNotBlank()) {
                                    "${originIata} ➔ ${selectedConnection!!.destination.iata} · ${selectedConnection!!.destination.city}"
                                } else {
                                    "${filteredConnections.size} Direct Routes from ${summary?.originAirport?.city ?: originIata}"
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
                        OutlinedTextField(
                            value = departureInput,
                            onValueChange = { connectionsViewModel.updateDepartureInput(it) },
                            modifier = Modifier
                                .weight(1f)
                                .testTag("departure_input_field"),
                            placeholder = {
                                Text(
                                    text = "Departure (code or city)",
                                    fontSize = 11.sp,
                                    color = TextSubtle,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            },
                            leadingIcon = {
                                Icon(
                                    imageVector = Icons.Default.FlightTakeoff,
                                    contentDescription = "Departure",
                                    tint = RadarCyan,
                                    modifier = Modifier.size(15.dp)
                                )
                            },
                            trailingIcon = {
                                if (departureInput.isNotEmpty()) {
                                    IconButton(
                                        onClick = { connectionsViewModel.clearDepartureInput() },
                                        modifier = Modifier.size(24.dp)
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.Close,
                                            contentDescription = "Clear Departure",
                                            tint = TextMuted,
                                            modifier = Modifier.size(14.dp)
                                        )
                                    }
                                }
                            },
                            singleLine = true,
                            textStyle = androidx.compose.ui.text.TextStyle(fontSize = 12.sp, color = TextWhite, fontWeight = FontWeight.SemiBold),
                            shape = RoundedCornerShape(10.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedContainerColor = InstrumentSurface,
                                unfocusedContainerColor = InstrumentSurface,
                                focusedBorderColor = RadarCyan,
                                unfocusedBorderColor = InstrumentBorder
                            )
                        )

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
                        OutlinedTextField(
                            value = destinationInput,
                            onValueChange = { connectionsViewModel.updateDestinationInput(it) },
                            modifier = Modifier
                                .weight(1f)
                                .testTag("destination_input_field"),
                            placeholder = {
                                Text(
                                    text = "Destination (code, city, All)",
                                    fontSize = 11.sp,
                                    color = TextSubtle,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            },
                            leadingIcon = {
                                Icon(
                                    imageVector = Icons.Default.FlightLand,
                                    contentDescription = "Destination",
                                    tint = AeroBlue,
                                    modifier = Modifier.size(15.dp)
                                )
                            },
                            trailingIcon = {
                                if (destinationInput.isNotEmpty()) {
                                    IconButton(
                                        onClick = { connectionsViewModel.clearDestinationInput() },
                                        modifier = Modifier.size(24.dp)
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.Close,
                                            contentDescription = "Clear Destination",
                                            tint = TextMuted,
                                            modifier = Modifier.size(14.dp)
                                        )
                                    }
                                }
                            },
                            singleLine = true,
                            textStyle = androidx.compose.ui.text.TextStyle(fontSize = 12.sp, color = TextWhite, fontWeight = FontWeight.SemiBold),
                            shape = RoundedCornerShape(10.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedContainerColor = InstrumentSurface,
                                unfocusedContainerColor = InstrumentSurface,
                                focusedBorderColor = AeroBlue,
                                unfocusedBorderColor = InstrumentBorder
                            )
                        )
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

            // Compact Single-Line Floating Legend Pill + Live Sync Indicator
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Surface(
                    shape = RoundedCornerShape(20.dp),
                    color = DeepSpace.copy(alpha = 0.82f),
                    border = BorderStroke(0.8.dp, InstrumentBorder)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        LegendDot(color = StatusLanded, label = "Short (<1.5k km)")
                        LegendDot(color = AeroBlue, label = "Medium")
                        LegendDot(color = StatusBoarding, label = "Long (>4k km)")
                    }
                }

                if (isLoading) {
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
                                text = "Syncing $originIata...",
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
 * Full-Screen Interactive Geodesic World Map Canvas displaying direct flight connections
 * radiating from [originAirport] (e.g., CAI) to all connected airports.
 */
@Composable
private fun FlightConnectionsMapCanvas(
    originAirport: AirportNode,
    connections: List<DirectFlightConnection>,
    selectedConnection: DirectFlightConnection?,
    direction: ConnectionDirection,
    onSelectDestination: (String) -> Unit,
    onTapEmptyMap: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    var zoomScale by remember(originAirport.iata) { mutableFloatStateOf(1.35f) }
    var panOffsetX by remember(originAirport.iata) { mutableFloatStateOf(0f) }
    var panOffsetY by remember(originAirport.iata) { mutableFloatStateOf(0f) }

    val textMeasurer = rememberTextMeasurer()

    val infiniteTransition = rememberInfiniteTransition(label = "connectionsPulse")
    val routeFlowProgress by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(3200, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "routeFlowProgress"
    )
    val hubPulseRadius by infiniteTransition.animateFloat(
        initialValue = 8f,
        targetValue = 32f,
        animationSpec = infiniteRepeatable(
            animation = tween(1800, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "hubPulseRadius"
    )

    val canvasCockpitDark = CockpitDark
    val canvasDeepSpace = DeepSpace
    val canvasRadarCyan = RadarCyan
    val canvasAeroBlue = AeroBlue
    val canvasShortHaul = StatusLanded
    val canvasLongHaul = StatusBoarding
    val canvasTextWhite = TextWhite

    // Remember projected screen coordinates of each destination pin for tap hit-testing
    val pinPositions = remember { mutableStateMapOf<String, Offset>() }

    Box(
        modifier = modifier
            .background(CockpitDark)
            .testTag("connections_map_canvas")
    ) {
        Canvas(
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(originAirport.iata) {
                    detectTransformGestures { _, pan, zoom, _ ->
                        zoomScale = (zoomScale * zoom).coerceIn(0.85f, 4.5f)
                        panOffsetX = (panOffsetX + pan.x).coerceIn(-size.width * 1.4f, size.width * 1.4f)
                        panOffsetY = (panOffsetY + pan.y).coerceIn(-size.height * 1.4f, size.height * 1.4f)
                    }
                }
                .pointerInput(originAirport.iata, connections) {
                    detectTapGestures { tapOffset ->
                        // Find closest airport marker within 44dp touch radius
                        val hitRadiusPx = 44.dp.toPx()
                        val hitEntry = pinPositions.entries
                            .map { (iata, pos) ->
                                val dist = hypot(tapOffset.x - pos.x, tapOffset.y - pos.y)
                                iata to dist
                            }
                            .filter { it.second <= hitRadiusPx }
                            .minByOrNull { it.second }

                        if (hitEntry != null) {
                            onSelectDestination(hitEntry.first)
                        } else {
                            onTapEmptyMap()
                        }
                    }
                }
        ) {
            val w = size.width
            val h = size.height

            // Helper function projecting (lat, lon) centered around originAirport with zoom & pan
            fun projectLatLon(lat: Double, lon: Double): Offset {
                // Center projection on originAirport so CAI (or current hub) sits naturally near center
                val deltaLon = ((lon - originAirport.longitude + 540.0) % 360.0) - 180.0
                val deltaLat = lat - originAirport.latitude

                val baseScaleX = (w / 175f) * zoomScale
                val baseScaleY = (h / 105f) * zoomScale

                val x = (w * 0.5f) + (deltaLon.toFloat() * baseScaleX) + panOffsetX
                val y = (h * 0.48f) - (deltaLat.toFloat() * baseScaleY) + panOffsetY
                return Offset(x, y)
            }

            // 1. Draw subtle lat/lon graticule lines
            for (lonStep in -150..180 step 30) {
                val pStart = projectLatLon(-70.0, lonStep.toDouble())
                val pEnd = projectLatLon(75.0, lonStep.toDouble())
                drawLine(
                    color = canvasRadarCyan.copy(alpha = 0.05f),
                    start = Offset(pStart.x, 0f),
                    end = Offset(pEnd.x, h),
                    strokeWidth = 1.dp.toPx()
                )
            }
            for (latStep in -60..60 step 20) {
                val pStart = projectLatLon(latStep.toDouble(), -180.0)
                drawLine(
                    color = canvasRadarCyan.copy(alpha = 0.05f),
                    start = Offset(0f, pStart.y),
                    end = Offset(w, pStart.y),
                    strokeWidth = 1.dp.toPx()
                )
            }

            // 2. Draw stylized world continental landmass polygons for geographic context
            drawWorldContinents(::projectLatLon, canvasRadarCyan.copy(alpha = 0.07f), canvasRadarCyan.copy(alpha = 0.16f))

            val originOffset = projectLatLon(originAirport.latitude, originAirport.longitude)

            // 3. Draw concentric distance range rings around the Origin Hub (e.g., CAI)
            val ringRadii = listOf(90f, 185f, 290f).map { it * (zoomScale * 0.78f) }
            ringRadii.forEach { r ->
                drawCircle(
                    color = canvasRadarCyan.copy(alpha = 0.09f),
                    radius = r,
                    center = originOffset,
                    style = Stroke(
                        width = 1.dp.toPx(),
                        pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 10f), 0f)
                    )
                )
            }

            pinPositions.clear()

            // 4. Draw all Direct Flight Connection Geodesic Arcs
            connections.forEach { conn ->
                val destOffset = projectLatLon(conn.destination.latitude, conn.destination.longitude)
                pinPositions[conn.destination.iata] = destOffset

                val isSelected = selectedConnection?.destination?.iata == conn.destination.iata
                val routeColor = when {
                    isSelected -> canvasRadarCyan
                    conn.haulCategory == HaulCategory.SHORT_HAUL -> canvasShortHaul
                    conn.haulCategory == HaulCategory.MEDIUM_HAUL -> canvasAeroBlue
                    else -> canvasLongHaul
                }

                // Compute great-circle upward control point
                val midX = (originOffset.x + destOffset.x) / 2f
                val midY = (originOffset.y + destOffset.y) / 2f
                val chordDist = hypot(destOffset.x - originOffset.x, destOffset.y - originOffset.y)
                val arcLift = (chordDist * 0.18f).coerceIn(14f, 95f)
                val controlPoint = Offset(midX, midY - arcLift)

                val routePath = Path().apply {
                    moveTo(originOffset.x, originOffset.y)
                    quadraticTo(controlPoint.x, controlPoint.y, destOffset.x, destOffset.y)
                }

                if (isSelected) {
                    // Outer neon glow for selected route
                    drawPath(
                        path = routePath,
                        color = canvasRadarCyan.copy(alpha = 0.32f),
                        style = Stroke(width = 6.dp.toPx(), cap = StrokeCap.Round)
                    )
                    drawPath(
                        path = routePath,
                        color = canvasRadarCyan,
                        style = Stroke(width = 2.6.dp.toPx(), cap = StrokeCap.Round)
                    )
                } else {
                    drawPath(
                        path = routePath,
                        color = routeColor.copy(alpha = 0.52f),
                        style = Stroke(width = 1.5.dp.toPx(), cap = StrokeCap.Round)
                    )
                }

                // Animated directional pulse along the arc (Outbound vs Inbound)
                val rawT = if (direction == ConnectionDirection.ARRIVALS) {
                    1f - routeFlowProgress
                } else {
                    routeFlowProgress
                }
                val t = ((rawT + (conn.destination.iata.hashCode().absoluteValue % 100) / 100f) % 1f)
                val pulseX = (1 - t).pow(2) * originOffset.x + 2 * (1 - t) * t * controlPoint.x + t.pow(2) * destOffset.x
                val pulseY = (1 - t).pow(2) * originOffset.y + 2 * (1 - t) * t * controlPoint.y + t.pow(2) * destOffset.y

                drawCircle(
                    color = if (isSelected) canvasTextWhite else routeColor.copy(alpha = 0.85f),
                    radius = if (isSelected) 4.dp.toPx() else 2.2.dp.toPx(),
                    center = Offset(pulseX, pulseY)
                )
            }

            // 5. Draw Destination Airport Nodes & IATA Labels
            connections.forEach { conn ->
                val destOffset = pinPositions[conn.destination.iata] ?: return@forEach
                val isSelected = selectedConnection?.destination?.iata == conn.destination.iata
                val pinColor = when {
                    isSelected -> canvasRadarCyan
                    conn.haulCategory == HaulCategory.SHORT_HAUL -> canvasShortHaul
                    conn.haulCategory == HaulCategory.MEDIUM_HAUL -> canvasAeroBlue
                    else -> canvasLongHaul
                }

                if (isSelected) {
                    drawCircle(
                        color = canvasRadarCyan.copy(alpha = 0.28f),
                        radius = 13.dp.toPx(),
                        center = destOffset
                    )
                }

                drawCircle(
                    color = pinColor,
                    radius = if (isSelected) 6.dp.toPx() else 4.2.dp.toPx(),
                    center = destOffset
                )
                drawCircle(
                    color = canvasDeepSpace,
                    radius = if (isSelected) 2.5.dp.toPx() else 1.8.dp.toPx(),
                    center = destOffset
                )

                // Draw IATA badge next to marker
                val labelText = conn.destination.iata
                val measured = textMeasurer.measure(
                    text = labelText,
                    style = TextStyle(
                        color = if (isSelected) canvasDeepSpace else canvasTextWhite,
                        fontSize = if (isSelected) 11.sp else 9.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )
                )
                val padH = 4.dp.toPx()
                val padV = 2.dp.toPx()
                val badgeW = measured.size.width + padH * 2
                val badgeH = measured.size.height + padV * 2
                val badgeTopLeft = Offset(
                    x = destOffset.x - badgeW / 2f,
                    y = destOffset.y - badgeH - (if (isSelected) 10.dp.toPx() else 7.dp.toPx())
                )

                drawRoundRect(
                    color = if (isSelected) canvasRadarCyan else canvasCockpitDark.copy(alpha = 0.86f),
                    topLeft = badgeTopLeft,
                    size = Size(badgeW, badgeH),
                    cornerRadius = CornerRadius(4.dp.toPx(), 4.dp.toPx())
                )
                if (!isSelected) {
                    drawRoundRect(
                        color = pinColor.copy(alpha = 0.65f),
                        topLeft = badgeTopLeft,
                        size = Size(badgeW, badgeH),
                        cornerRadius = CornerRadius(4.dp.toPx(), 4.dp.toPx()),
                        style = Stroke(width = 0.8.dp.toPx())
                    )
                }
                drawText(
                    textLayoutResult = measured,
                    topLeft = Offset(badgeTopLeft.x + padH, badgeTopLeft.y + padV)
                )
            }

            // 6. Draw Origin Airport Hub Beacon (e.g., CAI) on top
            drawCircle(
                color = canvasRadarCyan.copy(alpha = 0.25f),
                radius = hubPulseRadius.dp.toPx(),
                center = originOffset
            )
            drawCircle(
                color = canvasRadarCyan,
                radius = 8.dp.toPx(),
                center = originOffset
            )
            drawCircle(
                color = canvasDeepSpace,
                radius = 3.5.dp.toPx(),
                center = originOffset
            )

            val originMeasured = textMeasurer.measure(
                text = "★ ${originAirport.iata}",
                style = TextStyle(
                    color = canvasDeepSpace,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.ExtraBold,
                    fontFamily = FontFamily.Monospace
                )
            )
            val oPadH = 6.dp.toPx()
            val oPadV = 3.dp.toPx()
            val oBadgeW = originMeasured.size.width + oPadH * 2
            val oBadgeH = originMeasured.size.height + oPadV * 2
            val oTopLeft = Offset(
                x = originOffset.x - oBadgeW / 2f,
                y = originOffset.y + 10.dp.toPx()
            )
            drawRoundRect(
                color = canvasRadarCyan,
                topLeft = oTopLeft,
                size = Size(oBadgeW, oBadgeH),
                cornerRadius = CornerRadius(6.dp.toPx(), 6.dp.toPx())
            )
            drawText(
                textLayoutResult = originMeasured,
                topLeft = Offset(oTopLeft.x + oPadH, oTopLeft.y + oPadV)
            )
        }

        // Center-Right Floating Map Zoom & Re-Center Controls (unobstructed by top or bottom bars)
        Column(
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .padding(end = 12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            SmallMapControlButton(
                icon = Icons.Default.Add,
                contentDescription = "Zoom In Connections Map",
                tag = "connections_zoom_in_btn",
                onClick = { zoomScale = (zoomScale * 1.25f).coerceAtMost(4.5f) }
            )
            SmallMapControlButton(
                icon = Icons.Default.Remove,
                contentDescription = "Zoom Out Connections Map",
                tag = "connections_zoom_out_btn",
                onClick = { zoomScale = (zoomScale / 1.25f).coerceAtLeast(0.85f) }
            )
            SmallMapControlButton(
                icon = Icons.Default.CenterFocusStrong,
                contentDescription = "Center on Origin Airport",
                tag = "connections_recenter_btn",
                onClick = {
                    zoomScale = 1.35f
                    panOffsetX = 0f
                    panOffsetY = 0f
                }
            )
        }
    }
}

@Composable
private fun LegendDot(color: Color, label: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Box(
            modifier = Modifier
                .size(7.dp)
                .clip(CircleShape)
                .background(color)
        )
        Text(
            text = label,
            color = TextMuted,
            fontSize = 9.sp,
            maxLines = 1,
            softWrap = false
        )
    }
}

@Composable
private fun SmallMapControlButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    contentDescription: String,
    tag: String,
    onClick: () -> Unit
) {
    Surface(
        modifier = Modifier
            .size(34.dp)
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, InstrumentBorder, RoundedCornerShape(8.dp))
            .clickable { onClick() }
            .testTag(tag),
        color = DeepSpace.copy(alpha = 0.88f)
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(
                imageVector = icon,
                contentDescription = contentDescription,
                tint = TextWhite,
                modifier = Modifier.size(18.dp)
            )
        }
    }
}

/**
 * Draws simplified continental landmass outlines so the connections map immediately
 * conveys geographic orientation (Africa/Nile/Red Sea, Europe/Mediterranean, Asia, Americas).
 */
private fun DrawScope.drawWorldContinents(
    project: (Double, Double) -> Offset,
    fillColor: Color,
    strokeColor: Color
) {
    val continents = listOf(
        // Africa
        listOf(
            37.0 to -6.0, 37.2 to 10.5, 32.0 to 32.0, 29.5 to 34.8, 12.0 to 44.0,
            11.8 to 51.2, -2.0 to 41.0, -15.0 to 40.5, -26.0 to 33.0, -34.8 to 20.0,
            -18.0 to 12.0, 4.0 to 9.5, 4.5 to -7.5, 14.7 to -17.5, 28.0 to -13.0, 35.8 to -5.5
        ),
        // Europe
        listOf(
            36.0 to -9.0, 43.5 to -9.0, 48.5 to -4.5, 51.0 to 2.0, 54.0 to 8.5,
            58.0 to 8.0, 63.0 to 10.0, 68.0 to 18.0, 60.0 to 30.0, 47.0 to 39.0,
            41.0 to 29.0, 38.0 to 24.0, 40.0 to 18.0, 44.0 to 12.0, 41.0 to 14.0,
            38.0 to 15.5, 43.0 to 5.0, 41.0 to 2.0, 36.5 to -5.5
        ),
        // UK & Ireland
        listOf(
            50.0 to -5.5, 51.5 to 1.2, 55.0 to -1.5, 58.5 to -3.2, 54.5 to -8.0
        ),
        // Middle East & Asia
        listOf(
            41.0 to 29.5, 42.0 to 41.5, 38.0 to 48.0, 29.5 to 48.5, 26.0 to 56.5,
            22.5 to 59.8, 13.0 to 45.0, 18.0 to 41.0, 28.0 to 35.0, 31.5 to 34.5,
            36.5 to 36.0, 41.0 to 29.5
        ),
        // Wider Asia & India/China/SE Asia
        listOf(
            45.0 to 50.0, 55.0 to 75.0, 52.0 to 135.0, 38.0 to 122.0, 22.5 to 114.0,
            1.5 to 104.0, 15.0 to 96.0, 22.0 to 88.0, 8.0 to 77.5, 19.0 to 72.8,
            25.0 to 67.0, 27.0 to 56.0, 40.0 to 50.0
        ),
        // North America
        listOf(
            65.0 to -165.0, 70.0 to -130.0, 60.0 to -64.0, 47.0 to -53.0, 40.5 to -74.0,
            25.5 to -80.2, 29.0 to -95.0, 19.0 to -96.0, 16.0 to -95.0, 32.5 to -117.0,
            37.7 to -122.4, 48.0 to -124.5, 60.0 to -148.0
        ),
        // South America
        listOf(
            11.0 to -75.0, 8.0 to -60.0, -5.0 to -35.0, -23.5 to -43.0, -35.0 to -55.0,
            -54.0 to -68.0, -33.0 to -71.5, -12.0 to -77.0, 0.0 to -80.0
        ),
        // Australia
        listOf(
            -12.5 to 131.0, -16.0 to 145.5, -28.0 to 153.5, -34.0 to 151.0,
            -38.0 to 145.0, -35.0 to 136.0, -32.0 to 115.8, -21.0 to 114.0
        )
    )

    for (poly in continents) {
        if (poly.isEmpty()) continue
        val path = Path()
        poly.forEachIndexed { idx, (lat, lon) ->
            val pt = project(lat, lon)
            if (idx == 0) path.moveTo(pt.x, pt.y) else path.lineTo(pt.x, pt.y)
        }
        path.close()
        drawPath(path = path, color = fillColor)
        drawPath(path = path, color = strokeColor, style = Stroke(width = 1.dp.toPx()))
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
                                text = conn.destination.iata,
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
                                    text = "${route.destination.city} · ${route.durationFormatted} · ${route.dailyFlightsCount}x/d",
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
