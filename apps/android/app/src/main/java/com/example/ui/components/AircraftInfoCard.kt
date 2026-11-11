package com.example.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AirlineSeatReclineExtra
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Flight
import androidx.compose.material.icons.filled.Wifi
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
import com.example.model.AircraftInfo
import com.example.ui.theme.*

@Composable
fun AircraftInfoCard(
    aircraft: AircraftInfo,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .border(1.dp, InstrumentBorder, RoundedCornerShape(18.dp))
            .testTag("aircraft_info_card"),
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
                    text = "Aircraft Specifications",
                    color = TextWhite,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "Reg: ${aircraft.registration}",
                    color = RadarCyan,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Main Aircraft Model Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(42.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(InstrumentSurfaceElevated)
                        .border(1.dp, RadarCyan.copy(alpha = 0.4f), RoundedCornerShape(12.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Flight,
                        contentDescription = "Aircraft",
                        tint = RadarCyan,
                        modifier = Modifier.size(24.dp)
                    )
                }

                Column {
                    Text(
                        text = aircraft.model,
                        color = TextWhite,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "Airframe Age: ${aircraft.age ?: "Not reported"}",
                        color = TextMuted,
                        fontSize = 12.sp
                    )
                }
            }

            Spacer(modifier = Modifier.height(14.dp))
            HorizontalDivider(color = InstrumentBorder.copy(alpha = 0.5f), thickness = 0.8.dp)
            Spacer(modifier = Modifier.height(12.dp))

            // Cabin & In-Flight Amenities Row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                AmenityPill(
                    icon = Icons.Default.Wifi,
                    label = "Satellite Wi-Fi",
                    available = aircraft.wifiAvailable,
                    modifier = Modifier.weight(1f)
                )
                AmenityPill(
                    icon = Icons.Default.Bolt,
                    label = "USB & Power",
                    available = aircraft.powerOutlets,
                    modifier = Modifier.weight(1f)
                )
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Seating layout description
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp)),
                color = InstrumentSurface
            ) {
                Row(
                    modifier = Modifier.padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.AirlineSeatReclineExtra,
                        contentDescription = "Seating",
                        tint = AeroBlue,
                        modifier = Modifier.size(16.dp)
                    )
                    Text(
                        text = aircraft.seatLayout ?: "Seat layout not reported",
                        color = TextMuted,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }
    }
}

@Composable
private fun AmenityPill(
    icon: ImageVector,
    label: String,
    available: Boolean?,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .border(1.dp, InstrumentBorder, RoundedCornerShape(10.dp)),
        color = InstrumentSurface
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = label,
                tint = if (available == true) StatusLanded else TextSubtle,
                modifier = Modifier.size(14.dp)
            )
            Text(
                text = if (available == null) "$label: not reported" else label,
                color = if (available == true) TextWhite else TextSubtle,
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium
            )
        }
    }
}
