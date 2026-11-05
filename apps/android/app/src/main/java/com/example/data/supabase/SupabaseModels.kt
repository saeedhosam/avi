package com.example.data.supabase

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class ProfileRow(
    @SerialName("id") val id: String,
    @SerialName("display_name") val displayName: String = "",
    @SerialName("email") val email: String = "",
    @SerialName("photo_url") val photoUrl: String? = null,
    @SerialName("home_airport") val homeAirport: String? = null,
    @SerialName("theme_preference") val themePreference: String = "SYSTEM"
)

@Serializable
data class ProfileUpsert(
    @SerialName("id") val id: String,
    @SerialName("display_name") val displayName: String,
    @SerialName("email") val email: String,
    @SerialName("photo_url") val photoUrl: String? = null,
    @SerialName("home_airport") val homeAirport: String? = null,
    @SerialName("theme_preference") val themePreference: String = "SYSTEM"
)

@Serializable
data class TrackedFlightRow(
    @SerialName("user_id") val userId: String,
    @SerialName("flight_id") val flightId: String,
    @SerialName("flight_number") val flightNumber: String,
    @SerialName("airline") val airline: String = "",
    @SerialName("origin_code") val originCode: String = "",
    @SerialName("dest_code") val destCode: String = "",
    @SerialName("status") val status: String = "",
    @SerialName("custom_notes") val customNotes: String = "",
    @SerialName("is_favorite") val isFavorite: Boolean = false,
    @SerialName("snapshot") val snapshot: JsonObject? = null
)

@Serializable
data class TrackedFlightUpsert(
    @SerialName("user_id") val userId: String,
    @SerialName("flight_id") val flightId: String,
    @SerialName("flight_number") val flightNumber: String,
    @SerialName("airline") val airline: String,
    @SerialName("origin_code") val originCode: String,
    @SerialName("dest_code") val destCode: String,
    @SerialName("status") val status: String,
    @SerialName("custom_notes") val customNotes: String = "",
    @SerialName("is_favorite") val isFavorite: Boolean = false,
    @SerialName("snapshot") val snapshot: JsonObject? = null
)

@Serializable
data class AlertRow(
    @SerialName("id") val id: String,
    @SerialName("user_id") val userId: String,
    @SerialName("flight_number") val flightNumber: String,
    @SerialName("alert_type") val alertType: String,
    @SerialName("title") val title: String,
    @SerialName("message") val message: String,
    @SerialName("is_read") val isRead: Boolean = false,
    @SerialName("created_at") val createdAt: String? = null
)

@Serializable
data class AlertUpsert(
    @SerialName("id") val id: String,
    @SerialName("user_id") val userId: String,
    @SerialName("flight_number") val flightNumber: String,
    @SerialName("alert_type") val alertType: String,
    @SerialName("title") val title: String,
    @SerialName("message") val message: String,
    @SerialName("is_read") val isRead: Boolean = false
)

@Serializable
data class CloudAirportSnapshot(
    val code: String,
    val name: String,
    val city: String,
    val country: String = "",
    val timezone: String = "UTC",
    val latitude: Double,
    val longitude: Double,
    val weather: CloudAirportWeatherSnapshot = CloudAirportWeatherSnapshot()
)

@Serializable
data class CloudAirportWeatherSnapshot(
    val tempC: Int = 0,
    val tempF: Int = 0,
    val condition: String = "",
    val wind: String = "",
    val visibility: String = "",
    val humidity: Int = 0
)

@Serializable
data class CloudAircraftSnapshot(
    val model: String = "",
    val registration: String = "",
    val age: String = "",
    val wifiAvailable: Boolean = false,
    val powerOutlets: Boolean = false,
    val seatLayout: String = ""
)

@Serializable
data class CloudTelemetrySnapshot(
    val hasLiveLocation: Boolean = false,
    val currentLatitude: Double = 0.0,
    val currentLongitude: Double = 0.0,
    val altitudeFeet: Int = 0,
    val groundSpeedKnots: Int = 0,
    val headingDegrees: Float = 0f,
    val verticalSpeedFpm: Int = 0,
    val mach: Double = 0.0,
    val progressPercent: Float = 0f,
    val distanceCoveredNm: Int = 0,
    val distanceRemainingNm: Int = 0,
    val etaMinutesRemaining: Int = 0
)

@Serializable
data class CloudTimelineSnapshot(
    val title: String = "",
    val time: String = "",
    val isCompleted: Boolean = false,
    val isCurrent: Boolean = false,
    val description: String = ""
)

@Serializable
data class CloudFlightSnapshot(
    val id: String,
    val flightNumber: String,
    val airline: String = "",
    val airlineCode: String = "",
    val origin: CloudAirportSnapshot,
    val destination: CloudAirportSnapshot,
    val departureTimeScheduled: String = "",
    val departureTimeEstimated: String = "",
    val departureTimeActual: String? = null,
    val arrivalTimeScheduled: String = "",
    val arrivalTimeEstimated: String = "",
    val arrivalTimeActual: String? = null,
    val status: String = "SCHEDULED",
    val statusNote: String = "",
    val delayMinutes: Int = 0,
    val delayReason: String? = null,
    val terminalDeparture: String = "",
    val gateDeparture: String = "",
    val checkInCounter: String = "",
    val terminalArrival: String = "",
    val gateArrival: String = "",
    val baggageCarousel: String = "",
    val aircraft: CloudAircraftSnapshot = CloudAircraftSnapshot(),
    val telemetry: CloudTelemetrySnapshot = CloudTelemetrySnapshot(),
    val timeline: List<CloudTimelineSnapshot> = emptyList(),
    val isFavorite: Boolean = false,
    val isTracked: Boolean = true,
    val customNotes: String = ""
)
