package com.example.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.model.FlightTimelineEvent
import com.example.ui.theme.*

@Composable
fun FlightTimelineView(
    events: List<FlightTimelineEvent>,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .border(1.dp, InstrumentBorder, RoundedCornerShape(18.dp))
            .testTag("flight_timeline_card"),
        colors = CardDefaults.cardColors(containerColor = CockpitDark)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Text(
                text = "Flight Event Timeline",
                color = TextWhite,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = "Real-time gate and airborne progression",
                color = TextMuted,
                fontSize = 12.sp
            )

            Spacer(modifier = Modifier.height(16.dp))

            events.forEachIndexed { index, event ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.Top
                ) {
                    // Left timeline line and marker
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.width(32.dp)
                    ) {
                        // Marker circle
                        Box(
                            modifier = Modifier
                                .size(20.dp)
                                .clip(CircleShape)
                                .background(
                                    when {
                                        event.isCurrent -> RadarCyan
                                        event.isCompleted -> StatusLanded
                                        else -> InstrumentSurfaceElevated
                                    }
                                )
                                .border(
                                    1.dp,
                                    if (event.isCurrent) TextWhite else InstrumentBorder,
                                    CircleShape
                                ),
                            contentAlignment = Alignment.Center
                        ) {
                            if (event.isCompleted && !event.isCurrent) {
                                Icon(
                                    imageVector = Icons.Default.Check,
                                    contentDescription = "Completed",
                                    tint = DeepSpace,
                                    modifier = Modifier.size(12.dp)
                                )
                            } else if (event.isCurrent) {
                                Box(
                                    modifier = Modifier
                                        .size(6.dp)
                                        .clip(CircleShape)
                                        .background(DeepSpace)
                                )
                            }
                        }

                        // Connecting line if not last
                        if (index < events.size - 1) {
                            Box(
                                modifier = Modifier
                                    .width(2.dp)
                                    .height(38.dp)
                                    .background(
                                        if (event.isCompleted) StatusLanded.copy(alpha = 0.5f)
                                        else InstrumentBorder
                                    )
                            )
                        }
                    }

                    Spacer(modifier = Modifier.width(12.dp))

                    // Event description and timestamp
                    Column(modifier = Modifier.weight(1f).padding(bottom = if (index < events.size - 1) 12.dp else 0.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = event.title,
                                color = if (event.isCurrent) RadarCyan else if (event.isCompleted) TextWhite else TextMuted,
                                fontSize = 14.sp,
                                fontWeight = if (event.isCurrent) FontWeight.Bold else FontWeight.SemiBold
                            )
                            Text(
                                text = event.time,
                                color = if (event.isCurrent) RadarCyan else TextMuted,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Medium
                            )
                        }

                        if (event.description.isNotBlank()) {
                            Text(
                                text = event.description,
                                color = TextSubtle,
                                fontSize = 12.sp,
                                modifier = Modifier.padding(top = 2.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}
