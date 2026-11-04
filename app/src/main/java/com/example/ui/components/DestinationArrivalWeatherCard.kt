package com.example.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.model.DailyForecast
import com.example.model.DestinationArrivalForecast
import com.example.model.HourlyForecast
import com.example.ui.theme.*

@Composable
fun DestinationArrivalWeatherCard(
    forecast: DestinationArrivalForecast,
    modifier: Modifier = Modifier
) {
    var selectedTab by remember { mutableIntStateOf(0) } // 0: Hourly at Arrival, 1: 3-Day Outlook, 2: Airport Advisories

    Card(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .border(1.dp, InstrumentBorder, RoundedCornerShape(18.dp))
            .testTag("destination_weather_card"),
        colors = CardDefaults.cardColors(containerColor = CockpitDark)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            // Header: Destination & Arrival Planning Title
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .clip(CircleShape)
                            .background(RadarCyan.copy(alpha = 0.15f))
                            .border(1.dp, RadarCyan.copy(alpha = 0.4f), CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.WbSunny,
                            contentDescription = null,
                            tint = RadarCyan,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                    Column {
                        Text(
                            text = "Destination Arrival Weather",
                            color = TextWhite,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "${forecast.airportCity} (${forecast.airportCode}) · Arrival Planning",
                            color = AeroBlue,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }

                // Flight category badge (VFR / MVFR / IFR)
                val catColor = when {
                    forecast.advisory.flightCategory.contains("VFR", ignoreCase = true) && !forecast.advisory.flightCategory.contains("MVFR") -> StatusLanded
                    forecast.advisory.flightCategory.contains("MVFR", ignoreCase = true) -> StatusDelayed
                    else -> StatusCancelled
                }
                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = catColor.copy(alpha = 0.15f),
                    border = BorderStroke(0.6.dp, catColor.copy(alpha = 0.5f))
                ) {
                    Text(
                        text = forecast.advisory.flightCategory.take(4),
                        color = catColor,
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Primary Highlight Card: Forecast at Estimated Arrival Time
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .border(1.dp, RadarCyan.copy(alpha = 0.35f), RoundedCornerShape(14.dp)),
                color = InstrumentSurface
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
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
                                imageVector = Icons.Default.Schedule,
                                contentDescription = null,
                                tint = RadarCyan,
                                modifier = Modifier.size(14.dp)
                            )
                            Text(
                                text = "AT ESTIMATED ARRIVAL · ${forecast.arrivalTime}",
                                color = RadarCyan,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 0.5.sp
                            )
                        }

                        // Weather icon
                        val conditionIcon = getWeatherIcon(forecast.arrivalCondition)
                        Icon(
                            imageVector = conditionIcon,
                            contentDescription = forecast.arrivalCondition,
                            tint = TextWhite,
                            modifier = Modifier.size(22.dp)
                        )
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.Bottom
                    ) {
                        Column {
                            Text(
                                text = "${forecast.arrivalTempC}°C / ${forecast.arrivalTempF}°F",
                                color = TextWhite,
                                fontSize = 24.sp,
                                fontWeight = FontWeight.Black
                            )
                            Text(
                                text = forecast.arrivalCondition,
                                color = AeroBlue,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        }

                        Column(horizontalAlignment = Alignment.End) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                Icon(Icons.Default.WaterDrop, contentDescription = null, tint = AeroBlue, modifier = Modifier.size(12.dp))
                                Text(
                                    text = "${forecast.precipitationChance}% rain chance",
                                    color = if (forecast.precipitationChance > 40) StatusDelayed else TextMuted,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                            Text(
                                text = forecast.windCondition,
                                color = TextSubtle,
                                fontSize = 11.sp
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))
                    HorizontalDivider(color = InstrumentBorder.copy(alpha = 0.6f), thickness = 0.6.dp)
                    Spacer(modifier = Modifier.height(8.dp))

                    // Arrival Advice & Crosswind Risk
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.FlightLand,
                            contentDescription = null,
                            tint = RadarCyan,
                            modifier = Modifier.size(14.dp)
                        )
                        Text(
                            text = forecast.advisory.crosswindRisk,
                            color = TextWhite,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Forecast Tabs: Hourly vs 3-Day Outlook vs Advisories
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
                            "Arrival Window",
                            fontSize = 11.sp,
                            fontWeight = if (selectedTab == 0) FontWeight.Bold else FontWeight.Medium
                        )
                    },
                    modifier = Modifier.testTag("hourly_forecast_tab")
                )
                Tab(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    text = {
                        Text(
                            "3-Day Outlook",
                            fontSize = 11.sp,
                            fontWeight = if (selectedTab == 1) FontWeight.Bold else FontWeight.Medium
                        )
                    },
                    modifier = Modifier.testTag("daily_forecast_tab")
                )
                Tab(
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
                    text = {
                        Text(
                            "Advisories",
                            fontSize = 11.sp,
                            fontWeight = if (selectedTab == 2) FontWeight.Bold else FontWeight.Medium
                        )
                    },
                    modifier = Modifier.testTag("weather_advisories_tab")
                )
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Tab Content
            when (selectedTab) {
                0 -> {
                    // Hourly Timeline
                    LazyRow(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(forecast.hourlyForecast) { item ->
                            HourlyForecastPill(item = item)
                        }
                    }
                }
                1 -> {
                    // 3-Day Outlook List
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        forecast.dailyForecast.forEach { daily ->
                            DailyForecastRow(daily = daily)
                        }
                    }
                }
                2 -> {
                    // Airport Advisories & Metrics
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .border(1.dp, InstrumentBorder, RoundedCornerShape(12.dp)),
                        color = InstrumentSurface
                    ) {
                        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            AdvisoryDetailRow(label = "Runway Visual Range (RVR)", value = forecast.advisory.runwayVisualRange, icon = Icons.Default.Visibility)
                            AdvisoryDetailRow(label = "Flight Rules Category", value = forecast.advisory.flightCategory, icon = Icons.Default.AirplanemodeActive)
                            AdvisoryDetailRow(label = "Approach Wind Profile", value = forecast.windCondition, icon = Icons.Default.Air)
                            AdvisoryDetailRow(label = "Surface Visibility", value = forecast.visibility, icon = Icons.Default.NearMe)
                            AdvisoryDetailRow(label = "Atmospheric Humidity", value = "${forecast.humidity}% relative humidity", icon = Icons.Default.WaterDrop)
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Arrival Packing & Travel Tip Banner
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .border(0.8.dp, InstrumentBorder, RoundedCornerShape(10.dp)),
                color = CockpitDark
            ) {
                Row(
                    modifier = Modifier.padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Luggage,
                        contentDescription = null,
                        tint = RadarCyan,
                        modifier = Modifier.size(16.dp)
                    )
                    Text(
                        text = forecast.packingAdvice,
                        color = TextWhite,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }
    }
}

@Composable
private fun HourlyForecastPill(item: HourlyForecast) {
    val isEta = item.isArrivalTarget
    Surface(
        modifier = Modifier
            .width(84.dp)
            .clip(RoundedCornerShape(12.dp))
            .border(
                1.dp,
                if (isEta) RadarCyan else InstrumentBorder,
                RoundedCornerShape(12.dp)
            ),
        color = if (isEta) RadarCyan.copy(alpha = 0.12f) else InstrumentSurface
    ) {
        Column(
            modifier = Modifier.padding(vertical = 10.dp, horizontal = 6.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = item.time,
                color = if (isEta) RadarCyan else TextMuted,
                fontSize = 10.sp,
                fontWeight = if (isEta) FontWeight.Bold else FontWeight.Medium,
                maxLines = 1
            )

            Spacer(modifier = Modifier.height(6.dp))

            Icon(
                imageVector = getWeatherIcon(item.condition),
                contentDescription = item.condition,
                tint = if (isEta) RadarCyan else TextWhite,
                modifier = Modifier.size(20.dp)
            )

            Spacer(modifier = Modifier.height(6.dp))

            Text(
                text = "${item.tempC}°C",
                color = TextWhite,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold
            )

            Spacer(modifier = Modifier.height(2.dp))

            Text(
                text = "${item.precipProbabilityPercent}% rain",
                color = if (item.precipProbabilityPercent > 50) StatusDelayed else TextSubtle,
                fontSize = 9.sp
            )
        }
    }
}

@Composable
private fun DailyForecastRow(daily: DailyForecast) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .border(1.dp, InstrumentBorder, RoundedCornerShape(10.dp)),
        color = InstrumentSurface
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(modifier = Modifier.weight(1.2f)) {
                Text(
                    text = daily.dayName,
                    color = TextWhite,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = daily.condition,
                    color = AeroBlue,
                    fontSize = 11.sp,
                    maxLines = 1
                )
            }

            Row(
                modifier = Modifier.weight(1.2f),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = getWeatherIcon(daily.condition),
                    contentDescription = null,
                    tint = TextWhite,
                    modifier = Modifier.size(16.dp)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "${daily.precipProbabilityPercent}%",
                    color = if (daily.precipProbabilityPercent > 40) StatusDelayed else TextSubtle,
                    fontSize = 11.sp
                )
            }

            Row(
                modifier = Modifier.weight(1f),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "${daily.tempHighC}° / ${daily.tempLowC}°",
                    color = TextWhite,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

@Composable
private fun AdvisoryDetailRow(label: String, value: String, icon: ImageVector) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Icon(icon, contentDescription = null, tint = RadarCyan, modifier = Modifier.size(14.dp))
            Text(label, color = TextMuted, fontSize = 11.sp)
        }
        Text(value, color = TextWhite, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
    }
}

private fun getWeatherIcon(condition: String): ImageVector {
    return when {
        condition.contains("Rain", ignoreCase = true) || condition.contains("Drizzle", ignoreCase = true) -> Icons.Default.WaterDrop
        condition.contains("Thunder", ignoreCase = true) -> Icons.Default.Thunderstorm
        condition.contains("Fog", ignoreCase = true) || condition.contains("Mist", ignoreCase = true) -> Icons.Default.Deblur
        condition.contains("Cloud", ignoreCase = true) || condition.contains("Overcast", ignoreCase = true) -> Icons.Default.Cloud
        condition.contains("Snow", ignoreCase = true) -> Icons.Default.AcUnit
        else -> Icons.Default.WbSunny
    }
}
