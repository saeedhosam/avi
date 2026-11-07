package com.example.data.supabase

import com.example.data.cloud.CloudAlert
import com.example.data.cloud.CloudPlanState
import com.example.data.cloud.CloudTrackedFlight
import com.example.data.cloud.CloudUserProfile
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.user.UserInfo
import io.github.jan.supabase.postgrest.from
import kotlinx.serialization.json.JsonObject

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

    suspend fun saveWatchlistItem(
        flight: CloudTrackedFlight,
        snapshot: JsonObject? = null
    ): Result<String> = runCatching {
        val uid = requireUserId()
        val flightId = flight.watchRowId()
        SupabaseClientProvider.client.from("watchlist_items").upsert(
            WatchlistItemUpsert(
                userId = uid,
                flightId = flightId,
                flightNumber = flight.flightNumber.take(20),
                flightDate = flight.flightDate,
                airline = flight.airline.take(100),
                originCode = flight.originCode.take(10),
                destCode = flight.destCode.take(10),
                status = flight.status.take(30),
                notes = flight.customNotes.take(500),
                snapshot = snapshot
            )
        ) {
            onConflict = "user_id,flight_id"
        }
        flightId
    }

    suspend fun deleteWatchlistItem(flightId: String): Result<Unit> = runCatching {
        val uid = requireUserId()
        SupabaseClientProvider.client.from("watchlist_items").delete {
            filter {
                eq("user_id", uid)
                eq("flight_id", flightId)
            }
        }
        Unit
    }

    /** Reads the user's plan tier from profiles (backend-managed column). */
    suspend fun fetchPlan(): Result<CloudPlanState> = runCatching {
        val uid = requireUserId()
        val row = SupabaseClientProvider.client.from("profiles")
            .select {
                filter { eq("id", uid) }
            }
            .decodeSingle<ProfileRow>()
        val limit = when (row.plan.uppercase()) {
            "PRO" -> 50
            "PLUS" -> 15
            else -> 3
        }
        CloudPlanState(plan = row.plan.uppercase(), concurrentLimit = limit)
    }

    suspend fun fetchWatchlistItems(): Result<List<WatchlistItemRow>> = runCatching {
        val uid = requireUserId()
        SupabaseClientProvider.client.from("watchlist_items")
            .select {
                filter { eq("user_id", uid) }
            }
            .decodeList<WatchlistItemRow>()
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

