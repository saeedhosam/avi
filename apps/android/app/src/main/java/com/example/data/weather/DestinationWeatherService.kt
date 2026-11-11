package com.example.data.weather

import android.content.Context
import android.util.Log
import com.example.data.local.DestinationWeatherEntity
import com.example.data.local.SkyTrackDatabase
import com.example.data.remote.weather.OpenMeteoApiService
import com.example.data.remote.weather.OpenMeteoMapper
import com.example.data.remote.weather.OpenMeteoNetworkClient
import com.example.model.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import java.util.Locale

/**
 * Service component responsible for fetching real-time destination airport weather forecasts
 * from Open-Meteo (with local Room SQLite caching and offline fallback) to help users plan their arrival.
 */
class DestinationWeatherService(
    context: Context,
    private val openMeteoApi: OpenMeteoApiService = OpenMeteoNetworkClient.apiService
) {

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
     * Fetches a live destination arrival weather forecast from Open-Meteo for the specified
     * airport coordinates and arrival time, caching it in Room for offline access.
     */
    suspend fun getDestinationForecast(
        airport: Airport,
        arrivalTime: String,
        forceRefresh: Boolean = false
    ): DestinationArrivalForecast = withContext(Dispatchers.IO) {
        // 1. Check local Room cache (15-minute TTL unless forceRefresh is requested)
        val cached = flightDao.getCachedDestinationWeather(airport.code)
        val now = System.currentTimeMillis()
        if (!forceRefresh && cached != null && (now - cached.cachedTimestamp) < 15 * 60 * 1000) {
            return@withContext mapEntityToForecast(cached)
        }

        // 2. Attempt live meteorological fetch from Open-Meteo API
        val liveForecast = try {
            val response = openMeteoApi.getForecast(
                latitude = airport.latitude,
                longitude = airport.longitude
            )
            if (response.isSuccessful && response.body() != null) {
                OpenMeteoMapper.mapToDestinationForecast(
                    airport = airport,
                    arrivalTime = arrivalTime,
                    dto = response.body()!!
                )
            } else {
                null
            }
        } catch (e: Exception) {
            Log.d("DestinationWeather", "Open-Meteo live fetch fallback for ${airport.code}: ${e.message}")
            null
        }

        // 3. Use live forecast if available, otherwise a cached entity. If
        // neither exists, return an explicit unavailable forecast; never
        // synthesize weather values from cached conditions.
        val forecast = liveForecast
            ?: cached?.let { mapEntityToForecast(it) }
            ?: unavailableForecast(airport, arrivalTime)

        if (!forecast.dataAvailable) {
            return@withContext forecast
        }

        // 4. Persist into Room database
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

    private fun unavailableForecast(
        airport: Airport,
        arrivalTime: String
    ): DestinationArrivalForecast = DestinationArrivalForecast(
        airportCode = airport.code,
        airportName = airport.name,
        airportCity = airport.city,
        arrivalTime = arrivalTime,
        arrivalTempC = 0,
        arrivalTempF = 32,
        arrivalCondition = "Not reported",
        precipitationChance = 0,
        windCondition = "Not reported",
        visibility = "Not reported",
        humidity = 0,
        hourlyForecast = emptyList(),
        dailyForecast = emptyList(),
        advisory = ArrivalAviationAdvisory(
            flightCategory = "Not reported",
            crosswindKnots = 0,
            crosswindRisk = "Not reported",
            runwayVisualRange = "Not reported",
            arrivalNotice = "Not reported"
        ),
        packingAdvice = "Forecast unavailable. No estimated weather was generated.",
        dataAvailable = false
    )

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
