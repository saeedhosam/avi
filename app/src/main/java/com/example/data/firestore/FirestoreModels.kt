package com.example.data.firestore

import com.google.firebase.Timestamp
import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.ServerTimestamp

data class FirestoreUserProfile(
    @DocumentId
    val id: String = "",
    val userId: String = "",
    val displayName: String = "",
    val email: String = "",
    val homeAirport: String = "JFK",
    val themePreference: String = "SYSTEM",
    val photoUrl: String = "",
    @ServerTimestamp
    val createdAt: Timestamp? = null,
    @ServerTimestamp
    val updatedAt: Timestamp? = null
)

data class FirestoreTrackedFlight(
    @DocumentId
    val id: String = "",
    val userId: String = "",
    val flightNumber: String = "",
    val airline: String = "",
    val originCode: String = "",
    val destCode: String = "",
    val status: String = "SCHEDULED",
    val customNotes: String = "",
    val isFavorite: Boolean = false,
    @ServerTimestamp
    val createdAt: Timestamp? = null,
    @ServerTimestamp
    val updatedAt: Timestamp? = null
)

data class FirestoreAlert(
    @DocumentId
    val id: String = "",
    val userId: String = "",
    val flightNumber: String = "",
    val alertType: String = "DELAY",
    val title: String = "",
    val message: String = "",
    val isRead: Boolean = false,
    @ServerTimestamp
    val createdAt: Timestamp? = null
)
