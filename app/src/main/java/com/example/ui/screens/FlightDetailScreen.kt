package com.example.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.model.AlertType
import com.example.model.DestinationArrivalForecast
import com.example.model.Flight
import com.example.model.FlightStatus
import com.example.ui.components.*
import com.example.ui.theme.*
import com.example.ui.viewmodel.FlightViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FlightDetailScreen(
    flight: Flight,
    viewModel: FlightViewModel,
    onBack: () -> Unit,
    onOpenGoogleMap: () -> Unit,
    onOpenTerminalMap: (airportCode: String, gate: String) -> Unit = { _, _ -> },
    modifier: Modifier = Modifier
) {
    var showSimulateMenu by remember { mutableStateOf(false) }
    var showNoteDialog by remember { mutableStateOf(false) }
    var showShareDialog by remember { mutableStateOf(false) }
    var customNoteText by remember { mutableStateOf(flight.customNotes) }
    var isMapExpanded by remember { mutableStateOf(false) }

    val destinationForecast by produceState<DestinationArrivalForecast?>(
        initialValue = null,
        flight.destination.code,
        flight.arrivalTimeEstimated
    ) {
        val arrTime = flight.arrivalTimeEstimated.ifBlank { flight.arrivalTimeScheduled }
        value = viewModel.getDestinationWeather(flight.destination, arrTime)
    }

    Scaffold(
        modifier = modifier.testTag("flight_detail_screen"),
        containerColor = DeepSpace,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = flight.flightNumber,
                            color = TextWhite,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = flight.airline,
                            color = TextMuted,
                            fontSize = 12.sp
                        )
                    }
                },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.testTag("flight_detail_back_btn")
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                            tint = TextWhite
                        )
                    }
                },
                actions = {
                    // Share Flight Summary Button
                    IconButton(
                        onClick = { showShareDialog = true },
                        modifier = Modifier.testTag("flight_detail_share_btn")
                    ) {
                        Icon(
                            imageVector = Icons.Default.Share,
                            contentDescription = "Share Flight Summary",
                            tint = RadarCyan
                        )
                    }

                    // Google Maps Button
                    IconButton(
                        onClick = onOpenGoogleMap,
                        modifier = Modifier.testTag("open_google_map_top_btn")
                    ) {
                        Icon(
                            imageVector = Icons.Default.Map,
                            contentDescription = "Open Google Maps",
                            tint = RadarCyan
                        )
                    }

                    // Terminal Map Button
                    IconButton(
                        onClick = { onOpenTerminalMap(flight.origin.code, flight.gateDeparture) },
                        modifier = Modifier.testTag("open_terminal_map_top_btn")
                    ) {
                        Icon(
                            imageVector = Icons.Default.Layers,
                            contentDescription = "Open Terminal Map",
                            tint = RadarCyan
                        )
                    }

                    // Notes button
                    IconButton(
                        onClick = { showNoteDialog = true },
                        modifier = Modifier.testTag("flight_notes_btn")
                    ) {
                        Icon(
                            imageVector = Icons.Default.EditNote,
                            contentDescription = "Edit Notes",
                            tint = if (flight.customNotes.isNotBlank()) RadarCyan else TextMuted
                        )
                    }

                    // Room Tracking button
                    IconButton(
                        onClick = { viewModel.toggleTrackFlight(flight) },
                        modifier = Modifier.testTag("flight_detail_track_btn")
                    ) {
                        Icon(
                            imageVector = if (flight.isTracked) Icons.Default.Bookmark else Icons.Default.BookmarkBorder,
                            contentDescription = if (flight.isTracked) "Tracking in Room" else "Save to Room",
                            tint = if (flight.isTracked) RadarCyan else TextWhite
                        )
                    }

                    // Favorite button
                    IconButton(
                        onClick = { viewModel.toggleFavorite(flight.flightNumber) },
                        modifier = Modifier.testTag("flight_detail_favorite_btn")
                    ) {
                        Icon(
                            imageVector = if (flight.isFavorite) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                            contentDescription = "Favorite",
                            tint = if (flight.isFavorite) Color(0xFFFF4081) else TextWhite
                        )
                    }

                    // Simulation menu button
                    Box {
                        IconButton(
                            onClick = { showSimulateMenu = true },
                            modifier = Modifier.testTag("simulate_alert_menu_btn")
                        ) {
                            Icon(
                                imageVector = Icons.Default.NotificationAdd,
                                contentDescription = "Simulate Real-time Alert",
                                tint = RadarCyan
                            )
                        }

                        DropdownMenu(
                            expanded = showSimulateMenu,
                            onDismissRequest = { showSimulateMenu = false },
                            modifier = Modifier.background(CockpitDark)
                        ) {
                            Text(
                                text = "INSTANT PUSH NOTIFICATION",
                                color = TextSubtle,
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                            )
                            DropdownMenuItem(
                                text = { Text("Push Gate Change", color = TextWhite) },
                                leadingIcon = { Icon(Icons.Default.MeetingRoom, null, tint = RadarCyan) },
                                onClick = {
                                    viewModel.simulateAlert(flight.flightNumber, AlertType.GATE_CHANGE)
                                    showSimulateMenu = false
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Push Schedule Delay (+35m)", color = TextWhite) },
                                leadingIcon = { Icon(Icons.Default.AccessTime, null, tint = StatusDelayed) },
                                onClick = {
                                    viewModel.simulateAlert(flight.flightNumber, AlertType.DELAY)
                                    showSimulateMenu = false
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Push Flight Cancellation", color = TextWhite) },
                                leadingIcon = { Icon(Icons.Default.Warning, null, tint = StatusCancelled) },
                                onClick = {
                                    viewModel.simulateAlert(flight.flightNumber, AlertType.CANCELLATION)
                                    showSimulateMenu = false
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Push Boarding Call", color = TextWhite) },
                                leadingIcon = { Icon(Icons.Default.FlightTakeoff, null, tint = StatusBoarding) },
                                onClick = {
                                    viewModel.simulateAlert(flight.flightNumber, AlertType.BOARDING)
                                    showSimulateMenu = false
                                }
                            )
                            HorizontalDivider(color = InstrumentBorder)
                            Text(
                                text = "ROOM LOCAL SCHEDULING (ALARM)",
                                color = TextSubtle,
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                            )
                            DropdownMenuItem(
                                text = { Text("Schedule Gate Alert (in 10s)", color = TextWhite) },
                                leadingIcon = { Icon(Icons.Default.Alarm, null, tint = RadarCyan) },
                                onClick = {
                                    viewModel.scheduleLocalAlert(
                                        flightNumber = flight.flightNumber,
                                        type = AlertType.GATE_CHANGE,
                                        title = "Scheduled Gate Alert: ${flight.flightNumber}",
                                        message = "Gate changed to Gate B22 at ${flight.origin.code}. Boarding in 25 minutes.",
                                        delaySeconds = 10
                                    )
                                    showSimulateMenu = false
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Schedule Delay Alert (in 20s)", color = TextWhite) },
                                leadingIcon = { Icon(Icons.Default.Alarm, null, tint = StatusDelayed) },
                                onClick = {
                                    viewModel.scheduleLocalAlert(
                                        flightNumber = flight.flightNumber,
                                        type = AlertType.DELAY,
                                        title = "Scheduled Delay Notice: ${flight.flightNumber}",
                                        message = "ATC holding pattern delay +30 mins on route to ${flight.destination.code}.",
                                        delaySeconds = 20
                                    )
                                    showSimulateMenu = false
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Schedule Boarding Call (in 30s)", color = TextWhite) },
                                leadingIcon = { Icon(Icons.Default.Alarm, null, tint = StatusBoarding) },
                                onClick = {
                                    viewModel.scheduleLocalAlert(
                                        flightNumber = flight.flightNumber,
                                        type = AlertType.BOARDING,
                                        title = "Scheduled Boarding: ${flight.flightNumber}",
                                        message = "Final boarding call for ${flight.flightNumber} at ${flight.gateDeparture}.",
                                        delaySeconds = 30
                                    )
                                    showSimulateMenu = false
                                }
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
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Flight Overview & Status Header Card
            item {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(18.dp))
                        .border(1.dp, InstrumentBorder, RoundedCornerShape(18.dp)),
                    colors = CardDefaults.cardColors(containerColor = CockpitDark)
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            StatusBadge(status = flight.status, delayMinutes = flight.delayMinutes)

                            if (flight.delayReason != null) {
                                Text(
                                    text = flight.delayReason,
                                    color = StatusDelayed,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Medium,
                                    maxLines = 1
                                )
                            }
                        }

                        if (flight.statusNote.isNotBlank()) {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = flight.statusNote,
                                color = AeroBlue,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Medium
                            )
                        }

                        Spacer(modifier = Modifier.height(14.dp))

                        // Terminal, Gate & Counter Dashboard
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            DetailInfoTile(
                                label = "DEPARTURE GATE",
                                primary = "T${flight.terminalDeparture} · ${flight.gateDeparture}",
                                secondary = flight.checkInCounter,
                                modifier = Modifier.weight(1f)
                            )
                            DetailInfoTile(
                                label = "ARRIVAL GATE",
                                primary = "T${flight.terminalArrival} · ${flight.gateArrival}",
                                secondary = flight.baggageCarousel,
                                modifier = Modifier.weight(1f)
                            )
                        }

                        // Terminal Map gate navigation links
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            OutlinedButton(
                                onClick = { onOpenTerminalMap(flight.origin.code, flight.gateDeparture) },
                                shape = RoundedCornerShape(10.dp),
                                colors = ButtonDefaults.outlinedButtonColors(contentColor = RadarCyan),
                                border = androidx.compose.foundation.BorderStroke(1.dp, RadarCyan.copy(alpha = 0.5f)),
                                modifier = Modifier.weight(1f).testTag("view_dep_gate_map_btn")
                            ) {
                                Icon(Icons.Default.Layers, contentDescription = null, modifier = Modifier.size(14.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("Map: Gate ${flight.gateDeparture}", fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                            }

                            OutlinedButton(
                                onClick = { onOpenTerminalMap(flight.destination.code, flight.gateArrival) },
                                shape = RoundedCornerShape(10.dp),
                                colors = ButtonDefaults.outlinedButtonColors(contentColor = AeroBlue),
                                border = androidx.compose.foundation.BorderStroke(1.dp, InstrumentBorder),
                                modifier = Modifier.weight(1f).testTag("view_arr_gate_map_btn")
                            ) {
                                Icon(Icons.Default.Layers, contentDescription = null, modifier = Modifier.size(14.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("Map: Gate ${flight.gateArrival}", fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                            }
                        }
                    }
                }
            }

            // Quick Share Flight Status Action Card
            item {
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .border(1.dp, InstrumentBorder, RoundedCornerShape(14.dp))
                        .clickable { showShareDialog = true }
                        .testTag("quick_share_card"),
                    color = InstrumentSurface
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(34.dp)
                                    .clip(CircleShape)
                                    .background(RadarCyan.copy(alpha = 0.15f))
                                    .border(1.dp, RadarCyan.copy(alpha = 0.4f), CircleShape),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Share,
                                    contentDescription = null,
                                    tint = RadarCyan,
                                    modifier = Modifier.size(17.dp)
                                )
                            }
                            Column {
                                Text(
                                    text = "Share Flight Status Summary",
                                    color = TextWhite,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = "Send real-time gate, delay & ETA updates to family",
                                    color = TextMuted,
                                    fontSize = 11.sp
                                )
                            }
                        }
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                            contentDescription = "Share",
                            tint = RadarCyan,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }
            }

            // Local Room Database Tracking Card
            item {
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .border(
                            1.dp,
                            if (flight.isTracked) RadarCyan.copy(alpha = 0.6f) else InstrumentBorder,
                            RoundedCornerShape(14.dp)
                        )
                        .clickable { viewModel.toggleTrackFlight(flight) }
                        .testTag("flight_detail_tracking_card"),
                    color = if (flight.isTracked) RadarCyan.copy(alpha = 0.12f) else InstrumentSurface
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(34.dp)
                                    .clip(CircleShape)
                                    .background(if (flight.isTracked) RadarCyan.copy(alpha = 0.2f) else CockpitDark)
                                    .border(1.dp, if (flight.isTracked) RadarCyan else InstrumentBorder, CircleShape),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = if (flight.isTracked) Icons.Default.Storage else Icons.Default.BookmarkBorder,
                                    contentDescription = null,
                                    tint = if (flight.isTracked) RadarCyan else TextMuted,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                            Column {
                                Text(
                                    text = if (flight.isTracked) "Saved to Local Room DB" else "Track in Local Room DB",
                                    color = if (flight.isTracked) RadarCyan else TextWhite,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = if (flight.isTracked) "Offline-cached with SQLite push tracking" else "Persist to device Room database for offline monitoring",
                                    color = TextMuted,
                                    fontSize = 11.sp
                                )
                            }
                        }

                        Switch(
                            checked = flight.isTracked,
                            onCheckedChange = { viewModel.toggleTrackFlight(flight) },
                            colors = SwitchDefaults.colors(
                                checkedThumbColor = DeepSpace,
                                checkedTrackColor = RadarCyan,
                                uncheckedThumbColor = TextMuted,
                                uncheckedTrackColor = InstrumentBorder
                            ),
                            modifier = Modifier.testTag("flight_detail_track_switch")
                        )
                    }
                }
            }

            // Interactive Live Radar Map
            item {
                Column {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "LIVE FLIGHT RADAR & TELEMETRY",
                            color = TextSubtle,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 0.8.sp
                        )
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Surface(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(8.dp))
                                    .border(1.dp, RadarCyan.copy(alpha = 0.5f), RoundedCornerShape(8.dp))
                                    .clickable(onClick = onOpenGoogleMap)
                                    .testTag("launch_google_maps_pill"),
                                color = InstrumentSurface
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Map,
                                        contentDescription = null,
                                        tint = RadarCyan,
                                        modifier = Modifier.size(13.dp)
                                    )
                                    Text(
                                        text = "Google Maps",
                                        color = RadarCyan,
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                        }
                    }

                    RadarMapView(
                        flight = flight,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(if (isMapExpanded) 380.dp else 260.dp),
                        isExpandedMap = isMapExpanded,
                        onToggleExpand = { isMapExpanded = !isMapExpanded }
                    )
                }
            }

            // Destination Airport Arrival Weather Forecast & Planning
            item {
                if (destinationForecast != null) {
                    DestinationArrivalWeatherCard(forecast = destinationForecast!!)
                } else {
                    WeatherCard(origin = flight.origin, destination = flight.destination)
                }
            }

            // Airport Weather Conditions Comparison (METAR)
            if (destinationForecast != null) {
                item {
                    WeatherCard(origin = flight.origin, destination = flight.destination)
                }
            }

            // Timeline of Events
            item {
                FlightTimelineView(events = flight.timeline)
            }

            // Aircraft Specifications
            item {
                AircraftInfoCard(aircraft = flight.aircraft)
            }

            // Custom user note if available
            if (flight.customNotes.isNotBlank()) {
                item {
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .border(1.dp, InstrumentBorder, RoundedCornerShape(14.dp)),
                        colors = CardDefaults.cardColors(containerColor = CockpitDark)
                    ) {
                        Row(
                            modifier = Modifier.padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Icon(Icons.Default.StickyNote2, contentDescription = null, tint = RadarCyan)
                            Column {
                                Text("My Personal Note", color = TextMuted, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                Text(flight.customNotes, color = TextWhite, fontSize = 13.sp)
                            }
                        }
                    }
                }
            }
        }
    }

    // Edit Custom Note Dialog
    if (showNoteDialog) {
        AlertDialog(
            onDismissRequest = { showNoteDialog = false },
            title = { Text("Flight Note", color = TextWhite) },
            text = {
                OutlinedTextField(
                    value = customNoteText,
                    onValueChange = { customNoteText = it },
                    placeholder = { Text("e.g. Mom's flight, pick up at baggage claim") },
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = TextWhite,
                        unfocusedTextColor = TextWhite,
                        focusedBorderColor = RadarCyan,
                        unfocusedBorderColor = InstrumentBorder
                    )
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.updateNotes(flight.flightNumber, customNoteText)
                        showNoteDialog = false
                    }
                ) {
                    Text("Save Note", color = RadarCyan)
                }
            },
            dismissButton = {
                TextButton(onClick = { showNoteDialog = false }) {
                    Text("Cancel", color = TextMuted)
                }
            },
            containerColor = CockpitDark
        )
    }

    // Share Flight Summary Dialog
    if (showShareDialog) {
        ShareFlightDialog(
            flight = flight,
            onDismiss = { showShareDialog = false }
        )
    }
}

@Composable
private fun DetailInfoTile(
    label: String,
    primary: String,
    secondary: String,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .border(1.dp, InstrumentBorder, RoundedCornerShape(12.dp)),
        color = InstrumentSurface
    ) {
        Column(
            modifier = Modifier.padding(12.dp)
        ) {
            Text(
                text = label,
                color = TextSubtle,
                fontSize = 9.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.5.sp
            )
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = primary,
                color = TextWhite,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = secondary,
                color = AeroBlue,
                fontSize = 11.sp,
                maxLines = 1
            )
        }
    }
}
