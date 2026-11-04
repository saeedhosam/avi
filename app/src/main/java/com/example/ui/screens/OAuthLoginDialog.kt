package com.example.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.clickable
import com.example.data.preferences.ThemeMode
import com.example.model.UserAccount
import com.example.ui.theme.*

@Composable
fun OAuthLoginDialog(
    account: UserAccount,
    themeMode: ThemeMode = ThemeMode.SYSTEM,
    onThemeModeChange: (ThemeMode) -> Unit = {},
    onDismiss: () -> Unit,
    onSignIn: (String) -> Unit,
    onSignOut: () -> Unit,
    onToggleOffline: () -> Unit,
    onRefreshSync: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Security,
                    contentDescription = null,
                    tint = RadarCyan
                )
                Text(
                    text = "Aviation Account & Sync",
                    color = TextWhite,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                // Profile Card
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .border(1.dp, InstrumentBorder, RoundedCornerShape(14.dp)),
                    color = InstrumentSurface
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(46.dp)
                                .clip(CircleShape)
                                .background(RadarCyan.copy(alpha = 0.2f))
                                .border(1.5.dp, RadarCyan, CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = account.avatarInitial,
                                color = RadarCyan,
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Black
                            )
                        }

                        Column(modifier = Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(
                                    text = account.name,
                                    color = TextWhite,
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.Bold
                                )
                                if (account.isSignedIn) {
                                    Icon(
                                        imageVector = Icons.Default.Verified,
                                        contentDescription = "Verified",
                                        tint = StatusLanded,
                                        modifier = Modifier.size(16.dp)
                                    )
                                }
                            }
                            Text(
                                text = account.email,
                                color = TextMuted,
                                fontSize = 12.sp
                            )
                        }
                    }
                }

                // Offline Caching & Room Persistence Status
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .border(1.dp, InstrumentBorder, RoundedCornerShape(12.dp)),
                    color = InstrumentSurface
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text(
                                    text = "Offline Flight Caching",
                                    color = TextWhite,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                                Text(
                                    text = "Room SQLite Database Active",
                                    color = StatusLanded,
                                    fontSize = 11.sp
                                )
                            }
                            Switch(
                                checked = account.isOfflineMode,
                                onCheckedChange = { onToggleOffline() },
                                colors = SwitchDefaults.colors(
                                    checkedThumbColor = StatusDelayed,
                                    checkedTrackColor = StatusDelayed.copy(alpha = 0.4f),
                                    uncheckedThumbColor = RadarCyan,
                                    uncheckedTrackColor = InstrumentSurfaceElevated
                                )
                            )
                        }

                        Spacer(modifier = Modifier.height(6.dp))

                        Text(
                            text = if (account.isOfflineMode) {
                                "✈️ Airplane Mode active. Browsing flights and saved watchlists from local Room database without internet."
                            } else {
                                "☁️ Connected to live aviation feeds. All queries automatically cached locally."
                            },
                            color = TextSubtle,
                            fontSize = 11.sp
                        )
                    }
                }

                // WorkManager Background Sync Service Status
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .border(1.dp, InstrumentBorder, RoundedCornerShape(12.dp)),
                    color = InstrumentSurfaceElevated
                ) {
                    Column(
                        modifier = Modifier.padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
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
                                    imageVector = Icons.Default.CloudSync,
                                    contentDescription = null,
                                    tint = RadarCyan,
                                    modifier = Modifier.size(16.dp)
                                )
                                Text(
                                    text = "WorkManager Sync Service",
                                    color = TextWhite,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }

                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = StatusLanded.copy(alpha = 0.15f),
                                border = androidx.compose.foundation.BorderStroke(0.6.dp, StatusLanded.copy(alpha = 0.5f))
                            ) {
                                Text(
                                    text = "ACTIVE",
                                    color = StatusLanded,
                                    fontSize = 9.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                            }
                        }

                        Text(
                            text = "Auto-refreshes Room SQLite database cache whenever network connectivity is restored (NetworkType.CONNECTED constraint).",
                            color = TextMuted,
                            fontSize = 11.sp
                        )

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Last Sync: ${account.lastSyncTime}",
                                color = TextSubtle,
                                fontSize = 10.sp
                            )

                            OutlinedButton(
                                onClick = onRefreshSync,
                                modifier = Modifier
                                    .height(30.dp)
                                    .testTag("trigger_workmanager_sync_btn"),
                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp),
                                colors = ButtonDefaults.outlinedButtonColors(contentColor = RadarCyan),
                                border = androidx.compose.foundation.BorderStroke(0.8.dp, RadarCyan.copy(alpha = 0.5f))
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Sync,
                                    contentDescription = null,
                                    modifier = Modifier.size(12.dp)
                                )
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("Sync Now", fontSize = 10.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }

                // Global Theme Selection Section
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .border(1.dp, InstrumentBorder, RoundedCornerShape(12.dp)),
                    color = InstrumentSurface
                ) {
                    Column(
                        modifier = Modifier.padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
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
                                    imageVector = when (themeMode) {
                                        ThemeMode.SYSTEM -> Icons.Default.BrightnessAuto
                                        ThemeMode.LIGHT -> Icons.Default.LightMode
                                        ThemeMode.DARK -> Icons.Default.DarkMode
                                    },
                                    contentDescription = null,
                                    tint = RadarCyan,
                                    modifier = Modifier.size(18.dp)
                                )
                                Text(
                                    text = "App Theme Mode",
                                    color = TextWhite,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }

                            Text(
                                text = themeMode.title,
                                color = RadarCyan,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }

                        // 3 Option Buttons: System (Auto), Light, Dark
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            ThemeMode.values().forEach { mode ->
                                val isSelected = themeMode == mode
                                Surface(
                                    modifier = Modifier
                                        .weight(1f)
                                        .clip(RoundedCornerShape(8.dp))
                                        .border(
                                            width = if (isSelected) 1.5.dp else 1.dp,
                                            color = if (isSelected) RadarCyan else InstrumentBorder,
                                            shape = RoundedCornerShape(8.dp)
                                        )
                                        .clickable { onThemeModeChange(mode) }
                                        .padding(vertical = 8.dp)
                                        .testTag("theme_btn_${mode.name.lowercase()}"),
                                    color = if (isSelected) InstrumentSurfaceElevated else CockpitDark
                                ) {
                                    Column(
                                        horizontalAlignment = Alignment.CenterHorizontally,
                                        verticalArrangement = Arrangement.spacedBy(3.dp)
                                    ) {
                                        Icon(
                                            imageVector = when (mode) {
                                                ThemeMode.SYSTEM -> Icons.Default.BrightnessAuto
                                                ThemeMode.LIGHT -> Icons.Default.LightMode
                                                ThemeMode.DARK -> Icons.Default.DarkMode
                                            },
                                            contentDescription = mode.title,
                                            tint = if (isSelected) RadarCyan else TextMuted,
                                            modifier = Modifier.size(16.dp)
                                        )
                                        Text(
                                            text = when (mode) {
                                                ThemeMode.SYSTEM -> "System"
                                                ThemeMode.LIGHT -> "Light"
                                                ThemeMode.DARK -> "Dark"
                                            },
                                            color = if (isSelected) TextWhite else TextMuted,
                                            fontSize = 11.sp,
                                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                                        )
                                    }
                                }
                            }
                        }

                        Text(
                            text = when (themeMode) {
                                ThemeMode.SYSTEM -> "⚡ Automatically adjusts theme based on system device preferences."
                                ThemeMode.LIGHT -> "☀️ Daytime high-visibility theme with crisp contrast."
                                ThemeMode.DARK -> "🌙 Aviation night cockpit theme with deep space radar palette."
                            },
                            color = TextSubtle,
                            fontSize = 11.sp
                        )
                    }
                }

                // Cloud Sync Status
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Status: ${account.lastSyncTime}",
                        color = TextMuted,
                        fontSize = 11.sp
                    )

                    TextButton(onClick = onRefreshSync) {
                        Icon(Icons.Default.Sync, null, modifier = Modifier.size(14.dp), tint = RadarCyan)
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Sync Now", color = RadarCyan, fontSize = 12.sp)
                    }
                }

                HorizontalDivider(color = InstrumentBorder)

                // OAuth Actions
                if (account.isSignedIn) {
                    OutlinedButton(
                        onClick = onSignOut,
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("sign_out_btn"),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = StatusCancelled),
                        border = androidx.compose.foundation.BorderStroke(1.dp, StatusCancelled.copy(alpha = 0.6f))
                    ) {
                        Icon(Icons.Default.Logout, null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Sign Out to Guest Mode")
                    }
                } else {
                    Button(
                        onClick = { onSignIn("Google OAuth SSO") },
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("oauth_google_signin_btn"),
                        colors = ButtonDefaults.buttonColors(containerColor = RadarCyan, contentColor = DeepSpace)
                    ) {
                        Icon(Icons.Default.Lock, null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Sign in with Google OAuth", fontWeight = FontWeight.Bold)
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = onDismiss,
                modifier = Modifier.testTag("close_account_dialog_btn")
            ) {
                Text("Done", color = RadarCyan)
            }
        },
        containerColor = CockpitDark,
        modifier = Modifier.testTag("account_dialog")
    )
}
