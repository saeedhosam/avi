package com.example.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.example.data.local.FlightAlertEntity
import com.example.data.local.SkyTrackDatabase
import com.example.model.AlertType
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

class FlightAlertAlarmReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val scheduleId = intent.getStringExtra(EXTRA_SCHEDULE_ID) ?: return
        val flightNumber = intent.getStringExtra(EXTRA_FLIGHT_NUMBER) ?: "Flight Alert"
        val rawType = intent.getStringExtra(EXTRA_ALERT_TYPE) ?: "GATE_CHANGE"
        val title = intent.getStringExtra(EXTRA_TITLE) ?: "Scheduled Flight Alert"
        val message = intent.getStringExtra(EXTRA_MESSAGE) ?: "Alert for $flightNumber"

        val alertType = try {
            AlertType.valueOf(rawType)
        } catch (e: Exception) {
            AlertType.GATE_CHANGE
        }

        val notificationId = (flightNumber + scheduleId).hashCode()

        // 1. Trigger the system push notification
        FlightNotificationManager.showFlightAlertNotification(
            context = context,
            notificationId = notificationId,
            flightNumber = flightNumber,
            type = alertType,
            title = title,
            message = message
        )

        // 2. Update Room Database in background
        val timeStr = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date())
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val db = SkyTrackDatabase.getDatabase(context)
                val dao = db.flightDao()

                // Mark scheduled entry as triggered
                dao.markScheduledNotificationTriggered(scheduleId)

                // Add to active alerts list
                dao.insertAlert(
                    FlightAlertEntity(
                        id = UUID.randomUUID().toString(),
                        flightNumber = flightNumber,
                        type = alertType.name,
                        title = title,
                        message = message,
                        timestamp = timeStr,
                        isRead = false
                    )
                )
            } catch (e: Exception) {
                android.util.Log.e("FlightAlertAlarmReceiver", "Failed to update Room on alarm trigger", e)
            }
        }
    }

    companion object {
        const val EXTRA_SCHEDULE_ID = "EXTRA_SCHEDULE_ID"
        const val EXTRA_FLIGHT_NUMBER = "EXTRA_FLIGHT_NUMBER"
        const val EXTRA_ALERT_TYPE = "EXTRA_ALERT_TYPE"
        const val EXTRA_TITLE = "EXTRA_TITLE"
        const val EXTRA_MESSAGE = "EXTRA_MESSAGE"
    }
}
