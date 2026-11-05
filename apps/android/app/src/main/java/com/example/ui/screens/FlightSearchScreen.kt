package com.example.ui.screens

import androidx.compose.animation.*
import androidx.compose.foundation.Image
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
import androidx.compose.material.icons.automirrored.filled.AltRoute
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.R
import com.example.data.MockFlightData
import com.example.data.local.RecentSearchEntity
import com.example.data.preferences.ThemeMode
import com.example.model.Flight
import com.example.model.FlightStatus
import com.example.ui.components.DataSourceStatusBanner
import com.example.ui.components.FlightCard
import com.example.ui.components.ThemeSelectionDialog
import com.example.ui.theme.*
import com.example.ui.viewmodel.FlightViewModel
import com.example.ui.viewmodel.SearchMode
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FlightSearchScreen(
    viewModel: FlightViewModel,
    onFlightSelected: (Flight) -> Unit,
    onOpenNotifications: () -> Unit,
    onOpenAccount: () -> Unit,
    modifier: Modifier = Modifier
) {
    val coroutineScope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    val searchQuery by viewModel.searchQuery.collectAsState()
    val statusFilter by viewModel.statusFilter.collectAsState()
    val searchMode by viewModel.searchMode.collectAsState()
    val routeOrigin by viewModel.routeOrigin.collectAsState()
    val routeDestination by viewModel.routeDestination.collectAsState()
    val onlyTrackedFilter by viewModel.onlyTrackedFilter.collectAsState()
    val flights by viewModel.filteredFlights.collectAsState()
    val allFlights by viewModel.flights.collectAsState()
    val recentSearches by viewModel.recentSearches.collectAsState()
    val trackedFlights by viewModel.trackedFlights.collectAsState()
    val unreadAlerts by viewModel.unreadAlertCount.collectAsState()
    val userAccount by viewModel.userAccount.collectAsState()
    val themeMode by viewModel.themeMode.collectAsState()
    val dataSourceMode by viewModel.dataSourceMode.collectAsState()
    val isLiveLoading by viewModel.isLiveLoading.collectAsState()

    var showThemeDialog by remember { mutableStateOf(false) }
    var showOriginPicker by remember { mutableStateOf(false) }
    var showDestPicker by remember { mutableStateOf(false) }

    val quickFlights = listOf("AA 100", "BA 178", "DL 404", "EK 201", "UA 875", "SQ 22", "AF 006", "NH 106")
    val popularRoutes = listOf(
        Pair("JFK", "LHR"),
        Pair("SFO", "HND"),
        Pair("DXB", "CDG"),
        Pair("ORD", "SFO"),
        Pair("SIN", "HND"),
        Pair("LHR", "DXB")
    )

    Scaffold(
        modifier = modifier.testTag("flight_search_screen"),
        containerColor = DeepSpace,
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(34.dp)
                                .clip(CircleShape)
                                .background(RadarCyan.copy(alpha = 0.2f))
                                .border(1.dp, RadarCyan, CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.Flight,
                                contentDescription = "SkyTrack",
                                tint = RadarCyan,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                        Column {
                            Text(
                                text = "SkyTrack",
                                color = TextWhite,
                                fontSize = 19.sp,
                                fontWeight = FontWeight.Black,
                                maxLines = 1,
                                softWrap = false,
                                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                            )
                            Text(
                                text = "LIVE RADAR & FLIGHT TELEMETRY",
                                color = RadarCyan,
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 0.8.sp,
                                maxLines = 1,
                                softWrap = false,
                                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                            )
                        }
                    }
                },
                actions = {
                    // Notifications button with badge
                    IconButton(
                        onClick = onOpenNotifications,
                        modifier = Modifier.testTag("notifications_top_btn")
                    ) {
                        BadgedBox(
                            badge = {
                                if (unreadAlerts > 0) {
                                    Badge(
                                        containerColor = StatusDelayed,
                                        contentColor = DeepSpace
                                    ) {
                                        Text("$unreadAlerts", fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        ) {
                            Icon(
                                imageVector = Icons.Default.Notifications,
                                contentDescription = "Alerts",
                                tint = TextWhite
                            )
                        }
                    }

                    // Account / OAuth / Theme / Sync Avatar button
                    IconButton(
                        onClick = onOpenAccount,
                        modifier = Modifier.testTag("account_top_btn")
                    ) {
                        Box(
                            modifier = Modifier
                                .size(32.dp)
                                .clip(CircleShape)
                                .background(InstrumentSurfaceElevated)
                                .border(1.dp, RadarCyan.copy(alpha = 0.5f), CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = userAccount.avatarInitial,
                                color = RadarCyan,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = CockpitDark)
            )
        }
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Live AeroDataBox & Open-Meteo Telemetry Status Pill
            item {
                DataSourceStatusBanner(
                    mode = dataSourceMode,
                    isLiveLoading = isLiveLoading,
                    onRefreshClick = {
                        viewModel.refreshData()
                        coroutineScope.launch {
                            snackbarHostState.showSnackbar("Refreshing flight & weather telemetry...")
                        }
                    }
                )
            }

            // Search Mode Tab Selector (Flight Number vs Route)
            item {
                Surface(
                    color = CockpitDark,
                    shape = RoundedCornerShape(14.dp),
                    border = androidx.compose.foundation.BorderStroke(1.dp, InstrumentBorder),
                    modifier = Modifier.fillMaxWidth().testTag("search_mode_tab_bar")
                ) {
                    TabRow(
                        selectedTabIndex = if (searchMode == SearchMode.FLIGHT_NUMBER) 0 else 1,
                        containerColor = CockpitDark,
                        contentColor = RadarCyan,
                        indicator = { tabPositions ->
                            val currentPos = tabPositions[if (searchMode == SearchMode.FLIGHT_NUMBER) 0 else 1]
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .wrapContentSize(Alignment.BottomStart)
                                    .offset(x = currentPos.left)
                                    .width(currentPos.width)
                                    .height(3.dp)
                                    .background(RadarCyan, RoundedCornerShape(topStart = 3.dp, topEnd = 3.dp))
                            )
                        },
                        divider = { HorizontalDivider(color = InstrumentBorder.copy(alpha = 0.5f)) }
                    ) {
                        Tab(
                            selected = searchMode == SearchMode.FLIGHT_NUMBER,
                            onClick = { viewModel.setSearchMode(SearchMode.FLIGHT_NUMBER) },
                            text = {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Tag,
                                        contentDescription = null,
                                        modifier = Modifier.size(16.dp),
                                        tint = if (searchMode == SearchMode.FLIGHT_NUMBER) RadarCyan else TextMuted
                                    )
                                    Text(
                                        text = "Flight Number",
                                        fontWeight = if (searchMode == SearchMode.FLIGHT_NUMBER) FontWeight.Bold else FontWeight.Medium,
                                        color = if (searchMode == SearchMode.FLIGHT_NUMBER) RadarCyan else TextMuted,
                                        fontSize = 13.sp,
                                        maxLines = 1
                                    )
                                }
                            },
                            modifier = Modifier.testTag("tab_mode_flight_number")
                        )

                        Tab(
                            selected = searchMode == SearchMode.ROUTE,
                            onClick = { viewModel.setSearchMode(SearchMode.ROUTE) },
                            text = {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.AutoMirrored.Filled.AltRoute,
                                        contentDescription = null,
                                        modifier = Modifier.size(16.dp),
                                        tint = if (searchMode == SearchMode.ROUTE) RadarCyan else TextMuted
                                    )
                                    Text(
                                        text = "Route Lookup",
                                        fontWeight = if (searchMode == SearchMode.ROUTE) FontWeight.Bold else FontWeight.Medium,
                                        color = if (searchMode == SearchMode.ROUTE) RadarCyan else TextMuted,
                                        fontSize = 13.sp,
                                        maxLines = 1
                                    )
                                }
                            },
                            modifier = Modifier.testTag("tab_mode_route")
                        )
                    }
                }
            }

            // Mode 1: Flight Number Search Input & Quick Suggestions
            if (searchMode == SearchMode.FLIGHT_NUMBER) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = searchQuery,
                            onValueChange = { viewModel.setSearchQuery(it) },
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag("flight_search_input"),
                            placeholder = {
                                Text(
                                    text = "Flight # or airline (e.g. AA 100, BA 178, Delta)",
                                    color = TextSubtle,
                                    fontSize = 13.sp,
                                    maxLines = 1,
                                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
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
                                    IconButton(onClick = { viewModel.setSearchQuery("") }) {
                                        Icon(
                                            imageVector = Icons.Default.Close,
                                            contentDescription = "Clear",
                                            tint = TextMuted
                                        )
                                    }
                                }
                            },
                            singleLine = true,
                            shape = RoundedCornerShape(14.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedContainerColor = CockpitDark,
                                unfocusedContainerColor = CockpitDark,
                                focusedBorderColor = RadarCyan,
                                unfocusedBorderColor = InstrumentBorder,
                                focusedTextColor = TextWhite,
                                unfocusedTextColor = TextWhite
                            )
                        )

                        // Quick Flight Number Pills
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            modifier = Modifier.padding(top = 2.dp)
                        ) {
                            Text("Popular:", fontSize = 11.sp, color = TextSubtle, fontWeight = FontWeight.Bold)
                            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                items(quickFlights) { flightNum ->
                                    Surface(
                                        color = InstrumentSurface,
                                        shape = RoundedCornerShape(8.dp),
                                        border = androidx.compose.foundation.BorderStroke(0.8.dp, InstrumentBorder),
                                        modifier = Modifier.clickable { viewModel.setSearchQuery(flightNum) }
                                    ) {
                                        Text(
                                            text = flightNum,
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = RadarCyan,
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                // Mode 2: Interactive Route Lookup Card (Origin ➔ Destination)
                item {
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(16.dp))
                            .border(1.dp, InstrumentBorder, RoundedCornerShape(16.dp))
                            .testTag("route_lookup_card"),
                        colors = CardDefaults.cardColors(containerColor = CockpitDark)
                    ) {
                        Column(
                            modifier = Modifier.padding(14.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "AIRPORT ROUTE FINDER",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Black,
                                    letterSpacing = 0.8.sp,
                                    color = RadarCyan
                                )
                                TextButton(
                                    onClick = {
                                        viewModel.setRouteOrigin("ALL")
                                        viewModel.setRouteDestination("ALL")
                                    },
                                    contentPadding = PaddingValues(horizontal = 6.dp, vertical = 2.dp)
                                ) {
                                    Text("Reset / All", fontSize = 11.sp, color = TextMuted)
                                }
                            }

                            // Departure and Destination Direct Input Fields Row with Center Swap Button
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                // Origin / Departure Airport Input Field
                                OutlinedTextField(
                                    value = if (routeOrigin == "ALL") "" else routeOrigin,
                                    onValueChange = { viewModel.setRouteOrigin(it) },
                                    modifier = Modifier
                                        .weight(1f)
                                        .testTag("route_origin_selector_btn"),
                                    label = { Text("Departure", fontSize = 10.sp, color = TextMuted) },
                                    placeholder = {
                                        Text(
                                            text = "Code or city (e.g. JFK, London)",
                                            fontSize = 11.sp,
                                            color = TextSubtle,
                                            maxLines = 1,
                                            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                                        )
                                    },
                                    leadingIcon = {
                                        Icon(
                                            imageVector = Icons.Default.FlightTakeoff,
                                            contentDescription = "Departure",
                                            tint = RadarCyan,
                                            modifier = Modifier.size(16.dp)
                                        )
                                    },
                                    trailingIcon = {
                                        if (routeOrigin.isNotEmpty() && routeOrigin != "ALL") {
                                            IconButton(onClick = { viewModel.setRouteOrigin("") }) {
                                                Icon(
                                                    imageVector = Icons.Default.Close,
                                                    contentDescription = "Clear",
                                                    tint = TextMuted,
                                                    modifier = Modifier.size(14.dp)
                                                )
                                            }
                                        }
                                    },
                                    singleLine = true,
                                    textStyle = androidx.compose.ui.text.TextStyle(fontSize = 13.sp, color = TextWhite, fontWeight = FontWeight.Bold),
                                    shape = RoundedCornerShape(12.dp),
                                    colors = OutlinedTextFieldDefaults.colors(
                                        focusedContainerColor = InstrumentSurface,
                                        unfocusedContainerColor = InstrumentSurface,
                                        focusedBorderColor = RadarCyan,
                                        unfocusedBorderColor = InstrumentBorder
                                    )
                                )

                                // Interactive Swap Route Button
                                FilledIconButton(
                                    onClick = { viewModel.swapRoute() },
                                    colors = IconButtonDefaults.filledIconButtonColors(containerColor = InstrumentSurfaceElevated),
                                    modifier = Modifier
                                        .size(38.dp)
                                        .border(1.dp, RadarCyan.copy(alpha = 0.4f), CircleShape)
                                        .testTag("swap_route_btn")
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.SwapHoriz,
                                        contentDescription = "Swap Origin and Destination",
                                        tint = RadarCyan,
                                        modifier = Modifier.size(20.dp)
                                    )
                                }

                                // Destination Airport Input Field
                                OutlinedTextField(
                                    value = if (routeDestination == "ALL") "" else routeDestination,
                                    onValueChange = { viewModel.setRouteDestination(it) },
                                    modifier = Modifier
                                        .weight(1f)
                                        .testTag("route_dest_selector_btn"),
                                    label = { Text("Destination", fontSize = 10.sp, color = TextMuted) },
                                    placeholder = {
                                        Text(
                                            text = "Code or city (e.g. LHR, Paris)",
                                            fontSize = 11.sp,
                                            color = TextSubtle,
                                            maxLines = 1,
                                            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                                        )
                                    },
                                    leadingIcon = {
                                        Icon(
                                            imageVector = Icons.Default.FlightLand,
                                            contentDescription = "Destination",
                                            tint = AeroBlue,
                                            modifier = Modifier.size(16.dp)
                                        )
                                    },
                                    trailingIcon = {
                                        if (routeDestination.isNotEmpty() && routeDestination != "ALL") {
                                            IconButton(onClick = { viewModel.setRouteDestination("") }) {
                                                Icon(
                                                    imageVector = Icons.Default.Close,
                                                    contentDescription = "Clear",
                                                    tint = TextMuted,
                                                    modifier = Modifier.size(14.dp)
                                                )
                                            }
                                        }
                                    },
                                    singleLine = true,
                                    textStyle = androidx.compose.ui.text.TextStyle(fontSize = 13.sp, color = TextWhite, fontWeight = FontWeight.Bold),
                                    shape = RoundedCornerShape(12.dp),
                                    colors = OutlinedTextFieldDefaults.colors(
                                        focusedContainerColor = InstrumentSurface,
                                        unfocusedContainerColor = InstrumentSurface,
                                        focusedBorderColor = AeroBlue,
                                        unfocusedBorderColor = InstrumentBorder
                                    )
                                )
                            }

                            // Popular Route Fast-Pick Chips
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text("Popular Routes:", fontSize = 10.sp, color = TextSubtle, fontWeight = FontWeight.Bold)
                                LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    items(popularRoutes) { pair ->
                                        val isCurrent = routeOrigin == pair.first && routeDestination == pair.second
                                        Surface(
                                            color = if (isCurrent) RadarCyan.copy(alpha = 0.2f) else InstrumentSurface,
                                            shape = RoundedCornerShape(8.dp),
                                            border = androidx.compose.foundation.BorderStroke(
                                                1.dp,
                                                if (isCurrent) RadarCyan else InstrumentBorder
                                            ),
                                            modifier = Modifier.clickable {
                                                viewModel.setRouteOrigin(pair.first)
                                                viewModel.setRouteDestination(pair.second)
                                            }
                                        ) {
                                            Row(
                                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                                            ) {
                                                Text(pair.first, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = RadarCyan)
                                                Icon(
                                                    imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                                                    contentDescription = null,
                                                    tint = TextMuted,
                                                    modifier = Modifier.size(10.dp)
                                                )
                                                Text(pair.second, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = AeroBlue)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Recent Searches (Room Database - Last 5 Searched Flights)
            if (recentSearches.isNotEmpty()) {
                item {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("recent_searches_section"),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.History,
                                    contentDescription = "Recent Searches",
                                    tint = RadarCyan,
                                    modifier = Modifier.size(15.dp)
                                )
                                Text(
                                    text = "RECENT SEARCHES",
                                    color = TextWhite,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    letterSpacing = 0.8.sp
                                )
                                Text(
                                    text = "(${recentSearches.size}/5 Room cached)",
                                    color = TextMuted,
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Medium
                                )
                            }
                            TextButton(
                                onClick = { viewModel.clearRecentSearches() },
                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp),
                                modifier = Modifier.testTag("clear_recent_searches_btn")
                            ) {
                                Text(
                                    text = "Clear all",
                                    color = TextMuted,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                        }

                        LazyRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            items(recentSearches, key = { it.flightNumber }) { recent ->
                                RecentSearchCard(
                                    item = recent,
                                    onClick = {
                                        val matched = allFlights.find {
                                            it.flightNumber.replace(" ", "").equals(recent.flightNumber.replace(" ", ""), ignoreCase = true)
                                        }
                                        if (matched != null) {
                                            viewModel.recordRecentSearch(matched)
                                            onFlightSelected(matched)
                                        } else {
                                            viewModel.setSearchMode(SearchMode.FLIGHT_NUMBER)
                                            viewModel.setSearchQuery(recent.flightNumber)
                                        }
                                    },
                                    onDelete = {
                                        viewModel.deleteRecentSearch(recent.flightNumber)
                                    }
                                )
                            }
                        }
                    }
                }
            }

            // Filter Chips Row (Including Local Room Database Tracked Filter!)
            item {
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    // All flights chip
                    item {
                        FilterChip(
                            selected = statusFilter == null && !onlyTrackedFilter,
                            onClick = {
                                viewModel.setStatusFilter(null)
                                viewModel.setOnlyTrackedFilter(false)
                            },
                            label = { Text("All Flights") },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = RadarCyan,
                                selectedLabelColor = DeepSpace,
                                containerColor = InstrumentSurface,
                                labelColor = TextWhite
                            ),
                            border = FilterChipDefaults.filterChipBorder(
                                enabled = true,
                                selected = statusFilter == null && !onlyTrackedFilter,
                                borderColor = InstrumentBorder,
                                selectedBorderColor = RadarCyan
                            ),
                            modifier = Modifier.testTag("filter_chip_all")
                        )
                    }

                    // Room Database Tracked Flights Chip
                    item {
                        FilterChip(
                            selected = onlyTrackedFilter,
                            onClick = { viewModel.setOnlyTrackedFilter(!onlyTrackedFilter) },
                            leadingIcon = {
                                Icon(
                                    imageVector = Icons.Default.Bookmark,
                                    contentDescription = null,
                                    modifier = Modifier.size(15.dp),
                                    tint = if (onlyTrackedFilter) DeepSpace else RadarCyan
                                )
                            },
                            label = { Text("Tracked in Room (${trackedFlights.size})") },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = RadarCyan,
                                selectedLabelColor = DeepSpace,
                                containerColor = InstrumentSurface,
                                labelColor = RadarCyan
                            ),
                            border = FilterChipDefaults.filterChipBorder(
                                enabled = true,
                                selected = onlyTrackedFilter,
                                borderColor = RadarCyan.copy(alpha = 0.5f),
                                selectedBorderColor = RadarCyan
                            ),
                            modifier = Modifier.testTag("filter_chip_tracked_room")
                        )
                    }

                    items(FlightStatus.values()) { status ->
                        FilterChip(
                            selected = statusFilter == status && !onlyTrackedFilter,
                            onClick = {
                                viewModel.setOnlyTrackedFilter(false)
                                if (statusFilter == status) viewModel.setStatusFilter(null)
                                else viewModel.setStatusFilter(status)
                            },
                            label = { Text(status.label) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = status.color,
                                selectedLabelColor = DeepSpace,
                                containerColor = InstrumentSurface,
                                labelColor = TextWhite
                            ),
                            border = FilterChipDefaults.filterChipBorder(
                                enabled = true,
                                selected = statusFilter == status && !onlyTrackedFilter,
                                borderColor = InstrumentBorder,
                                selectedBorderColor = status.color
                            )
                        )
                    }
                }
            }

            // Room Database Active Tracking Banner if onlyTracked is enabled
            if (onlyTrackedFilter) {
                item {
                    Surface(
                        color = RadarCyan.copy(alpha = 0.12f),
                        shape = RoundedCornerShape(12.dp),
                        border = androidx.compose.foundation.BorderStroke(1.dp, RadarCyan.copy(alpha = 0.4f)),
                        modifier = Modifier.fillMaxWidth().testTag("room_tracking_banner")
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Storage,
                                contentDescription = null,
                                tint = RadarCyan,
                                modifier = Modifier.size(20.dp)
                            )
                            Column {
                                Text(
                                    text = "LOCAL ROOM DATABASE · ${trackedFlights.size} FLIGHTS TRACKED",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Black,
                                    color = RadarCyan
                                )
                                Text(
                                    text = "All updates are persisted locally on device SQLite tables and remain available offline.",
                                    fontSize = 11.sp,
                                    color = TextWhite
                                )
                            }
                        }
                    }
                }
            }

            // Results summary header
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = if (searchMode == SearchMode.ROUTE) {
                            "ROUTE RESULTS: $routeOrigin ➔ $routeDestination (${flights.size})"
                        } else {
                            "FLIGHT RESULTS (${flights.size})"
                        },
                        color = TextSubtle,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 0.8.sp
                    )
                    Text(
                        text = "Real-time updates active",
                        color = RadarCyan,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            }

            // Empty state if no matches
            if (flights.isEmpty()) {
                item {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 36.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(
                            imageVector = if (onlyTrackedFilter) Icons.Default.BookmarkBorder else Icons.Default.FlightLand,
                            contentDescription = "No flights",
                            tint = TextSubtle,
                            modifier = Modifier.size(54.dp)
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            text = if (onlyTrackedFilter) "No Tracked Flights in Room" else "No Flights Found",
                            color = TextWhite,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = if (onlyTrackedFilter) {
                                "Search for any flight above and tap 'Track' to save it to your local Room database for offline monitoring."
                            } else if (searchMode == SearchMode.ROUTE) {
                                "No direct flights found for route $routeOrigin ➔ $routeDestination. Try picking other hubs like JFK ➔ LHR or SFO ➔ HND."
                            } else {
                                "Try searching by flight number (e.g. 'AA 100') or airline name ('Delta', 'British Airways')."
                            },
                            color = TextMuted,
                            fontSize = 12.sp,
                            modifier = Modifier.padding(horizontal = 24.dp),
                            textAlign = TextAlign.Center
                        )
                    }
                }
            } else {
                items(flights, key = { it.id }) { flight ->
                    FlightCard(
                        flight = flight,
                        onClick = {
                            viewModel.recordRecentSearch(flight)
                            onFlightSelected(flight)
                        },
                        onToggleFavorite = { viewModel.toggleFavorite(flight.flightNumber) },
                        onToggleTrack = {
                            viewModel.toggleTrackFlight(flight)
                            coroutineScope.launch {
                                val message = if (flight.isTracked) {
                                    "Removed ${flight.flightNumber} from local Room tracking"
                                } else {
                                    "Saved ${flight.flightNumber} to local Room database for tracking!"
                                }
                                snackbarHostState.showSnackbar(message)
                            }
                        }
                    )
                }
            }
        }
    }

    // Origin Airport Picker Dialog
    if (showOriginPicker) {
        AirportPickerDialog(
            title = "Select Origin Airport",
            currentCode = routeOrigin,
            airports = MockFlightData.airports,
            onSelect = {
                viewModel.setRouteOrigin(it)
                showOriginPicker = false
            },
            onDismiss = { showOriginPicker = false }
        )
    }

    // Destination Airport Picker Dialog
    if (showDestPicker) {
        AirportPickerDialog(
            title = "Select Destination Airport",
            currentCode = routeDestination,
            airports = MockFlightData.airports,
            onSelect = {
                viewModel.setRouteDestination(it)
                showDestPicker = false
            },
            onDismiss = { showDestPicker = false }
        )
    }

    if (showThemeDialog) {
        ThemeSelectionDialog(
            currentThemeMode = themeMode,
            onSelectThemeMode = { newMode ->
                viewModel.setThemeMode(newMode)
            },
            onDismiss = { showThemeDialog = false }
        )
    }
}

@Composable
fun AirportPickerDialog(
    title: String,
    currentCode: String,
    airports: List<com.example.model.Airport>,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title, color = TextWhite, fontWeight = FontWeight.Bold, fontSize = 16.sp) },
        text = {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                item {
                    Surface(
                        color = if (currentCode == "ALL") RadarCyan.copy(alpha = 0.2f) else InstrumentSurface,
                        shape = RoundedCornerShape(10.dp),
                        border = androidx.compose.foundation.BorderStroke(
                            1.dp,
                            if (currentCode == "ALL") RadarCyan else InstrumentBorder
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onSelect("ALL") }
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("ALL", fontWeight = FontWeight.Black, color = RadarCyan, fontSize = 16.sp)
                            Spacer(modifier = Modifier.width(10.dp))
                            Text("All Airports / Any Location", color = TextWhite, fontSize = 13.sp)
                        }
                    }
                }

                items(airports) { airport ->
                    val isSelected = airport.code == currentCode
                    Surface(
                        color = if (isSelected) RadarCyan.copy(alpha = 0.2f) else InstrumentSurface,
                        shape = RoundedCornerShape(10.dp),
                        border = androidx.compose.foundation.BorderStroke(
                            1.dp,
                            if (isSelected) RadarCyan else InstrumentBorder
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onSelect(airport.code) }
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = airport.code,
                                    fontWeight = FontWeight.Black,
                                    color = if (isSelected) RadarCyan else TextWhite,
                                    fontSize = 16.sp
                                )
                                Spacer(modifier = Modifier.width(10.dp))
                                Column {
                                    Text(airport.city, color = TextWhite, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                                    Text(airport.name, color = TextMuted, fontSize = 11.sp, maxLines = 1)
                                }
                            }
                            if (isSelected) {
                                Icon(Icons.Default.Check, contentDescription = null, tint = RadarCyan)
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("Close", color = RadarCyan)
            }
        },
        containerColor = CockpitDark
    )
}

@Composable
fun RecentSearchCard(
    item: RecentSearchEntity,
    onClick: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier
) {
    val statusEnum = try {
        FlightStatus.valueOf(item.status)
    } catch (_: Exception) {
        FlightStatus.SCHEDULED
    }

    Surface(
        onClick = onClick,
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .border(0.8.dp, InstrumentBorder, RoundedCornerShape(12.dp))
            .testTag("recent_search_chip_${item.flightNumber}"),
        color = CockpitDark,
        tonalElevation = 2.dp
    ) {
        Row(
            modifier = Modifier.padding(start = 12.dp, top = 8.dp, bottom = 8.dp, end = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Column {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text(
                        text = item.flightNumber,
                        color = TextWhite,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(statusEnum.color.copy(alpha = 0.2f))
                            .padding(horizontal = 5.dp, vertical = 1.dp)
                    ) {
                        Text(
                            text = statusEnum.label,
                            color = statusEnum.color,
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
                Spacer(modifier = Modifier.height(2.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text(
                        text = item.originCode,
                        color = RadarCyan,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                        contentDescription = "to",
                        tint = TextSubtle,
                        modifier = Modifier.size(10.dp)
                    )
                    Text(
                        text = item.destCode,
                        color = RadarCyan,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        text = "· ${item.airline}",
                        color = TextMuted,
                        fontSize = 10.sp,
                        maxLines = 1
                    )
                }
            }

            IconButton(
                onClick = onDelete,
                modifier = Modifier
                    .size(28.dp)
                    .testTag("delete_recent_search_${item.flightNumber}")
            ) {
                Icon(
                    imageVector = Icons.Default.Close,
                    contentDescription = "Remove",
                    tint = TextSubtle,
                    modifier = Modifier.size(14.dp)
                )
            }
        }
    }
}
