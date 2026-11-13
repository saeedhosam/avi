package com.example.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DarkColorScheme = darkColorScheme(
    primary = Accent,
    onPrimary = Color(0xFF002233),
    primaryContainer = InstrumentSurfaceElevated,
    onPrimaryContainer = Color(0xFFBEEBFF),
    secondary = AccentMuted,
    onSecondary = Color(0xFF062338),
    secondaryContainer = InstrumentSurface,
    onSecondaryContainer = Color(0xFFBAE6FD),
    tertiary = StatusDelayed,
    onTertiary = Color(0xFF451A03),
    background = DeepSpace,
    onBackground = TextWhite,
    surface = CockpitDark,
    onSurface = TextWhite,
    surfaceVariant = InstrumentSurface,
    onSurfaceVariant = TextMuted,
    outline = InstrumentBorder,
    outlineVariant = InstrumentBorderStrong,
    error = StatusCancelled,
    onError = TextWhite,
)

@Composable
fun SkyTrackTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        typography = Typography,
        content = content,
    )
}
