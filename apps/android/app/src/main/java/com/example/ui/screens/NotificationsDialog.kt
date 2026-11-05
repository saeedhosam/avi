package com.example.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.data.local.ScheduledNotificationEntity
import com.example.model.AlertType
import com.example.model.Flight
import com.example.model.FlightAlert
import com.example.ui.theme.*

@Composable
fun NotificationsDialog(
    alerts: List<FlightAlert>,
    scheduledAlerts: List<ScheduledNotificationEntity>,
    savedFlights: List<Flight> = emptyList(),
    fcmToken: String = "",
    onDismiss: () -> Unit,
    onMarkAllRead: () -> Unit,
    onMarkRead: (String) -> Unit,
    onCancelSchedule: (String) -> Unit,
    onTriggerTestAlert: (String, AlertType) -> Unit
) {
    var selectedTab by remember { mutableIntStateOf(0) } // 0: Live Alerts & FCM, 1: Room Scheduled
    var selectedFlightNumber by remember(savedFlights) {
        mutableStateOf(savedFlights.firstOrNull()?.flightNumber ?: "AA 100")
    }
    val clipboardManager = LocalClipboardManager.current
    var copiedToken by remember { mutableStateOf(false) }

    LaunchedEffect(copiedToken) {
        if (copiedToken) {
            kotlinx.coroutines.delay(2000)
            copiedToken = false
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Column {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.NotificationsActive,
                            contentDescription = null,
                            tint = RadarCyan
                        )
                        Text(
                            text = "Flight Alerts & Push",
                            color = TextWhite,
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    if (selectedTab == 0 && alerts.any { !it.isRead }) {
                        TextButton(onClick = onMarkAllRead) {
                            Text("Mark all read", color = RadarCyan, fontSize = 11.sp)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(4.dp))

                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(7.dp)
                            .clip(CircleShape)
                            .background(StatusLanded)
                    )
                    Text(
                        text = "FCM Push · Room Scheduler · WorkManager Sync",
                        color = RadarCyan,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        },
        text = {
            Column(modifier = Modifier.fillMaxWidth()) {
                // Tab Row between Live Alerts and Room Scheduled
                TabRow(
                    selectedTabIndex = selectedTab,
                    containerColor = InstrumentSurface,
                    contentColor = RadarCyan,
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .border(1.dp, InstrumentBorder, RoundedCornerShape(10.dp))
                ) {
                    Tab(
                        selected = selectedTab == 0,
                        onClick = { selectedTab = 0 },
                        text = {
                            Text(
                                "Live & FCM (${alerts.size})",
                                fontSize = 12.sp,
                                fontWeight = if (selectedTab == 0) FontWeight.Bold else FontWeight.Medium
                            )
                        }
                    )
                    Tab(
                        selected = selectedTab == 1,
                        onClick = { selectedTab = 1 },
                        text = {
                            Text(
                                "Room Scheduled (${scheduledAlerts.size})",
                                fontSize = 12.sp,
                                fontWeight = if (selectedTab == 1) FontWeight.Bold else FontWeight.Medium
                            )
                        }
                    )
                }

                Spacer(modifier = Modifier.height(10.dp))

                if (selectedTab == 0) {
                    // FCM TOKEN & PUSH SUBSCRIPTIONS CARD
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(10.dp))
                            .border(1.dp, InstrumentBorder, RoundedCornerShape(10.dp)),
                        color = InstrumentSurfaceElevated
                    ) {
                        Column(modifier = Modifier.padding(10.dp)) {
                            // FCM Token Row
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.VpnKey,
                                        contentDescription = null,
                                        tint = RadarCyan,
                                        modifier = Modifier.size(14.dp)
                                    )
                                    Text(
                                        text = "FCM DEVICE REGISTRATION",
                                        color = TextWhite,
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        letterSpacing = 0.5.sp
                                    )
                                }

                                if (fcmToken.isNotBlank()) {
                                    TextButton(
                                        onClick = {
                                            clipboardManager.setText(AnnotatedString(fcmToken))
                                            copiedToken = true
                                        },
                                        contentPadding = PaddingValues(horizontal = 6.dp, vertical = 2.dp),
                                        modifier = Modifier.height(24.dp).testTag("copy_fcm_token_btn")
                                    ) {
                                        Icon(
                                            imageVector = if (copiedToken) Icons.Default.Check else Icons.Default.ContentCopy,
                                            contentDescription = "Copy Token",
                                            tint = if (copiedToken) StatusLanded else RadarCyan,
                                            modifier = Modifier.size(12.dp)
                                        )
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text(
                                            text = if (copiedToken) "Copied!" else "Copy",
                                            color = if (copiedToken) StatusLanded else RadarCyan,
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Bold
                                        )
                                    }
                                }
                            }

                            if (fcmToken.isNotBlank()) {
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = fcmToken,
                                    color = TextMuted,
                                    fontSize = 10.sp,
                                    fontFamily = FontFamily.Monospace,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }

                            Spacer(modifier = Modifier.height(8.dp))
                            HorizontalDivider(color = InstrumentBorder.copy(alpha = 0.5f))
                            Spacer(modifier = Modifier.height(6.dp))

                            // Subscribed Topics info
                            Text(
                                text = "ACTIVE FCM TOPIC SUBSCRIPTIONS",
                                color = TextSubtle,
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 0.5.sp
                            )

                            Spacer(modifier = Modifier.height(4.dp))

                            val subscribedTopics = if (savedFlights.isNotEmpty()) {
                                savedFlights.map { "flight_${it.flightNumber.replace(" ", "").lowercase()}" }.distinct()
                            } else {
                                listOf("flight_aa100")
                            }

                            LazyRow(
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                items(subscribedTopics) { topic ->
                                    Surface(
                                        shape = RoundedCornerShape(6.dp),
                                        color = CockpitDark,
                                        border = BorderStroke(0.6.dp, RadarCyan.copy(alpha = 0.4f))
                                    ) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp),
                                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                                        ) {
                                            Icon(
                                                Icons.Default.CloudSync,
                                                contentDescription = null,
                                                tint = RadarCyan,
                                                modifier = Modifier.size(10.dp)
                                            )
                                            Text(
                                                text = topic,
                                                color = RadarCyan,
                                                fontSize = 9.sp,
                                                fontFamily = FontFamily.Monospace,
                                                fontWeight = FontWeight.SemiBold
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    // TEST PUSH TRIGGER CONTROLS
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(10.dp))
                            .border(1.dp, InstrumentBorder, RoundedCornerShape(10.dp)),
                        color = InstrumentSurface
                    ) {
                        Column(modifier = Modifier.padding(10.dp)) {
                            Text(
                                text = "TRIGGER SIMULATED FCM PUSH",
                                color = TextSubtle,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 0.5.sp
                            )

                            Spacer(modifier = Modifier.height(6.dp))

                            // Flight selector row
                            val flightOptions = (listOf("AA 100") + savedFlights.map { it.flightNumber }).distinct()
                            LazyRow(
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                items(flightOptions) { fNum ->
                                    val isSelected = fNum == selectedFlightNumber
                                    Surface(
                                        shape = RoundedCornerShape(6.dp),
                                        color = if (isSelected) RadarCyan.copy(alpha = 0.2f) else CockpitDark,
                                        border = BorderStroke(
                                            0.8.dp,
                                            if (isSelected) RadarCyan else InstrumentBorder
                                        ),
                                        modifier = Modifier.clickable { selectedFlightNumber = fNum }
                                    ) {
                                        Text(
                                            text = fNum,
                                            color = if (isSelected) RadarCyan else TextMuted,
                                            fontSize = 10.sp,
                                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                        )
                                    }
                                }
                            }

                            Spacer(modifier = Modifier.height(8.dp))

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                OutlinedButton(
                                    onClick = { onTriggerTestAlert(selectedFlightNumber, AlertType.GATE_CHANGE) },
                                    modifier = Modifier.weight(1f).height(34.dp).testTag("test_alert_gate_change"),
                                    contentPadding = PaddingValues(horizontal = 2.dp),
                                    colors = ButtonDefaults.outlinedButtonColors(contentColor = RadarCyan),
                                    border = BorderStroke(1.dp, RadarCyan.copy(alpha = 0.5f))
                                ) {
                                    Text("Gate", fontSize = 10.sp, fontWeight = FontWeight.Bold)
                                }

                                OutlinedButton(
                                    onClick = { onTriggerTestAlert(selectedFlightNumber, AlertType.DELAY) },
                                    modifier = Modifier.weight(1f).height(34.dp).testTag("test_alert_delay"),
                                    contentPadding = PaddingValues(horizontal = 2.dp),
                                    colors = ButtonDefaults.outlinedButtonColors(contentColor = StatusDelayed),
                                    border = BorderStroke(1.dp, StatusDelayed.copy(alpha = 0.5f))
                                ) {
                                    Text("Delay", fontSize = 10.sp, fontWeight = FontWeight.Bold)
                                }

                                OutlinedButton(
                                    onClick = { onTriggerTestAlert(selectedFlightNumber, AlertType.BOARDING) },
                                    modifier = Modifier.weight(1f).height(34.dp).testTag("test_alert_boarding"),
                                    contentPadding = PaddingValues(horizontal = 2.dp),
                                    colors = ButtonDefaults.outlinedButtonColors(contentColor = StatusBoarding),
                                    border = BorderStroke(1.dp, StatusBoarding.copy(alpha = 0.5f))
                                ) {
                                    Text("Boarding", fontSize = 10.sp, fontWeight = FontWeight.Bold)
                                }

                                OutlinedButton(
                                    onClick = { onTriggerTestAlert(selectedFlightNumber, AlertType.CANCELLATION) },
                                    modifier = Modifier.weight(1f).height(34.dp).testTag("test_alert_cancel"),
                                    contentPadding = PaddingValues(horizontal = 2.dp),
                                    colors = ButtonDefaults.outlinedButtonColors(contentColor = StatusCancelled),
                                    border = BorderStroke(1.dp, StatusCancelled.copy(alpha = 0.5f))
                                ) {
                                    Text("Cancel", fontSize = 10.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    // LIVE ALERTS LIST
                    Text(
                        text = "RECENT ALERTS (${alerts.size})",
                        color = TextSubtle,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 0.5.sp
                    )

                    Spacer(modifier = Modifier.height(6.dp))

                    if (alerts.isEmpty()) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 20.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "No flight notifications yet",
                                color = TextMuted,
                                fontSize = 12.sp
                            )
                        }
                    } else {
                        LazyColumn(
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(max = 200.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            items(alerts, key = { it.id }) { alert ->
                                AlertItemCard(
                                    alert = alert,
                                    onClick = { onMarkRead(alert.id) }
                                )
                            }
                        }
                    }
                } else {
                    // ROOM SCHEDULED ALERTS LIST
                    if (scheduledAlerts.isEmpty()) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 32.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Icon(Icons.Default.Schedule, null, tint = TextSubtle, modifier = Modifier.size(36.dp))
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(
                                    text = "No Room Scheduled Alerts",
                                    color = TextWhite,
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = "Schedule alerts from any flight detail screen using AlarmManager & Room database.",
                                    color = TextMuted,
                                    fontSize = 11.sp,
                                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                                    modifier = Modifier.padding(horizontal = 16.dp)
                                )
                            }
                        }
                    } else {
                        LazyColumn(
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(max = 340.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            items(scheduledAlerts, key = { it.id }) { item ->
                                ScheduledItemCard(
                                    item = item,
                                    onCancel = { onCancelSchedule(item.id) }
                                )
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = onDismiss,
                modifier = Modifier.testTag("close_notifications_btn")
            ) {
                Text("Close", color = RadarCyan)
            }
        },
        containerColor = CockpitDark,
        modifier = Modifier.testTag("notifications_dialog")
    )
}

@Composable
private fun ScheduledItemCard(
    item: ScheduledNotificationEntity,
    onCancel: () -> Unit
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .border(1.dp, InstrumentBorder, RoundedCornerShape(12.dp)),
        color = InstrumentSurface
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .clip(CircleShape)
                    .background(
                        when {
                            item.isTriggered -> StatusLanded.copy(alpha = 0.2f)
                            item.isCancelled -> StatusCancelled.copy(alpha = 0.2f)
                            else -> RadarCyan.copy(alpha = 0.2f)
                        }
                    ),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = when {
                        item.isTriggered -> Icons.Default.CheckCircle
                        item.isCancelled -> Icons.Default.Cancel
                        else -> Icons.Default.Alarm
                    },
                    contentDescription = null,
                    tint = when {
                        item.isTriggered -> StatusLanded
                        item.isCancelled -> StatusCancelled
                        else -> RadarCyan
                    },
                    modifier = Modifier.size(16.dp)
                )
            }

            Column(modifier = Modifier.weight(1f)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = item.flightNumber,
                        color = TextWhite,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = when {
                            item.isTriggered -> "Delivered"
                            item.isCancelled -> "Cancelled"
                            else -> item.scheduledTimeString
                        },
                        color = if (item.isTriggered) StatusLanded else if (item.isCancelled) StatusCancelled else AeroBlue,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }

                Spacer(modifier = Modifier.height(2.dp))

                Text(
                    text = item.title,
                    color = TextMuted,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium
                )
            }

            if (!item.isTriggered && !item.isCancelled) {
                IconButton(onClick = onCancel, modifier = Modifier.size(28.dp)) {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = "Cancel Alert",
                        tint = TextSubtle,
                        modifier = Modifier.size(16.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun AlertItemCard(
    alert: FlightAlert,
    onClick: () -> Unit
) {
    val icon: ImageVector = when (alert.type) {
        AlertType.GATE_CHANGE -> Icons.Default.MeetingRoom
        AlertType.DELAY -> Icons.Default.AccessTime
        AlertType.BOARDING -> Icons.Default.FlightTakeoff
        AlertType.CANCELLATION -> Icons.Default.Warning
        AlertType.BAGGAGE -> Icons.Default.Luggage
    }

    val iconColor = when (alert.type) {
        AlertType.GATE_CHANGE -> RadarCyan
        AlertType.DELAY -> StatusDelayed
        AlertType.BOARDING -> StatusBoarding
        AlertType.CANCELLATION -> StatusCancelled
        AlertType.BAGGAGE -> StatusLanded
    }

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .border(
                1.dp,
                if (!alert.isRead) iconColor.copy(alpha = 0.5f) else InstrumentBorder,
                RoundedCornerShape(12.dp)
            )
            .clickable(onClick = onClick),
        color = if (!alert.isRead) InstrumentSurfaceElevated else InstrumentSurface
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .clip(CircleShape)
                    .background(iconColor.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = iconColor,
                    modifier = Modifier.size(16.dp)
                )
            }

            Column(modifier = Modifier.weight(1f)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = alert.title,
                        color = TextWhite,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = alert.timestamp,
                        color = TextSubtle,
                        fontSize = 10.sp
                    )
                }

                Spacer(modifier = Modifier.height(2.dp))

                Text(
                    text = alert.message,
                    color = TextMuted,
                    fontSize = 12.sp
                )
            }
        }
    }
}
