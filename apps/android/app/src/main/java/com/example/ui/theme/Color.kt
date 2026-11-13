package com.example.ui.theme

import androidx.compose.ui.graphics.Color

// Single dark cockpit palette shared by every Compose surface.
val DeepSpace = Color(0xFF070E17)
val CockpitDark = Color(0xFF0C1929)
val InstrumentSurface = Color(0xFF13233A)
val InstrumentSurfaceElevated = Color(0xFF1C314E)
val InstrumentBorder = Color(0xFF264366)
val InstrumentBorderStrong = Color(0xFF315A85)
val TextWhite = Color(0xFFF8FAFC)
val TextMuted = Color(0xFF94A3B8)
val TextSubtle = Color(0xFF64748B)
val Accent = Color(0xFF00E5FF)
val AccentMuted = Color(0xFF38BDF8)

// Legacy token aliases kept as plain values for existing call sites.
val RadarCyan = Accent
val AeroBlue = AccentMuted

// Universal aviation status colours (constant values for enums, models, canvas).
val StatusDeparted = Color(0xFF00E5FF)
val StatusBoarding = Color(0xFF38BDF8)
val StatusLanded = Color(0xFF10B981)
val StatusDelayed = Color(0xFFF59E0B)
val StatusCancelled = Color(0xFFEF4444)
val StatusScheduled = Color(0xFF94A3B8)

// Runway, radar, and weather overlays.
val RadarGrid = Color(0x2500E5FF)
val RadarSweep = Color(0x3500E5FF)
val WeatherStorm = Color(0x55EF4444)
val WeatherRain = Color(0x5538BDF8)
