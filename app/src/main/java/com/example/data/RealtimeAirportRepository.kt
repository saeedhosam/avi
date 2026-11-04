package com.example.data

import com.example.data.remote.ApiConfig
import com.example.data.remote.DataSourceMode
import com.example.data.remote.aerodatabox.AeroDataBoxApiService
import com.example.data.remote.aerodatabox.AeroDataBoxMapper
import com.example.data.remote.aerodatabox.AeroDataBoxNetworkClient
import com.example.data.remote.weather.OpenMeteoApiService
import com.example.data.remote.weather.OpenMeteoMapper
import com.example.data.remote.weather.OpenMeteoNetworkClient
import com.example.model.FlightCategory
import com.example.model.RealtimeAirportInfo
import com.example.model.RealtimeAirportWeather
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext

class RealtimeAirportRepository(
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
    private val aeroApi: AeroDataBoxApiService? = null,
    private val openMeteoApi: OpenMeteoApiService? = null,
    private val enableLiveNetwork: Boolean = ApiConfig.hasValidAeroDataBoxKey()
) {

    private val _dataSourceMode = MutableStateFlow(
        ApiConfig.resolveInitialMode(isOffline = false)
    )
    val dataSourceMode: StateFlow<DataSourceMode> = _dataSourceMode.asStateFlow()

    private val allAirports = listOf(
        RealtimeAirportInfo(
            code = "JFK",
            icao = "KJFK",
            name = "John F. Kennedy International Airport",
            city = "New York",
            country = "United States",
            region = "Americas",
            timezone = "EDT (UTC-4)",
            latitude = 40.6413,
            longitude = -73.7781,
            elevationFeet = 13,
            operationalStatus = "Normal Operations",
            isDelayed = false,
            delayMinutes = 4,
            onTimePercentage = 93,
            activeDeparturesCount = 48,
            activeArrivalsCount = 52,
            activeRunways = listOf("04L / 22R", "13R / 31L"),
            terminalCount = 6,
            weather = RealtimeAirportWeather(
                tempC = 19,
                tempF = 66,
                condition = "Clear Sky",
                wind = "11 kt NW",
                visibility = "10+ mi",
                humidity = 52,
                pressureInHg = 30.12,
                metarRaw = "KJFK 040751Z 32011KT 10SM CLR 19/09 A3012 RMK AO2",
                flightCategory = FlightCategory.VFR
            ),
            hubAirlines = listOf("Delta", "American", "JetBlue")
        ),
        RealtimeAirportInfo(
            code = "LHR",
            icao = "EGLL",
            name = "London Heathrow Airport",
            city = "London",
            country = "United Kingdom",
            region = "Europe",
            timezone = "BST (UTC+1)",
            latitude = 51.4700,
            longitude = -0.4543,
            elevationFeet = 83,
            operationalStatus = "ATC Flow Management (18m avg delay)",
            isDelayed = true,
            delayMinutes = 18,
            delayReason = "Dense Cloud Layer & Headwinds",
            onTimePercentage = 79,
            activeDeparturesCount = 64,
            activeArrivalsCount = 62,
            activeRunways = listOf("09L / 27R", "09R / 27L"),
            terminalCount = 4,
            weather = RealtimeAirportWeather(
                tempC = 14,
                tempF = 57,
                condition = "Light Drizzle & Overcast",
                wind = "16 kt WSW",
                visibility = "6 mi",
                humidity = 78,
                pressureInHg = 29.84,
                metarRaw = "EGLL 040750Z 24016KT 9999 -RA BKN012 OVC025 14/10 Q1010",
                flightCategory = FlightCategory.MVFR
            ),
            hubAirlines = listOf("British Airways", "Virgin Atlantic")
        ),
        RealtimeAirportInfo(
            code = "SFO",
            icao = "KSFO",
            name = "San Francisco International Airport",
            city = "San Francisco",
            country = "United States",
            region = "Americas",
            timezone = "PDT (UTC-7)",
            latitude = 37.6213,
            longitude = -122.3790,
            elevationFeet = 13,
            operationalStatus = "Ground Delay Program (32m avg)",
            isDelayed = true,
            delayMinutes = 32,
            delayReason = "Marine Stratus Fog Layer",
            onTimePercentage = 71,
            activeDeparturesCount = 42,
            activeArrivalsCount = 39,
            activeRunways = listOf("28L / 28R", "01L / 01R"),
            terminalCount = 4,
            weather = RealtimeAirportWeather(
                tempC = 17,
                tempF = 63,
                condition = "Coastal Fog / Low Stratus",
                wind = "14 kt W",
                visibility = "4 mi",
                humidity = 82,
                pressureInHg = 29.98,
                metarRaw = "KSFO 040756Z 28014KT 4SM BR OVC009 17/14 A2998",
                flightCategory = FlightCategory.IFR
            ),
            hubAirlines = listOf("United Airlines", "Alaska Airlines")
        ),
        RealtimeAirportInfo(
            code = "HND",
            icao = "RJTT",
            name = "Tokyo Haneda International Airport",
            city = "Tokyo",
            country = "Japan",
            region = "Asia-Pacific",
            timezone = "JST (UTC+9)",
            latitude = 35.5494,
            longitude = 139.7798,
            elevationFeet = 21,
            operationalStatus = "Normal Operations · Optimal Efficiency",
            isDelayed = false,
            delayMinutes = 2,
            onTimePercentage = 97,
            activeDeparturesCount = 72,
            activeArrivalsCount = 74,
            activeRunways = listOf("16L / 34R", "16R / 34L", "05 / 23"),
            terminalCount = 3,
            weather = RealtimeAirportWeather(
                tempC = 22,
                tempF = 72,
                condition = "Partly Cloudy",
                wind = "8 kt S",
                visibility = "10+ mi",
                humidity = 58,
                pressureInHg = 30.08,
                metarRaw = "RJTT 040800Z 18008KT 9999 FEW030 SCT050 22/13 Q1018",
                flightCategory = FlightCategory.VFR
            ),
            hubAirlines = listOf("ANA", "Japan Airlines")
        ),
        RealtimeAirportInfo(
            code = "DXB",
            icao = "OMDB",
            name = "Dubai International Airport",
            city = "Dubai",
            country = "United Arab Emirates",
            region = "Middle East",
            timezone = "GST (UTC+4)",
            latitude = 25.2532,
            longitude = 55.3657,
            elevationFeet = 62,
            operationalStatus = "Normal Operations · Heavy Widebody Traffic",
            isDelayed = false,
            delayMinutes = 6,
            onTimePercentage = 91,
            activeDeparturesCount = 88,
            activeArrivalsCount = 92,
            activeRunways = listOf("12L / 30R", "12R / 30L"),
            terminalCount = 3,
            weather = RealtimeAirportWeather(
                tempC = 34,
                tempF = 93,
                condition = "Clear · High Temp",
                wind = "9 kt NW",
                visibility = "10 mi",
                humidity = 41,
                pressureInHg = 29.82,
                metarRaw = "OMDB 040800Z 32009KT CAVOK 34/19 Q1009 NOSIG",
                flightCategory = FlightCategory.VFR
            ),
            hubAirlines = listOf("Emirates", "flydubai")
        ),
        RealtimeAirportInfo(
            code = "SIN",
            icao = "WSSS",
            name = "Singapore Changi Airport",
            city = "Singapore",
            country = "Singapore",
            region = "Asia-Pacific",
            timezone = "SGT (UTC+8)",
            latitude = 1.3644,
            longitude = 103.9915,
            elevationFeet = 22,
            operationalStatus = "Normal Operations · High Transit Volume",
            isDelayed = false,
            delayMinutes = 3,
            onTimePercentage = 95,
            activeDeparturesCount = 56,
            activeArrivalsCount = 58,
            activeRunways = listOf("02L / 20R", "02C / 20C"),
            terminalCount = 4,
            weather = RealtimeAirportWeather(
                tempC = 28,
                tempF = 82,
                condition = "Isolated Tropical Showers",
                wind = "6 kt E",
                visibility = "9 mi",
                humidity = 84,
                pressureInHg = 29.86,
                metarRaw = "WSSS 040800Z 09006KT 9000 VCSH FEW018TCU BKN140 28/25 Q1011",
                flightCategory = FlightCategory.VFR
            ),
            hubAirlines = listOf("Singapore Airlines", "Scoot")
        ),
        RealtimeAirportInfo(
            code = "CDG",
            icao = "LFPG",
            name = "Paris Charles de Gaulle Airport",
            city = "Paris",
            country = "France",
            region = "Europe",
            timezone = "CEST (UTC+2)",
            latitude = 49.0097,
            longitude = 2.5479,
            elevationFeet = 392,
            operationalStatus = "Normal Operations",
            isDelayed = false,
            delayMinutes = 8,
            onTimePercentage = 87,
            activeDeparturesCount = 54,
            activeArrivalsCount = 56,
            activeRunways = listOf("08L / 26R", "08R / 26L", "09L / 27R"),
            terminalCount = 3,
            weather = RealtimeAirportWeather(
                tempC = 16,
                tempF = 61,
                condition = "Partly Cloudy",
                wind = "10 kt NNE",
                visibility = "10+ mi",
                humidity = 64,
                pressureInHg = 30.06,
                metarRaw = "LFPG 040800Z 02010KT CAVOK 16/09 Q1018 NOSIG",
                flightCategory = FlightCategory.VFR
            ),
            hubAirlines = listOf("Air France")
        ),
        RealtimeAirportInfo(
            code = "ORD",
            icao = "KORD",
            name = "Chicago O'Hare International Airport",
            city = "Chicago",
            country = "United States",
            region = "Americas",
            timezone = "CDT (UTC-5)",
            latitude = 41.9742,
            longitude = -87.9073,
            elevationFeet = 668,
            operationalStatus = "Minor Wind Flow Restrictions (15m delay)",
            isDelayed = true,
            delayMinutes = 15,
            delayReason = "Gusty Crosswinds 22G30KT",
            onTimePercentage = 82,
            activeDeparturesCount = 76,
            activeArrivalsCount = 80,
            activeRunways = listOf("09C / 27C", "10L / 28R", "09R / 27L"),
            terminalCount = 4,
            weather = RealtimeAirportWeather(
                tempC = 15,
                tempF = 59,
                condition = "Breezy / Scattered Clouds",
                wind = "22 kt G 30 kt W",
                visibility = "10+ mi",
                humidity = 55,
                pressureInHg = 29.94,
                metarRaw = "KORD 040751Z 27022G30KT 10SM SCT045 15/06 A2994",
                flightCategory = FlightCategory.VFR
            ),
            hubAirlines = listOf("United Airlines", "American Airlines")
        ),
        RealtimeAirportInfo(
            code = "AMS",
            icao = "EHAM",
            name = "Amsterdam Airport Schiphol",
            city = "Amsterdam",
            country = "Netherlands",
            region = "Europe",
            timezone = "CEST (UTC+2)",
            latitude = 52.3105,
            longitude = 4.7683,
            elevationFeet = -11,
            operationalStatus = "Normal Operations · Below Sea Level",
            isDelayed = false,
            delayMinutes = 5,
            onTimePercentage = 90,
            activeDeparturesCount = 50,
            activeArrivalsCount = 52,
            activeRunways = listOf("18R / 36L Polderbaan", "06 / 24 Kaagbaan"),
            terminalCount = 1,
            weather = RealtimeAirportWeather(
                tempC = 13,
                tempF = 55,
                condition = "Mostly Cloudy",
                wind = "14 kt SW",
                visibility = "8 mi",
                humidity = 76,
                pressureInHg = 30.01,
                metarRaw = "EHAM 040825Z 22014KT 9999 BKN020 13/09 Q1016",
                flightCategory = FlightCategory.VFR
            ),
            hubAirlines = listOf("KLM", "Transavia")
        ),
        RealtimeAirportInfo(
            code = "FRA",
            icao = "EDDF",
            name = "Frankfurt Airport",
            city = "Frankfurt",
            country = "Germany",
            region = "Europe",
            timezone = "CEST (UTC+2)",
            latitude = 50.0379,
            longitude = 8.5622,
            elevationFeet = 364,
            operationalStatus = "Normal Operations",
            isDelayed = false,
            delayMinutes = 7,
            onTimePercentage = 89,
            activeDeparturesCount = 60,
            activeArrivalsCount = 58,
            activeRunways = listOf("07C / 25C", "07R / 25L", "18 Runway West"),
            terminalCount = 2,
            weather = RealtimeAirportWeather(
                tempC = 16,
                tempF = 61,
                condition = "Clear",
                wind = "7 kt NE",
                visibility = "10+ mi",
                humidity = 60,
                pressureInHg = 30.15,
                metarRaw = "EDDF 040750Z 05007KT CAVOK 16/08 Q1021 NOSIG",
                flightCategory = FlightCategory.VFR
            ),
            hubAirlines = listOf("Lufthansa", "Condor")
        ),
        RealtimeAirportInfo(
            code = "LAX",
            icao = "KLAX",
            name = "Los Angeles International Airport",
            city = "Los Angeles",
            country = "United States",
            region = "Americas",
            timezone = "PDT (UTC-7)",
            latitude = 33.9416,
            longitude = -118.4085,
            elevationFeet = 125,
            operationalStatus = "Normal Operations · Heavy Transpacific Hub",
            isDelayed = false,
            delayMinutes = 9,
            onTimePercentage = 88,
            activeDeparturesCount = 68,
            activeArrivalsCount = 70,
            activeRunways = listOf("24L / 24R", "25L / 25R"),
            terminalCount = 9,
            weather = RealtimeAirportWeather(
                tempC = 21,
                tempF = 70,
                condition = "Sunny",
                wind = "10 kt WSW",
                visibility = "10 mi",
                humidity = 58,
                pressureInHg = 29.96,
                metarRaw = "KLAX 040753Z 25010KT 10SM CLR 21/13 A2996",
                flightCategory = FlightCategory.VFR
            ),
            hubAirlines = listOf("Delta", "American", "United")
        ),
        RealtimeAirportInfo(
            code = "SYD",
            icao = "YSSY",
            name = "Sydney Kingsford Smith Airport",
            city = "Sydney",
            country = "Australia",
            region = "Asia-Pacific",
            timezone = "AEST (UTC+10)",
            latitude = -33.9399,
            longitude = 151.1753,
            elevationFeet = 21,
            operationalStatus = "Normal Operations",
            isDelayed = false,
            delayMinutes = 4,
            onTimePercentage = 94,
            activeDeparturesCount = 44,
            activeArrivalsCount = 46,
            activeRunways = listOf("16R / 34L", "16L / 34R", "07 / 25"),
            terminalCount = 3,
            weather = RealtimeAirportWeather(
                tempC = 20,
                tempF = 68,
                condition = "Clear Breeze",
                wind = "13 kt S",
                visibility = "10+ mi",
                humidity = 62,
                pressureInHg = 30.10,
                metarRaw = "YSSY 040800Z 18013KT 9999 FEW035 20/12 Q1019",
                flightCategory = FlightCategory.VFR
            ),
            hubAirlines = listOf("Qantas", "Virgin Australia")
        ),
        RealtimeAirportInfo(
            code = "CAI",
            icao = "HECA",
            name = "Cairo International Airport",
            city = "Cairo",
            country = "Egypt",
            region = "Middle East",
            timezone = "EEST (UTC+3)",
            latitude = 30.1219,
            longitude = 31.4056,
            elevationFeet = 382,
            operationalStatus = "Normal Operations · Primary North Africa & MENA Hub",
            isDelayed = false,
            delayMinutes = 4,
            onTimePercentage = 92,
            activeDeparturesCount = 68,
            activeArrivalsCount = 65,
            activeRunways = listOf("05L / 23R", "05C / 23C", "05R / 23L"),
            terminalCount = 3,
            weather = RealtimeAirportWeather(
                tempC = 28,
                tempF = 82,
                condition = "Sunny & Clear",
                wind = "9 kt NNE",
                visibility = "10+ mi",
                humidity = 38,
                pressureInHg = 30.04,
                metarRaw = "HECA 040800Z 02009KT CAVOK 28/12 Q1017 NOSIG",
                flightCategory = FlightCategory.VFR
            ),
            hubAirlines = listOf("EgyptAir", "Air Cairo", "Nile Air")
        )
    )

    suspend fun searchAirports(
        query: String,
        region: String = "All",
        statusFilter: String = "All",
        simulateNetworkDelay: Boolean = true
    ): Result<List<RealtimeAirportInfo>> = withContext(ioDispatcher) {
        if (simulateNetworkDelay && !enableLiveNetwork) {
            delay(550)
        }

        runCatching {
            val q = query.trim()
            val candidateAirports = if (enableLiveNetwork && q.length >= 2) {
                fetchLiveAirportsOrFallback(q)
            } else {
                allAirports
            }

            val qLower = q.lowercase()
            candidateAirports.filter { airport ->
                val matchesQuery = if (qLower.isBlank()) true else {
                    airport.code.lowercase().contains(qLower) ||
                        airport.icao.lowercase().contains(qLower) ||
                        airport.name.lowercase().contains(qLower) ||
                        airport.city.lowercase().contains(qLower) ||
                        airport.country.lowercase().contains(qLower) ||
                        airport.hubAirlines.any { it.lowercase().contains(qLower) }
                }

                val matchesRegion = if (region == "All") true else {
                    airport.region.equals(region, ignoreCase = true)
                }

                val matchesStatus = when (statusFilter) {
                    "Delayed" -> airport.isDelayed
                    "On-Time" -> !airport.isDelayed
                    "Weather Alerts" -> airport.weather.flightCategory != FlightCategory.VFR
                    else -> true
                }

                matchesQuery && matchesRegion && matchesStatus
            }
        }
    }

    private suspend fun fetchLiveAirportsOrFallback(query: String): List<RealtimeAirportInfo> {
        return try {
            val client = aeroApi ?: AeroDataBoxNetworkClient.apiService
            val weatherClient = openMeteoApi ?: OpenMeteoNetworkClient.apiService

            val searchResponse = client.searchAirportsByTerm(query = query, limit = 8)
            if (searchResponse.code() == 429) {
                _dataSourceMode.value = DataSourceMode.QUOTA_FALLBACK
                return allAirports
            }

            if (searchResponse.isSuccessful && searchResponse.body()?.items?.isNotEmpty() == true) {
                _dataSourceMode.value = DataSourceMode.LIVE_AERODATABOX
                val dtoItems = searchResponse.body()!!.items.orEmpty()
                val mapped = dtoItems.mapNotNull { dto ->
                    val code = dto.iata?.uppercase()
                    val base = allAirports.find { it.code.equals(code, ignoreCase = true) }
                    val delayDto = if (!code.isNullOrBlank() && dtoItems.size <= 3) {
                        runCatching { client.getAirportDelays(code).body() }.getOrNull()
                    } else null

                    val info = AeroDataBoxMapper.mapAirportToRealtimeInfo(dto, delayDto, base)
                    if (info != null && dtoItems.size <= 3) {
                        val liveWeather = runCatching {
                            val wRes = weatherClient.getForecast(info.latitude, info.longitude)
                            wRes.body()?.let { OpenMeteoMapper.mapToRealtimeAirportWeather(info.icao, it) }
                        }.getOrNull()
                        if (liveWeather != null) info.copy(weather = liveWeather) else info
                    } else {
                        info
                    }
                }
                if (mapped.isNotEmpty()) {
                    val existingCodes = mapped.map { it.code }.toSet()
                    mapped + allAirports.filter { it.code !in existingCodes }
                } else {
                    allAirports
                }
            } else {
                allAirports
            }
        } catch (_: Exception) {
            allAirports
        }
    }

    suspend fun getAirportByCode(code: String): RealtimeAirportInfo? = withContext(ioDispatcher) {
        allAirports.find { it.code.equals(code, ignoreCase = true) }
    }

    suspend fun getAllAirports(): List<RealtimeAirportInfo> = withContext(ioDispatcher) {
        allAirports
    }
}
