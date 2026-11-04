package com.example.model

import kotlin.math.*

enum class ConnectionDirection(val label: String, val shortLabel: String) {
    ALL("All Connections", "All"),
    DEPARTURES("Outbound Departures", "Departures"),
    ARRIVALS("Inbound Arrivals", "Arrivals")
}

enum class HaulCategory(val label: String, val rangeDescription: String) {
    ALL("All Ranges", "Any distance"),
    SHORT_HAUL("Short-Haul", "< 1,500 km"),
    MEDIUM_HAUL("Medium-Haul", "1,500 – 4,000 km"),
    LONG_HAUL("Long-Haul", "> 4,000 km")
}

enum class RouteRegion(val label: String) {
    ALL("All Regions"),
    MENA("Middle East & N. Africa"),
    EUROPE("Europe"),
    AFRICA("Sub-Saharan Africa"),
    ASIA_PACIFIC("Asia-Pacific"),
    AMERICAS("Americas")
}

data class AirportNode(
    val iata: String,
    val icao: String,
    val name: String,
    val city: String,
    val country: String,
    val region: RouteRegion,
    val latitude: Double,
    val longitude: Double,
    val timezone: String,
    val hubAirlines: List<String> = emptyList()
)

data class OperatingCarrierRoute(
    val airlineCode: String,
    val airlineName: String,
    val flightNumbers: List<String>,
    val dailyFrequencies: Int,
    val aircraftTypes: List<String>
)

data class DirectFlightConnection(
    val id: String,
    val origin: AirportNode,
    val destination: AirportNode,
    val distanceKm: Int,
    val distanceNm: Int,
    val estimatedDurationMinutes: Int,
    val durationFormatted: String,
    val haulCategory: HaulCategory,
    val dailyFlightsCount: Int,
    val hasDepartures: Boolean = true,
    val hasArrivals: Boolean = true,
    val operatingCarriers: List<OperatingCarrierRoute>,
    val isLiveVerified: Boolean = false
)

data class AirlineFilterChipItem(
    val code: String,
    val name: String,
    val destinationCount: Int
)

data class AirportRouteNetworkSummary(
    val originAirport: AirportNode,
    val connections: List<DirectFlightConnection>,
    val totalDirectDestinations: Int,
    val totalCountriesServed: Int,
    val totalOperatingAirlines: Int,
    val totalDailyFlights: Int,
    val availableAirlines: List<AirlineFilterChipItem>
)

object GeodesicRouteCalculator {
    private const val EARTH_RADIUS_KM = 6371.0

    fun calculateDistanceKm(
        lat1: Double,
        lon1: Double,
        lat2: Double,
        lon2: Double
    ): Int {
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val rLat1 = Math.toRadians(lat1)
        val rLat2 = Math.toRadians(lat2)

        val a = sin(dLat / 2).pow(2.0) +
            cos(rLat1) * cos(rLat2) * sin(dLon / 2).pow(2.0)
        val c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return (EARTH_RADIUS_KM * c).roundToInt().coerceAtLeast(80)
    }

    fun kmToNm(km: Int): Int = (km * 0.539957).roundToInt().coerceAtLeast(45)

    fun estimateDurationMinutes(distanceKm: Int): Int {
        // Cruise ~820 km/h + 32 min taxi/climb/approach allowance
        val cruiseMinutes = (distanceKm / 815.0) * 60.0
        return (cruiseMinutes + 32).roundToInt().coerceAtLeast(45)
    }

    fun formatDuration(minutes: Int): String {
        val hrs = minutes / 60
        val mins = minutes % 60
        return if (hrs > 0) "${hrs}h ${mins.toString().padStart(2, '0')}m" else "${mins}m"
    }

    fun classifyHaul(distanceKm: Int): HaulCategory {
        return when {
            distanceKm < 1500 -> HaulCategory.SHORT_HAUL
            distanceKm <= 4000 -> HaulCategory.MEDIUM_HAUL
            else -> HaulCategory.LONG_HAUL
        }
    }
}
