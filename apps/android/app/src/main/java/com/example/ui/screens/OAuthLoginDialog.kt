package com.example.ui.screens

import android.app.Activity
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.model.UserAccount
import com.example.ui.theme.*
import com.example.util.GoogleAuthManager
import kotlinx.coroutines.launch

@Composable
fun OAuthLoginDialog(
    account: UserAccount,
    onDismiss: () -> Unit,
    onSignIn: (String) -> Unit,
    onSignOut: () -> Unit,
    onToggleOffline: () -> Unit,
    onRefreshSync: () -> Unit
) {
    val context = LocalContext.current
    val activity = context as? Activity
    val coroutineScope = rememberCoroutineScope()
    var isSigningIn by remember { mutableStateOf(false) }
    var authError by remember { mutableStateOf<String?>(null) }

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
                    text = "Aviation Account & Settings",
                    color = TextWhite,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp)
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
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(44.dp)
                                .clip(CircleShape)
                                .background(RadarCyan.copy(alpha = 0.2f))
                                .border(1.5.dp, RadarCyan, CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = account.avatarInitial,
                                color = RadarCyan,
                                fontSize = 17.sp,
                                fontWeight = FontWeight.Black
                            )
                        }

                        Column(modifier = Modifier.weight(1f)) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Text(
                                    text = account.name,
                                    color = TextWhite,
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Bold,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                if (account.isSignedIn) {
                                    Icon(
                                        imageVector = Icons.Default.Verified,
                                        contentDescription = "Verified",
                                        tint = StatusLanded,
                                        modifier = Modifier.size(15.dp)
                                    )
                                }
                            }
                            Text(
                                text = if (account.isSignedIn) account.email else "Local Guest Session · Sign in below",
                                color = TextMuted,
                                fontSize = 11.sp,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                }

                // Offline Caching & WorkManager Sync Consolidated Card
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .border(1.dp, InstrumentBorder, RoundedCornerShape(12.dp)),
                    color = InstrumentSurface
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
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = "Offline Room SQLite Mode",
                                    color = TextWhite,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 1
                                )
                                Text(
                                    text = if (account.isOfflineMode) "Airplane / Local Cache Active" else "Live Feed + Local Room Cache",
                                    color = if (account.isOfflineMode) StatusDelayed else StatusLanded,
                                    fontSize = 11.sp,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
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

                        HorizontalDivider(color = InstrumentBorder.copy(alpha = 0.6f))

                        // Single consolidated WorkManager Sync Row
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = "WorkManager Background Sync",
                                    color = TextWhite,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 1
                                )
                                Text(
                                    text = "Last Sync: ${account.lastSyncTime}",
                                    color = TextSubtle,
                                    fontSize = 10.sp,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }

                            OutlinedButton(
                                onClick = onRefreshSync,
                                modifier = Modifier
                                    .height(30.dp)
                                    .testTag("trigger_workmanager_sync_btn"),
                                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 2.dp),
                                colors = ButtonDefaults.outlinedButtonColors(contentColor = RadarCyan),
                                border = androidx.compose.foundation.BorderStroke(0.8.dp, RadarCyan.copy(alpha = 0.5f))
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Sync,
                                    contentDescription = null,
                                    modifier = Modifier.size(12.dp)
                                )
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("Sync Now", fontSize = 10.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                            }
                        }
                    }
                }

                // Google Sign-In & Supabase sync section
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = InstrumentSurface,
                    border = androidx.compose.foundation.BorderStroke(1.dp, InstrumentBorder),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "CLOUD BACKUP",
                                color = RadarCyan,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                maxLines = 1
                            )
                            Surface(
                                shape = RoundedCornerShape(4.dp),
                                color = if (account.isSignedIn) StatusLanded.copy(alpha = 0.2f) else StatusDelayed.copy(alpha = 0.2f),
                                border = androidx.compose.foundation.BorderStroke(0.6.dp, if (account.isSignedIn) StatusLanded else StatusDelayed)
                            ) {
                                Text(
                                    text = if (account.isSignedIn) "FIRESTORE CONNECTED" else "LOCAL ONLY",
                                    color = if (account.isSignedIn) StatusLanded else StatusDelayed,
                                    fontSize = 9.sp,
                                    fontWeight = FontWeight.Bold,
                                    maxLines = 1,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                            }
                        }
                        Text(
                            text = if (account.isSignedIn) {
                                "Watchlists, flight notes, and alerts are synced to Supabase."
                            } else {
                                "Sign in with Google to back up watchlists and flight notes across devices."
                            },
                            color = TextMuted,
                            fontSize = 11.sp
                        )
                    }
                }

                if (authError != null) {
                    Text(
                        text = "Sign-In notice: $authError",
                        color = StatusDelayed,
                        fontSize = 11.sp
                    )
                }

                // Sign-In / Sign-Out Actions
                if (account.isSignedIn) {
                    OutlinedButton(
                        onClick = {
                            coroutineScope.launch { GoogleAuthManager.signOut() }
                            onSignOut()
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("sign_out_btn"),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = StatusCancelled),
                        border = androidx.compose.foundation.BorderStroke(1.dp, StatusCancelled.copy(alpha = 0.6f))
                    ) {
                        Icon(Icons.AutoMirrored.Filled.Logout, null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Sign Out of Google Account", maxLines = 1)
                    }
                } else {
                    Button(
                        onClick = {
                            if (activity != null) {
                                isSigningIn = true
                                authError = null
                                coroutineScope.launch {
                                    val res = GoogleAuthManager.signInWithGoogle(activity)
                                    isSigningIn = false
                                    if (res.isFailure) {
                                        val err = res.exceptionOrNull()
                                        if (err !is androidx.credentials.exceptions.GetCredentialCancellationException) {
                                            authError = err?.localizedMessage ?: "Sign-in was not completed"
                                        }
                                    }
                                }
                            } else {
                                onSignIn("Google Account")
                            }
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("oauth_google_signin_btn"),
                        colors = ButtonDefaults.buttonColors(containerColor = RadarCyan, contentColor = DeepSpace)
                    ) {
                        if (isSigningIn) {
                            CircularProgressIndicator(
                                color = DeepSpace,
                                strokeWidth = 2.dp,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Connecting with Google...", fontWeight = FontWeight.Bold, maxLines = 1)
                        } else {
                            Icon(Icons.Default.AccountCircle, null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Sign in with Google", fontWeight = FontWeight.Bold, maxLines = 1)
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = onDismiss,
                modifier = Modifier.testTag("close_account_dialog_btn")
            ) {
                Text("Done", color = RadarCyan, fontWeight = FontWeight.Bold)
            }
        },
        containerColor = CockpitDark,
        modifier = Modifier.testTag("account_dialog")
    )
}
