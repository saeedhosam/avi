package com.example.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.model.AlertType
import com.example.model.Flight
import com.example.ui.components.FlightCard
import com.example.ui.theme.*
import com.example.ui.viewmodel.FlightViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FavoritesScreen(
    viewModel: FlightViewModel,
    onFlightSelected: (Flight) -> Unit,
    modifier: Modifier = Modifier
) {
    val favorites by viewModel.favoriteFlights.collectAsState()
    var flightToShare by remember { mutableStateOf<Flight?>(null) }

    Scaffold(
        modifier = modifier.testTag("favorites_screen"),
        containerColor = DeepSpace,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "Saved Flight Watchlist",
                            color = TextWhite,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "${favorites.size} Active Watchlists · Offline Cached",
                            color = RadarCyan,
                            fontSize = 11.sp
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = CockpitDark)
            )
        }
    ) { innerPadding ->
        if (favorites.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .padding(24.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        imageVector = Icons.Default.FavoriteBorder,
                        contentDescription = "No Favorites",
                        tint = TextSubtle,
                        modifier = Modifier.size(64.dp)
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = "Your Watchlist is Empty",
                        color = TextWhite,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = "Tap the heart icon on any flight to save it. You'll receive real-time notifications for gate changes, boarding calls, and delay alerts even when offline.",
                        color = TextMuted,
                        fontSize = 13.sp,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center
                    )
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                item {
                    // Watchlist Info Banner
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .border(1.dp, InstrumentBorder, RoundedCornerShape(14.dp)),
                        colors = CardDefaults.cardColors(containerColor = CockpitDark)
                    ) {
                        Row(
                            modifier = Modifier.padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Icon(Icons.Default.NotificationsActive, null, tint = RadarCyan)
                            Column {
                                Text(
                                    text = "Live Alerts Active",
                                    color = TextWhite,
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = "Monitoring gate assignments, ATC flow delays, and boarding milestones.",
                                    color = TextMuted,
                                    fontSize = 12.sp
                                )
                            }
                        }
                    }
                }

                items(favorites, key = { it.id }) { flight ->
                    Column {
                        FlightCard(
                            flight = flight,
                            onClick = { onFlightSelected(flight) },
                            onToggleFavorite = { viewModel.toggleFavorite(flight.flightNumber) },
                            onToggleTrack = { viewModel.toggleTrackFlight(flight) }
                        )

                        // Quick trigger simulation bar under each favorite card
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 6.dp, start = 8.dp, end = 8.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Test Alerts:",
                                color = TextSubtle,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                SuggestionChip(
                                    onClick = { viewModel.simulateAlert(flight.flightNumber, AlertType.GATE_CHANGE) },
                                    label = { Text("Gate", fontSize = 10.sp) },
                                    colors = SuggestionChipDefaults.suggestionChipColors(
                                        containerColor = InstrumentSurface,
                                        labelColor = RadarCyan
                                    )
                                )
                                SuggestionChip(
                                    onClick = { viewModel.simulateAlert(flight.flightNumber, AlertType.DELAY) },
                                    label = { Text("Delay", fontSize = 10.sp) },
                                    colors = SuggestionChipDefaults.suggestionChipColors(
                                        containerColor = InstrumentSurface,
                                        labelColor = StatusDelayed
                                    )
                                )
                                SuggestionChip(
                                    onClick = { viewModel.simulateAlert(flight.flightNumber, AlertType.BOARDING) },
                                    label = { Text("Boarding", fontSize = 10.sp) },
                                    colors = SuggestionChipDefaults.suggestionChipColors(
                                        containerColor = InstrumentSurface,
                                        labelColor = StatusBoarding
                                    )
                                )
                                SuggestionChip(
                                    onClick = { flightToShare = flight },
                                    label = { Text("Share", fontSize = 10.sp, fontWeight = FontWeight.Bold) },
                                    icon = {
                                        Icon(Icons.Default.Share, null, tint = RadarCyan, modifier = Modifier.size(12.dp))
                                    },
                                    colors = SuggestionChipDefaults.suggestionChipColors(
                                        containerColor = InstrumentSurfaceElevated,
                                        labelColor = RadarCyan
                                    )
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    if (flightToShare != null) {
        com.example.ui.components.ShareFlightDialog(
            flight = flightToShare!!,
            onDismiss = { flightToShare = null }
        )
    }
}
