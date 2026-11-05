package com.example.ui.terminal

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.DirectionsWalk
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
import androidx.compose.ui.graphics.drawscope.*
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.model.*
import com.example.ui.theme.*
import kotlin.math.*

@Composable
fun TerminalMapCanvas(
    layout: AirportTerminalLayout,
    currentFloor: ConcourseFloor,
    amenities: List<TerminalAmenity>,
    selectedAmenity: TerminalAmenity?,
    onAmenitySelected: (TerminalAmenity) -> Unit,
    showWalkingRoute: Boolean,
    modifier: Modifier = Modifier
) {
    var scale by remember { mutableFloatStateOf(1.0f) }
    var offset by remember { mutableStateOf(Offset.Zero) }

    // Pulsing animation for selected pin & route
    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val pulseAlpha by infiniteTransition.animateFloat(
        initialValue = 0.3f,
        targetValue = 0.9f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulseAlpha"
    )
    val routeDashPhase by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 40f,
        animationSpec = infiniteRepeatable(
            animation = tween(1000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "routeDash"
    )

    val textMeasurer = rememberTextMeasurer()
    val density = LocalDensity.current

    // Snapshot theme colors for safe usage inside DrawScope
    val themeDeepSpace = DeepSpace
    val themeCockpitDark = CockpitDark
    val themeInstrumentBorder = InstrumentBorder
    val themeRadarCyan = RadarCyan
    val themeTextWhite = TextWhite
    val themeTextMuted = TextMuted

    Box(modifier = modifier.fillMaxSize().background(themeDeepSpace)) {
        Canvas(
            modifier = Modifier
                .fillMaxSize()
                .testTag("terminal_map_canvas")
                .pointerInput(currentFloor) {
                    detectTransformGestures { _, pan, zoom, _ ->
                        scale = (scale * zoom).coerceIn(0.6f, 3.8f)
                        val maxPan = 600f * scale
                        offset = Offset(
                            x = (offset.x + pan.x).coerceIn(-maxPan, maxPan),
                            y = (offset.y + pan.y).coerceIn(-maxPan, maxPan)
                        )
                    }
                }
                .pointerInput(amenities, scale, offset) {
                    detectTapGestures { tapOffset ->
                        val canvasWidth = size.width
                        val canvasHeight = size.height

                        // Find closest amenity within tap radius (36dp adjusted by scale)
                        val tapRadiusPx = with(density) { 36.dp.toPx() }
                        var closestAmenity: TerminalAmenity? = null
                        var minDistance = Float.MAX_VALUE

                        amenities.forEach { amenity ->
                            val screenX = (amenity.position.x * canvasWidth * scale) + offset.x + (canvasWidth * (1 - scale) / 2)
                            val screenY = (amenity.position.y * canvasHeight * scale) + offset.y + (canvasHeight * (1 - scale) / 2)

                            val dx = tapOffset.x - screenX
                            val dy = tapOffset.y - screenY
                            val distance = sqrt(dx * dx + dy * dy)

                            if (distance < tapRadiusPx && distance < minDistance) {
                                minDistance = distance
                                closestAmenity = amenity
                            }
                        }

                        closestAmenity?.let { onAmenitySelected(it) }
                    }
                }
        ) {
            val canvasW = size.width
            val canvasH = size.height

            // Coordinate transformation helper
            fun toScreen(p: PointF): Offset {
                val sx = (p.x * canvasW * scale) + offset.x + (canvasW * (1 - scale) / 2)
                val sy = (p.y * canvasH * scale) + offset.y + (canvasH * (1 - scale) / 2)
                return Offset(sx, sy)
            }

            // 1. Draw subtle airport radar / grid lines
            val gridStep = 60f * scale
            val gridAlpha = (0.06f * scale).coerceIn(0.03f, 0.12f)
            var gx = offset.x % gridStep
            while (gx < canvasW) {
                drawLine(
                    color = themeRadarCyan.copy(alpha = gridAlpha),
                    start = Offset(gx, 0f),
                    end = Offset(gx, canvasH),
                    strokeWidth = 1f
                )
                gx += gridStep
            }
            var gy = offset.y % gridStep
            while (gy < canvasH) {
                drawLine(
                    color = themeRadarCyan.copy(alpha = gridAlpha),
                    start = Offset(0f, gy),
                    end = Offset(canvasW, gy),
                    strokeWidth = 1f
                )
                gy += gridStep
            }

            // 2. Draw Central Marketplace / Security Lobby
            val hubPos = toScreen(currentFloor.centralHubCenter)
            val hubRadius = 75f * scale
            drawCircle(
                color = themeCockpitDark,
                radius = hubRadius,
                center = hubPos
            )
            drawCircle(
                color = themeInstrumentBorder,
                radius = hubRadius,
                center = hubPos,
                style = Stroke(width = 2.5f * scale)
            )

            // Draw Security Checkpoint barrier
            val secPos = toScreen(currentFloor.securityPosition)
            val secWidth = 100f * scale
            drawRoundRect(
                color = Color(0xFF1E2838),
                topLeft = Offset(secPos.x - secWidth / 2, secPos.y - 14f * scale),
                size = Size(secWidth, 28f * scale),
                cornerRadius = CornerRadius(6f * scale, 6f * scale)
            )
            drawRoundRect(
                color = Color(0xFFFF5252).copy(alpha = 0.7f),
                topLeft = Offset(secPos.x - secWidth / 2, secPos.y - 14f * scale),
                size = Size(secWidth, 28f * scale),
                cornerRadius = CornerRadius(6f * scale, 6f * scale),
                style = Stroke(width = 1.8f * scale)
            )

            val secTextLayout = textMeasurer.measure(
                text = AnnotatedString("SECURITY CHECKPOINT"),
                style = TextStyle(
                    color = Color(0xFFFF8A80),
                    fontSize = (9f * scale.coerceIn(0.8f, 1.4f)).sp,
                    fontWeight = FontWeight.Bold
                )
            )
            drawText(
                textLayoutResult = secTextLayout,
                topLeft = Offset(secPos.x - secTextLayout.size.width / 2, secPos.y - secTextLayout.size.height / 2)
            )

            // 3. Draw Concourse Corridors & Piers
            currentFloor.concourses.forEach { concourse ->
                val pStart = toScreen(concourse.start)
                val pEnd = toScreen(concourse.end)
                val strokeW = concourse.width * canvasW * scale

                // Concourse outer outline
                drawLine(
                    color = themeInstrumentBorder,
                    start = pStart,
                    end = pEnd,
                    strokeWidth = strokeW + 4f * scale,
                    cap = StrokeCap.Round
                )
                // Concourse floor corridor body
                drawLine(
                    color = themeCockpitDark,
                    start = pStart,
                    end = pEnd,
                    strokeWidth = strokeW,
                    cap = StrokeCap.Round
                )

                // Concourse Label Text
                val midX = (pStart.x + pEnd.x) / 2
                val midY = (pStart.y + pEnd.y) / 2
                val labelLayout = textMeasurer.measure(
                    text = AnnotatedString(concourse.name),
                    style = TextStyle(
                        color = themeTextMuted.copy(alpha = 0.85f),
                        fontSize = (10f * scale.coerceIn(0.7f, 1.2f)).sp,
                        fontWeight = FontWeight.SemiBold
                    )
                )
                drawText(
                    textLayoutResult = labelLayout,
                    topLeft = Offset(midX - labelLayout.size.width / 2, midY - labelLayout.size.height / 2)
                )
            }

            // 4. Draw Walking Navigation Route if active
            if (showWalkingRoute && selectedAmenity != null) {
                val startPoint = toScreen(currentFloor.securityPosition)
                val midPoint = toScreen(currentFloor.centralHubCenter)
                val targetPoint = toScreen(selectedAmenity.position)

                val routePath = Path().apply {
                    moveTo(startPoint.x, startPoint.y)
                    // Smooth waypoint through central hub then to target
                    cubicTo(
                        (startPoint.x + midPoint.x) / 2, (startPoint.y + midPoint.y) / 2,
                        midPoint.x, midPoint.y,
                        midPoint.x, midPoint.y
                    )
                    cubicTo(
                        midPoint.x, midPoint.y,
                        (midPoint.x + targetPoint.x) / 2, (midPoint.y + targetPoint.y) / 2,
                        targetPoint.x, targetPoint.y
                    )
                }

                // Route halo / shadow
                drawPath(
                    path = routePath,
                    color = themeRadarCyan.copy(alpha = 0.25f),
                    style = Stroke(width = 10f * scale, cap = StrokeCap.Round)
                )

                // Dashed walking route
                drawPath(
                    path = routePath,
                    color = themeRadarCyan,
                    style = Stroke(
                        width = 3.5f * scale,
                        pathEffect = PathEffect.dashPathEffect(
                            floatArrayOf(16f * scale, 12f * scale),
                            routeDashPhase
                        ),
                        cap = StrokeCap.Round
                    )
                )

                // Start location beacon ("You are here / Security")
                drawCircle(
                    color = Color(0xFFFF5252),
                    radius = 8f * scale,
                    center = startPoint
                )
                drawCircle(
                    color = themeTextWhite,
                    radius = 3.5f * scale,
                    center = startPoint
                )
            }

            // 5. Draw Amenity Pins & Gates
            amenities.forEach { amenity ->
                val pos = toScreen(amenity.position)
                val isSelected = amenity.id == selectedAmenity?.id
                val baseRadius = if (isSelected) 18f * scale else 13f * scale

                // Selection halo
                if (isSelected) {
                    drawCircle(
                        color = amenity.category.color.copy(alpha = pulseAlpha * 0.45f),
                        radius = baseRadius * 1.8f,
                        center = pos
                    )
                    drawCircle(
                        color = amenity.category.color.copy(alpha = 0.8f),
                        radius = baseRadius * 1.3f,
                        center = pos,
                        style = Stroke(width = 2.5f * scale)
                    )
                }

                // Pin circle background
                drawCircle(
                    color = if (isSelected) amenity.category.color else themeCockpitDark,
                    radius = baseRadius,
                    center = pos
                )
                drawCircle(
                    color = if (isSelected) themeTextWhite else amenity.category.color,
                    radius = baseRadius,
                    center = pos,
                    style = Stroke(width = if (isSelected) 2.5f * scale else 2.0f * scale)
                )

                // Inner label or gate text
                val pinLabel = when {
                    amenity.gateNumber != null -> amenity.gateNumber
                    amenity.category == AmenityCategory.LOUNGE -> "VIP"
                    amenity.category == AmenityCategory.SECURITY -> "TSA"
                    amenity.category == AmenityCategory.DINING -> "EAT"
                    amenity.category == AmenityCategory.RESTROOM -> "WC"
                    amenity.category == AmenityCategory.SHOPPING -> "DUTY"
                    amenity.category == AmenityCategory.TRANSIT -> "TRAIN"
                    else -> "POI"
                }

                val pinTextLayout = textMeasurer.measure(
                    text = AnnotatedString(pinLabel),
                    style = TextStyle(
                        color = if (isSelected) themeDeepSpace else themeTextWhite,
                        fontSize = ((if (pinLabel.length > 3) 7.5f else 9f) * scale.coerceIn(0.75f, 1.3f)).sp,
                        fontWeight = FontWeight.Bold
                    )
                )
                drawText(
                    textLayoutResult = pinTextLayout,
                    topLeft = Offset(pos.x - pinTextLayout.size.width / 2, pos.y - pinTextLayout.size.height / 2)
                )

                // If selected or gate has flight, show small banner above
                if (isSelected || (amenity.assignedFlightNumber != null && scale > 1.2f)) {
                    val labelContent = if (amenity.assignedFlightNumber != null) {
                        "${amenity.name} · ${amenity.assignedFlightNumber}"
                    } else {
                        amenity.name
                    }
                    val badgeLayout = textMeasurer.measure(
                        text = AnnotatedString(labelContent),
                        style = TextStyle(
                            color = themeTextWhite,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold
                        )
                    )
                    val badgeW = badgeLayout.size.width + 16f
                    val badgeH = badgeLayout.size.height + 8f
                    val badgeX = pos.x - badgeW / 2
                    val badgeY = pos.y - baseRadius - badgeH - 6f

                    drawRoundRect(
                        color = themeCockpitDark.copy(alpha = 0.92f),
                        topLeft = Offset(badgeX, badgeY),
                        size = Size(badgeW, badgeH),
                        cornerRadius = CornerRadius(6f, 6f)
                    )
                    drawRoundRect(
                        color = amenity.category.color,
                        topLeft = Offset(badgeX, badgeY),
                        size = Size(badgeW, badgeH),
                        cornerRadius = CornerRadius(6f, 6f),
                        style = Stroke(width = 1.2f)
                    )
                    drawText(
                        textLayoutResult = badgeLayout,
                        topLeft = Offset(badgeX + 8f, badgeY + 4f)
                    )
                }
            }
        }

        // Map Control Floating HUD
        // Top right: Compass indicator & Level pill
        Column(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(14.dp),
            horizontalAlignment = Alignment.End,
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Surface(
                color = themeCockpitDark.copy(alpha = 0.9f),
                shape = CircleShape,
                border = androidx.compose.foundation.BorderStroke(1.dp, themeInstrumentBorder),
                modifier = Modifier.size(40.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            Icons.Default.Navigation,
                            contentDescription = "North",
                            tint = themeRadarCyan,
                            modifier = Modifier.size(16.dp)
                        )
                        Text("N", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = themeRadarCyan)
                    }
                }
            }

            Surface(
                color = themeCockpitDark.copy(alpha = 0.9f),
                shape = RoundedCornerShape(12.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, themeInstrumentBorder),
                modifier = Modifier.padding(top = 4.dp)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Icon(Icons.Default.Layers, contentDescription = null, tint = themeRadarCyan, modifier = Modifier.size(14.dp))
                    Text(currentFloor.levelName, fontSize = 11.sp, color = themeTextWhite, fontWeight = FontWeight.Medium)
                }
            }
        }

        // Bottom right: Zoom Controls & Recenter
        Column(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(bottom = 20.dp, end = 14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            FilledIconButton(
                onClick = { scale = (scale * 1.3f).coerceAtMost(3.8f) },
                colors = IconButtonDefaults.filledIconButtonColors(containerColor = themeCockpitDark),
                modifier = Modifier
                    .size(44.dp)
                    .border(1.dp, themeInstrumentBorder, CircleShape)
                    .testTag("terminal_zoom_in_btn")
            ) {
                Icon(Icons.Default.Add, contentDescription = "Zoom In", tint = themeRadarCyan)
            }

            FilledIconButton(
                onClick = { scale = (scale / 1.3f).coerceAtLeast(0.6f) },
                colors = IconButtonDefaults.filledIconButtonColors(containerColor = themeCockpitDark),
                modifier = Modifier
                    .size(44.dp)
                    .border(1.dp, themeInstrumentBorder, CircleShape)
                    .testTag("terminal_zoom_out_btn")
            ) {
                Icon(Icons.Default.Remove, contentDescription = "Zoom Out", tint = themeRadarCyan)
            }

            FilledIconButton(
                onClick = {
                    scale = 1.0f
                    offset = Offset.Zero
                },
                colors = IconButtonDefaults.filledIconButtonColors(containerColor = themeCockpitDark),
                modifier = Modifier
                    .size(44.dp)
                    .border(1.dp, themeInstrumentBorder, CircleShape)
                    .testTag("terminal_recenter_btn")
            ) {
                Icon(Icons.Default.MyLocation, contentDescription = "Recenter", tint = themeRadarCyan)
            }
        }

        // Bottom Left: Live Scale Bar & Route Indicator
        Surface(
            color = themeCockpitDark.copy(alpha = 0.88f),
            shape = RoundedCornerShape(10.dp),
            border = androidx.compose.foundation.BorderStroke(1.dp, themeInstrumentBorder),
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(bottom = 20.dp, start = 14.dp)
        ) {
            Column(modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .width(40.dp)
                            .height(3.dp)
                            .background(themeRadarCyan)
                    )
                    Text("100 m / 330 ft", fontSize = 10.sp, color = themeTextMuted, fontWeight = FontWeight.Bold)
                }
                if (showWalkingRoute && selectedAmenity != null) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        modifier = Modifier.padding(top = 2.dp)
                    ) {
                        Icon(
                            Icons.AutoMirrored.Filled.DirectionsWalk,
                            contentDescription = null,
                            tint = themeRadarCyan,
                            modifier = Modifier.size(12.dp)
                        )
                        Text(
                            "Walk route: ~${selectedAmenity.walkTimeFromSecurityMinutes} min",
                            fontSize = 10.sp,
                            color = themeRadarCyan,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }
    }
}
