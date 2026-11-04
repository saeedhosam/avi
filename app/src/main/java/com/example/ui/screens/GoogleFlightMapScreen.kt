package com.example.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.model.Flight
import com.example.model.FlightStatus
import com.example.ui.components.StatusBadge
import com.example.ui.theme.*
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.LatLngBounds
import com.google.maps.android.compose.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GoogleFlightMapScreen(
    flight: Flight,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    val coroutineScope = rememberCoroutineScope()

    // Key Coordinates
    val originLatLng = remember(flight) {
        LatLng(flight.origin.latitude, flight.origin.longitude)
    }
    val destLatLng = remember(flight) {
        LatLng(flight.destination.latitude, flight.destination.longitude)
    }
    val currentPlaneLatLng = remember(flight.telemetry.currentLatitude, flight.telemetry.currentLongitude) {
        LatLng(flight.telemetry.currentLatitude, flight.telemetry.currentLongitude)
    }

    // Geodesic Flight Path Points
    val flightPathPoints = remember(flight, currentPlaneLatLng) {
        val points = mutableListOf<LatLng>()
        points.add(originLatLng)
        flight.telemetry.waypoints.forEach { wp ->
            points.add(LatLng(wp.latitude, wp.longitude))
        }
        if (flight.status == FlightStatus.DEPARTED) {
            points.add(currentPlaneLatLng)
        }
        points.add(destLatLng)
        points
    }

    // Initial Camera Position centered between origin and destination
    val midLat = (originLatLng.latitude + destLatLng.latitude) / 2
    val midLon = (originLatLng.longitude + destLatLng.longitude) / 2
    val cameraPositionState = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(LatLng(midLat, midLon), 3.2f)
    }

    var selectedMapType by remember { mutableStateOf(MapType.NORMAL) }
    var showTelemetryCard by remember { mutableStateOf(true) }

    val mapProperties by remember(selectedMapType) {
        mutableStateOf(
            MapProperties(
                mapType = selectedMapType,
                isMyLocationEnabled = false,
                isTrafficEnabled = false
            )
        )
    }

    val mapUiSettings by remember {
        mutableStateOf(
            MapUiSettings(
                zoomControlsEnabled = false,
                compassEnabled = true,
                mapToolbarEnabled = false,
                rotationGesturesEnabled = true,
                tiltGesturesEnabled = true
            )
        )
    }

    Scaffold(
        modifier = modifier.testTag("google_flight_map_screen"),
        containerColor = DeepSpace,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(
                                text = "${flight.flightNumber} · Google Maps",
                                color = TextWhite,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold
                            )
                            StatusBadge(status = flight.status, delayMinutes = flight.delayMinutes)
                        }
                        Text(
                            text = "${flight.origin.code} (${flight.origin.city}) → ${flight.destination.code} (${flight.destination.city})",
                            color = RadarCyan,
                            fontSize = 11.sp
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack, modifier = Modifier.testTag("map_back_btn")) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                            tint = TextWhite
                        )
                    }
                },
                actions = {
                    // Toggle telemetry sheet
                    IconButton(onClick = { showTelemetryCard = !showTelemetryCard }) {
                        Icon(
                            imageVector = if (showTelemetryCard) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                            contentDescription = "Toggle Telemetry HUD",
                            tint = if (showTelemetryCard) RadarCyan else TextMuted
                        )
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
            // Main Google Map View
            GoogleMap(
                modifier = Modifier
                    .fillMaxSize()
                    .testTag("google_map_view"),
                cameraPositionState = cameraPositionState,
                properties = mapProperties,
                uiSettings = mapUiSettings
            ) {
                // 1. Departure Point Marker (Origin)
                Marker(
                    state = MarkerState(position = originLatLng),
                    title = "Departure: ${flight.origin.code}",
                    snippet = "${flight.origin.city} · Scheduled ${flight.departureTimeScheduled} · Terminal ${flight.terminalDeparture} Gate ${flight.gateDeparture}",
                    icon = BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_AZURE)
                )

                // 2. Estimated Arrival Point Marker (Destination)
                Marker(
                    state = MarkerState(position = destLatLng),
                    title = "Arrival Point: ${flight.destination.code}",
                    snippet = "${flight.destination.city} · ETA ${flight.arrivalTimeEstimated} · Terminal ${flight.terminalArrival} Gate ${flight.gateArrival}",
                    icon = BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_GREEN)
                )

                // 3. Current Aircraft Location Marker (Only when in flight or active)
                if (flight.status == FlightStatus.DEPARTED) {
                    Marker(
                        state = MarkerState(position = currentPlaneLatLng),
                        title = "${flight.airline} ${flight.flightNumber}",
                        snippet = "Alt: ${flight.telemetry.altitudeFeet} ft · Speed: ${flight.telemetry.groundSpeedKnots} kts · Heading: ${flight.telemetry.headingDegrees.toInt()}°",
                        rotation = flight.telemetry.headingDegrees,
                        flat = true,
                        icon = BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_CYAN)
                    )
                }

                // 4. Geodesic Flight Path Polyline
                Polyline(
                    points = flightPathPoints,
                    color = Color(0xFF00E5FF),
                    width = 8f,
                    geodesic = true
                )

                // Traveled Path highlight (Origin to Current Plane)
                if (flight.status == FlightStatus.DEPARTED) {
                    Polyline(
                        points = listOf(originLatLng, currentPlaneLatLng),
                        color = Color(0xFF38BDF8),
                        width = 10f,
                        geodesic = true
                    )
                }
            }

            // Top Map Type Selector (Normal, Satellite, Terrain, Hybrid)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp)
                    .align(Alignment.TopCenter),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                MapTypeChip(
                    label = "Normal",
                    selected = selectedMapType == MapType.NORMAL,
                    onClick = { selectedMapType = MapType.NORMAL }
                )
                MapTypeChip(
                    label = "Satellite",
                    selected = selectedMapType == MapType.SATELLITE,
                    onClick = { selectedMapType = MapType.SATELLITE }
                )
                MapTypeChip(
                    label = "Terrain",
                    selected = selectedMapType == MapType.TERRAIN,
                    onClick = { selectedMapType = MapType.TERRAIN }
                )
                MapTypeChip(
                    label = "Hybrid",
                    selected = selectedMapType == MapType.HYBRID,
                    onClick = { selectedMapType = MapType.HYBRID }
                )
            }

            // Floating Map Controls (Right Side: Center Plane, Fit Route, Zoom In/Out)
            Column(
                modifier = Modifier
                    .align(Alignment.CenterEnd)
                    .padding(end = 12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // Center on Current Plane
                FloatingActionButton(
                    onClick = {
                        coroutineScope.launch {
                            val target = if (flight.status == FlightStatus.DEPARTED) currentPlaneLatLng else originLatLng
                            cameraPositionState.animate(
                                CameraUpdateFactory.newCameraPosition(
                                    CameraPosition.fromLatLngZoom(target, 6.5f)
                                ),
                                800
                            )
                        }
                    },
                    modifier = Modifier.size(44.dp).testTag("map_center_plane_btn"),
                    containerColor = CockpitDark,
                    contentColor = RadarCyan,
                    shape = CircleShape
                ) {
                    Icon(Icons.Default.Flight, contentDescription = "Center Plane", modifier = Modifier.size(20.dp))
                }

                // Fit Full Route in Bounds
                FloatingActionButton(
                    onClick = {
                        coroutineScope.launch {
                            val bounds = LatLngBounds.builder()
                                .include(originLatLng)
                                .include(destLatLng)
                                .include(currentPlaneLatLng)
                                .build()
                            cameraPositionState.animate(
                                CameraUpdateFactory.newLatLngBounds(bounds, 120),
                                800
                            )
                        }
                    },
                    modifier = Modifier.size(44.dp).testTag("map_fit_route_btn"),
                    containerColor = CockpitDark,
                    contentColor = TextWhite,
                    shape = CircleShape
                ) {
                    Icon(Icons.Default.ZoomOutMap, contentDescription = "Fit Route", modifier = Modifier.size(20.dp))
                }

                // Zoom In
                FloatingActionButton(
                    onClick = {
                        coroutineScope.launch {
                            cameraPositionState.animate(CameraUpdateFactory.zoomIn(), 400)
                        }
                    },
                    modifier = Modifier.size(44.dp),
                    containerColor = CockpitDark,
                    contentColor = TextWhite,
                    shape = CircleShape
                ) {
                    Icon(Icons.Default.Add, contentDescription = "Zoom In", modifier = Modifier.size(20.dp))
                }

                // Zoom Out
                FloatingActionButton(
                    onClick = {
                        coroutineScope.launch {
                            cameraPositionState.animate(CameraUpdateFactory.zoomOut(), 400)
                        }
                    },
                    modifier = Modifier.size(44.dp),
                    containerColor = CockpitDark,
                    contentColor = TextWhite,
                    shape = CircleShape
                ) {
                    Icon(Icons.Default.Remove, contentDescription = "Zoom Out", modifier = Modifier.size(20.dp))
                }
            }

            // Bottom Floating Dossier Card (Current Location, Flight Path, Arrival Point)
            AnimatedVisibility(
                visible = showTelemetryCard,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .padding(14.dp)
            ) {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(18.dp))
                        .border(1.dp, InstrumentBorder, RoundedCornerShape(18.dp))
                        .testTag("map_telemetry_card"),
                    colors = CardDefaults.cardColors(containerColor = CockpitDark.copy(alpha = 0.94f)),
                    elevation = CardDefaults.cardElevation(8.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Icon(Icons.Default.LocationOn, contentDescription = null, tint = RadarCyan, modifier = Modifier.size(18.dp))
                                Column {
                                    Text(
                                        text = "AIRCRAFT CURRENT LOCATION",
                                        color = TextSubtle,
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        letterSpacing = 0.5.sp
                                    )
                                    Text(
                                        text = "${String.format("%.2f", flight.telemetry.currentLatitude)}° N, ${String.format("%.2f", kotlin.math.abs(flight.telemetry.currentLongitude))}° ${if (flight.telemetry.currentLongitude >= 0) "E" else "W"}",
                                        color = TextWhite,
                                        fontSize = 14.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }

                            Column(horizontalAlignment = Alignment.End) {
                                Text(
                                    text = "ESTIMATED ARRIVAL",
                                    color = TextSubtle,
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    letterSpacing = 0.5.sp
                                )
                                Text(
                                    text = "${flight.destination.code} · ${flight.arrivalTimeEstimated}",
                                    color = StatusLanded,
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(12.dp))
                        HorizontalDivider(color = InstrumentBorder.copy(alpha = 0.6f), thickness = 0.8.dp)
                        Spacer(modifier = Modifier.height(10.dp))

                        // Metric counters row
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            MapMetricItem(label = "ALTITUDE", value = "${flight.telemetry.altitudeFeet} ft", highlight = true)
                            MapMetricItem(label = "SPEED", value = "${flight.telemetry.groundSpeedKnots} kts")
                            MapMetricItem(label = "MACH", value = "M ${flight.telemetry.mach}")
                            MapMetricItem(label = "REMAINING", value = "${flight.telemetry.distanceRemainingNm} NM", subtext = "${flight.telemetry.etaMinutesRemaining}m")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MapTypeChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit
) {
    Surface(
        modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .border(1.dp, if (selected) RadarCyan else InstrumentBorder, RoundedCornerShape(10.dp))
            .clickable(onClick = onClick),
        color = if (selected) CockpitDark else CockpitDark.copy(alpha = 0.75f)
    ) {
        Text(
            text = label,
            color = if (selected) RadarCyan else TextWhite,
            fontSize = 11.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
        )
    }
}

@Composable
private fun MapMetricItem(
    label: String,
    value: String,
    highlight: Boolean = false,
    subtext: String? = null
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(text = label, color = TextSubtle, fontSize = 9.sp, fontWeight = FontWeight.Bold)
        Text(text = value, color = if (highlight) RadarCyan else TextWhite, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        if (subtext != null) {
            Text(text = subtext, color = AeroBlue, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}
