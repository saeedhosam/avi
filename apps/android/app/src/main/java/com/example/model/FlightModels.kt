package com.example.model

import androidx.compose.ui.graphics.Color
import com.example.ui.theme.StatusBoarding
import com.example.ui.theme.StatusCancelled
import com.example.ui.theme.StatusDelayed
import com.example.ui.theme.StatusDeparted
import com.example.ui.theme.StatusLanded
import com.example.ui.theme.StatusScheduled

enum class FlightStatus(val label: String, val color: Color) {
    SCHEDULED("Scheduled", StatusScheduled),
    BOARDING("Boarding", StatusBoarding),
    DEPARTED("En Route", StatusDeparted),
    DELAYED("Delayed", StatusDelayed),
    LANDED("Landed", StatusLanded),
    CANCELLED("Cancelled", StatusCancelled)
}

data class AirportWeather(
    val tempC: Int,
    val tempF: Int,
    val condition: String,
    val wind: String,
    val visibility: String,
    val humidity: Int
)

data class Airport(
    val code: String,
    val name: String,
    val city: String,
    val country: String,
    val timezone: String,
    val latitude: Double,
    val longitude: Double,
    val weather: AirportWeather
)

data class AircraftInfo(
    val model: String,
    val registration: String,
    val age: String,
    val wifiAvailable: Boolean = true,
    val powerOutlets: Boolean = true,
    val seatLayout: String = "3-Class (Business, Premium, Economy)"
)

data class Waypoint(
    val name: String,
    val latitude: Double,
    val longitude: Double,
    val altitudeFeet: Int
)

data class FlightTelemetry(
    val currentLatitude: Double,
    val currentLongitude: Double,
    val altitudeFeet: Int,
    val groundSpeedKnots: Int,
    val headingDegrees: Float,
    val verticalSpeedFpm: Int,
    val mach: Double,
    val progressPercent: Float, // 0.0f to 1.0f
    val distanceCoveredNm: Int,
    val distanceRemainingNm: Int,
    val etaMinutesRemaining: Int,
    val waypoints: List<Waypoint>
)

data class FlightTimelineEvent(
    val title: String,
    val time: String,
    val isCompleted: Boolean,
    val isCurrent: Boolean,
    val description: String
)

data class Flight(
    val id: String, // e.g. "AA100"
    val flightNumber: String, // e.g. "AA 100"
    val airline: String, // e.g. "American Airlines"
    val airlineCode: String, // e.g. "AA"
    val flightDate: String? = null, // ISO YYYY-MM-DD operating date (departure-airport local)
    val origin: Airport,
    val destination: Airport,
    val departureTimeScheduled: String,
    val departureTimeEstimated: String,
    val departureTimeActual: String? = null,
    val arrivalTimeScheduled: String,
    val arrivalTimeEstimated: String,
    val arrivalTimeActual: String? = null,
    val status: FlightStatus,
    val statusNote: String = "",
    val delayMinutes: Int = 0,
    val delayReason: String? = null,
    val terminalDeparture: String,
    val gateDeparture: String,
    val checkInCounter: String,
    val terminalArrival: String,
    val gateArrival: String,
    val baggageCarousel: String,
    val aircraft: AircraftInfo,
    val telemetry: FlightTelemetry,
    val timeline: List<FlightTimelineEvent>,
    val isFavorite: Boolean = false,
    val isTracked: Boolean = false,
    val customNotes: String = ""
)

enum class AlertType {
    GATE_CHANGE,
    DELAY,
    BOARDING,
    CANCELLATION,
    BAGGAGE
}

data class FlightAlert(
    val id: String,
    val flightNumber: String,
    val type: AlertType,
    val title: String,
    val message: String,
    val timestamp: String,
    val isRead: Boolean = false
)

data class UserAccount(
    val name: String = "Captain Alex Mercer",
    val email: String = "alex.mercer@aviation.aero",
    val avatarInitial: String = "A",
    val isSignedIn: Boolean = true,
    val isOfflineMode: Boolean = false,
    val lastSyncTime: String = "Just now"
)
