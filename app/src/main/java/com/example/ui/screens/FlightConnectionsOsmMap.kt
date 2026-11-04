package com.example.ui.screens

import android.content.Context
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.OpenInFull
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.model.AirportNode
import com.example.model.ConnectionDirection
import com.example.model.DirectFlightConnection
import org.json.JSONArray
import kotlin.math.*

// FlightConnections.com + OpenStreetMap Positron Color Palette
private val OsmOceanBlue = Color(0xFFCBE7F9)
private val OsmLandLight = Color(0xFFF2F3F5)
private val OsmBorderGray = Color(0xFFD3D8E0)
private val OsmCountryLabelGray = Color(0xFF7B8592)

private val FcRouteArcCrimson = Color(0xFFD94A6A)
private val FcRouteSelectedCrimson = Color(0xFFC2185B)
private val FcPinBlue = Color(0xFF0077FF)
private val FcPinDarkNavy = Color(0xFF0A335C)
private val FcPinYellow = Color(0xFFFFB800)
private val FcPinOutline = Color(0xFF141E2B)
private val FcCalloutBlue = Color(0xFF1888F8)

/**
 * Pre-projected Web Mercator country polygon & label metadata loaded from `assets/world_countries.json`
 * (Natural Earth 176 countries). Renders in pure vector graphics at 60 FPS with zero network calls.
 */
private data class MercatorCountryFeature(
    val name: String,
    val labelNormX: Float,
    val labelNormY: Float,
    val bboxAreaDeg: Float,
    val ringsNormXY: List<FloatArray> // Interleaved [normX0, normY0, normX1, normY1, ...]
)

private object WorldVectorMapCache {
    @Volatile
    var countries: List<MercatorCountryFeature>? = null

    fun mercatorNormX(lonDeg: Double): Float = ((lonDeg + 180.0) / 360.0).toFloat()

    fun mercatorNormY(latDeg: Double): Float {
        val clamped = latDeg.coerceIn(-82.0, 82.0)
        val rad = Math.toRadians(clamped)
        return ((1.0 - ln(tan(rad) + 1.0 / cos(rad)) / PI) / 2.0).toFloat()
    }

    fun getOrLoad(context: Context): List<MercatorCountryFeature> {
        countries?.let { return it }
        synchronized(this) {
            countries?.let { return it }
            val loaded = try {
                val jsonText = context.assets.open("world_countries.json")
                    .bufferedReader()
                    .use { it.readText() }
                val root = JSONArray(jsonText)
                val list = ArrayList<MercatorCountryFeature>(root.length())
                for (i in 0 until root.length()) {
                    val obj = root.getJSONObject(i)
                    val name = obj.getString("n")
                    val cLat = obj.getDouble("lat")
                    val cLon = obj.getDouble("lon")
                    val area = obj.getDouble("a").toFloat()
                    val ringsJson = obj.getJSONArray("r")
                    val rings = ArrayList<FloatArray>(ringsJson.length())
                    for (rIdx in 0 until ringsJson.length()) {
                        val ringArr = ringsJson.getJSONArray(rIdx)
                        val count = ringArr.length()
                        val xy = FloatArray(count * 2)
                        for (pIdx in 0 until count) {
                            val pt = ringArr.getJSONArray(pIdx)
                            val lat = pt.getDouble(0)
                            val lon = pt.getDouble(1)
                            xy[pIdx * 2] = mercatorNormX(lon)
                            xy[pIdx * 2 + 1] = mercatorNormY(lat)
                        }
                        rings.add(xy)
                    }
                    list.add(
                        MercatorCountryFeature(
                            name = name,
                            labelNormX = mercatorNormX(cLon),
                            labelNormY = mercatorNormY(cLat),
                            bboxAreaDeg = area,
                            ringsNormXY = rings
                        )
                    )
                }
                // Sort by area descending so major country labels get priority
                list.sortedByDescending { it.bboxAreaDeg }
            } catch (_: Exception) {
                emptyList()
            }
            countries = loaded
            return loaded
        }
    }
}

/**
 * Full-Screen FlightConnections.com + OpenStreetMap Positron Vector World Map Canvas.
 * Default zoom shows the entire globe with all 176 countries, borders, and labels rendered
 * natively in vector graphics (zero external tile requests or blocked tiles),
 * rose-crimson curved geodesic arcs, blue/navy/yellow destination dots,
 * and floating blue "City (IATA) ×" callout tags when an airport is selected.
 */
@Composable
fun FlightConnectionsOsmMapCanvas(
    originAirport: AirportNode?,
    connections: List<DirectFlightConnection>,
    selectedConnection: DirectFlightConnection?,
    direction: ConnectionDirection,
    onSelectDestination: (String) -> Unit,
    onClearOriginHub: () -> Unit = {},
    onClearSelectedDestination: () -> Unit = {},
    onTapEmptyMap: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val countryFeatures = remember(context) { WorldVectorMapCache.getOrLoad(context) }

    // Default zoom is zoomed out to see the whole globe
    var zoomScale by remember { mutableFloatStateOf(1.0f) }
    var panOffsetX by remember { mutableFloatStateOf(0f) }
    var panOffsetY by remember { mutableFloatStateOf(0f) }
    var showLegendCard by remember { mutableStateOf(true) }

    val textMeasurer = rememberTextMeasurer()

    // Remember projected screen coordinates of each airport pin for tap hit-testing
    val pinPositions = remember { mutableStateMapOf<String, Offset>() }
    // Remember callout close button hit boxes on canvas
    var originCalloutCloseRect by remember { mutableStateOf<Rect?>(null) }
    var destCalloutCloseRect by remember { mutableStateOf<Rect?>(null) }

    Box(
        modifier = modifier
            .background(OsmOceanBlue)
            .testTag("connections_map_canvas")
    ) {
        Canvas(
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(Unit) {
                    detectTransformGestures { _, pan, zoom, _ ->
                        val newZoom = (zoomScale * zoom).coerceIn(0.85f, 6.0f)
                        zoomScale = newZoom
                        val maxPanX = size.width * newZoom * 0.85f
                        val maxPanY = size.height * newZoom * 0.48f
                        panOffsetX = (panOffsetX + pan.x).coerceIn(-maxPanX, maxPanX)
                        panOffsetY = (panOffsetY + pan.y).coerceIn(-maxPanY, maxPanY)
                    }
                }
                .pointerInput(connections, originAirport, selectedConnection) {
                    detectTapGestures { tapOffset ->
                        // 1. Check if user tapped the '×' on the Origin or Destination blue callout tag
                        val origRect = originCalloutCloseRect
                        if (origRect != null && origRect.inflate(10.dp.toPx()).contains(tapOffset)) {
                            onClearOriginHub()
                            return@detectTapGestures
                        }
                        val dstRect = destCalloutCloseRect
                        if (dstRect != null && dstRect.inflate(10.dp.toPx()).contains(tapOffset)) {
                            onClearSelectedDestination()
                            return@detectTapGestures
                        }

                        // 2. Find closest airport dot within 38dp touch radius
                        val hitRadiusPx = 38.dp.toPx()
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

            // True Square Web Mercator World Size:
            // At zoomScale = 1.0f, the full 360° globe fits across the viewport width,
            // with horizontal wrapping (-1..1) so there is never an edge seam.
            val worldSize = maxOf(w * 1.02f, h * 0.56f) * zoomScale

            // Center slightly east (10° E, 22° N) so Americas, Europe, Africa, Asia, and Australia all fit
            val centerNormX = WorldVectorMapCache.mercatorNormX(10.0)
            val centerNormY = WorldVectorMapCache.mercatorNormY(22.0)

            val baseTopY = (h * 0.48f) - (centerNormY * worldSize) + panOffsetY

            fun projectLatLon(lat: Double, lon: Double): Offset {
                val normX = WorldVectorMapCache.mercatorNormX(lon)
                val normY = WorldVectorMapCache.mercatorNormY(lat)
                val x = (w * 0.5f) + ((normX - centerNormX) * worldSize) + panOffsetX
                val y = baseTopY + (normY * worldSize)
                return Offset(x, y)
            }

            clipRect(0f, 0f, w, h) {
                // 1. Ocean Base Fill (#CBE7F9)
                drawRect(color = OsmOceanBlue, size = Size(w, h))

                // 2. Draw all 176 Real Country Polygons & Borders (with horizontal world wrapping -1..1)
                val path = Path()
                val borderStroke = Stroke(width = 0.85.dp.toPx(), join = StrokeJoin.Round)

                for (wrap in -1..1) {
                    val baseLeftX = (w * 0.5f) + ((wrap - centerNormX) * worldSize) + panOffsetX
                    if (baseLeftX + worldSize < -50f || baseLeftX > w + 50f) continue

                    for (country in countryFeatures) {
                        for (ring in country.ringsNormXY) {
                            if (ring.size < 6) continue
                            path.reset()
                            val x0 = baseLeftX + ring[0] * worldSize
                            val y0 = baseTopY + ring[1] * worldSize
                            path.moveTo(x0, y0)
                            var idx = 2
                            while (idx < ring.size) {
                                path.lineTo(
                                    baseLeftX + ring[idx] * worldSize,
                                    baseTopY + ring[idx + 1] * worldSize
                                )
                                idx += 2
                            }
                            path.close()
                            drawPath(path = path, color = OsmLandLight)
                            drawPath(path = path, color = OsmBorderGray, style = borderStroke)
                        }
                    }
                }

                // 3. Draw Collision-Free Country Labels (OpenStreetMap Positron Typography)
                val placedLabelRects = ArrayList<Rect>(64)
                val minAreaForZoom = when {
                    zoomScale >= 3.0f -> 0.5f
                    zoomScale >= 2.0f -> 4.0f
                    zoomScale >= 1.35f -> 14.0f
                    else -> 32.0f
                }
                val labelFontSize = if (zoomScale >= 1.8f) 9.5.sp else 8.sp

                for (country in countryFeatures) {
                    if (country.bboxAreaDeg < minAreaForZoom) continue
                    val lx = (w * 0.5f) + ((country.labelNormX - centerNormX) * worldSize) + panOffsetX
                    val ly = baseTopY + (country.labelNormY * worldSize)
                    if (lx < 20f || lx > w - 20f || ly < 60f || ly > h - 60f) continue

                    val measured = textMeasurer.measure(
                        text = country.name,
                        style = TextStyle(
                            color = OsmCountryLabelGray,
                            fontSize = labelFontSize,
                            fontWeight = FontWeight.Medium,
                            fontFamily = FontFamily.SansSerif,
                            textAlign = TextAlign.Center
                        )
                    )
                    val tw = measured.size.width.toFloat()
                    val th = measured.size.height.toFloat()
                    val candidateRect = Rect(
                        left = lx - tw / 2f - 6f,
                        top = ly - th / 2f - 3f,
                        right = lx + tw / 2f + 6f,
                        bottom = ly + th / 2f + 3f
                    )
                    if (placedLabelRects.none { it.overlaps(candidateRect) }) {
                        placedLabelRects.add(candidateRect)
                        drawText(
                            textLayoutResult = measured,
                            topLeft = Offset(lx - tw / 2f, ly - th / 2f)
                        )
                    }
                }

                pinPositions.clear()
                originCalloutCloseRect = null
                destCalloutCloseRect = null

                // 4. Draw Curved Geodesic Flight Route Arcs (FlightConnections Crimson-Rose Style)
                connections.forEach { conn ->
                    val startOffset = projectLatLon(conn.origin.latitude, conn.origin.longitude)
                    val destOffset = projectLatLon(conn.destination.latitude, conn.destination.longitude)
                    pinPositions[conn.destination.iata] = destOffset
                    pinPositions[conn.origin.iata] = startOffset

                    val isSelected = (selectedConnection?.id == conn.id) ||
                        (selectedConnection?.origin?.iata == conn.origin.iata &&
                            selectedConnection.destination.iata == conn.destination.iata)

                    // Great-circle poleward curvature matching FlightConnections.com Mercator arcs
                    val midX = (startOffset.x + destOffset.x) / 2f
                    val midY = (startOffset.y + destOffset.y) / 2f
                    val dx = destOffset.x - startOffset.x
                    val dy = destOffset.y - startOffset.y
                    val chordDist = hypot(dx, dy)
                    val avgLat = (conn.origin.latitude + conn.destination.latitude) / 2.0
                    val poleDirection = if (avgLat >= -5.0) -1f else 1f
                    val arcLift = (chordDist * 0.20f).coerceIn(8f, 110f) * poleDirection
                    val controlPoint = Offset(midX, midY + arcLift)

                    val routePath = Path().apply {
                        moveTo(startOffset.x, startOffset.y)
                        quadraticTo(controlPoint.x, controlPoint.y, destOffset.x, destOffset.y)
                    }

                    if (isSelected) {
                        drawPath(
                            path = routePath,
                            color = FcCalloutBlue.copy(alpha = 0.25f),
                            style = Stroke(width = 5.dp.toPx(), cap = StrokeCap.Round)
                        )
                        drawPath(
                            path = routePath,
                            color = FcRouteSelectedCrimson,
                            style = Stroke(width = 2.2.dp.toPx(), cap = StrokeCap.Round)
                        )
                    } else {
                        drawPath(
                            path = routePath,
                            color = FcRouteArcCrimson.copy(alpha = 0.56f),
                            style = Stroke(width = 1.15.dp.toPx(), cap = StrokeCap.Round)
                        )
                    }
                }

                // 5. Draw Airport Dots (Blue / Dark Navy / Yellow with dark 1dp border)
                val airportFreqMap = mutableMapOf<String, Int>()
                val airportNodeMap = mutableMapOf<String, AirportNode>()
                connections.forEach { conn ->
                    airportNodeMap[conn.origin.iata] = conn.origin
                    airportNodeMap[conn.destination.iata] = conn.destination
                    airportFreqMap[conn.destination.iata] = maxOf(
                        airportFreqMap[conn.destination.iata] ?: 0,
                        conn.dailyFlightsCount
                    )
                    airportFreqMap[conn.origin.iata] = maxOf(
                        airportFreqMap[conn.origin.iata] ?: 0,
                        conn.dailyFlightsCount
                    )
                }

                airportNodeMap.values.forEach { airport ->
                    val pos = pinPositions[airport.iata] ?: return@forEach
                    val isOriginHub = originAirport?.iata == airport.iata
                    val isSelectedDest = selectedConnection?.destination?.iata == airport.iata

                    if (isOriginHub) {
                        return@forEach // Drawn on top with bullseye + blue callout tag
                    }

                    val dailyFreq = airportFreqMap[airport.iata] ?: 2
                    val fillColor = when {
                        isSelectedDest -> FcCalloutBlue
                        dailyFreq >= 4 -> FcPinBlue
                        dailyFreq >= 2 -> FcPinDarkNavy
                        else -> FcPinYellow
                    }

                    val dotRadius = if (isSelectedDest) 5.5.dp.toPx() else 4.2.dp.toPx()

                    if (isSelectedDest) {
                        drawCircle(
                            color = Color.White,
                            radius = dotRadius + 2.5.dp.toPx(),
                            center = pos
                        )
                        drawCircle(
                            color = FcCalloutBlue,
                            radius = dotRadius + 2.5.dp.toPx(),
                            center = pos,
                            style = Stroke(width = 1.8.dp.toPx())
                        )
                    }

                    drawCircle(
                        color = fillColor,
                        radius = dotRadius,
                        center = pos
                    )
                    drawCircle(
                        color = FcPinOutline,
                        radius = dotRadius,
                        center = pos,
                        style = Stroke(width = 1.1.dp.toPx())
                    )
                }

                // 6. Draw Origin Hub Bullseye + Floating Blue Callout Tag ("City (IATA)  ×")
                if (originAirport != null) {
                    val originPos = projectLatLon(originAirport.latitude, originAirport.longitude)
                    pinPositions[originAirport.iata] = originPos

                    drawCircle(
                        color = Color.White,
                        radius = 8.5.dp.toPx(),
                        center = originPos
                    )
                    drawCircle(
                        color = FcCalloutBlue,
                        radius = 8.5.dp.toPx(),
                        center = originPos,
                        style = Stroke(width = 2.dp.toPx())
                    )
                    drawCircle(
                        color = FcCalloutBlue,
                        radius = 4.dp.toPx(),
                        center = originPos
                    )

                    originCalloutCloseRect = drawFlightConnectionsBlueCallout(
                        anchor = originPos,
                        label = "${originAirport.city} (${originAirport.iata})",
                        textMeasurer = textMeasurer,
                        canvasWidth = w
                    )
                } else if (selectedConnection != null) {
                    val destAirport = selectedConnection.destination
                    val destPos = pinPositions[destAirport.iata]
                    if (destPos != null) {
                        destCalloutCloseRect = drawFlightConnectionsBlueCallout(
                            anchor = destPos,
                            label = "${destAirport.city} (${destAirport.iata})",
                            textMeasurer = textMeasurer,
                            canvasWidth = w
                        )
                    }
                }
            }
        }

        // Right-side Clean White Map Zoom & Full-Globe Controls (FlightConnections style)
        Column(
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .padding(end = 10.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            OsmMapControlButton(
                icon = Icons.Default.Add,
                contentDescription = "Zoom In Connections Map",
                tag = "connections_zoom_in_btn",
                onClick = { zoomScale = (zoomScale * 1.35f).coerceAtMost(6.0f) }
            )
            OsmMapControlButton(
                icon = Icons.Default.Remove,
                contentDescription = "Zoom Out Connections Map",
                tag = "connections_zoom_out_btn",
                onClick = {
                    zoomScale = (zoomScale / 1.35f).coerceAtLeast(0.85f)
                    if (zoomScale <= 1.05f) {
                        panOffsetX = 0f
                        panOffsetY = 0f
                    }
                }
            )
            OsmMapControlButton(
                icon = Icons.Default.OpenInFull,
                contentDescription = "Reset to Whole Globe View",
                tag = "connections_recenter_btn",
                onClick = {
                    zoomScale = 1.0f
                    panOffsetX = 0f
                    panOffsetY = 0f
                }
            )
        }

        // Bottom-Left FlightConnections White Legend Card (Dismissible with ×)
        if (showLegendCard) {
            Surface(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(start = 10.dp, bottom = 78.dp)
                    .shadow(4.dp, RoundedCornerShape(8.dp)),
                shape = RoundedCornerShape(8.dp),
                color = Color.White.copy(alpha = 0.95f),
                border = BorderStroke(0.8.dp, Color(0xFFD5DCE4))
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text(
                            text = "Route Legend",
                            color = Color(0xFF2C3E50),
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = "Close Legend",
                            tint = Color(0xFF7F8C8D),
                            modifier = Modifier
                                .size(13.dp)
                                .clickable { showLegendCard = false }
                        )
                    }
                    FcLegendRow(color = FcPinBlue, label = "Popular direct (4+ daily)")
                    FcLegendRow(color = FcPinDarkNavy, label = "Regular direct (2-3 daily)")
                    FcLegendRow(color = FcPinYellow, label = "1x daily / seasonal")
                }
            }
        }
    }
}

/**
 * Draws the signature FlightConnections floating blue callout tag: `[ City (IATA) | × ]`
 * Returns the [Rect] of the `×` close button for tap hit-testing.
 */
private fun DrawScope.drawFlightConnectionsBlueCallout(
    anchor: Offset,
    label: String,
    textMeasurer: androidx.compose.ui.text.TextMeasurer,
    canvasWidth: Float
): Rect {
    val labelMeasured = textMeasurer.measure(
        text = label,
        style = TextStyle(
            color = Color.White,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold
        )
    )
    val closeMeasured = textMeasurer.measure(
        text = "×",
        style = TextStyle(
            color = Color.White.copy(alpha = 0.92f),
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold
        )
    )

    val padH = 8.dp.toPx()
    val padV = 5.dp.toPx()
    val closeZoneW = 22.dp.toPx()
    val boxW = labelMeasured.size.width + padH * 2 + closeZoneW
    val boxH = maxOf(labelMeasured.size.height, closeMeasured.size.height) + padV * 2

    val placeLeft = (anchor.x + 11.dp.toPx() + boxW) > (canvasWidth - 12.dp.toPx())
    val boxX = if (placeLeft) {
        anchor.x - 11.dp.toPx() - boxW
    } else {
        anchor.x + 11.dp.toPx()
    }
    val boxY = anchor.y - boxH / 2f

    drawRoundRect(
        color = Color.Black.copy(alpha = 0.18f),
        topLeft = Offset(boxX + 1.dp.toPx(), boxY + 2.dp.toPx()),
        size = Size(boxW, boxH),
        cornerRadius = CornerRadius(4.dp.toPx(), 4.dp.toPx())
    )

    drawRoundRect(
        color = FcCalloutBlue,
        topLeft = Offset(boxX, boxY),
        size = Size(boxW, boxH),
        cornerRadius = CornerRadius(4.dp.toPx(), 4.dp.toPx())
    )

    val divX = boxX + boxW - closeZoneW
    drawLine(
        color = Color.White.copy(alpha = 0.28f),
        start = Offset(divX, boxY + 3.dp.toPx()),
        end = Offset(divX, boxY + boxH - 3.dp.toPx()),
        strokeWidth = 1.dp.toPx()
    )

    drawText(
        textLayoutResult = labelMeasured,
        topLeft = Offset(
            x = boxX + padH,
            y = boxY + (boxH - labelMeasured.size.height) / 2f
        )
    )

    drawText(
        textLayoutResult = closeMeasured,
        topLeft = Offset(
            x = divX + (closeZoneW - closeMeasured.size.width) / 2f,
            y = boxY + (boxH - closeMeasured.size.height) / 2f
        )
    )

    return Rect(
        left = divX,
        top = boxY,
        right = boxX + boxW,
        bottom = boxY + boxH
    )
}

@Composable
private fun FcLegendRow(color: Color, label: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(color)
                .border(1.dp, FcPinOutline, CircleShape)
        )
        Text(
            text = label,
            color = Color(0xFF34495E),
            fontSize = 9.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
            softWrap = false
        )
    }
}

@Composable
private fun OsmMapControlButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    contentDescription: String,
    tag: String,
    onClick: () -> Unit
) {
    Surface(
        modifier = Modifier
            .size(34.dp)
            .shadow(3.dp, RoundedCornerShape(6.dp))
            .clip(RoundedCornerShape(6.dp))
            .clickable { onClick() }
            .testTag(tag),
        color = Color.White.copy(alpha = 0.96f),
        border = BorderStroke(0.8.dp, Color(0xFFCFD8DC))
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(
                imageVector = icon,
                contentDescription = contentDescription,
                tint = Color(0xFF37474F),
                modifier = Modifier.size(18.dp)
            )
        }
    }
}
