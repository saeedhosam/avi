package com.example.data.weather

import android.content.Context
import com.example.data.local.DestinationWeatherEntity
import com.example.data.local.SkyTrackDatabase
import com.example.model.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Service component responsible for fetching, synthesizing, and caching
 * local destination airport weather forecasts tailored for flight arrival planning.
 */
class DestinationWeatherService(context: Context) {

    private val database = SkyTrackDatabase.getDatabase(context)
    private val flightDao = database.flightDao()

    /**
     * Observes the cached destination weather forecast from the Room database.
     */
    fun observeDestinationWeather(airportCode: String): Flow<DestinationArrivalForecast?> {
        return flightDao.getDestinationWeather(airportCode).map { entity ->
            entity?.let { mapEntityToForecast(it) }
        }
    }

    /**
     * Fetches or generates a destination arrival weather forecast for the specified
     * airport and arrival time, caching it in Room for offline access.
     */
    suspend fun getDestinationForecast(
        airport: Airport,
        arrivalTime: String
    ): DestinationArrivalForecast = withContext(Dispatchers.IO) {
        // 1. Check local Room cache
        val cached = flightDao.getCachedDestinationWeather(airport.code)
        val now = System.currentTimeMillis()
        if (cached != null && (now - cached.cachedTimestamp) < 15 * 60 * 1000) {
            return@withContext mapEntityToForecast(cached)
        }

        // 2. Synthesize fresh destination arrival forecast
        val forecast = generateDestinationForecast(airport, arrivalTime)

        // 3. Cache into Room database
        val entity = DestinationWeatherEntity(
            airportCode = forecast.airportCode,
            airportCity = forecast.airportCity,
            airportName = forecast.airportName,
            arrivalTime = forecast.arrivalTime,
            tempC = forecast.arrivalTempC,
            tempF = forecast.arrivalTempF,
            condition = forecast.arrivalCondition,
            precipChance = forecast.precipitationChance,
            windCondition = forecast.windCondition,
            visibility = forecast.visibility,
            humidity = forecast.humidity,
            flightCategory = forecast.advisory.flightCategory,
            crosswindRisk = forecast.advisory.crosswindRisk,
            packingAdvice = forecast.packingAdvice,
            hourlyJson = serializeHourly(forecast.hourlyForecast),
            dailyJson = serializeDaily(forecast.dailyForecast),
            cachedTimestamp = now
        )
        flightDao.insertDestinationWeather(entity)

        forecast
    }

    private fun generateDestinationForecast(airport: Airport, arrivalTime: String): DestinationArrivalForecast {
        val baseWeather = airport.weather
        val arrivalHour = parseArrivalHour(arrivalTime)

        // Adjust temperature slightly for time of day at arrival
        val isNightArrival = arrivalHour < 6 || arrivalHour > 21
        val tempAdjustment = if (isNightArrival) -3 else 1
        val arrTempC = baseWeather.tempC + tempAdjustment
        val arrTempF = (arrTempC * 9 / 5) + 32

        // Determine precipitation chance based on condition
        val precipChance = when {
            baseWeather.condition.contains("Rain", ignoreCase = true) || baseWeather.condition.contains("Drizzle", ignoreCase = true) -> 75
            baseWeather.condition.contains("Thunder", ignoreCase = true) -> 90
            baseWeather.condition.contains("Fog", ignoreCase = true) -> 40
            baseWeather.condition.contains("Cloud", ignoreCase = true) -> 20
            else -> 5
        }

        // Aviation flight category (VFR, MVFR, IFR)
        val flightCategory = when {
            baseWeather.condition.contains("Thunder", ignoreCase = true) -> "IFR (Instrument Flight Rules)"
            baseWeather.condition.contains("Fog", ignoreCase = true) || baseWeather.condition.contains("Rain", ignoreCase = true) -> "MVFR (Marginal VFR)"
            else -> "VFR (Visual Flight Rules)"
        }

        // Crosswind risk analysis
        val crosswindKnots = when (airport.code) {
            "SFO" -> 16
            "LHR" -> 14
            "ORD" -> 18
            "HND" -> 11
            else -> 8
        }
        val crosswindRisk = when {
            crosswindKnots >= 18 -> "Moderate Crosswind Caution (Runway 28R/L)"
            crosswindKnots >= 12 -> "Standard Approach Winds"
            else -> "Light Crosswinds (Smooth Final)"
        }

        // Destination packing & arrival tip
        val packingAdvice = when {
            arrTempC < 10 -> "Cold arrival expected (${arrTempC}°C). Heavy coat & thermal wear recommended."
            precipChance > 50 -> "Rain expected at arrival (${precipChance}% chance). Keep an umbrella and waterproof jacket handy."
            baseWeather.condition.contains("Fog", ignoreCase = true) -> "Coastal mist & low visibility at touchdown. Allow extra time for airport transfers."
            arrTempC > 28 -> "Warm & sunny arrival (${arrTempC}°C). Breathable light clothing and sunglasses recommended."
            else -> "Pleasant conditions (${arrTempC}°C) expected. Light layers or jacket suitable for arrival."
        }

        // Generate hourly forecast around arrival window (-2h to +4h)
        val hourlyList = mutableListOf<HourlyForecast>()
        for (offset in -2..4) {
            val hour = (arrivalHour + offset + 24) % 24
            val timeLabel = String.format(Locale.getDefault(), "%02d:00", hour)
            val isTarget = offset == 0
            val hTempC = arrTempC + (offset * 0.5).toInt()
            val hTempF = (hTempC * 9 / 5) + 32
            val hPrecip = (precipChance + (offset * 3)).coerceIn(5, 95)
            val hCondition = if (isTarget) baseWeather.condition else if (hPrecip > 50) "Light Showers" else baseWeather.condition

            hourlyList.add(
                HourlyForecast(
                    time = if (isTarget) "$arrivalTime (ETA)" else timeLabel,
                    tempC = hTempC,
                    tempF = hTempF,
                    condition = hCondition,
                    precipProbabilityPercent = hPrecip,
                    windSpeedKnots = (10 + (offset * 2)).coerceIn(5, 25),
                    isArrivalTarget = isTarget
                )
            )
        }

        // Generate 3-day arrival outlook
        val dailyList = listOf(
            DailyForecast(
                dayName = "Arrival Day",
                dateString = "Today",
                tempHighC = arrTempC + 4,
                tempHighF = ((arrTempC + 4) * 9 / 5) + 32,
                tempLowC = arrTempC - 3,
                tempLowF = ((arrTempC - 3) * 9 / 5) + 32,
                condition = baseWeather.condition,
                precipProbabilityPercent = precipChance,
                packingTip = packingAdvice
            ),
            DailyForecast(
                dayName = "Day 2",
                dateString = "Tomorrow",
                tempHighC = arrTempC + 3,
                tempHighF = ((arrTempC + 3) * 9 / 5) + 32,
                tempLowC = arrTempC - 2,
                tempLowF = ((arrTempC - 2) * 9 / 5) + 32,
                condition = if (precipChance > 40) "Scattered Showers" else "Partly Cloudy",
                precipProbabilityPercent = (precipChance - 15).coerceAtLeast(10),
                packingTip = "Layered clothing recommended for city transit."
            ),
            DailyForecast(
                dayName = "Day 3",
                dateString = "Day After",
                tempHighC = arrTempC + 5,
                tempHighF = ((arrTempC + 5) * 9 / 5) + 32,
                tempLowC = arrTempC - 1,
                tempLowF = ((arrTempC - 1) * 9 / 5) + 32,
                condition = "Clear / Fair",
                precipProbabilityPercent = 15,
                packingTip = "Clear skies. Great outdoor visibility for sightseeing."
            )
        )

        return DestinationArrivalForecast(
            airportCode = airport.code,
            airportName = airport.name,
            airportCity = airport.city,
            arrivalTime = arrivalTime,
            arrivalTempC = arrTempC,
            arrivalTempF = arrTempF,
            arrivalCondition = baseWeather.condition,
            precipitationChance = precipChance,
            windCondition = baseWeather.wind,
            visibility = baseWeather.visibility,
            humidity = baseWeather.humidity,
            hourlyForecast = hourlyList,
            dailyForecast = dailyList,
            advisory = ArrivalAviationAdvisory(
                flightCategory = flightCategory,
                crosswindKnots = crosswindKnots,
                crosswindRisk = crosswindRisk,
                runwayVisualRange = "6,000+ ft (RVR Clear)",
                arrivalNotice = "Expected on-time approach into ${airport.code} (${airport.city}). Local ground temperature: ${arrTempC}°C."
            ),
            packingAdvice = packingAdvice,
            lastUpdated = System.currentTimeMillis()
        )
    }

    private fun parseArrivalHour(timeStr: String): Int {
        return try {
            val clean = timeStr.trim().take(5)
            clean.split(":")[0].toInt()
        } catch (_: Exception) {
            12
        }
    }

    private fun serializeHourly(hourly: List<HourlyForecast>): String {
        return hourly.joinToString(";") { "${it.time}|${it.tempC}|${it.tempF}|${it.condition}|${it.precipProbabilityPercent}|${it.windSpeedKnots}|${it.isArrivalTarget}" }
    }

    private fun deserializeHourly(raw: String): List<HourlyForecast> {
        if (raw.isBlank()) return emptyList()
        return raw.split(";").mapNotNull { part ->
            val p = part.split("|")
            if (p.size >= 7) {
                HourlyForecast(
                    time = p[0],
                    tempC = p[1].toIntOrNull() ?: 20,
                    tempF = p[2].toIntOrNull() ?: 68,
                    condition = p[3],
                    precipProbabilityPercent = p[4].toIntOrNull() ?: 10,
                    windSpeedKnots = p[5].toIntOrNull() ?: 10,
                    isArrivalTarget = p[6].toBoolean()
                )
            } else null
        }
    }

    private fun serializeDaily(daily: List<DailyForecast>): String {
        return daily.joinToString(";") { "${it.dayName}|${it.dateString}|${it.tempHighC}|${it.tempHighF}|${it.tempLowC}|${it.tempLowF}|${it.condition}|${it.precipProbabilityPercent}|${it.packingTip}" }
    }

    private fun deserializeDaily(raw: String): List<DailyForecast> {
        if (raw.isBlank()) return emptyList()
        return raw.split(";").mapNotNull { part ->
            val p = part.split("|")
            if (p.size >= 9) {
                DailyForecast(
                    dayName = p[0],
                    dateString = p[1],
                    tempHighC = p[2].toIntOrNull() ?: 22,
                    tempHighF = p[3].toIntOrNull() ?: 72,
                    tempLowC = p[4].toIntOrNull() ?: 14,
                    tempLowF = p[5].toIntOrNull() ?: 57,
                    condition = p[6],
                    precipProbabilityPercent = p[7].toIntOrNull() ?: 15,
                    packingTip = p[8]
                )
            } else null
        }
    }

    private fun mapEntityToForecast(entity: DestinationWeatherEntity): DestinationArrivalForecast {
        val hourly = deserializeHourly(entity.hourlyJson)
        val daily = deserializeDaily(entity.dailyJson)
        return DestinationArrivalForecast(
            airportCode = entity.airportCode,
            airportName = entity.airportName,
            airportCity = entity.airportCity,
            arrivalTime = entity.arrivalTime,
            arrivalTempC = entity.tempC,
            arrivalTempF = entity.tempF,
            arrivalCondition = entity.condition,
            precipitationChance = entity.precipChance,
            windCondition = entity.windCondition,
            visibility = entity.visibility,
            humidity = entity.humidity,
            hourlyForecast = hourly,
            dailyForecast = daily,
            advisory = ArrivalAviationAdvisory(
                flightCategory = entity.flightCategory,
                crosswindKnots = 12,
                crosswindRisk = entity.crosswindRisk,
                runwayVisualRange = "6,000+ ft (RVR Clear)",
                arrivalNotice = "Cached arrival advisory for ${entity.airportCode} (${entity.airportCity})."
            ),
            packingAdvice = entity.packingAdvice,
            lastUpdated = entity.cachedTimestamp
        )
    }
}
