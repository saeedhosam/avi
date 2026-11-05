package com.example.data.supabase

import com.example.data.cloud.CloudAlert
import com.example.data.cloud.CloudTrackedFlight
import com.example.data.cloud.CloudUserProfile
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.user.UserInfo
import io.github.jan.supabase.postgrest.from
import kotlinx.serialization.json.JsonObject
import java.util.UUID

class SupabaseUserRepository {

    val isAvailable: Boolean
        get() = SupabaseClientProvider.isReady

    fun currentUser(): UserInfo? {
        if (!isAvailable) return null
        return SupabaseClientProvider.auth.currentUserOrNull()
    }

    fun currentUserId(): String? = currentUser()?.id

    private fun requireUserId(): String =
        currentUserId() ?: throw IllegalStateException("Authenticated user required for Supabase operation")

    suspend fun saveUserProfile(profile: CloudUserProfile): Result<Unit> = runCatching {
        val uid = requireUserId()
        SupabaseClientProvider.client.from("profiles").upsert(
            ProfileUpsert(
                id = uid,
                displayName = profile.displayName.ifBlank { "Aviation Navigator" }.take(100),
                email = profile.email.ifBlank { "pilot@aviation.aero" }.take(150),
                photoUrl = profile.photoUrl.takeIf { it.isNotBlank() },
                homeAirport = profile.homeAirport.takeIf { it.isNotBlank() }?.take(10),
                themePreference = profile.themePreference.takeIf {
                    it in setOf("SYSTEM", "LIGHT", "DARK")
                } ?: "SYSTEM"
            )
        ) {
            onConflict = "id"
        }
        Unit
    }

    suspend fun saveTrackedFlight(
        flight: CloudTrackedFlight,
        snapshot: JsonObject? = null
    ): Result<String> = runCatching {
        val uid = requireUserId()
        val flightId = flight.id.ifBlank {
            flight.flightNumber.replace(" ", "").uppercase()
        }
        SupabaseClientProvider.client.from("tracked_flights").upsert(
            TrackedFlightUpsert(
                userId = uid,
                flightId = flightId,
                flightNumber = flight.flightNumber.take(20),
                airline = flight.airline.take(100),
                originCode = flight.originCode.take(10),
                destCode = flight.destCode.take(10),
                status = flight.status.take(30),
                customNotes = flight.customNotes.take(500),
                isFavorite = flight.isFavorite,
                snapshot = snapshot
            )
        ) {
            onConflict = "user_id,flight_id"
        }
        flightId
    }

    suspend fun deleteTrackedFlight(flightId: String): Result<Unit> = runCatching {
        val uid = requireUserId()
        SupabaseClientProvider.client.from("tracked_flights").delete {
            filter {
                eq("user_id", uid)
                eq("flight_id", flightId)
            }
        }
        Unit
    }

    suspend fun fetchTrackedFlights(): Result<List<TrackedFlightRow>> = runCatching {
        val uid = requireUserId()
        SupabaseClientProvider.client.from("tracked_flights")
            .select {
                filter { eq("user_id", uid) }
            }
            .decodeList<TrackedFlightRow>()
    }

    suspend fun saveAlert(alert: CloudAlert): Result<String> = runCatching {
        val uid = requireUserId()
        val alertId = alert.id.ifBlank { UUID.randomUUID().toString() }
        SupabaseClientProvider.client.from("flight_alerts").upsert(
            AlertUpsert(
                id = alertId,
                userId = uid,
                flightNumber = alert.flightNumber.take(20),
                alertType = alert.alertType,
                title = alert.title.take(200),
                message = alert.message.take(1000),
                isRead = alert.isRead
            )
        ) {
            onConflict = "id"
        }
        alertId
    }

    suspend fun markAlertRead(alertId: String): Result<Unit> = runCatching {
        val uid = requireUserId()
        SupabaseClientProvider.client.from("flight_alerts").update(
            {
                set("is_read", true)
            }
        ) {
            filter {
                eq("user_id", uid)
                eq("id", alertId)
            }
        }
        Unit
    }

    suspend fun deleteAlert(alertId: String): Result<Unit> = runCatching {
        val uid = requireUserId()
        SupabaseClientProvider.client.from("flight_alerts").delete {
            filter {
                eq("user_id", uid)
                eq("id", alertId)
            }
        }
        Unit
    }

    suspend fun fetchAlerts(): Result<List<CloudAlert>> = runCatching {
        val uid = requireUserId()
        SupabaseClientProvider.client.from("flight_alerts")
            .select {
                filter { eq("user_id", uid) }
            }
            .decodeList<AlertRow>()
            .map { row ->
                CloudAlert(
                    id = row.id,
                    flightNumber = row.flightNumber,
                    alertType = row.alertType,
                    title = row.title,
                    message = row.message,
                    isRead = row.isRead,
                    timestamp = row.createdAt ?: ""
                )
            }
    }

    suspend fun signOut() {
        if (!isAvailable) return
        SupabaseClientProvider.auth.signOut()
    }
}
