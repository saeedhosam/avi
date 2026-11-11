package com.example.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.border
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
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.example.R
import com.example.model.Flight
import com.example.model.FlightStatus
import com.example.ui.components.StatusBadge
import com.example.ui.theme.*
import java.util.Locale
import kotlin.math.min
import kotlin.time.Duration.Companion.milliseconds
import kotlinx.coroutines.launch
import org.maplibre.compose.camera.CameraAnimation
import org.maplibre.compose.camera.CameraFit
import org.maplibre.compose.camera.CameraPosition
import org.maplibre.compose.camera.CameraUpdate
import org.maplibre.compose.expressions.dsl.asString
import org.maplibre.compose.expressions.dsl.const
import org.maplibre.compose.expressions.dsl.feature
import org.maplibre.compose.expressions.dsl.format
import org.maplibre.compose.expressions.dsl.image
import org.maplibre.compose.expressions.dsl.span
import org.maplibre.compose.expressions.dsl.textOffset
import org.maplibre.compose.expressions.value.IconRotationAlignment
import org.maplibre.compose.expressions.value.LineCap
import org.maplibre.compose.expressions.value.LineJoin
import org.maplibre.compose.expressions.value.SymbolAnchor
import org.maplibre.compose.layers.Anchor
import org.maplibre.compose.layers.CircleLayer
import org.maplibre.compose.layers.LineLayer
import org.maplibre.compose.layers.SymbolLayer
import org.maplibre.compose.map.MaplibreMap
import org.maplibre.compose.map.rememberMapState
import org.maplibre.compose.sources.GeoJsonData
import org.maplibre.compose.sources.rememberGeoJsonSource
import org.maplibre.compose.style.BaseStyle
import org.maplibre.compose.util.DpPadding
import org.maplibre.spatialk.geojson.BoundingBox
import org.maplibre.spatialk.geojson.Position

/** Web parity: apps/web/src/lib/maplibre.ts MAP_COLORS. */
private val MapInk = Color(0xFF071018)
private val MapWhite = Color(0xFFFFFFFF)
private val MapRouteRemaining = Color(0xFFD94A6A)
private val MapRouteTraveled = Color(0xFF0077FF)
private val MapRadarCyan = Color(0xFF00E5FF)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FlightMapScreen(
    flight: Flight,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    val coroutineScope = rememberCoroutineScope()
    val isDarkTheme = LocalDarkTheme.current

    val origin = LngLat(flight.origin.longitude, flight.origin.latitude)
    val destination = LngLat(flight.destination.longitude, flight.destination.latitude)
    val aircraft = LngLat(flight.telemetry.currentLongitude, flight.telemetry.currentLatitude)
    val isLive = flight.status == FlightStatus.DEPARTED &&
        flight.telemetry.currentLatitude != 0.0 &&
        flight.telemetry.currentLongitude != 0.0

    // Great-circle pieces, matching apps/web/src/lib/geo.ts + flight-map.tsx.
    val route = remember(flight) { greatCircle(origin, destination) }
    val traveled =
        if (isLive) remember(flight) { greatCircle(origin, aircraft) } else emptyList()
    val progressPoint =
        if (flight.status != FlightStatus.SCHEDULED) {
            destinationAlong(
                origin,
                destination,
                flight.telemetry.progressPercent.coerceIn(0f, 1f).toDouble(),
            )
        } else null
    val planePoint = when {
        isLive -> aircraft
        progressPoint != null -> progressPoint
        else -> null
    }
    val headingVector =
        if (isLive && flight.telemetry.groundSpeedKnots > 40) {
            listOf(aircraft, headingDestination(aircraft, flight.telemetry.headingDegrees, 28.0))
        } else emptyList()

    val planePainter = painterResource(R.drawable.ic_map_plane)
    val fitPadding = DpPadding(left = 70.dp, top = 70.dp, right = 70.dp, bottom = 70.dp)

    val mapState = rememberMapState(
        baseStyle = BaseStyle.Uri(
            if (isDarkTheme) "asset://map/style-dark.json" else "asset://map/style.json"
        ),
        initialCameraPosition = CameraPosition(
            center = Position((origin.lon + destination.lon) / 2, (origin.lat + destination.lat) / 2),
            zoom = 2.6,
        ),
    ) {
        val routeSource =
            rememberGeoJsonSource(GeoJsonData.JsonString(lineCollection(route)))
        val traveledSource =
            rememberGeoJsonSource(GeoJsonData.JsonString(lineCollection(traveled)))
        val headingSource =
            rememberGeoJsonSource(GeoJsonData.JsonString(lineCollection(headingVector)))
        val airportsSource = rememberGeoJsonSource(
            GeoJsonData.JsonString(
                pointCollection(
                    pointFeature("origin", origin, """"iata":"${flight.origin.code}""""),
                    pointFeature("destination", destination, """"iata":"${flight.destination.code}""""),
                )
            )
        )
        val aircraftSource = rememberGeoJsonSource(
            GeoJsonData.JsonString(
                pointCollection(
                    *listOfNotNull(
                        planePoint?.let {
                            pointFeature(
                                "aircraft",
                                it,
                                """"heading":${fmt(flight.telemetry.headingDegrees.toDouble())},""" +
                                    """"flight":"${flight.flightNumber}""""
                            )
                        }
                    ).toTypedArray()
                )
            )
        )

        // Lines sit below the base style's symbol layers (mirrors web label-hiding contract).
        Anchor.Below({ it.type == "symbol" }) {
            LineLayer(
                id = "avi-route-line",
                source = routeSource,
                cap = const(LineCap.Round),
                join = const(LineJoin.Round),
                color = const(MapRouteRemaining),
                width = const(2.2.dp),
                opacity = const(0.9f),
            )
            LineLayer(
                id = "avi-traveled-line",
                source = traveledSource,
                cap = const(LineCap.Round),
                join = const(LineJoin.Round),
                color = const(MapRouteTraveled),
                width = const(3.2.dp),
            )
            LineLayer(
                id = "avi-heading-line",
                source = headingSource,
                cap = const(LineCap.Round),
                color = const(MapRadarCyan),
                width = const(1.4.dp),
                opacity = const(0.9f),
            )
        }
        CircleLayer(
            id = "avi-airport-circles",
            source = airportsSource,
            radius = const(5.dp),
            color = const(MapRouteTraveled),
            strokeColor = const(MapWhite),
            strokeWidth = const(2.dp),
        )
        SymbolLayer(
            id = "avi-airport-labels",
            source = airportsSource,
            textField = format(span(feature["iata"].asString())),
            textColor = const(MapInk),
            textHaloColor = const(MapWhite),
            textHaloWidth = const(2.dp),
            textAnchor = const(SymbolAnchor.Bottom),
            textSize = const(11.sp),
            textOffset = textOffset(0f.em, (-1.35f).em),
            textAllowOverlap = const(true),
            textIgnorePlacement = const(true),
        )
        CircleLayer(
            id = "avi-aircraft-circle",
            source = aircraftSource,
            radius = const(7.dp),
            color = const(MapRadarCyan),
            strokeColor = const(MapInk),
            strokeWidth = const(2.dp),
            opacity = const(0.24f),
        )
        SymbolLayer(
            id = "avi-aircraft-icon",
            source = aircraftSource,
            iconImage = image(planePainter, size = DpSize(64.dp, 64.dp)),
            iconSize = const(0.52f),
            iconRotate = const(flight.telemetry.headingDegrees),
            iconRotationAlignment = const(IconRotationAlignment.Map),
            iconAllowOverlap = const(true),
            iconIgnorePlacement = const(true),
        )
    }

    var lastFitKey by remember { mutableStateOf("") }
    LaunchedEffect(flight.id, flight.status, isLive) {
        val key = "${flight.id}:${flight.status}:$isLive"
        if (lastFitKey == key) return@LaunchedEffect
        lastFitKey = key
        val camera = mapState.cameraForBounds(
            boundingBox = routeBounds(route, planePoint),
            fit = CameraFit(fitPadding = fitPadding),
        )
        // Cap like the web fitBounds(maxZoom 5.8).
        mapState.animateCamera(
            camera.copy(zoom = min(camera.zoom, 5.8)).toCameraUpdate(),
            animation = CameraAnimation.Ease { duration = 800.milliseconds },
        )
    }

    var showTelemetryCard by remember { mutableStateOf(true) }

    Scaffold(
        modifier = modifier.testTag("avi_flight_map_screen"),
        containerColor = DeepSpace,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(
                                text = "${flight.flightNumber} · Flight Map",
                                color = TextWhite,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold
                            )
                            StatusBadge(
                                status = flight.status,
                                delayMinutes = flight.delayMinutes,
                                statusReported = flight.statusReported,
                                delayReported = flight.delayReported
                            )
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
            MaplibreMap(
                state = mapState,
                modifier = Modifier
                    .fillMaxSize()
                    .testTag("avi_map_view"),
            )

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
                            val target = planePoint ?: origin
                            val keepZoom = mapState.cameraPosition.zoom.coerceAtLeast(6.5)
                            mapState.animateCamera(
                                update = CameraUpdate(
                                    center = Position(target.lon, target.lat),
                                    zoom = keepZoom,
                                ),
                                animation = CameraAnimation.Ease { duration = 800.milliseconds },
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
                            val camera = mapState.cameraForBounds(
                                boundingBox = routeBounds(route, planePoint),
                                fit = CameraFit(fitPadding = fitPadding),
                            )
                            mapState.animateCamera(
                                camera.copy(zoom = min(camera.zoom, 5.8)).toCameraUpdate(),
                                animation = CameraAnimation.Ease { duration = 800.milliseconds },
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
                            mapState.animateCamera(
                                CameraUpdate(zoom = mapState.cameraPosition.zoom + 1.0),
                                animation = CameraAnimation.Ease { duration = 400.milliseconds },
                            )
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
                            mapState.animateCamera(
                                CameraUpdate(zoom = mapState.cameraPosition.zoom - 1.0),
                                animation = CameraAnimation.Ease { duration = 400.milliseconds },
                            )
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
                                        text = "${String.format(Locale.US, "%.2f", flight.telemetry.currentLatitude)}° N, ${String.format(Locale.US, "%.2f", kotlin.math.abs(flight.telemetry.currentLongitude))}° ${if (flight.telemetry.currentLongitude >= 0) "E" else "W"}",
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

// ── Geo helpers ─────────────────────────────────────────────────────────────
// Kotlin port of apps/web/src/lib/geo.ts so web and Android draw identical arcs.

private data class LngLat(val lon: Double, val lat: Double)

private fun greatCircle(origin: LngLat, destination: LngLat, steps: Int = 128): List<LngLat> {
    val lon1 = Math.toRadians(origin.lon)
    val lat1 = Math.toRadians(origin.lat)
    val lon2 = Math.toRadians(destination.lon)
    val lat2 = Math.toRadians(destination.lat)
    val dLat = lat2 - lat1
    val dLon = lon2 - lon1
    val a = kotlin.math.sin(dLat / 2) * kotlin.math.sin(dLat / 2) +
        kotlin.math.cos(lat1) * kotlin.math.cos(lat2) * kotlin.math.sin(dLon / 2) * kotlin.math.sin(dLon / 2)
    val angularDistance = 2 * kotlin.math.atan2(kotlin.math.sqrt(a), kotlin.math.sqrt(1 - a))

    if (angularDistance < 1e-6) return listOf(origin, destination)

    val points = mutableListOf<LngLat>()
    for (index in 0..steps) {
        val fraction = index.toDouble() / steps
        val b1 = kotlin.math.sin(fraction * angularDistance) / kotlin.math.sin(angularDistance)
        val a1 = kotlin.math.sin((1 - fraction) * angularDistance) / kotlin.math.sin(angularDistance)
        val x = a1 * kotlin.math.cos(lat1) * kotlin.math.cos(lon1) + b1 * kotlin.math.cos(lat2) * kotlin.math.cos(lon2)
        val y = a1 * kotlin.math.cos(lat1) * kotlin.math.sin(lon1) + b1 * kotlin.math.cos(lat2) * kotlin.math.sin(lon2)
        val z = a1 * kotlin.math.sin(lat1) + b1 * kotlin.math.sin(lat2)
        points.add(LngLat(Math.toDegrees(kotlin.math.atan2(y, x)), Math.toDegrees(kotlin.math.atan2(z, kotlin.math.hypot(x, y)))))
    }
    return unwrapLongitude(points)
}

private fun unwrapLongitude(line: List<LngLat>): List<LngLat> {
    if (line.isEmpty()) return line
    val result = mutableListOf<LngLat>()
    for ((lon, lat) in line) {
        if (result.isEmpty()) {
            result.add(LngLat(lon, lat))
        } else {
            val previous = result.last().lon
            var candidate = lon
            while (candidate - previous > 180) candidate -= 360
            while (previous - candidate > 180) candidate += 360
            result.add(LngLat(candidate, lat))
        }
    }
    return result
}

private fun destinationAlong(start: LngLat, end: LngLat, fraction: Double): LngLat {
    val lon1 = Math.toRadians(start.lon)
    val lat1 = Math.toRadians(start.lat)
    val lon2 = Math.toRadians(end.lon)
    val lat2 = Math.toRadians(end.lat)
    val d = kotlin.math.acos(
        1.0.coerceAtLeast(-1.0.coerceAtLeast(
            kotlin.math.sin(lat1) * kotlin.math.sin(lat2) +
                kotlin.math.cos(lat1) * kotlin.math.cos(lat2) * kotlin.math.cos(lon2 - lon1)
        ))
    )
    if (d < 1e-6) return end
    val a1 = kotlin.math.sin((1 - fraction) * d) / kotlin.math.sin(d)
    val b1 = kotlin.math.sin(fraction * d) / kotlin.math.sin(d)
    val x = a1 * kotlin.math.cos(lat1) * kotlin.math.cos(lon1) + b1 * kotlin.math.cos(lat2) * kotlin.math.cos(lon2)
    val y = a1 * kotlin.math.cos(lat1) * kotlin.math.sin(lon1) + b1 * kotlin.math.cos(lat2) * kotlin.math.sin(lon2)
    val z = a1 * kotlin.math.sin(lat1) + b1 * kotlin.math.sin(lat2)
    return LngLat(Math.toDegrees(kotlin.math.atan2(y, x)), Math.toDegrees(kotlin.math.atan2(z, kotlin.math.hypot(x, y))))
}

private fun headingDestination(start: LngLat, heading: Float, distanceNm: Double): LngLat {
    // Earth radius in nautical miles; trigonometric functions below use radians.
    val distance = distanceNm / 3440.065
    val lon = Math.toRadians(start.lon)
    val lat = Math.toRadians(start.lat)
    val bearing = Math.toRadians(heading.toDouble())
    val lat2 = kotlin.math.asin(
        kotlin.math.sin(lat) * kotlin.math.cos(distance) +
            kotlin.math.cos(lat) * kotlin.math.sin(distance) * kotlin.math.cos(bearing)
    )
    val lon2 = lon + kotlin.math.atan2(
        kotlin.math.sin(bearing) * kotlin.math.sin(distance) * kotlin.math.cos(lat),
        kotlin.math.cos(distance) - kotlin.math.sin(lat) * kotlin.math.sin(lat2),
    )
    return LngLat(Math.toDegrees(lon2), Math.toDegrees(lat2))
}

private fun routeBounds(route: List<LngLat>, planePoint: LngLat?): BoundingBox {
    val points = buildList {
        route.firstOrNull()?.let { add(it) }
        route.lastOrNull()?.let { add(it) }
        planePoint?.let { add(it) }
    }
    val xs = points.map { it.lon }
    val ys = points.map { it.lat }
    return BoundingBox(
        west = xs.min(),
        south = ys.min(),
        east = xs.max(),
        north = ys.max(),
    )
}

private fun fmt(value: Double): String = String.format(Locale.US, "%.6f", value)

private fun lineCollection(points: List<LngLat>): String {
    if (points.isEmpty()) return EMPTY_COLLECTION
    val coordinates = points.joinToString(",") { "[${fmt(it.lon)},${fmt(it.lat)}]" }
    return """{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"LineString","coordinates":[$coordinates]},"properties":{}}]}"""
}

private fun pointCollection(vararg features: String): String {
    if (features.isEmpty()) return EMPTY_COLLECTION
    return """{"type":"FeatureCollection","features":[${features.joinToString(",")}]}"""
}

private fun pointFeature(id: String, point: LngLat, properties: String): String =
    """{"type":"Feature","geometry":{"type":"Point","coordinates":[${fmt(point.lon)},${fmt(point.lat)}]},"properties":{$properties}}"""

private const val EMPTY_COLLECTION = """{"type":"FeatureCollection","features":[]}"""
