package com.example.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

val LocalDarkTheme = staticCompositionLocalOf { true }

// Raw static palette definitions
val DarkDeepSpace = Color(0xFF070E17)
val DarkCockpitDark = Color(0xFF0C1929)
val DarkInstrumentSurface = Color(0xFF13233A)
val DarkInstrumentSurfaceElevated = Color(0xFF1C314E)
val DarkInstrumentBorder = Color(0xFF264366)
val DarkTextWhite = Color(0xFFF8FAFC)
val DarkTextMuted = Color(0xFF94A3B8)
val DarkTextSubtle = Color(0xFF64748B)

val LightBackground = Color(0xFFF1F5F9)
val LightSurface = Color(0xFFFFFFFF)
val LightSurfaceElevated = Color(0xFFF8FAFC)
val LightSurfaceVariant = Color(0xFFFFFFFF)
val LightBorder = Color(0xFFCBD5E1)
val LightTextPrimary = Color(0xFF0F172A)
val LightTextMuted = Color(0xFF475569)
val LightTextSubtle = Color(0xFF64748B)

val NeonRadarCyan = Color(0xFF00E5FF)
val LightSkyBlue = Color(0xFF0284C7)
val AltitudeBlue = Color(0xFF60A5FA)
val SkyPrimary = Color(0xFF0284C7)

// Universal Aviation Status Colors (constant values for enums, models, and canvas)
val StatusDeparted = Color(0xFF00E5FF)
val StatusBoarding = Color(0xFF38BDF8)
val StatusLanded = Color(0xFF10B981)
val StatusDelayed = Color(0xFFF59E0B)
val StatusCancelled = Color(0xFFEF4444)
val StatusScheduled = Color(0xFF94A3B8)

// Dynamic Composable Color Accessors for seamless global light/dark reactivity
val DeepSpace: Color
    @Composable
    @ReadOnlyComposable
    get() = if (LocalDarkTheme.current) DarkDeepSpace else LightBackground

val CockpitDark: Color
    @Composable
    @ReadOnlyComposable
    get() = if (LocalDarkTheme.current) DarkCockpitDark else LightSurface

val InstrumentSurface: Color
    @Composable
    @ReadOnlyComposable
    get() = if (LocalDarkTheme.current) DarkInstrumentSurface else LightSurfaceElevated

val InstrumentSurfaceElevated: Color
    @Composable
    @ReadOnlyComposable
    get() = if (LocalDarkTheme.current) DarkInstrumentSurfaceElevated else Color(0xFFE2E8F0)

val InstrumentBorder: Color
    @Composable
    @ReadOnlyComposable
    get() = if (LocalDarkTheme.current) DarkInstrumentBorder else LightBorder

val RadarCyan: Color
    @Composable
    @ReadOnlyComposable
    get() = if (LocalDarkTheme.current) NeonRadarCyan else LightSkyBlue

val AeroBlue: Color
    @Composable
    @ReadOnlyComposable
    get() = if (LocalDarkTheme.current) Color(0xFF38BDF8) else Color(0xFF0284C7)

// Text Colors
val TextWhite: Color
    @Composable
    @ReadOnlyComposable
    get() = if (LocalDarkTheme.current) DarkTextWhite else LightTextPrimary

val TextMuted: Color
    @Composable
    @ReadOnlyComposable
    get() = if (LocalDarkTheme.current) DarkTextMuted else LightTextMuted

val TextSubtle: Color
    @Composable
    @ReadOnlyComposable
    get() = if (LocalDarkTheme.current) DarkTextSubtle else LightTextSubtle

// Runway & Weather Radar Colors
val RadarGrid: Color
    @Composable
    @ReadOnlyComposable
    get() = if (LocalDarkTheme.current) Color(0x2500E5FF) else Color(0x180284C7)

val RadarSweep: Color
    @Composable
    @ReadOnlyComposable
    get() = if (LocalDarkTheme.current) Color(0x3500E5FF) else Color(0x220284C7)

val WeatherStorm: Color
    @Composable
    @ReadOnlyComposable
    get() = if (LocalDarkTheme.current) Color(0x55EF4444) else Color(0x30EF4444)

val WeatherRain: Color
    @Composable
    @ReadOnlyComposable
    get() = if (LocalDarkTheme.current) Color(0x5538BDF8) else Color(0x250284C7)
