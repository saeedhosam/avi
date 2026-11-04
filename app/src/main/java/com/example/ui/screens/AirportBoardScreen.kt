package com.example.ui.screens

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
import androidx.compose.material.icons.filled.FlightLand
import androidx.compose.material.icons.filled.FlightTakeoff
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.data.MockFlightData
import com.example.model.Flight
import com.example.model.FlightStatus
import com.example.ui.components.StatusBadge
import com.example.ui.theme.*
import com.example.ui.viewmodel.FlightViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AirportBoardScreen(
    viewModel: FlightViewModel,
    onFlightSelected: (Flight) -> Unit,
    modifier: Modifier = Modifier
) {
    val selectedAirportCode by viewModel.selectedAirportCode.collectAsState()
    val isDeparture by viewModel.isDepartureBoard.collectAsState()
    val airlineFilter by viewModel.airportAirlineFilter.collectAsState()
    val flights by viewModel.airportBoardFlights.collectAsState()

    val currentAirport = remember(selectedAirportCode) {
        MockFlightData.getAirport(selectedAirportCode)
    }

    Scaffold(
        modifier = modifier.testTag("airport_board_screen"),
        containerColor = DeepSpace,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "Airport Flight Boards",
                            color = TextWhite,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "${currentAirport.code} · ${currentAirport.name}",
                            color = RadarCyan,
                            fontSize = 11.sp
                        )
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
            // 1. Airport Hub Selection Row
            LazyRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(CockpitDark)
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(MockFlightData.airports) { airport ->
                    val isSelected = airport.code == selectedAirportCode
                    Surface(
                        modifier = Modifier
                            .clip(RoundedCornerShape(12.dp))
                            .border(
                                1.dp,
                                if (isSelected) RadarCyan else InstrumentBorder,
                                RoundedCornerShape(12.dp)
                            )
                            .clickable { viewModel.selectAirport(airport.code) }
                            .testTag("airport_chip_${airport.code}"),
                        color = if (isSelected) RadarCyan.copy(alpha = 0.2f) else InstrumentSurface
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.LocationOn,
                                contentDescription = null,
                                tint = if (isSelected) RadarCyan else TextMuted,
                                modifier = Modifier.size(14.dp)
                            )
                            Text(
                                text = airport.code,
                                color = if (isSelected) RadarCyan else TextWhite,
                                fontWeight = FontWeight.Bold,
                                fontSize = 13.sp
                            )
                            Text(
                                text = airport.city,
                                color = TextMuted,
                                fontSize = 11.sp
                            )
                        }
                    }
                }
            }

            // 2. Departures vs Arrivals Tabs
            TabRow(
                selectedTabIndex = if (isDeparture) 0 else 1,
                containerColor = CockpitDark,
                contentColor = RadarCyan,
                divider = { HorizontalDivider(color = InstrumentBorder) }
            ) {
                Tab(
                    selected = isDeparture,
                    onClick = { viewModel.setAirportBoardDirection(true) },
                    text = {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Icon(Icons.Default.FlightTakeoff, null, modifier = Modifier.size(18.dp))
                            Text("DEPARTURES", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        }
                    },
                    modifier = Modifier.testTag("tab_departures")
                )
                Tab(
                    selected = !isDeparture,
                    onClick = { viewModel.setAirportBoardDirection(false) },
                    text = {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Icon(Icons.Default.FlightLand, null, modifier = Modifier.size(18.dp))
                            Text("ARRIVALS", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        }
                    },
                    modifier = Modifier.testTag("tab_arrivals")
                )
            }

            // 3. Airline Filter Row
            val airlines = listOf("All", "American Airlines", "British Airways", "Delta Air Lines", "Emirates", "United Airlines", "Air France")
            LazyRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(airlines) { airline ->
                    val isSelected = airline == airlineFilter
                    FilterChip(
                        selected = isSelected,
                        onClick = { viewModel.setAirportAirlineFilter(airline) },
                        label = { Text(if (airline == "All") "All Airlines" else airline) },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = InstrumentSurfaceElevated,
                            selectedLabelColor = RadarCyan,
                            containerColor = CockpitDark,
                            labelColor = TextMuted
                        ),
                        border = FilterChipDefaults.filterChipBorder(
                            enabled = true,
                            selected = isSelected,
                            borderColor = InstrumentBorder,
                            selectedBorderColor = RadarCyan
                        )
                    )
                }
            }

            // 4. Airport Flight Display Board Header
            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = InstrumentSurface
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("TIME / FLIGHT", color = TextSubtle, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1.2f))
                    Text(if (isDeparture) "DESTINATION" else "ORIGIN", color = TextSubtle, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1.3f))
                    Text("GATE", color = TextSubtle, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(0.7f))
                    Text("STATUS", color = TextSubtle, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                }
            }

            // 5. Board List
            if (flights.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(24.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Default.FlightTakeoff, null, tint = TextSubtle, modifier = Modifier.size(48.dp))
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "No scheduled ${if (isDeparture) "departures" else "arrivals"} found",
                            color = TextWhite,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "Try switching to another airport (e.g. JFK, LHR, SFO)",
                            color = TextMuted,
                            fontSize = 12.sp
                        )
                    }
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(bottom = 16.dp)
                ) {
                    items(flights, key = { it.id }) { flight ->
                        AirportBoardRow(
                            flight = flight,
                            isDeparture = isDeparture,
                            onClick = { onFlightSelected(flight) }
                        )
                        HorizontalDivider(color = InstrumentBorder.copy(alpha = 0.4f), thickness = 0.5.dp)
                    }
                }
            }
        }
    }
}

@Composable
private fun AirportBoardRow(
    flight: Flight,
    isDeparture: Boolean,
    onClick: () -> Unit
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .testTag("board_row_${flight.id}"),
        color = CockpitDark
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Time / Flight
            Column(modifier = Modifier.weight(1.2f)) {
                Text(
                    text = if (isDeparture) flight.departureTimeEstimated else flight.arrivalTimeEstimated,
                    color = RadarCyan,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = flight.flightNumber,
                    color = TextWhite,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    text = flight.airlineCode,
                    color = TextSubtle,
                    fontSize = 10.sp
                )
            }

            // Destination / Origin
            val otherAirport = if (isDeparture) flight.destination else flight.origin
            Column(modifier = Modifier.weight(1.3f)) {
                Text(
                    text = otherAirport.code,
                    color = TextWhite,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Black
                )
                Text(
                    text = otherAirport.city,
                    color = TextMuted,
                    fontSize = 11.sp,
                    maxLines = 1
                )
            }

            // Gate / Terminal
            Column(modifier = Modifier.weight(0.7f)) {
                Text(
                    text = if (isDeparture) flight.gateDeparture else flight.gateArrival,
                    color = TextWhite,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1
                )
                Text(
                    text = "T${if (isDeparture) flight.terminalDeparture else flight.terminalArrival}",
                    color = TextMuted,
                    fontSize = 10.sp
                )
            }

            // Status Badge
            Box(modifier = Modifier.weight(1f)) {
                StatusBadge(status = flight.status, delayMinutes = flight.delayMinutes)
            }
        }
    }
}
