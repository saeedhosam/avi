package com.example.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.Color

private val DarkColorScheme = darkColorScheme(
    primary = NeonRadarCyan,
    onPrimary = Color(0xFF002233),
    primaryContainer = DarkInstrumentSurfaceElevated,
    onPrimaryContainer = Color(0xFFBEEBFF),
    secondary = Color(0xFF38BDF8),
    onSecondary = Color(0xFF062338),
    secondaryContainer = DarkInstrumentSurface,
    onSecondaryContainer = Color(0xFFBAE6FD),
    tertiary = Color(0xFFF59E0B),
    onTertiary = Color(0xFF451A03),
    background = DarkDeepSpace,
    onBackground = DarkTextWhite,
    surface = DarkCockpitDark,
    onSurface = DarkTextWhite,
    surfaceVariant = DarkInstrumentSurface,
    onSurfaceVariant = DarkTextMuted,
    outline = DarkInstrumentBorder,
    outlineVariant = Color(0xFF1B314D)
)

private val LightColorScheme = lightColorScheme(
    primary = SkyPrimary,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE0F2FE),
    onPrimaryContainer = Color(0xFF0369A1),
    secondary = Color(0xFF0284C7),
    onSecondary = Color.White,
    secondaryContainer = LightSurfaceElevated,
    onSecondaryContainer = Color(0xFF0F172A),
    tertiary = Color(0xFFD97706),
    onTertiary = Color.White,
    background = LightBackground,
    onBackground = LightTextPrimary,
    surface = LightSurface,
    onSurface = LightTextPrimary,
    surfaceVariant = LightSurfaceVariant,
    onSurfaceVariant = LightTextMuted,
    outline = LightBorder,
    outlineVariant = Color(0xFFE2E8F0)
)

@Composable
fun SkyTrackTheme(
    darkTheme: Boolean = true,
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    CompositionLocalProvider(
        LocalDarkTheme provides darkTheme
    ) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = Typography,
            content = content
        )
    }
}
