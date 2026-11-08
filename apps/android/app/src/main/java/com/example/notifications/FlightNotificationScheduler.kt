package com.example.notifications

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import com.example.data.local.ScheduledNotificationEntity
import com.example.data.local.SkyTrackDatabase
import com.example.model.AlertType
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

class FlightNotificationScheduler(private val context: Context) {

    private val db = SkyTrackDatabase.getDatabase(context)
    private val dao = db.flightDao()
    private val scope = CoroutineScope(Dispatchers.IO)
    private val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager

    val scheduledNotifications: Flow<List<ScheduledNotificationEntity>> = dao.getAllScheduledNotifications()

    /**
     * Schedules a local notification stored in Room and queued via AlarmManager.
     */
    fun scheduleAlert(
        flightNumber: String,
        type: AlertType,
        title: String,
        message: String,
        delaySeconds: Int
    ): String {
        val scheduleId = UUID.randomUUID().toString()
        val triggerTime = System.currentTimeMillis() + (delaySeconds * 1000L)
        val timeFormat = SimpleDateFormat("HH:mm:ss", Locale.getDefault())
        val timeStr = "In ${delaySeconds}s (${timeFormat.format(Date(triggerTime))})"

        val entity = ScheduledNotificationEntity(
            id = scheduleId,
            flightNumber = flightNumber,
            alertType = type.name,
            title = title,
            message = message,
            scheduledTimeMillis = triggerTime,
            scheduledTimeString = timeStr,
            isTriggered = false,
            isCancelled = false
        )

        scope.launch {
            dao.insertScheduledNotification(entity)
        }

        // Setup PendingIntent for AlarmManager
        val intent = Intent(context, FlightAlertAlarmReceiver::class.java).apply {
            putExtra(FlightAlertAlarmReceiver.EXTRA_SCHEDULE_ID, scheduleId)
            putExtra(FlightAlertAlarmReceiver.EXTRA_FLIGHT_NUMBER, flightNumber)
            putExtra(FlightAlertAlarmReceiver.EXTRA_ALERT_TYPE, type.name)
            putExtra(FlightAlertAlarmReceiver.EXTRA_TITLE, title)
            putExtra(FlightAlertAlarmReceiver.EXTRA_MESSAGE, message)
        }

        val pendingIntent = PendingIntent.getBroadcast(
            context,
            scheduleId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        alarmManager?.let { am ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerTime, pendingIntent)
            } else {
                am.set(AlarmManager.RTC_WAKEUP, triggerTime, pendingIntent)
            }
        }

        return scheduleId
    }

    /**
     * Triggers an immediate system push notification and saves to Room.
     */
    fun triggerInstantAlert(
        flightNumber: String,
        type: AlertType,
        title: String,
        message: String
    ) {
        val notificationId = (flightNumber + System.currentTimeMillis()).hashCode()
        FlightNotificationManager.showFlightAlertNotification(
            context = context,
            notificationId = notificationId,
            flightNumber = flightNumber,
            type = type,
            title = title,
            message = message
        )
    }

    fun cancelSchedule(id: String) {
        scope.launch {
            dao.cancelScheduledNotification(id)
        }
        val intent = Intent(context, FlightAlertAlarmReceiver::class.java)
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            id.hashCode(),
            intent,
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
        )
        if (pendingIntent != null && alarmManager != null) {
            alarmManager.cancel(pendingIntent)
            pendingIntent.cancel()
        }
    }

    fun deleteSchedule(id: String) {
        cancelSchedule(id)
        scope.launch {
            dao.deleteScheduledNotification(id)
        }
    }
}
