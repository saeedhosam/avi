package com.example.model

enum class WeatherCategory(val label: String) {
    CLEAR("Clear Sky"),
    CLOUDY("Partly Cloudy"),
    OVERCAST("Overcast"),
    RAIN("Rain / Showers"),
    THUNDERSTORM("Thunderstorms"),
    FOG("Fog / Mist"),
    SNOW("Snow / Freezing Rain")
}

data class HourlyForecast(
    val time: String,
    val tempC: Int,
    val tempF: Int,
    val condition: String,
    val precipProbabilityPercent: Int,
    val windSpeedKnots: Int,
    val isArrivalTarget: Boolean = false
)

data class DailyForecast(
    val dayName: String,
    val dateString: String,
    val tempHighC: Int,
    val tempHighF: Int,
    val tempLowC: Int,
    val tempLowF: Int,
    val condition: String,
    val precipProbabilityPercent: Int,
    val packingTip: String
)

data class ArrivalAviationAdvisory(
    val flightCategory: String,
    val crosswindKnots: Int,
    val crosswindRisk: String,
    val runwayVisualRange: String,
    val arrivalNotice: String
)

data class DestinationArrivalForecast(
    val airportCode: String,
    val airportName: String,
    val airportCity: String,
    val arrivalTime: String,
    val arrivalTempC: Int,
    val arrivalTempF: Int,
    val arrivalCondition: String,
    val precipitationChance: Int,
    val windCondition: String,
    val visibility: String,
    val humidity: Int,
    val hourlyForecast: List<HourlyForecast>,
    val dailyForecast: List<DailyForecast>,
    val advisory: ArrivalAviationAdvisory,
    val packingAdvice: String,
    val lastUpdated: Long = System.currentTimeMillis(),
    /** False when no live/cached forecast exists; numeric fields are placeholders. */
    val dataAvailable: Boolean = true
)
