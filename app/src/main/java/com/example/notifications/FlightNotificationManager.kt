package com.example.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.example.MainActivity
import com.example.R
import com.example.model.AlertType

object FlightNotificationManager {

    const val CHANNEL_ID = "skytrack_flight_alerts_channel"
    const val CHANNEL_NAME = "Flight Status & Gate Alerts"
    const val CHANNEL_DESC = "Real-time updates for flight gate changes, delays, boarding calls, and cancellations."

    fun createNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val importance = NotificationManager.IMPORTANCE_HIGH
            val channel = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, importance).apply {
                description = CHANNEL_DESC
                enableLights(true)
                lightColor = Color.CYAN
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 250, 150, 250)
                setShowBadge(true)
            }
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    fun showFlightAlertNotification(
        context: Context,
        notificationId: Int,
        flightNumber: String,
        type: AlertType,
        title: String,
        message: String
    ) {
        createNotificationChannel(context)

        // Intent to launch MainActivity with the flight selected
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("EXTRA_FLIGHT_NUMBER", flightNumber)
            putExtra("EXTRA_OPEN_NOTIFICATIONS", true)
        }

        val pendingIntent = PendingIntent.getActivity(
            context,
            notificationId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val subText = when (type) {
            AlertType.GATE_CHANGE -> "GATE UPDATE · $flightNumber"
            AlertType.DELAY -> "SCHEDULE DELAY · $flightNumber"
            AlertType.BOARDING -> "BOARDING CALL · $flightNumber"
            AlertType.CANCELLATION -> "CANCELLATION ADVISORY · $flightNumber"
            AlertType.BAGGAGE -> "BAGGAGE CLAIM · $flightNumber"
        }

        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(message)
            .setSubText(subText)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_EVENT)
            .setColor(0xFF00E5FF.toInt())
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setVibrate(longArrayOf(0, 300, 200, 300))

        try {
            val notificationManager = NotificationManagerCompat.from(context)
            notificationManager.notify(notificationId, builder.build())
        } catch (e: SecurityException) {
            // POST_NOTIFICATIONS permission not granted yet by user
            android.util.Log.w("FlightNotificationManager", "Notification permission not granted: ${e.message}")
        }
    }
}
