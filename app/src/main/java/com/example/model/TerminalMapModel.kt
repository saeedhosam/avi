package com.example.model

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.DirectionsWalk
import androidx.compose.material.icons.filled.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector

enum class AmenityCategory(
    val displayName: String,
    val icon: ImageVector,
    val color: Color,
    val tag: String
) {
    ALL("All", Icons.Default.AllInclusive, Color(0xFF00E5FF), "filter_all"),
    GATE("Gates", Icons.Default.MeetingRoom, Color(0xFF00E5FF), "filter_gate"),
    LOUNGE("Lounges", Icons.Default.Weekend, Color(0xFFFFB300), "filter_lounge"),
    SECURITY("Security", Icons.Default.Shield, Color(0xFFFF5252), "filter_security"),
    DINING("Dining & Coffee", Icons.Default.Restaurant, Color(0xFFFF7043), "filter_dining"),
    SHOPPING("Duty Free & Shops", Icons.Default.ShoppingBag, Color(0xFFAB47BC), "filter_shopping"),
    RESTROOM("Restrooms", Icons.Default.Wc, Color(0xFF42A5F5), "filter_restroom"),
    TRANSIT("Transit & Baggage", Icons.Default.Luggage, Color(0xFF26A69A), "filter_transit")
}

data class PointF(val x: Float, val y: Float)

data class TerminalAmenity(
    val id: String,
    val name: String,
    val category: AmenityCategory,
    val airportCode: String,
    val terminal: String,
    val concourse: String,
    val level: Int, // 0 = Arrivals/Baggage, 1 = Departures/Gates, 2 = Mezzanine/Lounges
    val locationDescription: String,
    val position: PointF, // Normalized coordinate (0.0 to 1.0)
    val gateNumber: String? = null,
    val openingHours: String = "24 Hours",
    val accessInfo: String? = null, // e.g. "Amex Platinum, Centurion, Delta Reserve"
    val waitTimeMinutes: Int? = null, // e.g. for security checkpoints
    val walkTimeFromSecurityMinutes: Int = 3,
    val walkDistanceMeters: Int = 200,
    val rating: Float? = null,
    val assignedFlightNumber: String? = null,
    val features: List<String> = emptyList()
)

data class ConcourseSection(
    val id: String,
    val name: String,
    val start: PointF,
    val end: PointF,
    val width: Float = 0.06f,
    val gatesRange: String = ""
)

data class ConcourseFloor(
    val level: Int,
    val levelName: String,
    val description: String,
    val concourses: List<ConcourseSection>,
    val centralHubCenter: PointF = PointF(0.5f, 0.5f),
    val securityPosition: PointF = PointF(0.5f, 0.72f),
    val entrancePosition: PointF = PointF(0.5f, 0.88f)
)

data class AirportTerminalLayout(
    val airportCode: String,
    val airportName: String,
    val city: String,
    val terminalId: String,
    val terminalName: String,
    val availableLevels: List<Int>,
    val floors: Map<Int, ConcourseFloor>,
    val amenities: List<TerminalAmenity>
)
