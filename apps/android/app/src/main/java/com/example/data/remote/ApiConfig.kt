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

    private val PLACEHOLDER_KEYS = setOf(
        "",
        "null",
        "DEFAULT_AERODATABOX_KEY",
        "YOUR_AERODATABOX_KEY",
        "MY_AERODATABOX_API_KEY",
        "REPLACE_WITH_YOUR_KEY"
    )

    private val PLACEHOLDER_MAP_KEYS = setOf(
        "",
        "null",
        "DEFAULT_MAPS_KEY",
        "YOUR_MAPS_KEY"
    )

    /**
     * Returns the configured AeroDataBox API key from BuildConfig.
     */
    val aeroDataBoxApiKey: String
        get() = try {
            BuildConfig.AERODATABOX_API_KEY.trim()
        } catch (_: Throwable) {
            ""
        }

    /**
     * Returns the configured AeroDataBox gateway host from BuildConfig.
     */
    val aeroDataBoxApiHost: String
        get() = try {
            val host = BuildConfig.AERODATABOX_API_HOST.trim()
            if (host.isBlank() || host == "null") "api.aerodatabox.com" else host
        } catch (_: Throwable) {
            "api.aerodatabox.com"
        }

    /**
     * RapidAPI remains supported as an optional gateway override for rollback,
     * but direct AeroDataBox access is the default.
     */
    val usesRapidApiGateway: Boolean
        get() = aeroDataBoxApiHost.contains("rapidapi.com")

    /**
     * Returns the base HTTPS URL for AeroDataBox API requests.
     */
    val aeroDataBoxBaseUrl: String
        get() {
            val host = aeroDataBoxApiHost.removePrefix("https://").removePrefix("http://").trimEnd('/')
            return "https://$host/"
        }

    /**
     * Checks whether a real, non-placeholder AeroDataBox API key is available.
     */
    fun hasValidAeroDataBoxKey(keyOverride: String? = null): Boolean {
        val key = (keyOverride ?: aeroDataBoxApiKey).trim()
        return key.length >= 16 && key !in PLACEHOLDER_KEYS && !key.startsWith("DEFAULT_")
    }

    /**
     * Checks whether a real Google Maps API key is configured.
     */
    fun hasValidMapsApiKey(): Boolean {
        return try {
            val key = BuildConfig.MAPS_API_KEY.trim()
            key.length >= 16 && key !in PLACEHOLDER_MAP_KEYS && !key.startsWith("DEFAULT_")
        } catch (_: Throwable) {
            false
        }
    }

    /**
     * Computes the default initial DataSourceMode based on key availability and offline flag.
     */
    fun resolveInitialMode(isOffline: Boolean): DataSourceMode {
        return when {
            isOffline -> DataSourceMode.OFFLINE_ROOM_CACHE
            hasValidAeroDataBoxKey() -> DataSourceMode.LIVE_AERODATABOX
            else -> DataSourceMode.DEMO_CACHE_NO_KEY
        }
    }
}
