package com.example.notifications

import android.util.Log
import com.example.data.local.FlightAlertEntity
import com.example.data.local.SkyTrackDatabase
import com.example.model.AlertType
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.util.UUID

class SkyTrackMessagingService : FirebaseMessagingService() {

    private val serviceScope = CoroutineScope(Dispatchers.IO)

    @Suppress("DEPRECATION")
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "New Firebase Messaging Token received: $token")
        // Save FCM token to preferences so the backend can target this device
        val prefs = getSharedPreferences("skytrack_prefs", MODE_PRIVATE)
        prefs.edit().putString("fcm_token", token).apply()
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        Log.d(TAG, "From: ${remoteMessage.from}, data: ${remoteMessage.data}")

        val data = remoteMessage.data
        val flightNumber = data["flight_number"] ?: data["flightNumber"] ?: "Flight Update"
        val rawType = data["alert_type"] ?: data["type"] ?: "GATE_CHANGE"
        val title = data["title"] ?: remoteMessage.notification?.title ?: "Flight Status Alert: $flightNumber"
        val body = data["body"] ?: data["message"] ?: remoteMessage.notification?.body ?: "Status change detected for $flightNumber."
        val newGate = data["new_gate"]
        val delayMinutes = data["delay_minutes"]?.toIntOrNull()

        val alertType = try {
            AlertType.valueOf(rawType.uppercase())
        } catch (e: Exception) {
            AlertType.GATE_CHANGE
        }

        val alertId = UUID.randomUUID().toString()
        val timestamp = "Just now"

        // 1. Persist alert in Room database
        serviceScope.launch {
            try {
                val db = SkyTrackDatabase.getDatabase(applicationContext)
                val dao = db.flightDao()

                dao.insertAlert(
                    FlightAlertEntity(
                        id = alertId,
                        flightNumber = flightNumber,
                        type = alertType.name,
                        title = title,
                        message = body,
                        timestamp = timestamp,
                        isRead = false
                    )
                )

                // Update cached flight fields if gate or delay provided
                if (newGate != null && newGate.isNotBlank()) {
                    dao.updateFlightGate(flightNumber, newGate)
                }
                if (delayMinutes != null && delayMinutes > 0) {
                    dao.updateFlightDelay(
                        flightNumber = flightNumber,
                        status = "DELAYED",
                        delayMinutes = delayMinutes,
                        delayReason = data["delay_reason"] ?: "Air Traffic Control Metering",
                        statusNote = "Delayed $delayMinutes mins · Flow management"
                    )
                } else if (alertType == AlertType.CANCELLATION) {
                    dao.updateFlightStatus(
                        flightNumber = flightNumber,
                        status = "CANCELLED",
                        statusNote = "Cancelled · Flight Advisory"
                    )
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error saving FCM alert to Room", e)
            }
        }

        // 2. Trigger heads-up push notification
        val notificationId = flightNumber.hashCode()
        FlightNotificationManager.showFlightAlertNotification(
            context = applicationContext,
            notificationId = notificationId,
            flightNumber = flightNumber,
            type = alertType,
            title = title,
            message = body
        )
    }

    companion object {
        private const val TAG = "SkyTrackFCM"
    }
}
