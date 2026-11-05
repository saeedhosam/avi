package com.example.ui.components

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.model.Flight
import com.example.ui.theme.*
import com.example.util.FlightShareHelper

@Composable
fun ShareFlightDialog(
    flight: Flight,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    var personalNote by remember { mutableStateOf("") }
    var isCopied by remember { mutableStateOf(false) }

    val summaryText = remember(flight, personalNote) {
        FlightShareHelper.generateFlightSummary(flight, personalNote)
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Share,
                    contentDescription = null,
                    tint = RadarCyan
                )
                Text(
                    text = "Share Flight Summary",
                    color = TextWhite,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold
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
                Text(
                    text = "Send real-time departure, gate, delay, and arrival updates to friends and family.",
                    color = TextMuted,
                    fontSize = 12.sp
                )

                // Optional personal note field
                OutlinedTextField(
                    value = personalNote,
                    onValueChange = {
                        personalNote = it
                        isCopied = false
                    },
                    label = { Text("Add a note (optional)") },
                    placeholder = { Text("e.g. Picking me up at Terminal 3?") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("share_personal_note_input"),
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = TextWhite,
                        unfocusedTextColor = TextWhite,
                        focusedBorderColor = RadarCyan,
                        unfocusedBorderColor = InstrumentBorder,
                        focusedLabelColor = RadarCyan,
                        unfocusedLabelColor = TextSubtle
                    )
                )

                // Live Summary Preview Box
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
                            Text(
                                text = "SUMMARY PREVIEW",
                                color = TextSubtle,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 0.5.sp
                            )
                            StatusBadge(status = flight.status, delayMinutes = flight.delayMinutes)
                        }

                        Spacer(modifier = Modifier.height(8.dp))

                        Text(
                            text = summaryText,
                            color = TextWhite,
                            fontSize = 11.5.sp,
                            lineHeight = 17.sp,
                            fontFamily = FontFamily.Monospace,
                            modifier = Modifier.testTag("share_summary_preview_text")
                        )
                    }
                }
            }
        },
        confirmButton = {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                // Copy button
                OutlinedButton(
                    onClick = {
                        FlightShareHelper.copyToClipboard(context, summaryText, "Flight ${flight.flightNumber}")
                        isCopied = true
                        Toast.makeText(context, "Flight summary copied to clipboard!", Toast.LENGTH_SHORT).show()
                    },
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = if (isCopied) StatusLanded else RadarCyan),
                    border = androidx.compose.foundation.BorderStroke(1.dp, if (isCopied) StatusLanded else RadarCyan),
                    modifier = Modifier.testTag("copy_summary_btn")
                ) {
                    Icon(
                        imageVector = if (isCopied) Icons.Default.Check else Icons.Default.ContentCopy,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(if (isCopied) "Copied!" else "Copy")
                }

                // Share via System Chooser (WhatsApp, Telegram, SMS, etc.)
                Button(
                    onClick = {
                        FlightShareHelper.shareFlight(context, flight, personalNote)
                        onDismiss()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = RadarCyan, contentColor = DeepSpace),
                    modifier = Modifier.testTag("share_via_apps_btn")
                ) {
                    Icon(
                        imageVector = Icons.Default.Share,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Share via Apps", fontWeight = FontWeight.Bold)
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel", color = TextMuted)
            }
        },
        containerColor = CockpitDark,
        modifier = Modifier.testTag("share_flight_dialog")
    )
}
