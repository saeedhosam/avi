package com.example.ui.screens

import android.content.Intent
import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.DirectionsWalk
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.data.TerminalMapRepository
import com.example.model.*
import com.example.ui.terminal.TerminalMapCanvas
import com.example.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TerminalMapScreen(
    initialAirportCode: String? = null,
    initialGate: String? = null,
    onBack: (() -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    var selectedAirportCode by remember { mutableStateOf(initialAirportCode ?: "JFK") }
    var selectedLevel by remember { mutableIntStateOf(1) }
    var selectedCategory by remember { mutableStateOf(AmenityCategory.ALL) }
    var searchQuery by remember { mutableStateOf("") }
    var selectedAmenity by remember { mutableStateOf<TerminalAmenity?>(null) }
    var showWalkingRoute by remember { mutableStateOf(true) }
    var showAirportDropdown by remember { mutableStateOf(false) }

    val layout = remember(selectedAirportCode) {
        TerminalMapRepository.getLayout(selectedAirportCode)
    }

    // Pre-select gate if provided
    LaunchedEffect(initialAirportCode, initialGate, layout) {
        if (!initialGate.isNullOrBlank()) {
            val matched = TerminalMapRepository.findAmenityByGate(layout.airportCode, initialGate)
            if (matched != null) {
                selectedLevel = matched.level
                selectedAmenity = matched
                showWalkingRoute = true
            }
        }
    }

    // Ensure selected level exists in layout
    LaunchedEffect(layout) {
        if (!layout.availableLevels.contains(selectedLevel)) {
            selectedLevel = layout.availableLevels.firstOrNull() ?: 1
        }
    }

    val currentFloor = layout.floors[selectedLevel] ?: layout.floors[1] ?: layout.floors.values.first()

    // Filter amenities by level, category, and search query
    val filteredAmenities = remember(layout, selectedLevel, selectedCategory, searchQuery) {
        layout.amenities.filter { amenity ->
            val matchesLevel = amenity.level == selectedLevel
            val matchesCategory = selectedCategory == AmenityCategory.ALL || amenity.category == selectedCategory
            val matchesSearch = searchQuery.isBlank() ||
                    amenity.name.contains(searchQuery, ignoreCase = true) ||
                    (amenity.gateNumber?.contains(searchQuery, ignoreCase = true) == true) ||
                    amenity.locationDescription.contains(searchQuery, ignoreCase = true) ||
                    amenity.category.displayName.contains(searchQuery, ignoreCase = true) ||
                    (amenity.accessInfo?.contains(searchQuery, ignoreCase = true) == true)

            matchesLevel && matchesCategory && matchesSearch
        }
    }

    Scaffold(
        modifier = modifier.testTag("terminal_map_screen"),
        containerColor = DeepSpace,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Text(
                                text = "${layout.airportCode} Terminal Map",
                                color = TextWhite,
                                fontSize = 17.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Surface(
                                color = RadarCyan.copy(alpha = 0.15f),
                                shape = RoundedCornerShape(6.dp),
                                border = androidx.compose.foundation.BorderStroke(1.dp, RadarCyan.copy(alpha = 0.5f))
                            ) {
                                Text(
                                    text = layout.terminalId,
                                    color = RadarCyan,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                            }
                        }
                        Text(
                            text = layout.terminalName,
                            color = TextMuted,
                            fontSize = 11.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                },
                navigationIcon = {
                    if (onBack != null) {
                        IconButton(onClick = onBack, modifier = Modifier.testTag("terminal_map_back_btn")) {
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = "Back",
                                tint = RadarCyan
                            )
                        }
                    } else {
                        Icon(
                            Icons.Default.Map,
                            contentDescription = "Terminal Map",
                            tint = RadarCyan,
                            modifier = Modifier.padding(start = 16.dp, end = 8.dp)
                        )
                    }
                },
                actions = {
                    // Airport Switcher
                    Box {
                        TextButton(
                            onClick = { showAirportDropdown = true },
                            modifier = Modifier.testTag("airport_selector_btn")
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                Text(selectedAirportCode, color = RadarCyan, fontWeight = FontWeight.Bold)
                                Icon(Icons.Default.ArrowDropDown, contentDescription = "Select Airport", tint = RadarCyan)
                            }
                        }

                        DropdownMenu(
                            expanded = showAirportDropdown,
                            onDismissRequest = { showAirportDropdown = false },
                            modifier = Modifier.background(CockpitDark).border(1.dp, InstrumentBorder)
                        ) {
                            TerminalMapRepository.getAllSupportedAirports().forEach { (code, title) ->
                                DropdownMenuItem(
                                    text = {
                                        Text(
                                            text = title,
                                            color = if (code == selectedAirportCode) RadarCyan else TextWhite,
                                            fontWeight = if (code == selectedAirportCode) FontWeight.Bold else FontWeight.Normal
                                        )
                                    },
                                    onClick = {
                                        selectedAirportCode = code
                                        selectedAmenity = null
                                        showAirportDropdown = false
                                    }
                                )
                            }
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = CockpitDark)
            )
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                // Search & Filter Controls Header
                Surface(
                    color = CockpitDark,
                    tonalElevation = 2.dp,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp)) {
                        // Search textfield
                        OutlinedTextField(
                            value = searchQuery,
                            onValueChange = { searchQuery = it },
                            placeholder = { Text("Find gates (e.g. B22), Centurion lounge, TSA, dining...", fontSize = 12.sp, color = TextMuted) },
                            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = RadarCyan, modifier = Modifier.size(18.dp)) },
                            trailingIcon = {
                                if (searchQuery.isNotEmpty()) {
                                    IconButton(onClick = { searchQuery = "" }) {
                                        Icon(Icons.Default.Close, contentDescription = "Clear", tint = TextMuted, modifier = Modifier.size(16.dp))
                                    }
                                }
                            },
                            singleLine = true,
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(50.dp)
                                .testTag("terminal_search_input"),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedTextColor = TextWhite,
                                unfocusedTextColor = TextWhite,
                                focusedBorderColor = RadarCyan,
                                unfocusedBorderColor = InstrumentBorder,
                                focusedContainerColor = InstrumentSurface,
                                unfocusedContainerColor = InstrumentSurface
                            )
                        )

                        Spacer(modifier = Modifier.height(8.dp))

                        // Level / Floor Selector
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "FLOOR:",
                                color = TextSubtle,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(end = 4.dp)
                            )

                            layout.availableLevels.forEach { lvl ->
                                val isSelected = lvl == selectedLevel
                                val label = when (lvl) {
                                    1 -> "L1 Departures"
                                    2 -> "L2 Lounges & Mezzanine"
                                    0 -> "L0 Arrivals & Ground"
                                    else -> "Level $lvl"
                                }

                                FilterChip(
                                    selected = isSelected,
                                    onClick = {
                                        selectedLevel = lvl
                                        selectedAmenity = null
                                    },
                                    label = { Text(label, fontSize = 11.sp, fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium) },
                                    colors = FilterChipDefaults.filterChipColors(
                                        selectedContainerColor = RadarCyan,
                                        selectedLabelColor = DeepSpace,
                                        containerColor = InstrumentSurface,
                                        labelColor = TextMuted
                                    ),
                                    border = FilterChipDefaults.filterChipBorder(
                                        enabled = true,
                                        selected = isSelected,
                                        borderColor = InstrumentBorder,
                                        selectedBorderColor = RadarCyan
                                    ),
                                    modifier = Modifier.testTag("floor_chip_$lvl")
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(4.dp))

                        // Category Filter Chips
                        LazyRow(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.fillMaxWidth().testTag("amenity_category_row")
                        ) {
                            items(AmenityCategory.values()) { category ->
                                val isSelected = category == selectedCategory
                                FilterChip(
                                    selected = isSelected,
                                    onClick = { selectedCategory = category },
                                    leadingIcon = {
                                        Icon(
                                            category.icon,
                                            contentDescription = null,
                                            tint = if (isSelected) DeepSpace else category.color,
                                            modifier = Modifier.size(14.dp)
                                        )
                                    },
                                    label = {
                                        Text(
                                            category.displayName,
                                            fontSize = 11.sp,
                                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                                        )
                                    },
                                    colors = FilterChipDefaults.filterChipColors(
                                        selectedContainerColor = category.color,
                                        selectedLabelColor = DeepSpace,
                                        containerColor = InstrumentSurface,
                                        labelColor = TextWhite
                                    ),
                                    border = FilterChipDefaults.filterChipBorder(
                                        enabled = true,
                                        selected = isSelected,
                                        borderColor = InstrumentBorder,
                                        selectedBorderColor = category.color
                                    ),
                                    modifier = Modifier.testTag(category.tag)
                                )
                            }
                        }
                    }
                }

                // Interactive Terminal Map Canvas
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                ) {
                    TerminalMapCanvas(
                        layout = layout,
                        currentFloor = currentFloor,
                        amenities = filteredAmenities,
                        selectedAmenity = selectedAmenity,
                        onAmenitySelected = { amenity ->
                            selectedAmenity = amenity
                            showWalkingRoute = true
                        },
                        showWalkingRoute = showWalkingRoute,
                        modifier = Modifier.fillMaxSize()
                    )
                }
            }

            // Bottom Selected Amenity Inspection Card
            AnimatedVisibility(
                visible = selectedAmenity != null,
                enter = slideInVertically(initialOffsetY = { it }) + fadeIn(),
                exit = slideOutVertically(targetOffsetY = { it }) + fadeOut(),
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .padding(12.dp)
            ) {
                selectedAmenity?.let { amenity ->
                    AmenityDetailCard(
                        amenity = amenity,
                        showRoute = showWalkingRoute,
                        onToggleRoute = { showWalkingRoute = !showWalkingRoute },
                        onShare = {
                            val shareText = "📍 ${amenity.name} at ${amenity.airportCode} ${amenity.terminal} (${amenity.concourse}). Walk time: ~${amenity.walkTimeFromSecurityMinutes} min (${amenity.walkDistanceMeters}m from security). Tracked via SkyTrack."
                            val intent = Intent(Intent.ACTION_SEND).apply {
                                type = "text/plain"
                                putExtra(Intent.EXTRA_TEXT, shareText)
                            }
                            context.startActivity(Intent.createChooser(intent, "Share Terminal Location"))
                        },
                        onDismiss = { selectedAmenity = null }
                    )
                }
            }
        }
    }
}

@Composable
fun AmenityDetailCard(
    amenity: TerminalAmenity,
    showRoute: Boolean,
    onToggleRoute: () -> Unit,
    onShare: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .border(1.2.dp, amenity.category.color.copy(alpha = 0.7f), RoundedCornerShape(18.dp))
            .testTag("amenity_detail_card"),
        colors = CardDefaults.cardColors(containerColor = CockpitDark.copy(alpha = 0.96f)),
        elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // Header Row: Category Badge + Name + Close Button
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    modifier = Modifier.weight(1f),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(42.dp)
                            .clip(CircleShape)
                            .background(amenity.category.color.copy(alpha = 0.18f))
                            .border(1.dp, amenity.category.color, CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = amenity.category.icon,
                            contentDescription = null,
                            tint = amenity.category.color,
                            modifier = Modifier.size(22.dp)
                        )
                    }

                    Column {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Text(
                                text = amenity.name,
                                color = TextWhite,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            if (amenity.rating != null) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(2.dp)
                                ) {
                                    Icon(Icons.Default.Star, contentDescription = null, tint = Color(0xFFFFD54F), modifier = Modifier.size(13.dp))
                                    Text("${amenity.rating}", color = Color(0xFFFFD54F), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                        Text(
                            text = "${amenity.airportCode} ${amenity.terminal} · ${amenity.concourse} · Level ${amenity.level}",
                            color = TextMuted,
                            fontSize = 11.sp
                        )
                    }
                }

                IconButton(
                    onClick = onDismiss,
                    modifier = Modifier.size(32.dp).testTag("amenity_dismiss_btn")
                ) {
                    Icon(Icons.Default.Close, contentDescription = "Close", tint = TextMuted, modifier = Modifier.size(18.dp))
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Navigation Telemetry Row (Walk Time & Distance)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(InstrumentSurface)
                    .border(0.8.dp, InstrumentBorder, RoundedCornerShape(10.dp))
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Icon(
                        Icons.AutoMirrored.Filled.DirectionsWalk,
                        contentDescription = null,
                        tint = RadarCyan,
                        modifier = Modifier.size(16.dp)
                    )
                    Text(
                        text = "Walk from Security: ~${amenity.walkTimeFromSecurityMinutes} min",
                        color = RadarCyan,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                Text(
                    text = "${amenity.walkDistanceMeters} meters",
                    color = TextMuted,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium
                )
            }

            // Location description & hours
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = amenity.locationDescription,
                color = AeroBlue,
                fontSize = 12.sp,
                lineHeight = 16.sp
            )

            // Access Info or Wait Time if present
            if (!amenity.accessInfo.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(6.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Icon(Icons.Default.VpnKey, contentDescription = null, tint = Color(0xFFFFB300), modifier = Modifier.size(14.dp))
                    Text(
                        text = "Access: ${amenity.accessInfo}",
                        color = Color(0xFFFFE082),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            }

            if (amenity.waitTimeMinutes != null) {
                Spacer(modifier = Modifier.height(6.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Icon(Icons.Default.Timer, contentDescription = null, tint = Color(0xFFFF5252), modifier = Modifier.size(14.dp))
                    Text(
                        text = "Estimated Wait Time: ~${amenity.waitTimeMinutes} mins",
                        color = Color(0xFFFF8A80),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            // Features chips
            if (amenity.features.isNotEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    amenity.features.forEach { feat ->
                        Surface(
                            color = CockpitDark,
                            shape = RoundedCornerShape(6.dp),
                            border = androidx.compose.foundation.BorderStroke(0.6.dp, InstrumentBorder)
                        ) {
                            Text(
                                text = feat,
                                color = TextMuted,
                                fontSize = 10.sp,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp)
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Action Buttons Row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Button(
                    onClick = onToggleRoute,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (showRoute) RadarCyan else InstrumentSurface,
                        contentColor = if (showRoute) DeepSpace else TextWhite
                    ),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.weight(1f).testTag("toggle_walk_route_btn")
                ) {
                    Icon(
                        imageVector = if (showRoute) Icons.Default.VisibilityOff else Icons.AutoMirrored.Filled.DirectionsWalk,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = if (showRoute) "Hide Path" else "Show Path",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                OutlinedButton(
                    onClick = onShare,
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = RadarCyan),
                    border = androidx.compose.foundation.BorderStroke(1.dp, RadarCyan),
                    modifier = Modifier.testTag("share_terminal_location_btn")
                ) {
                    Icon(Icons.Default.Share, contentDescription = "Share", modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Share Gate", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}
