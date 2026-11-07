package com.example.data.remote

import com.example.BuildConfig

/**
 * Represents the active telemetry data source mode across SkyTrack.
 */
enum class DataSourceMode(
    val badgeLabel: String,
    val title: String,
    val subtitle: String,
    val isLiveAviation: Boolean
) {
    LIVE_DATA(
        badgeLabel = "LIVE DATA + METEO",
        title = "Live flight data & Open-Meteo connected",
        subtitle = "Streaming real-time global flights, airport boards, delay indexes, and live destination weather through the Avi gateway.",
        isLiveAviation = true
    ),
    OFFLINE_ROOM_CACHE(
        badgeLabel = "OFFLINE · ROOM CACHE",
        title = "Offline Mode (Room SQLite SSOT)",
        subtitle = "Network disconnected or airplane mode active. Serving cached flights, watchlists, and arrival weather from local Room database.",
        isLiveAviation = false
    ),
    QUOTA_FALLBACK(
        badgeLabel = "RATE LIMIT · CACHE ACTIVE",
        title = "Live updates paused (quota)",
        subtitle = "Serving saved flights from the local cache + live Open-Meteo destination weather until the live-data quota resets.",
        isLiveAviation = false
    ),
    DEMO_CACHE_NO_KEY(
        badgeLabel = "SAVED DATA + LIVE WEATHER",
        title = "Saved flights + live Open-Meteo weather",
        subtitle = "Live flight lookups route through the Avi gateway and are temporarily unavailable — saved flights and live weather still work.",
        isLiveAviation = false
    )
}

/**
 * Centralized configuration and credential validator for remote aviation and weather APIs.
 */
object ApiConfig {

    /** Gateway base URL. The Android client does not hold provider keys — all
     *  AeroDataBox traffic flows through the Avi gateway, which owns the key
     *  and returns console-shaped Flight objects. */
    val aviGatewayBaseUrl: String
        get() {
            val raw = try {
                BuildConfig.AVI_API_BASE_URL.trim()
            } catch (_: Throwable) {
                ""
            }
            val host = raw.replace("https://", "").replace("http://", "").trimEnd('/')
            return if (host.isBlank() || host == "null") "https://api.codestep.org/" else "https://$host/"
        }

    val isGatewayConfigured: Boolean
        get() = aviGatewayBaseUrl.startsWith("https://")

    private val PLACEHOLDER_KEYS = setOf(
        "",
        "null",
        "DEFAULT_AERODATABOX_KEY",
        "YOUR_AERODATABOX_KEY",
        "MY_AERODATABOX_API_KEY",
        "REPLACE_WITH_YOUR_KEY"
    )

    /**
     * Legacy compatibility shim: Avi no longer holds provider keys on-device,
     * so there is never a direct API key to validate — return true (the
     * gateway ready-gate is the authoritative check).
     */
    fun hasValidAeroDataBoxKey(keyOverride: String? = null): Boolean =
        isGatewayConfigured

    /**
     * Computes the default initial DataSourceMode based on gateway availability and offline flag.
     */
    fun resolveInitialMode(isOffline: Boolean): DataSourceMode {
        return when {
            isOffline -> DataSourceMode.OFFLINE_ROOM_CACHE
            isGatewayConfigured -> DataSourceMode.LIVE_DATA
            else -> DataSourceMode.DEMO_CACHE_NO_KEY
        }
    }
}
