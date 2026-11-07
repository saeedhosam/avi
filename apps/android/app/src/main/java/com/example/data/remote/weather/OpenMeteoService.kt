package com.example.data.remote.weather

import com.example.model.*
import com.squareup.moshi.Json
import okhttp3.OkHttpClient
import retrofit2.Response
import retrofit2.Retrofit
import com.example.data.remote.gateway.GatewayNetworkClient
import retrofit2.converter.moshi.MoshiConverterFactory
import retrofit2.http.GET
import retrofit2.http.Query
import java.util.Locale
import java.util.concurrent.TimeUnit

data class OpenMeteoResponseDto(
    @Json(name = "latitude") val latitude: Double? = null,
    @Json(name = "longitude") val longitude: Double? = null,
    @Json(name = "timezone") val timezone: String? = null,
    @Json(name = "current") val current: OpenMeteoCurrentDto? = null,
    @Json(name = "hourly") val hourly: OpenMeteoHourlyDto? = null,
    @Json(name = "daily") val daily: OpenMeteoDailyDto? = null
)

data class OpenMeteoCurrentDto(
    @Json(name = "time") val time: String? = null,
    @Json(name = "temperature_2m") val temperature2m: Double? = null,
    @Json(name = "relative_humidity_2m") val relativeHumidity2m: Int? = null,
    @Json(name = "precipitation") val precipitation: Double? = null,
    @Json(name = "weather_code") val weatherCode: Int? = null,
    @Json(name = "wind_speed_10m") val windSpeed10m: Double? = null,
    @Json(name = "wind_direction_10m") val windDirection10m: Int? = null,
    @Json(name = "surface_pressure") val surfacePressure: Double? = null,
    @Json(name = "visibility") val visibility: Double? = null
)

data class OpenMeteoHourlyDto(
    @Json(name = "time") val time: List<String>? = null,
    @Json(name = "temperature_2m") val temperature2m: List<Double>? = null,
    @Json(name = "precipitation_probability") val precipitationProbability: List<Int>? = null,
    @Json(name = "weather_code") val weatherCode: List<Int>? = null,
    @Json(name = "wind_speed_10m") val windSpeed10m: List<Double>? = null
)

data class OpenMeteoDailyDto(
    @Json(name = "time") val time: List<String>? = null,
    @Json(name = "weather_code") val weatherCode: List<Int>? = null,
    @Json(name = "temperature_2m_max") val temperature2mMax: List<Double>? = null,
    @Json(name = "temperature_2m_min") val temperature2mMin: List<Double>? = null,
    @Json(name = "precipitation_probability_max") val precipitationProbabilityMax: List<Int>? = null
)

interface OpenMeteoApiService {

    @GET("v1/forecast")
    suspend fun getForecast(
        @Query("latitude") latitude: Double,
        @Query("longitude") longitude: Double,
        @Query("current") current: String = "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,visibility",
        @Query("hourly") hourly: String = "temperature_2m,precipitation_probability,weather_code,wind_speed_10m",
        @Query("daily") daily: String = "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
        @Query("wind_speed_unit") windSpeedUnit: String = "kn",
        @Query("timezone") timezone: String = "auto",
        @Query("forecast_days") forecastDays: Int = 4
    ): Response<OpenMeteoResponseDto>
}

object OpenMeteoNetworkClient {

    private const val BASE_URL = "https://api.open-meteo.com/"

    val apiService: OpenMeteoApiService by lazy {
        val client = OkHttpClient.Builder()
            .connectTimeout(8, TimeUnit.SECONDS)
            .readTimeout(10, TimeUnit.SECONDS)
            .build()

        Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(client)
            .addConverterFactory(MoshiConverterFactory.create(GatewayNetworkClient.moshi))
            .build()
            .create(OpenMeteoApiService::class.java)
    }
}

/**
 * Pure mapper converting Open-Meteo WMO meteorological payloads into SkyTrack
 * [DestinationArrivalForecast] and [RealtimeAirportWeather] models.
 */
object OpenMeteoMapper {

    fun mapWmoCodeToCondition(wmoCode: Int?): String {
        return when (wmoCode ?: 0) {
            0 -> "Clear Sky"
            1 -> "Mainly Clear"
            2 -> "Partly Cloudy"
            3 -> "Overcast"
            45, 48 -> "Fog / Low Visibility"
            51, 53, 55 -> "Light Drizzle"
            56, 57 -> "Freezing Drizzle"
            61, 63 -> "Rain Showers"
            65, 82 -> "Heavy Rain"
            66, 67 -> "Freezing Rain"
            71, 73, 75, 77, 85, 86 -> "Snow / Flurries"
            80, 81 -> "Scattered Showers"
            95, 96, 99 -> "Thunderstorms"
            else -> "Fair / Clear"
        }
    }

    fun determineFlightCategory(visibilityMeters: Double?, wmoCode: Int?): FlightCategory {
        val visMiles = (visibilityMeters ?: 16000.0) / 1609.34
        val code = wmoCode ?: 0
        return when {
            visMiles < 3.0 || code in setOf(45, 48, 65, 95, 96, 99) -> FlightCategory.IFR
            visMiles < 5.0 || code in setOf(51, 53, 55, 61, 63, 71, 73, 80, 81) -> FlightCategory.MVFR
            else -> FlightCategory.VFR
        }
    }

    fun degreesToCardinal(degrees: Int?): String {
        val d = ((degrees ?: 270) % 360 + 360) % 360
        val directions = arrayOf("N", "NE", "E", "SE", "S", "SW", "W", "NW")
        val idx = ((d + 22.5) / 45.0).toInt() % 8
        return directions[idx]
    }

    fun mapToRealtimeAirportWeather(
        icao: String,
        dto: OpenMeteoResponseDto
    ): RealtimeAirportWeather {
        val current = dto.current
        val tempC = current?.temperature2m?.toInt() ?: 20
        val tempF = (tempC * 9 / 5) + 32
        val condition = mapWmoCodeToCondition(current?.weatherCode)
        val windKnots = current?.windSpeed10m?.toInt() ?: 10
        val windDir = degreesToCardinal(current?.windDirection10m)
        val visMiles = ((current?.visibility ?: 16000.0) / 1609.34).toInt().coerceIn(1, 10)
        val visLabel = if (visMiles >= 10) "10+ mi" else "$visMiles mi"
        val humidity = current?.relativeHumidity2m ?: 55
        val hPa = current?.surfacePressure ?: 1013.25
        val inHg = ((hPa * 0.02953) * 100).toInt() / 100.0
        val flightCat = determineFlightCategory(current?.visibility, current?.weatherCode)

        val degStr = String.format(Locale.US, "%03d", current?.windDirection10m ?: 270)
        val ktStr = String.format(Locale.US, "%02d", windKnots)
        val qnh = hPa.toInt()
        val metar = "$icao AUTO ${degStr}${ktStr}KT ${visMiles}SM ${condition.uppercase(Locale.US).take(6)} ${tempC}/${maxOf(0, tempC - 6)} Q$qnh"

        return RealtimeAirportWeather(
            tempC = tempC,
            tempF = tempF,
            condition = condition,
            wind = "$windKnots kt $windDir",
            visibility = visLabel,
            humidity = humidity,
            pressureInHg = inHg,
            metarRaw = metar,
            flightCategory = flightCat
        )
    }

    fun mapToDestinationForecast(
        airport: Airport,
        arrivalTime: String,
        dto: OpenMeteoResponseDto
    ): DestinationArrivalForecast {
        val current = dto.current
        val tempC = current?.temperature2m?.toInt() ?: airport.weather.tempC
        val tempF = (tempC * 9 / 5) + 32
        val condition = mapWmoCodeToCondition(current?.weatherCode)
        val windKnots = current?.windSpeed10m?.toInt() ?: 10
        val windDir = degreesToCardinal(current?.windDirection10m)
        val visMiles = ((current?.visibility ?: 16000.0) / 1609.34).toInt().coerceIn(1, 10)
        val visLabel = if (visMiles >= 10) "10+ mi" else "$visMiles mi"
        val humidity = current?.relativeHumidity2m ?: airport.weather.humidity

        val hourlyTimes = dto.hourly?.time.orEmpty()
        val hourlyTemps = dto.hourly?.temperature2m.orEmpty()
        val hourlyPrecips = dto.hourly?.precipitationProbability.orEmpty()
        val hourlyCodes = dto.hourly?.weatherCode.orEmpty()
        val hourlyWinds = dto.hourly?.windSpeed10m.orEmpty()

        val targetHour = parseArrivalHour(arrivalTime)
        val hourlyForecasts = mutableListOf<HourlyForecast>()

        if (hourlyTimes.size >= 7 && hourlyTemps.size >= 7) {
            val startIndex = hourlyTimes.indexOfFirst { it.endsWith(String.format(Locale.US, "%02d:00", targetHour)) }
                .let { if (it >= 2) it - 2 else 0 }
                .coerceAtMost(maxOf(0, hourlyTimes.size - 7))

            for (i in 0 until minOf(7, hourlyTimes.size - startIndex)) {
                val idx = startIndex + i
                val timeRaw = hourlyTimes[idx].substringAfter("T")
                val hTempC = hourlyTemps.getOrNull(idx)?.toInt() ?: tempC
                val hTempF = (hTempC * 9 / 5) + 32
                val hPrecip = hourlyPrecips.getOrNull(idx) ?: 10
                val hCode = hourlyCodes.getOrNull(idx) ?: 0
                val hWind = hourlyWinds.getOrNull(idx)?.toInt() ?: windKnots
                val isTarget = i == 2

                hourlyForecasts.add(
                    HourlyForecast(
                        time = if (isTarget) "$arrivalTime (ETA)" else timeRaw,
                        tempC = hTempC,
                        tempF = hTempF,
                        condition = mapWmoCodeToCondition(hCode),
                        precipProbabilityPercent = hPrecip,
                        windSpeedKnots = hWind,
                        isArrivalTarget = isTarget
                    )
                )
            }
        }

        val maxPrecipChance = hourlyForecasts.firstOrNull { it.isArrivalTarget }?.precipProbabilityPercent
            ?: dto.daily?.precipitationProbabilityMax?.firstOrNull()
            ?: if (condition.contains("Rain", ignoreCase = true)) 70 else 10

        val flightCategoryEnum = determineFlightCategory(current?.visibility, current?.weatherCode)
        val flightCategoryLabel = when (flightCategoryEnum) {
            FlightCategory.IFR -> "IFR (Instrument Flight Rules)"
            FlightCategory.MVFR -> "MVFR (Marginal VFR)"
            FlightCategory.VFR -> "VFR (Visual Flight Rules)"
        }

        val crosswindRisk = when {
            windKnots >= 18 -> "Moderate Crosswind Caution ($windKnots kt $windDir)"
            windKnots >= 12 -> "Standard Approach Winds ($windKnots kt $windDir)"
            else -> "Light Winds · Smooth Final ($windKnots kt $windDir)"
        }

        val packingAdvice = when {
            tempC < 10 -> "Cold arrival (${tempC}°C). Pack a warm coat and thermal layers."
            maxPrecipChance >= 50 -> "Rain likely at arrival (${maxPrecipChance}% chance). Keep an umbrella or raincoat accessible."
            tempC > 28 -> "Warm arrival (${tempC}°C). Light breathable clothing and sunglasses advised."
            else -> "Comfortable arrival conditions (${tempC}°C). Light jacket recommended for airport transit."
        }

        val dailyTimes = dto.daily?.time.orEmpty()
        val dailyHighs = dto.daily?.temperature2mMax.orEmpty()
        val dailyLows = dto.daily?.temperature2mMin.orEmpty()
        val dailyCodes = dto.daily?.weatherCode.orEmpty()
        val dailyPrecips = dto.daily?.precipitationProbabilityMax.orEmpty()

        val dayLabels = listOf("Arrival Day", "Day 2", "Day 3")
        val dailyForecasts = (0 until minOf(3, dailyTimes.size)).map { idx ->
            val hiC = dailyHighs.getOrNull(idx)?.toInt() ?: (tempC + 3)
            val loC = dailyLows.getOrNull(idx)?.toInt() ?: (tempC - 3)
            val dCond = mapWmoCodeToCondition(dailyCodes.getOrNull(idx))
            val dPrecip = dailyPrecips.getOrNull(idx) ?: maxPrecipChance
            DailyForecast(
                dayName = dayLabels.getOrElse(idx) { "Day ${idx + 1}" },
                dateString = dailyTimes.getOrNull(idx) ?: "Upcoming",
                tempHighC = hiC,
                tempHighF = (hiC * 9 / 5) + 32,
                tempLowC = loC,
                tempLowF = (loC * 9 / 5) + 32,
                condition = dCond,
                precipProbabilityPercent = dPrecip,
                packingTip = if (dPrecip >= 50) "Bring rain protection for outdoor transit." else "Ideal conditions for city travel."
            )
        }

        return DestinationArrivalForecast(
            airportCode = airport.code,
            airportName = airport.name,
            airportCity = airport.city,
            arrivalTime = arrivalTime,
            arrivalTempC = tempC,
            arrivalTempF = tempF,
            arrivalCondition = condition,
            precipitationChance = maxPrecipChance,
            windCondition = "$windKnots kt $windDir",
            visibility = visLabel,
            humidity = humidity,
            hourlyForecast = hourlyForecasts,
            dailyForecast = dailyForecasts,
            advisory = ArrivalAviationAdvisory(
                flightCategory = flightCategoryLabel,
                crosswindKnots = windKnots,
                crosswindRisk = crosswindRisk,
                runwayVisualRange = if (visMiles >= 6) "6,000+ ft (RVR Clear)" else "${visMiles * 1000} ft (Reduced RVR)",
                arrivalNotice = "Live Open-Meteo telemetry for ${airport.code} (${airport.city}): ${tempC}°C, $condition."
            ),
            packingAdvice = packingAdvice,
            lastUpdated = System.currentTimeMillis()
        )
    }

    private fun parseArrivalHour(timeStr: String): Int {
        return try {
            val clean = timeStr.trim().take(5)
            clean.split(":")[0].toInt().coerceIn(0, 23)
        } catch (_: Exception) {
            14
        }
    }
}
