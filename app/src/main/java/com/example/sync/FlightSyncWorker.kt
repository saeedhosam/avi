package com.example.sync

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.example.data.MockFlightData
import com.example.data.local.CachedFlightEntity
import com.example.data.local.FlightAlertEntity
import com.example.data.local.SkyTrackDatabase
import com.example.model.AlertType
import com.example.model.FlightStatus
import com.example.notifications.FlightNotificationManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

/**
 * Background WorkManager Worker responsible for syncing live flight telemetry,
 * gate changes, and delay statuses into the local Room database whenever connectivity
 * is restored or periodic background sync occurs.
 */
class FlightSyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val startTime = System.currentTimeMillis()
        Log.d(TAG, "Executing background flight cache sync via WorkManager (Attempt: $runAttemptCount)...")

        try {
            val db = SkyTrackDatabase.getDatabase(applicationContext)
            val dao = db.flightDao()

            // 1. Fetch current tracked and favorite flights to retain user preferences
            val favorites = dao.getAllFavorites().firstOrNull() ?: emptyList()
            val favoriteMap = favorites.associateBy({ it.flightNumber }, { it.customNotes })

            val tracked = dao.getAllTrackedFlights().firstOrNull() ?: emptyList()
            val trackedMap = tracked.associateBy({ it.flightNumber.replace(" ", "").lowercase() }, { it.notes })

            // 2. Obtain fresh flight data (simulating live cloud aviation feed)
            val baseFlights = MockFlightData.initialFlights
            val entities = baseFlights.map { flight ->
                val key = flight.flightNumber.replace(" ", "").lowercase()
                val isFav = favoriteMap.containsKey(flight.flightNumber)
                val isTrk = trackedMap.containsKey(key)
                val note = favoriteMap[flight.flightNumber] ?: trackedMap[key] ?: flight.customNotes

                // Update telemetry progress for airborne flights
                val progress = if (flight.status == FlightStatus.DEPARTED) {
                    (flight.telemetry.progressPercent + 0.04f).coerceAtMost(0.99f)
                } else {
                    flight.telemetry.progressPercent
                }

                CachedFlightEntity(
                    id = flight.id,
                    flightNumber = flight.flightNumber,
                    airline = flight.airline,
                    airlineCode = flight.airlineCode,
                    originCode = flight.origin.code,
                    originCity = flight.origin.city,
                    originName = flight.origin.name,
                    destCode = flight.destination.code,
                    destCity = flight.destination.city,
                    destName = flight.destination.name,
                    departureTimeScheduled = flight.departureTimeScheduled,
                    departureTimeEstimated = flight.departureTimeEstimated,
                    arrivalTimeScheduled = flight.arrivalTimeScheduled,
                    arrivalTimeEstimated = flight.arrivalTimeEstimated,
                    status = flight.status.name,
                    statusNote = flight.statusNote,
                    delayMinutes = flight.delayMinutes,
                    delayReason = flight.delayReason,
                    terminalDeparture = flight.terminalDeparture,
                    gateDeparture = flight.gateDeparture,
                    checkInCounter = flight.checkInCounter,
                    terminalArrival = flight.terminalArrival,
                    gateArrival = flight.gateArrival,
                    baggageCarousel = flight.baggageCarousel,
                    aircraftModel = flight.aircraft.model,
                    aircraftRegistration = flight.aircraft.registration,
                    altitudeFeet = flight.telemetry.altitudeFeet,
                    groundSpeedKnots = flight.telemetry.groundSpeedKnots,
                    headingDegrees = flight.telemetry.headingDegrees,
                    progressPercent = progress,
                    isFavorite = isFav,
                    customNotes = note,
                    cachedTimestamp = System.currentTimeMillis()
                )
            }

            // 3. Upsert fresh flight data into Room SQLite database
            dao.insertFlights(entities)

            // 4. Update sync metadata in SharedPreferences
            val timeFormat = SimpleDateFormat("HH:mm:ss", Locale.getDefault())
            val timeStr = timeFormat.format(Date())
            val prefs = applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit()
                .putLong(KEY_LAST_SYNC_TIMESTAMP, System.currentTimeMillis())
                .putString(KEY_LAST_SYNC_TIME_STR, timeStr)
                .putInt(KEY_LAST_SYNC_COUNT, entities.size)
                .putString(KEY_LAST_SYNC_STATUS, "SUCCESS (Connectivity Restored)")
                .apply()

            // 5. If user has active tracked flights, create a sync notification & alert
            if (tracked.isNotEmpty()) {
                val firstTracked = tracked.first()
                val alert = FlightAlertEntity(
                    id = UUID.randomUUID().toString(),
                    flightNumber = firstTracked.flightNumber,
                    type = AlertType.GATE_CHANGE.name,
                    title = "Background Cache Synced: ${firstTracked.flightNumber}",
                    message = "Connectivity restored. Room database updated with latest radar & gate information.",
                    timestamp = "Just now",
                    isRead = false
                )
                dao.insertAlert(alert)
                FlightNotificationManager.showFlightAlertNotification(
                    context = applicationContext,
                    notificationId = firstTracked.flightNumber.hashCode() + 999,
                    flightNumber = firstTracked.flightNumber,
                    type = AlertType.GATE_CHANGE,
                    title = "Cache Synced: ${firstTracked.flightNumber}",
                    message = "Connectivity restored. Room database updated with fresh telemetry."
                )
            }

            val elapsed = System.currentTimeMillis() - startTime
            Log.d(TAG, "WorkManager background flight sync completed in ${elapsed}ms. Cached ${entities.size} flights in Room.")

            Result.success(
                workDataOf(
                    OUTPUT_KEY_FLIGHTS_SYNCED to entities.size,
                    OUTPUT_KEY_TIMESTAMP to System.currentTimeMillis(),
                    OUTPUT_KEY_TIME_STRING to timeStr
                )
            )
        } catch (e: Exception) {
            Log.e(TAG, "Background sync failed: ${e.message}", e)
            val prefs = applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit()
                .putString(KEY_LAST_SYNC_STATUS, "FAILED: ${e.message}")
                .apply()

            if (runAttemptCount < 3) {
                Result.retry()
            } else {
                Result.failure(workDataOf("error" to (e.message ?: "Sync failure")))
            }
        }
    }

    companion object {
        const val TAG = "FlightSyncWorker"
        const val WORK_NAME_CONNECTIVITY_SYNC = "skytrack_connectivity_sync"
        const val WORK_NAME_PERIODIC_SYNC = "skytrack_periodic_sync"
        const val WORK_NAME_IMMEDIATE_SYNC = "skytrack_immediate_sync"

        const val PREFS_NAME = "skytrack_prefs"
        const val KEY_LAST_SYNC_TIMESTAMP = "last_sync_timestamp"
        const val KEY_LAST_SYNC_TIME_STR = "last_sync_time_str"
        const val KEY_LAST_SYNC_COUNT = "last_sync_flight_count"
        const val KEY_LAST_SYNC_STATUS = "last_sync_status"

        const val OUTPUT_KEY_FLIGHTS_SYNCED = "flights_synced"
        const val OUTPUT_KEY_TIMESTAMP = "sync_timestamp"
        const val OUTPUT_KEY_TIME_STRING = "sync_time_string"
    }
}
