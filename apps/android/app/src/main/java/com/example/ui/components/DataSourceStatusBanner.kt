package com.example.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.data.remote.ApiConfig
import com.example.data.remote.DataSourceMode
import com.example.ui.theme.*

@Composable
fun DataSourceStatusBanner(
    mode: DataSourceMode,
    isLiveLoading: Boolean = false,
    onRefreshClick: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    var showDetailsDialog by remember { mutableStateOf(false) }

    val accentColor: Color = when (mode) {
        DataSourceMode.LIVE_DATA -> StatusLanded
        DataSourceMode.OFFLINE_ROOM_CACHE -> RadarCyan
        DataSourceMode.QUOTA_FALLBACK -> StatusDelayed
        DataSourceMode.DEMO_CACHE_NO_KEY -> StatusDelayed
    }

    val compactStatusSummary = when (mode) {
        DataSourceMode.LIVE_DATA -> "Live Flights, FIDS & Weather"
        DataSourceMode.OFFLINE_ROOM_CACHE -> "Offline SQLite Cache Active"
        DataSourceMode.QUOTA_FALLBACK -> "Room Cache + Live Weather"
        DataSourceMode.DEMO_CACHE_NO_KEY -> "Cached Flights + Live Weather"
    }

    Surface(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .border(0.8.dp, accentColor.copy(alpha = 0.45f), RoundedCornerShape(10.dp))
            .clickable { showDetailsDialog = true }
            .testTag("data_source_status_banner"),
        color = InstrumentSurface
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 10.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(
                modifier = Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                if (isLiveLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(12.dp),
                        color = RadarCyan,
                        strokeWidth = 1.8.dp
                    )
                } else {
                    Box(
                        modifier = Modifier
                            .size(7.dp)
                            .clip(CircleShape)
                            .background(accentColor)
                    )
                }

                Text(
                    text = if (isLiveLoading) "SYNCING LIVE TELEMETRY..." else mode.badgeLabel,
                    color = accentColor,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.ExtraBold,
                    letterSpacing = 0.4.sp,
                    maxLines = 1,
                    softWrap = false
                )

                Text(
                    text = "· $compactStatusSummary",
                    color = TextMuted,
                    fontSize = 11.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )

                Icon(
                    imageVector = Icons.Default.Info,
                    contentDescription = "Data Source Details",
                    tint = TextSubtle,
                    modifier = Modifier.size(13.dp)
                )
            }

            Spacer(modifier = Modifier.width(4.dp))

            IconButton(
                onClick = onRefreshClick,
                modifier = Modifier
                    .size(26.dp)
                    .testTag("data_source_refresh_btn")
            ) {
                Icon(
                    imageVector = Icons.Default.Refresh,
                    contentDescription = "Refresh Live Telemetry",
                    tint = RadarCyan,
                    modifier = Modifier.size(15.dp)
                )
            }
        }
    }

    if (showDetailsDialog) {
        AlertDialog(
            onDismissRequest = { showDetailsDialog = false },
            containerColor = CockpitDark,
            title = {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.CellTower,
                        contentDescription = null,
                        tint = accentColor
                    )
                    Text(
                        text = "Telemetry & API Diagnostics",
                        color = TextWhite,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        text = mode.title,
                        color = accentColor,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = mode.subtitle,
                        color = TextMuted,
                        fontSize = 12.sp
                    )

                    HorizontalDivider(color = InstrumentBorder)

                    DiagnosticItemRow(
                        title = "Avi Gateway",
                        status = if (ApiConfig.isGatewayConfigured) "CONNECTED" else "SAVED DATA",
                        isActive = ApiConfig.isGatewayConfigured,
                        detail = "Live lookups route through the Avi gateway"
                    )

                    DiagnosticItemRow(
                        title = "Open-Meteo Aviation Weather",
                        status = "LIVE · ZERO-KEY",
                        isActive = true,
                        detail = "Real-time VFR/IFR rules, wind & arrival forecasts"
                    )

                    DiagnosticItemRow(
                        title = "Room SQLite + WorkManager",
                        status = "ACTIVE (SSOT)",
                        isActive = true,
                        detail = "Diff-based background alerts & offline cache"
                    )

                    AnimatedVisibility(visible = !ApiConfig.hasValidAeroDataBoxKey()) {
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(8.dp))
                                .border(0.8.dp, StatusDelayed.copy(alpha = 0.4f), RoundedCornerShape(8.dp)),
                            color = StatusDelayed.copy(alpha = 0.1f)
                        ) {
                            Text(
                                text = "Live lookups route through the Avi gateway and pause when the shared live-data budget is exhausted — saved flights and live weather keep working.",
                                color = TextWhite,
                                fontSize = 11.sp,
                                modifier = Modifier.padding(10.dp)
                            )
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showDetailsDialog = false }) {
                    Text("Close", color = RadarCyan, fontWeight = FontWeight.Bold)
                }
            }
        )
    }
}

@Composable
private fun DiagnosticItemRow(
    title: String,
    status: String,
    isActive: Boolean,
    detail: String
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                color = TextWhite,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = detail,
                color = TextSubtle,
                fontSize = 10.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        Spacer(modifier = Modifier.width(8.dp))
        Surface(
            shape = RoundedCornerShape(6.dp),
            color = (if (isActive) StatusLanded else StatusDelayed).copy(alpha = 0.15f)
        ) {
            Text(
                text = status,
                color = if (isActive) StatusLanded else StatusDelayed,
                fontSize = 9.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                softWrap = false,
                modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp)
            )
        }
    }
}
