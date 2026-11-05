package com.example.sync

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.util.Log
import androidx.work.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.util.concurrent.TimeUnit

/**
 * Manager responsible for configuring WorkManager background sync jobs
 * and monitoring system connectivity restoration to refresh Room cached flight data.
 */
object FlightSyncManager {

    private const val TAG = "FlightSyncManager"
    private var isNetworkCallbackRegistered = false

    /**
     * Schedules a unique OneTimeWorkRequest with NetworkType.CONNECTED constraint.
     * WorkManager will automatically trigger this whenever network connectivity is restored,
     * even if the app process is terminated or backgrounded.
     */
    fun scheduleConnectivitySync(context: Context) {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val syncRequest = OneTimeWorkRequestBuilder<FlightSyncWorker>()
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
            .addTag(FlightSyncWorker.TAG)
            .build()

        WorkManager.getInstance(context).enqueueUniqueWork(
            FlightSyncWorker.WORK_NAME_CONNECTIVITY_SYNC,
            ExistingWorkPolicy.KEEP,
            syncRequest
        )
        Log.d(TAG, "Enqueued WorkManager connectivity sync with NetworkType.CONNECTED constraint.")
    }

    /**
     * Schedules periodic background sync (every 15 minutes) with NetworkType.CONNECTED constraint.
     */
    fun schedulePeriodicSync(context: Context) {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val periodicRequest = PeriodicWorkRequestBuilder<FlightSyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .addTag(FlightSyncWorker.TAG)
            .build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            FlightSyncWorker.WORK_NAME_PERIODIC_SYNC,
            ExistingPeriodicWorkPolicy.KEEP,
            periodicRequest
        )
        Log.d(TAG, "Enqueued periodic WorkManager flight cache sync.")
    }

    /**
     * Enqueues an immediate WorkManager sync task (e.g., when the user manually refreshes,
     * disables airplane mode, or when active network callback detects reconnection).
     */
    fun enqueueImmediateSync(context: Context) {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val immediateRequest = OneTimeWorkRequestBuilder<FlightSyncWorker>()
            .setConstraints(constraints)
            .addTag(FlightSyncWorker.TAG)
            .build()

        WorkManager.getInstance(context).enqueueUniqueWork(
            FlightSyncWorker.WORK_NAME_IMMEDIATE_SYNC,
            ExistingWorkPolicy.REPLACE,
            immediateRequest
        )
        Log.d(TAG, "Enqueued immediate WorkManager sync on connectivity restore.")
    }

    /**
     * Registers a ConnectivityManager.NetworkCallback that detects when connectivity transitions
     * to available, immediately triggering the WorkManager sync service.
     */
    fun registerConnectivityRestoredMonitor(context: Context) {
        if (isNetworkCallbackRegistered) return
        try {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return
            val request = NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build()

            cm.registerNetworkCallback(request, object : ConnectivityManager.NetworkCallback() {
                private var wasLost = false

                override fun onLost(network: Network) {
                    super.onLost(network)
                    wasLost = true
                    Log.d(TAG, "Network connection lost. Room database running in offline mode.")
                }

                override fun onAvailable(network: Network) {
                    super.onAvailable(network)
                    Log.d(TAG, "Network connection restored! Triggering immediate WorkManager cache sync...")
                    enqueueImmediateSync(context)
                    // Also ensure the permanent connectivity constraint work is kept scheduled
                    scheduleConnectivitySync(context)
                    wasLost = false
                }
            })
            isNetworkCallbackRegistered = true
            Log.d(TAG, "Registered NetworkCallback for active connectivity restore detection.")
        } catch (e: Exception) {
            Log.w(TAG, "Unable to register NetworkCallback: ${e.message}")
        }
    }

    /**
     * Returns a Flow observing the status of the connectivity sync worker.
     */
    fun getSyncWorkInfoFlow(context: Context): Flow<WorkInfo?> {
        return WorkManager.getInstance(context)
            .getWorkInfosForUniqueWorkFlow(FlightSyncWorker.WORK_NAME_CONNECTIVITY_SYNC)
            .map { list -> list.firstOrNull() }
    }

    /**
     * Returns a Flow observing the status of immediate sync requests.
     */
    fun getImmediateSyncWorkInfoFlow(context: Context): Flow<WorkInfo?> {
        return WorkManager.getInstance(context)
            .getWorkInfosForUniqueWorkFlow(FlightSyncWorker.WORK_NAME_IMMEDIATE_SYNC)
            .map { list -> list.firstOrNull() }
    }

    fun getLastSyncTimeString(context: Context): String {
        val prefs = context.getSharedPreferences(FlightSyncWorker.PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getString(FlightSyncWorker.KEY_LAST_SYNC_TIME_STR, null) ?: "Never"
    }

    fun getLastSyncStatus(context: Context): String {
        val prefs = context.getSharedPreferences(FlightSyncWorker.PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getString(FlightSyncWorker.KEY_LAST_SYNC_STATUS, "Ready (Connected)") ?: "Ready"
    }

    fun getLastSyncCount(context: Context): Int {
        val prefs = context.getSharedPreferences(FlightSyncWorker.PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getInt(FlightSyncWorker.KEY_LAST_SYNC_COUNT, 0)
    }
}
