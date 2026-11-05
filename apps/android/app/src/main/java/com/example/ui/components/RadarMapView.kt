package com.example.ui.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.model.Flight
import com.example.model.FlightStatus
import com.example.ui.theme.*
import kotlin.math.*

@Composable
fun RadarMapView(
    flight: Flight,
    modifier: Modifier = Modifier,
    isExpandedMap: Boolean = false,
    onToggleExpand: (() -> Unit)? = null
) {
    // Zoom and pan state
    var zoomScale by remember { mutableFloatStateOf(1.0f) }
    var panOffsetX by remember { mutableFloatStateOf(0f) }
    var panOffsetY by remember { mutableFloatStateOf(0f) }
    var showWeatherOverlay by remember { mutableStateOf(true) }

    // Pulsing radar beacon animation
    val infiniteTransition = rememberInfiniteTransition(label = "radarPulse")
    val pulseRadius by infiniteTransition.animateFloat(
        initialValue = 8f,
        targetValue = 38f,
        animationSpec = infiniteRepeatable(
            animation = tween(1800, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "pulseRadius"
    )
    val pulseAlpha by infiniteTransition.animateFloat(
        initialValue = 0.8f,
        targetValue = 0.0f,
        animationSpec = infiniteRepeatable(
            animation = tween(1800, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "pulseAlpha"
    )

    // Sweep line animation for high-tech radar effect
    val radarSweepAngle by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(4000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "radarSweep"
    )

    val canvasRadarCyan = RadarCyan
    val canvasDeepSpace = DeepSpace
    val canvasCockpitDark = CockpitDark
    val canvasWeatherStorm = WeatherStorm
    val canvasWeatherRain = WeatherRain
    val canvasTextSubtle = TextSubtle
    val canvasTextMuted = TextMuted
    val canvasTextWhite = TextWhite

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(20.dp))
            .background(CockpitDark)
            .border(1.dp, InstrumentBorder, RoundedCornerShape(20.dp))
            .testTag("live_radar_map")
    ) {
        // Canvas flight map
        Canvas(
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(Unit) {
                    detectTransformGestures { _, pan, zoom, _ ->
                        zoomScale = (zoomScale * zoom).coerceIn(0.6f, 3.0f)
                        panOffsetX += pan.x
                        panOffsetY += pan.y
                    }
                }
        ) {
            val width = size.width
            val height = size.height

            // Calculate center with pan offset
            val centerX = width / 2f + panOffsetX
            val centerY = height / 2f + panOffsetY

            // 1. Draw radar grid & concentric range rings
            val baseRadius = min(width, height) * 0.42f * zoomScale
            for (ring in 1..4) {
                val r = baseRadius * (ring / 4f)
                drawCircle(
                    color = canvasRadarCyan.copy(alpha = 0.08f),
                    radius = r,
                    center = Offset(centerX, centerY),
                    style = Stroke(width = 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 10f), 0f))
                )
            }

            // Radar Crosshairs
            drawLine(
                color = canvasRadarCyan.copy(alpha = 0.12f),
                start = Offset(centerX - baseRadius * 1.2f, centerY),
                end = Offset(centerX + baseRadius * 1.2f, centerY),
                strokeWidth = 1.dp.toPx()
            )
            drawLine(
                color = canvasRadarCyan.copy(alpha = 0.12f),
                start = Offset(centerX, centerY - baseRadius * 1.2f),
                end = Offset(centerX, centerY + baseRadius * 1.2f),
                strokeWidth = 1.dp.toPx()
            )

            // Radar Rotating Sweep Sector
            rotate(degrees = radarSweepAngle, pivot = Offset(centerX, centerY)) {
                drawArc(
                    brush = Brush.sweepGradient(
                        0.0f to Color.Transparent,
                        0.85f to Color.Transparent,
                        1.0f to canvasRadarCyan.copy(alpha = 0.15f)
                    ),
                    startAngle = 0f,
                    sweepAngle = 45f,
                    useCenter = true,
                    topLeft = Offset(centerX - baseRadius, centerY - baseRadius),
                    size = androidx.compose.ui.geometry.Size(baseRadius * 2, baseRadius * 2)
                )
            }

            // 2. Weather Radar Overlay (simulated storm/precipitation cells)
            if (showWeatherOverlay) {
                drawCircle(
                    brush = Brush.radialGradient(
                        colors = listOf(canvasWeatherStorm.copy(alpha = 0.25f), canvasWeatherRain.copy(alpha = 0.15f), Color.Transparent),
                        center = Offset(centerX + 60f * zoomScale, centerY - 80f * zoomScale),
                        radius = 110f * zoomScale
                    ),
                    radius = 110f * zoomScale,
                    center = Offset(centerX + 60f * zoomScale, centerY - 80f * zoomScale)
                )
                drawCircle(
                    brush = Brush.radialGradient(
                        colors = listOf(canvasWeatherRain.copy(alpha = 0.2f), Color.Transparent),
                        center = Offset(centerX - 120f * zoomScale, centerY + 50f * zoomScale),
                        radius = 80f * zoomScale
                    ),
                    radius = 80f * zoomScale,
                    center = Offset(centerX - 120f * zoomScale, centerY + 50f * zoomScale)
                )
            }

            // 3. Flight Path Great Circle Projection
            // Map coordinates: Origin (left) to Destination (right) with an upward arc
            val startX = centerX - baseRadius * 0.85f
            val startY = centerY + 30f * zoomScale
            val endX = centerX + baseRadius * 0.85f
            val endY = centerY - 40f * zoomScale

            val controlX = (startX + endX) / 2f
            val controlY = min(startY, endY) - 100f * zoomScale

            // Draw full planned path (dashed)
            val fullPath = Path().apply {
                moveTo(startX, startY)
                quadraticTo(controlX, controlY, endX, endY)
            }
            drawPath(
                path = fullPath,
                color = canvasTextSubtle.copy(alpha = 0.45f),
                style = Stroke(
                    width = 2.dp.toPx(),
                    pathEffect = PathEffect.dashPathEffect(floatArrayOf(14f, 12f), 0f)
                )
            )

            // Current aircraft position on the Bezier curve
            val progress = when (flight.status) {
                FlightStatus.LANDED -> 1.0f
                FlightStatus.SCHEDULED -> 0.05f
                FlightStatus.CANCELLED -> 0.05f
                else -> flight.telemetry.progressPercent.coerceIn(0.05f, 0.98f)
            }

            // Quadratic Bezier formula: B(t) = (1-t)^2 * P0 + 2(1-t)t * P1 + t^2 * P2
            val t = progress
            val planeX = (1 - t).pow(2) * startX + 2 * (1 - t) * t * controlX + t.pow(2) * endX
            val planeY = (1 - t).pow(2) * startY + 2 * (1 - t) * t * controlY + t.pow(2) * endY

            // Draw traveled flight path (solid neon glow)
            val traveledPath = Path().apply {
                moveTo(startX, startY)
                // Approximate partial quadratic bezier up to plane position
                val partialControlX = startX + (controlX - startX) * t
                val partialControlY = startY + (controlY - startY) * t
                quadraticTo(partialControlX, partialControlY, planeX, planeY)
            }

            // Glow line behind
            drawPath(
                path = traveledPath,
                color = canvasRadarCyan.copy(alpha = 0.35f),
                style = Stroke(width = 6.dp.toPx(), cap = StrokeCap.Round)
            )
            // Solid active line
            drawPath(
                path = traveledPath,
                color = canvasRadarCyan,
                style = Stroke(width = 2.5.dp.toPx(), cap = StrokeCap.Round)
            )

            // 4. Draw Origin & Destination Hubs
            // Origin Hub (JFK / SFO etc)
            drawCircle(
                color = canvasRadarCyan,
                radius = 6.dp.toPx(),
                center = Offset(startX, startY)
            )
            drawCircle(
                color = canvasCockpitDark,
                radius = 3.dp.toPx(),
                center = Offset(startX, startY)
            )

            // Destination Hub (LHR / DXB etc)
            drawCircle(
                color = StatusLanded,
                radius = 6.dp.toPx(),
                center = Offset(endX, endY)
            )
            drawCircle(
                color = canvasCockpitDark,
                radius = 3.dp.toPx(),
                center = Offset(endX, endY)
            )

            // 5. Draw Waypoints along the arc
            val waypointFractions = listOf(0.25f, 0.45f, 0.70f)
            for (wpT in waypointFractions) {
                val wpX = (1 - wpT).pow(2) * startX + 2 * (1 - wpT) * wpT * controlX + wpT.pow(2) * endX
                val wpY = (1 - wpT).pow(2) * startY + 2 * (1 - wpT) * wpT * controlY + wpT.pow(2) * endY

                // Waypoint diamond
                val wpSize = 4.dp.toPx()
                val wpPath = Path().apply {
                    moveTo(wpX, wpY - wpSize)
                    lineTo(wpX + wpSize, wpY)
                    lineTo(wpX, wpY + wpSize)
                    lineTo(wpX - wpSize, wpY)
                    close()
                }
                drawPath(path = wpPath, color = canvasTextMuted.copy(alpha = 0.7f), style = Stroke(width = 1.5.dp.toPx()))
            }

            // 6. Draw Aircraft Position & Pulsating Radar Ring
            // Pulsing ring
            drawCircle(
                color = canvasRadarCyan.copy(alpha = pulseAlpha),
                radius = pulseRadius * zoomScale,
                center = Offset(planeX, planeY),
                style = Stroke(width = 1.5.dp.toPx())
            )

            // Heading speed vector line
            val headingRad = Math.toRadians((flight.telemetry.headingDegrees - 90).toDouble())
            val vectorLen = 28f * zoomScale
            val headEndX = planeX + (vectorLen * cos(headingRad)).toFloat()
            val headEndY = planeY + (vectorLen * sin(headingRad)).toFloat()
            drawLine(
                color = canvasRadarCyan,
                start = Offset(planeX, planeY),
                end = Offset(headEndX, headEndY),
                strokeWidth = 2.dp.toPx(),
                cap = StrokeCap.Round
            )

            // Draw Airplane Silhouette
            val planeAngle = flight.telemetry.headingDegrees
            rotate(degrees = planeAngle, pivot = Offset(planeX, planeY)) {
                val scale = 1.3f * zoomScale
                val p = Path().apply {
                    // Aircraft nose
                    moveTo(planeX, planeY - 14f * scale)
                    // Cockpit fuselage right
                    lineTo(planeX + 3f * scale, planeY - 8f * scale)
                    // Right wing tip
                    lineTo(planeX + 16f * scale, planeY + 2f * scale)
                    lineTo(planeX + 16f * scale, planeY + 5f * scale)
                    // Fuselage behind wing
                    lineTo(planeX + 4f * scale, planeY + 3f * scale)
                    // Right horizontal stabilizer
                    lineTo(planeX + 7f * scale, planeY + 11f * scale)
                    lineTo(planeX + 7f * scale, planeY + 13f * scale)
                    // Tail tip
                    lineTo(planeX, planeY + 10f * scale)
                    // Left horizontal stabilizer
                    lineTo(planeX - 7f * scale, planeY + 13f * scale)
                    lineTo(planeX - 7f * scale, planeY + 11f * scale)
                    // Fuselage left
                    lineTo(planeX - 4f * scale, planeY + 3f * scale)
                    // Left wing tip
                    lineTo(planeX - 16f * scale, planeY + 5f * scale)
                    lineTo(planeX - 16f * scale, planeY + 2f * scale)
                    // Left fuselage
                    lineTo(planeX - 3f * scale, planeY - 8f * scale)
                    close()
                }

                // Plane shadow/halo
                drawPath(path = p, color = canvasDeepSpace.copy(alpha = 0.8f))
                // Solid airplane body
                drawPath(path = p, color = canvasRadarCyan)
                // Core cockpit light
                drawCircle(color = canvasTextWhite, radius = 2.dp.toPx(), center = Offset(planeX, planeY - 4f * scale))
            }
        }

        // Top bar overlay inside Map: Status & Airport Badges
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .background(CockpitDark.copy(alpha = 0.85f))
                    .border(1.dp, InstrumentBorder, RoundedCornerShape(12.dp))
                    .padding(horizontal = 10.dp, vertical = 6.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(if (flight.status == FlightStatus.DEPARTED) RadarCyan else flight.status.color)
                )
                Text(
                    text = "${flight.origin.code} → ${flight.destination.code}",
                    color = TextWhite,
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp
                )
                Text(
                    text = "·",
                    color = TextMuted,
                    fontSize = 13.sp
                )
                Text(
                    text = "${(flight.telemetry.progressPercent * 100).toInt()}%",
                    color = RadarCyan,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 13.sp
                )
            }

            // Quick Map Action Buttons (Weather overlay & Center)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                // Weather Radar Toggle Button
                IconButton(
                    onClick = { showWeatherOverlay = !showWeatherOverlay },
                    modifier = Modifier
                        .size(34.dp)
                        .clip(CircleShape)
                        .background(if (showWeatherOverlay) InstrumentSurfaceElevated else CockpitDark.copy(alpha = 0.8f))
                        .border(1.dp, if (showWeatherOverlay) RadarCyan.copy(alpha = 0.6f) else InstrumentBorder, CircleShape)
                        .testTag("toggle_weather_radar")
                ) {
                    Icon(
                        imageVector = Icons.Default.Thunderstorm,
                        contentDescription = "Toggle Weather Radar",
                        tint = if (showWeatherOverlay) RadarCyan else TextMuted,
                        modifier = Modifier.size(16.dp)
                    )
                }

                // Center on Plane Button
                IconButton(
                    onClick = {
                        panOffsetX = 0f
                        panOffsetY = 0f
                        zoomScale = 1.0f
                    },
                    modifier = Modifier
                        .size(34.dp)
                        .clip(CircleShape)
                        .background(CockpitDark.copy(alpha = 0.8f))
                        .border(1.dp, InstrumentBorder, CircleShape)
                        .testTag("center_plane_btn")
                ) {
                    Icon(
                        imageVector = Icons.Default.MyLocation,
                        contentDescription = "Center on Aircraft",
                        tint = RadarCyan,
                        modifier = Modifier.size(16.dp)
                    )
                }

                if (onToggleExpand != null) {
                    IconButton(
                        onClick = onToggleExpand,
                        modifier = Modifier
                            .size(34.dp)
                            .clip(CircleShape)
                            .background(CockpitDark.copy(alpha = 0.8f))
                            .border(1.dp, InstrumentBorder, CircleShape)
                            .testTag("expand_map_btn")
                    ) {
                        Icon(
                            imageVector = if (isExpandedMap) Icons.Default.FullscreenExit else Icons.Default.Fullscreen,
                            contentDescription = "Toggle Fullscreen Map",
                            tint = TextWhite,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }
            }
        }

        // Live Telemetry HUD Bar pinned at the bottom of the map
        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .padding(12.dp)
        ) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .border(1.dp, InstrumentBorder, RoundedCornerShape(14.dp)),
                color = CockpitDark.copy(alpha = 0.92f)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Altitude
                    TelemetryItem(
                        label = "ALTITUDE",
                        value = "${flight.telemetry.altitudeFeet} ft",
                        highlight = true
                    )

                    VerticalDivider(modifier = Modifier.height(28.dp), color = InstrumentBorder)

                    // Ground Speed
                    TelemetryItem(
                        label = "SPEED",
                        value = "${flight.telemetry.groundSpeedKnots} kts"
                    )

                    VerticalDivider(modifier = Modifier.height(28.dp), color = InstrumentBorder)

                    // Mach
                    TelemetryItem(
                        label = "MACH",
                        value = "M ${flight.telemetry.mach}"
                    )

                    VerticalDivider(modifier = Modifier.height(28.dp), color = InstrumentBorder)

                    // ETA
                    TelemetryItem(
                        label = "REMAINING",
                        value = "${flight.telemetry.distanceRemainingNm} nm",
                        subtext = "${flight.telemetry.etaMinutesRemaining}m"
                    )
                }
            }
        }
    }
}

@Composable
private fun TelemetryItem(
    label: String,
    value: String,
    highlight: Boolean = false,
    subtext: String? = null
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = label,
            color = TextSubtle,
            fontSize = 9.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.5.sp
        )
        Text(
            text = value,
            color = if (highlight) RadarCyan else TextWhite,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold
        )
        if (subtext != null) {
            Text(
                text = subtext,
                color = AeroBlue,
                fontSize = 10.sp,
                fontWeight = FontWeight.SemiBold
            )
        }
    }
}
