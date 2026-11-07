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
    LIVE_AERODATABOX(
        badgeLabel = "LIVE AERODATABOX + METEO",
        title = "Live AeroDataBox & Open-Meteo Connected",
        subtitle = "Streaming real-time global flights, airport FIDS boards, delay indexes, and live destination weather.",
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
        title = "AeroDataBox Quota Reached (HTTP 429)",
        subtitle = "Serving cached flights from Room SQLite + live Open-Meteo destination weather until the AeroDataBox quota resets.",
        isLiveAviation = false
    ),
    DEMO_CACHE_NO_KEY(
        badgeLabel = "ROOM CACHE + LIVE WEATHER",
        title = "Room Cache + Live Open-Meteo Weather",
        subtitle = "Add AERODATABOX_API_KEY in the AI Studio Secrets panel to enable live AeroDataBox flight & FIDS queries.",
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
     * Legacy direct-provider config. The Android app no longer calls
     * AeroDataBox directly (all traffic flows through the Avi gateway), so
     * these default to blank rather than reading removed BuildConfig fields.
     */
    val aeroDataBoxApiKey: String
        get() = ""

    val aeroDataBoxApiHost: String
        get() = "api.aerodatabox.com"

    val usesRapidApiGateway: Boolean
        get() = false

    val aeroDataBoxBaseUrl: String
        get() = "https://api.aerodatabox.com/"

    /**
     * Checks whether a real, non-placeholder AeroDataBox API key is available.
     */
    fun hasValidAeroDataBoxKey(keyOverride: String? = null): Boolean {
        val key = (keyOverride ?: aeroDataBoxApiKey).trim()
        return key.length >= 16 && key !in PLACEHOLDER_KEYS && !key.startsWith("DEFAULT_")
    }

    /**
     * Computes the default initial DataSourceMode based on gateway availability and offline flag.
     */
    fun resolveInitialMode(isOffline: Boolean): DataSourceMode {
        return when {
            isOffline -> DataSourceMode.OFFLINE_ROOM_CACHE
            isGatewayConfigured -> DataSourceMode.LIVE_AERODATABOX
            else -> DataSourceMode.DEMO_CACHE_NO_KEY
        }
    }
}
