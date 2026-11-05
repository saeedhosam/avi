package com.example.data.firestore

import android.content.Context
import android.util.Log
import com.example.R
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.SetOptions
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

class FirestoreRepository(
    val firestore: FirebaseFirestore,
    val auth: FirebaseAuth
) {

    fun currentUserId(): String? = auth.currentUser?.uid

    fun requireUserId(): String {
        return auth.currentUser?.uid
            ?: throw IllegalStateException("Authenticated user required for Firestore operation")
    }

    /**
     * Observes the user's profile document in /users/{userId}.
     */
    fun observeUserProfile(userId: String): Flow<FirestoreUserProfile?> = callbackFlow {
        val docRef = firestore.collection("users").document(userId)
        val listener: ListenerRegistration = docRef.addSnapshotListener { snapshot, error ->
            if (error != null) {
                Log.w("FirestoreRepo", "Listen error for user $userId: ${error.message}")
                close(error)
                return@addSnapshotListener
            }
            val profile = snapshot?.toObject(FirestoreUserProfile::class.java)
            trySend(profile)
        }
        awaitClose { listener.remove() }
    }

    suspend fun saveUserProfile(profile: FirestoreUserProfile): Result<Unit> = runCatching {
        val uid = requireUserId()
        val sanitized = profile.copy(userId = uid)
        val data = hashMapOf(
            "userId" to uid,
            "displayName" to sanitized.displayName.ifBlank { "Aviation Navigator" }.take(100),
            "email" to sanitized.email.ifBlank { "pilot@aviation.aero" }.take(150),
            "homeAirport" to sanitized.homeAirport.take(10),
            "themePreference" to sanitized.themePreference,
            "photoUrl" to sanitized.photoUrl,
            "updatedAt" to FieldValue.serverTimestamp()
        )
        if (sanitized.createdAt == null) {
            data["createdAt"] = FieldValue.serverTimestamp()
        }
        firestore.collection("users").document(uid)
            .set(data, SetOptions.merge())
            .await()
    }

    /**
     * Observes the user's tracked flights in /users/{userId}/trackedFlights
     */
    fun observeTrackedFlights(userId: String): Flow<List<FirestoreTrackedFlight>> = callbackFlow {
        val collRef = firestore.collection("users").document(userId).collection("trackedFlights")
        val listener: ListenerRegistration = collRef.addSnapshotListener { snapshot, error ->
            if (error != null) {
                Log.w("FirestoreRepo", "Listen error for trackedFlights: ${error.message}")
                close(error)
                return@addSnapshotListener
            }
            val flights = snapshot?.documents?.mapNotNull { doc ->
                doc.toObject(FirestoreTrackedFlight::class.java)?.copy(id = doc.id)
            } ?: emptyList()
            trySend(flights)
        }
        awaitClose { listener.remove() }
    }

    suspend fun saveTrackedFlight(flight: FirestoreTrackedFlight): Result<String> = runCatching {
        val uid = requireUserId()
        val flightId = flight.id.ifBlank { flight.flightNumber.replace(" ", "").uppercase() }
        val data = hashMapOf(
            "userId" to uid,
            "flightNumber" to flight.flightNumber.take(20),
            "airline" to flight.airline.take(100),
            "originCode" to flight.originCode.take(10),
            "destCode" to flight.destCode.take(10),
            "status" to flight.status.take(30),
            "customNotes" to flight.customNotes.take(500),
            "isFavorite" to flight.isFavorite,
            "updatedAt" to FieldValue.serverTimestamp()
        )
        if (flight.createdAt == null) {
            data["createdAt"] = FieldValue.serverTimestamp()
        }
        firestore.collection("users").document(uid)
            .collection("trackedFlights").document(flightId)
            .set(data, SetOptions.merge())
            .await()
        flightId
    }

    suspend fun deleteTrackedFlight(flightId: String): Result<Unit> = runCatching {
        val uid = requireUserId()
        firestore.collection("users").document(uid)
            .collection("trackedFlights").document(flightId)
            .delete()
            .await()
    }

    /**
     * Observes real-time flight alerts in /users/{userId}/alerts
     */
    fun observeAlerts(userId: String): Flow<List<FirestoreAlert>> = callbackFlow {
        val collRef = firestore.collection("users").document(userId).collection("alerts")
        val listener: ListenerRegistration = collRef.addSnapshotListener { snapshot, error ->
            if (error != null) {
                Log.w("FirestoreRepo", "Listen error for alerts: ${error.message}")
                close(error)
                return@addSnapshotListener
            }
            val alerts = snapshot?.documents?.mapNotNull { doc ->
                doc.toObject(FirestoreAlert::class.java)?.copy(id = doc.id)
            } ?: emptyList()
            trySend(alerts)
        }
        awaitClose { listener.remove() }
    }

    suspend fun saveAlert(alert: FirestoreAlert): Result<String> = runCatching {
        val uid = requireUserId()
        val alertId = alert.id.ifBlank { java.util.UUID.randomUUID().toString() }
        val data = hashMapOf(
            "userId" to uid,
            "flightNumber" to alert.flightNumber.take(20),
            "alertType" to alert.alertType,
            "title" to alert.title.take(200),
            "message" to alert.message.take(1000),
            "isRead" to alert.isRead,
            "createdAt" to FieldValue.serverTimestamp()
        )
        firestore.collection("users").document(uid)
            .collection("alerts").document(alertId)
            .set(data, SetOptions.merge())
            .await()
        alertId
    }

    suspend fun markAlertRead(alertId: String): Result<Unit> = runCatching {
        val uid = requireUserId()
        firestore.collection("users").document(uid)
            .collection("alerts").document(alertId)
            .update("isRead", true)
            .await()
    }

    suspend fun deleteAlert(alertId: String): Result<Unit> = runCatching {
        val uid = requireUserId()
        firestore.collection("users").document(uid)
            .collection("alerts").document(alertId)
            .delete()
            .await()
    }

    companion object {
        @Volatile
        private var instance: FirestoreRepository? = null

        fun getInstance(context: Context): FirestoreRepository {
            return instance ?: synchronized(this) {
                instance ?: run {
                    val dbId = context.getString(R.string.firestore_database_id)
                    val db = FirebaseFirestore.getInstance(dbId)
                    val auth = FirebaseAuth.getInstance()
                    FirestoreRepository(db, auth).also { instance = it }
                }
            }
        }
    }
}
