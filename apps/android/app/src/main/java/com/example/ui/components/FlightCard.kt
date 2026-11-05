package com.example.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.model.Flight
import com.example.model.FlightStatus
import com.example.ui.theme.*

@Composable
fun FlightCard(
    flight: Flight,
    onClick: () -> Unit,
    onToggleFavorite: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .border(1.dp, InstrumentBorder, RoundedCornerShape(18.dp))
            .clickable(onClick = onClick)
            .testTag("flight_card_${flight.id}"),
        colors = CardDefaults.cardColors(containerColor = CockpitDark),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            // Header: Airline badge, Flight Number, Status & Favorite button
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(InstrumentSurfaceElevated)
                            .border(1.dp, RadarCyan.copy(alpha = 0.3f), RoundedCornerShape(10.dp)),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = flight.airlineCode,
                            color = RadarCyan,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    Column {
                        Text(
                            text = flight.flightNumber,
                            color = TextWhite,
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = flight.airline,
                            color = TextMuted,
                            fontSize = 12.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    StatusBadge(status = flight.status, delayMinutes = flight.delayMinutes)

                    IconButton(
                        onClick = onToggleFavorite,
                        modifier = Modifier
                            .size(36.dp)
                            .testTag("favorite_btn_${flight.id}")
                    ) {
                        Icon(
                            imageVector = if (flight.isFavorite) Icons.Default.Bookmark else Icons.Default.BookmarkBorder,
                            contentDescription = if (flight.isFavorite) "Remove from watchlist" else "Add to watchlist",
                            tint = if (flight.isFavorite) RadarCyan else TextMuted
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Origin -> Destination Row
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Origin
                Column(
                    modifier = Modifier.weight(1f),
                    horizontalAlignment = Alignment.Start
                ) {
                    Text(
                        text = flight.origin.code,
                        color = TextWhite,
                        fontSize = 26.sp,
                        fontWeight = FontWeight.Black
                    )
                    Text(
                        text = flight.origin.city,
                        color = TextMuted,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = flight.departureTimeEstimated,
                        color = RadarCyan,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }

                // Flight path visual in middle
                Column(
                    modifier = Modifier
                        .weight(1.5f)
                        .padding(horizontal = 8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    // Aircraft model tag
                    Text(
                        text = flight.aircraft.model.take(15),
                        color = TextSubtle,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Normal,
                        maxLines = 1
                    )

                    Spacer(modifier = Modifier.height(4.dp))

                    // Progress Track with Plane Icon
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(24.dp),
                        contentAlignment = Alignment.CenterStart
                    ) {
                        // Track Line
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(2.dp)
                                .background(
                                    Brush.horizontalGradient(
                                        listOf(
                                            RadarCyan,
                                            if (flight.status == FlightStatus.DEPARTED) RadarCyan else InstrumentBorder,
                                            InstrumentBorder
                                        )
                                    )
                                )
                        )

                        // Plane position based on progress
                        val progress = when (flight.status) {
                            FlightStatus.LANDED -> 1.0f
                            FlightStatus.SCHEDULED -> 0.0f
                            FlightStatus.CANCELLED -> 0.0f
                            else -> flight.telemetry.progressPercent.coerceIn(0.05f, 0.95f)
                        }

                        Box(
                            modifier = Modifier
                                .fillMaxWidth(progress)
                                .wrapContentWidth(Alignment.End)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(20.dp)
                                    .clip(CircleShape)
                                    .background(RadarCyan),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Flight,
                                    contentDescription = "Flight",
                                    tint = DeepSpace,
                                    modifier = Modifier
                                        .size(12.dp)
                                        .rotate(90f)
                                )
                            }
                        }
                    }

                    // ETA / Note
                    if (flight.status == FlightStatus.DEPARTED) {
                        Text(
                            text = "${flight.telemetry.etaMinutesRemaining}m to arrival",
                            color = AeroBlue,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    } else if (flight.delayMinutes > 0) {
                        Text(
                            text = "+${flight.delayMinutes}m delay",
                            color = StatusDelayed,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }

                // Destination
                Column(
                    modifier = Modifier.weight(1f),
                    horizontalAlignment = Alignment.End
                ) {
                    Text(
                        text = flight.destination.code,
                        color = TextWhite,
                        fontSize = 26.sp,
                        fontWeight = FontWeight.Black
                    )
                    Text(
                        text = flight.destination.city,
                        color = TextMuted,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = flight.arrivalTimeEstimated,
                        color = TextWhite,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Destination Arrival Weather Planning Banner for Tracked Flights
            if (flight.isFavorite) {
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .border(0.6.dp, RadarCyan.copy(alpha = 0.35f), RoundedCornerShape(8.dp)),
                    color = InstrumentSurface
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(
                                imageVector = Icons.Default.WbSunny,
                                contentDescription = null,
                                tint = RadarCyan,
                                modifier = Modifier.size(13.dp)
                            )
                            Text(
                                text = "Arrival ${flight.destination.code}: ${flight.destination.weather.tempC}°C · ${flight.destination.weather.condition}",
                                color = TextWhite,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Medium,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }

                        Text(
                            text = "Forecast",
                            color = RadarCyan,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
                Spacer(modifier = Modifier.height(10.dp))
            }

            HorizontalDivider(color = InstrumentBorder.copy(alpha = 0.5f), thickness = 0.8.dp)
            Spacer(modifier = Modifier.height(10.dp))

            // Footer row: Gate, Terminal, Baggage Carousel
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.MeetingRoom,
                            contentDescription = "Gate",
                            tint = TextMuted,
                            modifier = Modifier.size(14.dp)
                        )
                        Text(
                            text = "T${flight.terminalDeparture} · ${flight.gateDeparture}",
                            color = TextWhite,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Luggage,
                            contentDescription = "Baggage",
                            tint = TextMuted,
                            modifier = Modifier.size(14.dp)
                        )
                        Text(
                            text = flight.baggageCarousel,
                            color = TextMuted,
                            fontSize = 12.sp
                        )
                    }
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text(
                        text = "Details",
                        color = RadarCyan,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                        contentDescription = "View Details",
                        tint = RadarCyan,
                        modifier = Modifier.size(14.dp)
                    )
                }
            }

            if (flight.customNotes.isNotBlank()) {
                Spacer(modifier = Modifier.height(8.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .background(InstrumentSurfaceElevated.copy(alpha = 0.5f))
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = "Note: ${flight.customNotes}",
                        color = AeroBlue,
                        fontSize = 11.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}
