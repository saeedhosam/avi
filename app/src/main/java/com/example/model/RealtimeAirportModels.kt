package com.example.model

enum class FlightCategory(val label: String) {
    VFR("VFR · Visual"),
    MVFR("MVFR · Marginal"),
    IFR("IFR · Low Vis")
}

data class RealtimeAirportWeather(
    val tempC: Int,
    val tempF: Int,
    val condition: String,
    val wind: String,
    val visibility: String,
    val humidity: Int,
    val pressureInHg: Double = 29.92,
    val metarRaw: String = "",
    val flightCategory: FlightCategory = FlightCategory.VFR
)

data class RealtimeAirportInfo(
    val code: String,              // e.g. "JFK"
    val icao: String,              // e.g. "KJFK"
    val name: String,              // e.g. "John F. Kennedy International"
    val city: String,              // e.g. "New York"
    val country: String,           // e.g. "United States"
    val region: String,            // e.g. "Americas"
    val timezone: String,
    val latitude: Double,
    val longitude: Double,
    val elevationFeet: Int,
    val operationalStatus: String, // e.g. "Normal Operations", "Ground Delay (35m)"
    val isDelayed: Boolean,
    val delayMinutes: Int,
    val delayReason: String? = null,
    val onTimePercentage: Int,     // e.g. 92
    val activeDeparturesCount: Int,
    val activeArrivalsCount: Int,
    val activeRunways: List<String>,
    val terminalCount: Int,
    val weather: RealtimeAirportWeather,
    val hubAirlines: List<String> = emptyList()
)
