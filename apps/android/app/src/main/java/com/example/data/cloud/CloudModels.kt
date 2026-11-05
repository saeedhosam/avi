package com.example.data.cloud

data class CloudUserProfile(
    val id: String = "",
    val userId: String = "",
    val displayName: String = "",
    val email: String = "",
    val photoUrl: String = "",
    val homeAirport: String = "JFK",
    val themePreference: String = "SYSTEM"
)

data class CloudTrackedFlight(
    val id: String = "",
    val userId: String = "",
    val flightNumber: String = "",
    val airline: String = "",
    val originCode: String = "",
    val destCode: String = "",
    val status: String = "SCHEDULED",
    val customNotes: String = "",
    val isFavorite: Boolean = false
)

data class CloudAlert(
    val id: String = "",
    val userId: String = "",
    val flightNumber: String = "",
    val alertType: String = "DELAY",
    val title: String = "",
    val message: String = "",
    val isRead: Boolean = false,
    val timestamp: String = ""
)
