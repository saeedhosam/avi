package com.example.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Air
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.WaterDrop
import androidx.compose.material.icons.filled.WbSunny
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.model.Airport
import com.example.ui.theme.*

@Composable
fun WeatherCard(
    origin: Airport,
    destination: Airport,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .border(1.dp, InstrumentBorder, RoundedCornerShape(18.dp))
            .testTag("weather_conditions_card"),
        colors = CardDefaults.cardColors(containerColor = CockpitDark)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Airport Weather Conditions",
                    color = TextWhite,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "OPEN-METEO MODEL",
                    color = RadarCyan,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }

            Spacer(modifier = Modifier.height(14.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Departure Airport Weather
                AirportWeatherPane(
                    airport = origin,
                    label = "DEPARTURE",
                    modifier = Modifier.weight(1f)
                )

                // Arrival Airport Weather
                AirportWeatherPane(
                    airport = destination,
                    label = "ARRIVAL",
                    modifier = Modifier.weight(1f)
                )
            }
        }
    }
}

@Composable
private fun AirportWeatherPane(
    airport: Airport,
    label: String,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .border(1.dp, InstrumentBorder.copy(alpha = 0.7f), RoundedCornerShape(14.dp)),
        color = InstrumentSurface
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = label,
                    color = TextSubtle,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.5.sp
                )
                Text(
                    text = airport.code,
                    color = RadarCyan,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Black
                )
            }

            Spacer(modifier = Modifier.height(4.dp))

            if (!airport.weatherReported) {
                Text(
                    text = "Weather not reported",
                    color = TextMuted,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium
                )
            } else {
                Text(
                    text = "${airport.weather.tempC}°C / ${airport.weather.tempF}°F",
                    color = TextWhite,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold
                )

                Text(
                    text = airport.weather.condition,
                    color = AeroBlue,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1
                )

                Spacer(modifier = Modifier.height(8.dp))
                HorizontalDivider(color = InstrumentBorder.copy(alpha = 0.5f), thickness = 0.5.dp)
                Spacer(modifier = Modifier.height(8.dp))

                // Weather Metrics
                WeatherMetricRow(icon = Icons.Default.Air, text = airport.weather.wind)
                Spacer(modifier = Modifier.height(4.dp))
                WeatherMetricRow(icon = Icons.Default.Visibility, text = "Vis: ${airport.weather.visibility}")
                Spacer(modifier = Modifier.height(4.dp))
                WeatherMetricRow(icon = Icons.Default.WaterDrop, text = "Humidity: ${airport.weather.humidity}%")
            }
        }
    }
}

@Composable
private fun WeatherMetricRow(
    icon: ImageVector,
    text: String
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = TextMuted,
            modifier = Modifier.size(13.dp)
        )
        Text(
            text = text,
            color = TextMuted,
            fontSize = 11.sp
        )
    }
}
