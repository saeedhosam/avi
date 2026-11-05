package com.example.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.model.FlightCategory
import com.example.model.RealtimeAirportInfo
import com.example.ui.theme.*
import com.example.ui.viewmodel.AirportSearchUiState
import com.example.ui.viewmodel.AirportSearchViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AirportSearchScreen(
    viewModel: AirportSearchViewModel = viewModel(),
    onOpenAirportBoard: (String) -> Unit = {},
    onOpenTerminalMap: (String) -> Unit = {},
    onBack: (() -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val searchQuery by viewModel.searchQuery.collectAsStateWithLifecycle()
    val selectedRegion by viewModel.selectedRegion.collectAsStateWithLifecycle()
    val selectedStatus by viewModel.selectedStatusFilter.collectAsStateWithLifecycle()
    val selectedAirport by viewModel.selectedAirport.collectAsStateWithLifecycle()

    val regions = listOf("All", "Americas", "Europe", "Asia-Pacific", "Middle East")
    val statusFilters = listOf("All", "On-Time", "Delayed", "Weather Alerts")

    Scaffold(
        modifier = modifier.testTag("airport_search_screen"),
        containerColor = DeepSpace,
        topBar = {
            TopAppBar(
                title = {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(32.dp)
                                .clip(CircleShape)
                                .background(RadarCyan.copy(alpha = 0.2f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.FlightTakeoff,
                                contentDescription = null,
                                tint = RadarCyan,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                        Column {
                            Text(
                                text = "Real-Time Airport Explorer",
                                color = TextWhite,
                                fontSize = 17.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = "Live ATC telemetry · Runway status · Global METAR",
                                color = TextMuted,
                                fontSize = 11.sp
                            )
                        }
                    }
                },
                navigationIcon = {
                    if (onBack != null) {
                        IconButton(onClick = onBack) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = "Back",
                                tint = TextWhite
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = CockpitDark)
            )
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            // Search Input Header
            Surface(
                color = CockpitDark,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp)) {
                    OutlinedTextField(
                        value = searchQuery,
                        onValueChange = { viewModel.onSearchQueryChanged(it) },
                        placeholder = {
                            Text(
                                text = "Search airport (e.g. JFK, London, Tokyo, DXB)...",
                                color = TextMuted,
                                fontSize = 13.sp
                            )
                        },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Default.Search,
                                contentDescription = "Search",
                                tint = RadarCyan
                            )
                        },
                        trailingIcon = {
                            if (searchQuery.isNotEmpty()) {
                                IconButton(
                                    onClick = { viewModel.clearSearch() },
                                    modifier = Modifier.testTag("airport_search_clear_button")
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Close,
                                        contentDescription = "Clear",
                                        tint = TextMuted
                                    )
                                }
                            }
                        },
                        singleLine = true,
                        shape = RoundedCornerShape(12.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = RadarCyan,
                            unfocusedBorderColor = InstrumentBorder,
                            focusedContainerColor = InstrumentSurface,
                            unfocusedContainerColor = InstrumentSurface,
                            focusedTextColor = TextWhite,
                            unfocusedTextColor = TextWhite
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("airport_search_input")
                    )

                    Spacer(modifier = Modifier.height(10.dp))

                    // Region Filter Chips
                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        items(regions) { region ->
                            val isSelected = region == selectedRegion
                            FilterChip(
                                selected = isSelected,
                                onClick = { viewModel.onRegionSelected(region) },
                                label = {
                                    Text(
                                        text = region,
                                        fontSize = 12.sp,
                                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                                    )
                                },
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = RadarCyan.copy(alpha = 0.25f),
                                    selectedLabelColor = RadarCyan,
                                    containerColor = InstrumentSurface,
                                    labelColor = TextMuted
                                ),
                                border = FilterChipDefaults.filterChipBorder(
                                    enabled = true,
                                    selected = isSelected,
                                    borderColor = InstrumentBorder,
                                    selectedBorderColor = RadarCyan
                                ),
                                modifier = Modifier.testTag("airport_chip_$region")
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(4.dp))

                    // Status Filter Chips
                    LazyRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        items(statusFilters) { status ->
                            val isSelected = status == selectedStatus
                            FilterChip(
                                selected = isSelected,
                                onClick = { viewModel.onStatusFilterSelected(status) },
                                label = {
                                    Text(
                                        text = status,
                                        fontSize = 11.sp,
                                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                                    )
                                },
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = if (status == "Delayed") StatusCancelled.copy(alpha = 0.25f) else RadarCyan.copy(alpha = 0.2f),
                                    selectedLabelColor = if (status == "Delayed") StatusCancelled else RadarCyan,
                                    containerColor = InstrumentSurface,
                                    labelColor = TextMuted
                                ),
                                border = FilterChipDefaults.filterChipBorder(
                                    enabled = true,
                                    selected = isSelected,
                                    borderColor = InstrumentBorder,
                                    selectedBorderColor = if (status == "Delayed") StatusCancelled else RadarCyan
                                )
                            )
                        }
                    }
                }
            }

            // Body Content based on UiState
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp)
            ) {
                when (val state = uiState) {
                    is AirportSearchUiState.Loading -> {
                        AirportSearchLoadingView(message = state.message)
                    }
                    is AirportSearchUiState.Error -> {
                        AirportSearchErrorView(
                            message = state.message,
                            onRetry = { viewModel.retry() }
                        )
                    }
                    is AirportSearchUiState.Empty -> {
                        AirportSearchEmptyView(
                            query = state.query,
                            suggestions = state.suggestions,
                            onSuggestionClick = { viewModel.selectRecentSearch(it) }
                        )
                    }
                    is AirportSearchUiState.Idle -> {
                        AirportSearchIdleView(
                            featuredAirports = state.featuredAirports,
                            recentSearches = state.recentSearches,
                            onAirportClick = { viewModel.selectAirport(it) },
                            onOpenBoard = onOpenAirportBoard,
                            onOpenTerminal = onOpenTerminalMap,
                            onRecentClick = { viewModel.selectRecentSearch(it) }
                        )
                    }
                    is AirportSearchUiState.Success -> {
                        AirportSearchSuccessView(
                            airports = state.airports,
                            totalCount = state.totalCount,
                            delayedCount = state.delayedCount,
                            onAirportClick = { viewModel.selectAirport(it) },
                            onOpenBoard = onOpenAirportBoard,
                            onOpenTerminal = onOpenTerminalMap
                        )
                    }
                }
            }
        }
    }

    // Quick Airport Detail / METAR Modal Sheet
    if (selectedAirport != null) {
        AirportDetailModal(
            airport = selectedAirport!!,
            onDismiss = { viewModel.selectAirport(null) },
            onOpenBoard = {
                val code = selectedAirport!!.code
                viewModel.selectAirport(null)
                onOpenAirportBoard(code)
            },
            onOpenTerminal = {
                val code = selectedAirport!!.code
                viewModel.selectAirport(null)
                onOpenTerminalMap(code)
            }
        )
    }
}

@Composable
private fun AirportSearchLoadingView(message: String) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .testTag("airport_search_loading"),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        CircularProgressIndicator(
            color = RadarCyan,
            strokeWidth = 3.dp,
            modifier = Modifier.size(48.dp)
        )
        Spacer(modifier = Modifier.height(18.dp))
        Text(
            text = message,
            color = TextWhite,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium
        )
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = "Aggregating global ADS-B radar, FAA ATC feeds & METAR",
            color = TextMuted,
            fontSize = 12.sp
        )
    }
}

@Composable
private fun AirportSearchErrorView(
    message: String,
    onRetry: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Default.Warning,
            contentDescription = null,
            tint = StatusCancelled,
            modifier = Modifier.size(54.dp)
        )
        Spacer(modifier = Modifier.height(14.dp))
        Text(
            text = "Airport Telemetry Unavailable",
            color = TextWhite,
            fontSize = 17.sp,
            fontWeight = FontWeight.Bold
        )
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = message,
            color = TextMuted,
            fontSize = 13.sp
        )
        Spacer(modifier = Modifier.height(20.dp))
        Button(
            onClick = onRetry,
            colors = ButtonDefaults.buttonColors(containerColor = RadarCyan, contentColor = DeepSpace),
            shape = RoundedCornerShape(10.dp),
            modifier = Modifier.testTag("airport_search_retry_button")
        ) {
            Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text("Retry Search", fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun AirportSearchEmptyView(
    query: String,
    suggestions: List<String>,
    onSuggestionClick: (String) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .testTag("airport_search_empty"),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Default.SearchOff,
            contentDescription = null,
            tint = TextMuted,
            modifier = Modifier.size(54.dp)
        )
        Spacer(modifier = Modifier.height(14.dp))
        Text(
            text = "No Airports Found",
            color = TextWhite,
            fontSize = 17.sp,
            fontWeight = FontWeight.Bold
        )
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = "No matches for \"$query\". Try airport code or major city.",
            color = TextMuted,
            fontSize = 13.sp
        )
        Spacer(modifier = Modifier.height(18.dp))
        Text(
            text = "Suggested Hubs:",
            color = RadarCyan,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold
        )
        Spacer(modifier = Modifier.height(8.dp))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(suggestions) { hub ->
                SuggestionChip(
                    onClick = { onSuggestionClick(hub) },
                    label = { Text(hub, color = TextWhite, fontSize = 12.sp) },
                    colors = SuggestionChipDefaults.suggestionChipColors(containerColor = InstrumentSurface),
                    border = SuggestionChipDefaults.suggestionChipBorder(
                        enabled = true,
                        borderColor = InstrumentBorder
                    )
                )
            }
        }
    }
}

@Composable
private fun AirportSearchIdleView(
    featuredAirports: List<RealtimeAirportInfo>,
    recentSearches: List<String>,
    onAirportClick: (RealtimeAirportInfo) -> Unit,
    onOpenBoard: (String) -> Unit,
    onOpenTerminal: (String) -> Unit,
    onRecentClick: (String) -> Unit
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        if (recentSearches.isNotEmpty()) {
            item {
                Column {
                    Text(
                        text = "RECENT SEARCHES",
                        color = TextMuted,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(recentSearches) { searchItem ->
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = InstrumentSurface,
                                border = androidx.compose.foundation.BorderStroke(1.dp, InstrumentBorder),
                                modifier = Modifier.clickable { onRecentClick(searchItem) }
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Icon(
                                        Icons.Default.History,
                                        contentDescription = null,
                                        tint = RadarCyan,
                                        modifier = Modifier.size(14.dp)
                                    )
                                    Text(searchItem, color = TextWhite, fontSize = 12.sp)
                                }
                            }
                        }
                    }
                }
            }
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "FEATURED GLOBAL HUBS",
                    color = RadarCyan,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "Live status",
                    color = TextMuted,
                    fontSize = 11.sp
                )
            }
        }

        items(featuredAirports) { airport ->
            RealtimeAirportCard(
                airport = airport,
                onClick = { onAirportClick(airport) },
                onOpenBoard = { onOpenBoard(airport.code) },
                onOpenTerminal = { onOpenTerminal(airport.code) }
            )
        }
    }
}

@Composable
private fun AirportSearchSuccessView(
    airports: List<RealtimeAirportInfo>,
    totalCount: Int,
    delayedCount: Int,
    onAirportClick: (RealtimeAirportInfo) -> Unit,
    onOpenBoard: (String) -> Unit,
    onOpenTerminal: (String) -> Unit
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "$totalCount AIRPORTS FOUND",
                    color = TextWhite,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold
                )
                if (delayedCount > 0) {
                    Text(
                        text = "$delayedCount affected by ATC delays",
                        color = StatusDelayed,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }

        items(airports) { airport ->
            RealtimeAirportCard(
                airport = airport,
                onClick = { onAirportClick(airport) },
                onOpenBoard = { onOpenBoard(airport.code) },
                onOpenTerminal = { onOpenTerminal(airport.code) }
            )
        }
    }
}

@Composable
private fun RealtimeAirportCard(
    airport: RealtimeAirportInfo,
    onClick: () -> Unit,
    onOpenBoard: () -> Unit,
    onOpenTerminal: () -> Unit
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .border(1.dp, InstrumentBorder, RoundedCornerShape(16.dp))
            .clickable { onClick() }
            .testTag("airport_card_${airport.code}"),
        color = InstrumentSurface
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // Header Row: Code, Name, Region & Delay Badge
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(46.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(RadarCyan.copy(alpha = 0.2f))
                            .border(1.dp, RadarCyan, RoundedCornerShape(12.dp)),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                text = airport.code,
                                color = RadarCyan,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Black
                            )
                            Text(
                                text = airport.icao,
                                color = TextMuted,
                                fontSize = 9.sp
                            )
                        }
                    }

                    Column {
                        Text(
                            text = airport.name,
                            color = TextWhite,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Text(
                            text = "${airport.city}, ${airport.country} · ${airport.timezone}",
                            color = TextMuted,
                            fontSize = 12.sp
                        )
                    }
                }

                // Flight Category Badge (VFR/MVFR/IFR)
                val categoryColor = when (airport.weather.flightCategory) {
                    FlightCategory.VFR -> StatusLanded
                    FlightCategory.MVFR -> StatusDelayed
                    FlightCategory.IFR -> StatusCancelled
                }
                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = categoryColor.copy(alpha = 0.2f),
                    border = androidx.compose.foundation.BorderStroke(1.dp, categoryColor)
                ) {
                    Text(
                        text = airport.weather.flightCategory.name,
                        color = categoryColor,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Operational Status Bar
            Surface(
                shape = RoundedCornerShape(8.dp),
                color = if (airport.isDelayed) StatusCancelled.copy(alpha = 0.15f) else StatusLanded.copy(alpha = 0.12f),
                border = androidx.compose.foundation.BorderStroke(
                    0.8.dp,
                    if (airport.isDelayed) StatusCancelled.copy(alpha = 0.5f) else StatusLanded.copy(alpha = 0.4f)
                ),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(
                        imageVector = if (airport.isDelayed) Icons.Default.Warning else Icons.Default.CheckCircle,
                        contentDescription = null,
                        tint = if (airport.isDelayed) StatusCancelled else StatusLanded,
                        modifier = Modifier.size(14.dp)
                    )
                    Text(
                        text = airport.operationalStatus,
                        color = if (airport.isDelayed) StatusCancelled else StatusLanded,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Real-Time Metrics Grid
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                MetricColumn(
                    title = "Departures",
                    value = "${airport.activeDeparturesCount} active",
                    icon = Icons.Default.FlightTakeoff,
                    tint = RadarCyan
                )
                MetricColumn(
                    title = "Arrivals",
                    value = "${airport.activeArrivalsCount} active",
                    icon = Icons.Default.FlightLand,
                    tint = StatusLanded
                )
                MetricColumn(
                    title = "Weather",
                    value = "${airport.weather.tempC}°C / ${airport.weather.tempF}°F",
                    icon = Icons.Default.WbSunny,
                    tint = StatusDelayed
                )
                MetricColumn(
                    title = "On-Time",
                    value = "${airport.onTimePercentage}%",
                    icon = Icons.Default.Speed,
                    tint = if (airport.onTimePercentage >= 90) StatusLanded else StatusDelayed
                )
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Action Buttons
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedButton(
                    onClick = onOpenBoard,
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = RadarCyan),
                    border = androidx.compose.foundation.BorderStroke(1.dp, RadarCyan.copy(alpha = 0.7f)),
                    modifier = Modifier
                        .weight(1f)
                        .testTag("airport_board_button_${airport.code}")
                ) {
                    Icon(Icons.Default.Schedule, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Live Board", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }

                Button(
                    onClick = onOpenTerminal,
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = CockpitDark, contentColor = TextWhite),
                    border = androidx.compose.foundation.BorderStroke(1.dp, InstrumentBorder),
                    modifier = Modifier
                        .weight(1f)
                        .testTag("airport_terminal_button_${airport.code}")
                ) {
                    Icon(Icons.Default.Layers, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Terminal Map", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun MetricColumn(
    title: String,
    value: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    tint: Color
) {
    Column {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Icon(imageVector = icon, contentDescription = null, tint = tint, modifier = Modifier.size(12.dp))
            Text(text = title, color = TextMuted, fontSize = 10.sp)
        }
        Text(
            text = value,
            color = TextWhite,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
private fun AirportDetailModal(
    airport: RealtimeAirportInfo,
    onDismiss: () -> Unit,
    onOpenBoard: () -> Unit,
    onOpenTerminal: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "${airport.code} · ${airport.city}",
                        color = TextWhite,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = airport.name,
                        color = RadarCyan,
                        fontSize = 12.sp
                    )
                }
                IconButton(onClick = onDismiss) {
                    Icon(Icons.Default.Close, contentDescription = "Close", tint = TextMuted)
                }
            }
        },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                // Weather & METAR Box
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = DeepSpace,
                    border = androidx.compose.foundation.BorderStroke(1.dp, InstrumentBorder),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text(
                            text = "METAR TELEMETRY",
                            color = RadarCyan,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = airport.weather.metarRaw,
                            color = TextWhite,
                            fontSize = 12.sp,
                            fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = "Condition: ${airport.weather.condition} · Wind: ${airport.weather.wind} · Vis: ${airport.weather.visibility}",
                            color = TextMuted,
                            fontSize = 11.sp
                        )
                    }
                }

                // Runway Operations
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = DeepSpace,
                    border = androidx.compose.foundation.BorderStroke(1.dp, InstrumentBorder),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text(
                            text = "ACTIVE RUNWAYS",
                            color = RadarCyan,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = airport.activeRunways.joinToString("  •  "),
                            color = TextWhite,
                            fontSize = 12.sp
                        )
                    }
                }

                // Hub Carriers
                if (airport.hubAirlines.isNotEmpty()) {
                    Text(
                        text = "Major Operating Airlines: " + airport.hubAirlines.joinToString(", "),
                        color = TextMuted,
                        fontSize = 12.sp
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = onOpenBoard,
                colors = ButtonDefaults.buttonColors(containerColor = RadarCyan, contentColor = DeepSpace)
            ) {
                Text("View Departures & Arrivals", fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            OutlinedButton(
                onClick = onOpenTerminal,
                colors = ButtonDefaults.outlinedButtonColors(contentColor = TextWhite)
            ) {
                Text("Terminal Layout")
            }
        },
        containerColor = CockpitDark
    )
}
