package com.example.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Flight
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.model.Flight
import com.example.model.FlightStatus
import com.example.ui.components.RadarMapView
import com.example.ui.components.StatusBadge
import com.example.ui.theme.*
import com.example.ui.viewmodel.FlightViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LiveRadarScreen(
    viewModel: FlightViewModel,
    onFlightSelected: (Flight) -> Unit,
    modifier: Modifier = Modifier
) {
    val flights by viewModel.flights.collectAsState()
    val activeFlights = remember(flights) {
        flights.filter { it.status == FlightStatus.DEPARTED || it.status == FlightStatus.BOARDING || it.status == FlightStatus.DELAYED }
    }

    var selectedRadarFlight by remember {
        mutableStateOf(activeFlights.firstOrNull() ?: flights.first())
    }

    Scaffold(
        modifier = modifier.testTag("live_radar_screen"),
        containerColor = DeepSpace,
        topBar = {
            TopAppBar(
                title = {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            text = "Live Tactical Radar",
                            color = TextWhite,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = RadarCyan.copy(alpha = 0.15f),
                            border = androidx.compose.foundation.BorderStroke(1.dp, RadarCyan.copy(alpha = 0.5f))
                        ) {
                            Text(
                                text = "AIRBORNE",
                                color = RadarCyan,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = CockpitDark)
            )
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            // Main Map View (takes up majority of screen)
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 8.dp)
            ) {
                RadarMapView(
                    flight = selectedRadarFlight,
                    modifier = Modifier.fillMaxSize(),
                    isExpandedMap = true
                )
            }

            // Carousel of Airborne Flights to inspect
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(CockpitDark)
                    .padding(vertical = 10.dp)
            ) {
                Text(
                    text = "SELECT AIRBORNE TRAFFIC (${activeFlights.size})",
                    color = TextSubtle,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.8.sp,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
                )

                LazyRow(
                    modifier = Modifier.fillMaxWidth(),
                    contentPadding = PaddingValues(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(activeFlights, key = { it.id }) { flight ->
                        val isSelected = flight.id == selectedRadarFlight.id
                        Surface(
                            modifier = Modifier
                                .width(200.dp)
                                .clip(RoundedCornerShape(14.dp))
                                .border(
                                    1.dp,
                                    if (isSelected) RadarCyan else InstrumentBorder,
                                    RoundedCornerShape(14.dp)
                                )
                                .clickable {
                                    selectedRadarFlight = flight
                                }
                                .testTag("radar_carousel_${flight.id}"),
                            color = if (isSelected) InstrumentSurfaceElevated else InstrumentSurface
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = flight.flightNumber,
                                        color = if (isSelected) RadarCyan else TextWhite,
                                        fontSize = 14.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                    StatusBadge(status = flight.status, delayMinutes = flight.delayMinutes)
                                }

                                Spacer(modifier = Modifier.height(4.dp))

                                Text(
                                    text = "${flight.origin.code} → ${flight.destination.code}",
                                    color = TextWhite,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.SemiBold
                                )

                                Spacer(modifier = Modifier.height(2.dp))

                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text(
                                        text = "${flight.telemetry.altitudeFeet} ft",
                                        color = TextMuted,
                                        fontSize = 11.sp
                                    )
                                    Text(
                                        text = "${flight.telemetry.groundSpeedKnots} kts",
                                        color = AeroBlue,
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Medium
                                    )
                                }

                                Spacer(modifier = Modifier.height(6.dp))

                                TextButton(
                                    onClick = { onFlightSelected(flight) },
                                    modifier = Modifier.fillMaxWidth().height(28.dp),
                                    contentPadding = PaddingValues(0.dp)
                                ) {
                                    Text("Open Flight Dossier →", color = RadarCyan, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
