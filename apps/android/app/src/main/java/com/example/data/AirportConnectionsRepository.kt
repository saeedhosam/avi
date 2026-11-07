package com.example.data

import android.content.Context
import android.util.Log
import com.example.data.local.CachedAirportRouteEntity
import com.example.data.local.SkyTrackDatabase
import com.example.data.remote.ApiConfig
import com.example.data.remote.DataSourceMode
import com.example.data.remote.gateway.GatewayNetworkClient
import com.example.data.remote.gateway.ConsoleRouteStat
import com.example.data.remote.gateway.ConsoleAirportNode
import com.example.model.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import java.util.Locale

class AirportConnectionsRepository(context: Context) {

    private val flightDao = SkyTrackDatabase.getDatabase(context).flightDao()

    private val _isLoadingRoutes = MutableStateFlow(false)
    val isLoadingRoutes: StateFlow<Boolean> = _isLoadingRoutes.asStateFlow()

    private val _routeDataSourceMode = MutableStateFlow(
        ApiConfig.resolveInitialMode(isOffline = false)
    )
    val routeDataSourceMode: StateFlow<DataSourceMode> = _routeDataSourceMode.asStateFlow()

    fun getAllAirports(): List<AirportNode> = GlobalRouteCatalog.airports

    fun getAirportNode(iata: String): AirportNode {
        return GlobalRouteCatalog.getAirport(iata)
    }

    suspend fun searchAirports(query: String): List<AirportNode> = withContext(Dispatchers.IO) {
        val trimmed = query.trim()
        val localMatches = GlobalRouteCatalog.searchAirports(trimmed)
        if (trimmed.length < 2 || !ApiConfig.isGatewayConfigured) {
            return@withContext localMatches
        }

        try {
            val response = GatewayNetworkClient.apiService.searchAirports(trimmed)
            if (response.isSuccessful && !response.body()?.airports.isNullOrEmpty()) {
                val remoteNodes = response.body()!!.airports.orEmpty().mapNotNull { node ->
                    node.toDomainNode()
                }
                remoteNodes.forEach { GlobalRouteCatalog.registerDynamicAirport(it) }
                val combined = (localMatches + remoteNodes).distinctBy { it.iata }
                combined
            } else {
                localMatches
            }
        } catch (_: Exception) {
            localMatches
        }
    }

    /**
     * Loads the complete direct flight connection network for [originIata].
     * Combines:
     * 1. Live AeroDataBox `/airports/iata/{code}/stats/routes/daily` when configured
     * 2. Room cached route records (`airport_route_connections`)
     * 3. Comprehensive built-in global route graph (with full Cairo CAI + global hub coverage)
     */
    suspend fun loadRouteNetwork(
        originIata: String,
        isOfflineMode: Boolean = false
    ): AirportRouteNetworkSummary = withContext(Dispatchers.IO) {
        val code = originIata.trim().uppercase(Locale.ROOT)
        val originNode = GlobalRouteCatalog.getAirport(code)
        val catalogConnections = GlobalRouteCatalog.getConnectionsForOrigin(originNode)

        if (isOfflineMode) {
            _routeDataSourceMode.value = DataSourceMode.OFFLINE_ROOM_CACHE
            val cachedEntities = flightDao.getCachedRoutesForOrigin(code)
            val merged = mergeCachedIntoCatalog(originNode, catalogConnections, cachedEntities)
            return@withContext buildSummary(originNode, merged)
        }

        if (!ApiConfig.isGatewayConfigured) {
            _routeDataSourceMode.value = DataSourceMode.DEMO_CACHE_NO_KEY
            val cachedEntities = flightDao.getCachedRoutesForOrigin(code)
            val merged = mergeCachedIntoCatalog(originNode, catalogConnections, cachedEntities)
            return@withContext buildSummary(originNode, merged)
        }

        _isLoadingRoutes.value = true
        try {
            val response = GatewayNetworkClient.apiService.getAirportRoutes(code)
            when {
                response.code() == 429 -> {
                    _routeDataSourceMode.value = DataSourceMode.QUOTA_FALLBACK
                    val cachedEntities = flightDao.getCachedRoutesForOrigin(code)
                    val merged = mergeCachedIntoCatalog(originNode, catalogConnections, cachedEntities)
                    buildSummary(originNode, merged)
                }
                response.isSuccessful && !response.body()?.routes.isNullOrEmpty() -> {
                    _routeDataSourceMode.value = DataSourceMode.LIVE_AERODATABOX
                    val liveRoutes = mapLiveRoutes(originNode, response.body()!!.routes.orEmpty())
                    if (liveRoutes.isNotEmpty()) {
                        cacheRoutesInRoom(liveRoutes)
                    }
                    val combined = mergeLiveAndCatalog(catalogConnections, liveRoutes)
                    buildSummary(originNode, combined)
                }
                else -> {
                    val cachedEntities = flightDao.getCachedRoutesForOrigin(code)
                    val merged = mergeCachedIntoCatalog(originNode, catalogConnections, cachedEntities)
                    buildSummary(originNode, merged)
                }
            }
        } catch (e: Exception) {
            Log.d("AirportConnectionsRepo", "Fallback to catalog/Room routes for $code: ${e.message}")
            val cachedEntities = flightDao.getCachedRoutesForOrigin(code)
            val merged = mergeCachedIntoCatalog(originNode, catalogConnections, cachedEntities)
            buildSummary(originNode, merged)
        } finally {
            _isLoadingRoutes.value = false
        }
    }

    private fun mapLiveRoutes(
        origin: AirportNode,
        stats: List<ConsoleRouteStat>
    ): List<DirectFlightConnection> {
        return stats.mapNotNull { route ->
            val destNode = route.toDomainNode() ?: return@mapNotNull null
            if (destNode.iata.equals(origin.iata, ignoreCase = true)) return@mapNotNull null

            GlobalRouteCatalog.registerDynamicAirport(destNode)
            val distKm = GeodesicRouteCalculator.calculateDistanceKm(
                origin.latitude, origin.longitude,
                destNode.latitude, destNode.longitude
            )
            val distNm = GeodesicRouteCalculator.kmToNm(distKm)
            val durationMin = GeodesicRouteCalculator.estimateDurationMinutes(distKm)
            val dailyFlights = route.dailyFlights.coerceAtLeast(1)

            val operators = route.operators.orEmpty().mapIndexedNotNull { idx, op ->
                val airlineCode = op.code.takeIf { it.isNotBlank() }?.uppercase(Locale.ROOT)
                    ?: return@mapIndexedNotNull null
                val airlineName = op.name.takeIf { it.isNotBlank() } ?: "$airlineCode Airlines"
                val baseFlightNum = 100 + ((origin.iata.hashCode() + destNode.iata.hashCode() + idx * 37) and 0x1FF)
                OperatingCarrierRoute(
                    airlineCode = airlineCode,
                    airlineName = airlineName,
                    flightNumbers = listOf("$airlineCode $baseFlightNum", "$airlineCode ${baseFlightNum + 1}"),
                    dailyFrequencies = (dailyFlights / (route.operators.size.coerceAtLeast(1))).coerceAtLeast(1),
                    aircraftTypes = listOf(if (distKm > 3500) "Boeing 787-9" else "Airbus A320neo")
                )
            }.ifEmpty {
                val defaultAirlineCode = origin.hubAirlines.firstOrNull()?.take(2)?.uppercase(Locale.ROOT) ?: "MS"
                val defaultAirlineName = origin.hubAirlines.firstOrNull() ?: "Flag Carrier"
                listOf(
                    OperatingCarrierRoute(
                        airlineCode = defaultAirlineCode,
                        airlineName = defaultAirlineName,
                        flightNumbers = listOf("$defaultAirlineCode 701"),
                        dailyFrequencies = dailyFlights,
                        aircraftTypes = listOf("Airbus A321neo")
                    )
                )
            }

            DirectFlightConnection(
                id = "${origin.iata}-${destNode.iata}",
                origin = origin,
                destination = destNode,
                distanceKm = distKm,
                distanceNm = distNm,
                estimatedDurationMinutes = durationMin,
                durationFormatted = GeodesicRouteCalculator.formatDuration(durationMin),
                haulCategory = GeodesicRouteCalculator.classifyHaul(distKm),
                dailyFlightsCount = dailyFlights,
                hasDepartures = true,
                hasArrivals = true,
                operatingCarriers = operators,
                isLiveVerified = true
            )
        }
    }

    private suspend fun cacheRoutesInRoom(routes: List<DirectFlightConnection>) {
        val entities = routes.map { route ->
            val summary = route.operatingCarriers.joinToString("|") { carrier ->
                "${carrier.airlineCode}:${carrier.airlineName}:${carrier.flightNumbers.joinToString(",")}"
            }
            CachedAirportRouteEntity(
                routeId = route.id,
                originIata = route.origin.iata,
                destinationIata = route.destination.iata,
                destinationName = route.destination.name,
                destinationCity = route.destination.city,
                destinationCountry = route.destination.country,
                destinationLat = route.destination.latitude,
                destinationLon = route.destination.longitude,
                distanceKm = route.distanceKm,
                dailyFlightsCount = route.dailyFlightsCount,
                airlinesSummary = summary,
                isLiveVerified = route.isLiveVerified
            )
        }
        flightDao.insertCachedRoutes(entities)
    }

    private fun mergeLiveAndCatalog(
        catalog: List<DirectFlightConnection>,
        live: List<DirectFlightConnection>
    ): List<DirectFlightConnection> {
        val byDest = catalog.associateBy { it.destination.iata }.toMutableMap()
        for (liveRoute in live) {
            val existing = byDest[liveRoute.destination.iata]
            if (existing != null) {
                val mergedCarriers = (liveRoute.operatingCarriers + existing.operatingCarriers)
                    .distinctBy { it.airlineCode }
                byDest[liveRoute.destination.iata] = existing.copy(
                    dailyFlightsCount = maxOf(existing.dailyFlightsCount, liveRoute.dailyFlightsCount),
                    operatingCarriers = mergedCarriers,
                    isLiveVerified = true
                )
            } else {
                byDest[liveRoute.destination.iata] = liveRoute
            }
        }
        return byDest.values.sortedByDescending { it.dailyFlightsCount }
    }

    private fun mergeCachedIntoCatalog(
        origin: AirportNode,
        catalog: List<DirectFlightConnection>,
        cached: List<CachedAirportRouteEntity>
    ): List<DirectFlightConnection> {
        if (cached.isEmpty()) return catalog
        val cachedMapped = cached.map { entity ->
            val destNode = GlobalRouteCatalog.findAirportOrNull(entity.destinationIata) ?: AirportNode(
                iata = entity.destinationIata,
                icao = "K${entity.destinationIata}",
                name = entity.destinationName,
                city = entity.destinationCity,
                country = entity.destinationCountry,
                region = GlobalRouteCatalog.inferRegionFromCoords(entity.destinationLat, entity.destinationLon),
                latitude = entity.destinationLat,
                longitude = entity.destinationLon,
                timezone = "UTC"
            )
            val durationMin = GeodesicRouteCalculator.estimateDurationMinutes(entity.distanceKm)
            val carriers = entity.airlinesSummary.split("|").mapNotNull { token ->
                val parts = token.split(":")
                if (parts.size >= 2) {
                    val code = parts[0]
                    val name = parts[1]
                    val flights = parts.getOrNull(2)?.split(",")?.filter { it.isNotBlank() }
                        ?: listOf("$code 401")
                    OperatingCarrierRoute(
                        airlineCode = code,
                        airlineName = name,
                        flightNumbers = flights,
                        dailyFrequencies = 2,
                        aircraftTypes = listOf("Boeing 787-9")
                    )
                } else null
            }
            DirectFlightConnection(
                id = entity.routeId,
                origin = origin,
                destination = destNode,
                distanceKm = entity.distanceKm,
                distanceNm = GeodesicRouteCalculator.kmToNm(entity.distanceKm),
                estimatedDurationMinutes = durationMin,
                durationFormatted = GeodesicRouteCalculator.formatDuration(durationMin),
                haulCategory = GeodesicRouteCalculator.classifyHaul(entity.distanceKm),
                dailyFlightsCount = entity.dailyFlightsCount,
                operatingCarriers = carriers,
                isLiveVerified = entity.isLiveVerified
            )
        }
        return mergeLiveAndCatalog(catalog, cachedMapped)
    }


    suspend fun loadAllRoutes(): AirportRouteNetworkSummary = withContext(Dispatchers.IO) {
        _isLoadingRoutes.value = false
        _routeDataSourceMode.value = DataSourceMode.DEMO_CACHE_NO_KEY
        val allConn = GlobalRouteCatalog.getAllUniqueConnections()
        return@withContext buildSummary(null, allConn)
    }

    private fun buildSummary(
        origin: AirportNode?,
        connections: List<DirectFlightConnection>
    ): AirportRouteNetworkSummary {
        val countries = connections.map { it.destination.country }.distinct().size
        val airlineMap = mutableMapOf<String, Pair<String, Int>>()

        connections.forEach { conn ->
            conn.operatingCarriers.forEach { carrier ->
                val current = airlineMap[carrier.airlineCode]
                if (current == null) {
                    airlineMap[carrier.airlineCode] = carrier.airlineName to 1
                } else {
                    airlineMap[carrier.airlineCode] = current.first to (current.second + 1)
                }
            }
        }

        val availableAirlines = airlineMap.entries
            .map { (code, pair) ->
                AirlineFilterChipItem(
                    code = code,
                    name = pair.first,
                    destinationCount = pair.second
                )
            }
            .sortedByDescending { it.destinationCount }

        val totalDaily = connections.sumOf { it.dailyFlightsCount }

        return AirportRouteNetworkSummary(
            originAirport = origin,
            connections = connections,
            totalDirectDestinations = connections.size,
            totalCountriesServed = countries,
            totalOperatingAirlines = availableAirlines.size,
            totalDailyFlights = totalDaily,
            availableAirlines = availableAirlines
        )
    }
}

/**
 * Comprehensive global airport & direct flight route catalog with deep coverage of
 * Cairo International Airport (CAI) and 45+ world aviation hubs.
 */
object GlobalRouteCatalog {

    private val dynamicAirports = mutableMapOf<String, AirportNode>()

    val airports: List<AirportNode> = listOf(
        // EGYPT & MENA HUBS
        AirportNode(
            iata = "CAI",
            icao = "HECA",
            name = "Cairo International Airport",
            city = "Cairo",
            country = "Egypt",
            region = RouteRegion.MENA,
            latitude = 30.1219,
            longitude = 31.4056,
            timezone = "EEST (UTC+3)",
            hubAirlines = listOf("EgyptAir", "Air Cairo", "Nile Air")
        ),
        AirportNode(
            iata = "HRG",
            icao = "HEGN",
            name = "Hurghada International Airport",
            city = "Hurghada",
            country = "Egypt",
            region = RouteRegion.MENA,
            latitude = 27.1783,
            longitude = 33.7994,
            timezone = "EEST (UTC+3)",
            hubAirlines = listOf("EgyptAir", "Air Cairo")
        ),
        AirportNode(
            iata = "SSH",
            icao = "HESH",
            name = "Sharm El Sheikh International Airport",
            city = "Sharm El Sheikh",
            country = "Egypt",
            region = RouteRegion.MENA,
            latitude = 27.9773,
            longitude = 34.3950,
            timezone = "EEST (UTC+3)",
            hubAirlines = listOf("EgyptAir", "Air Cairo")
        ),
        AirportNode(
            iata = "LXR",
            icao = "HELX",
            name = "Luxor International Airport",
            city = "Luxor",
            country = "Egypt",
            region = RouteRegion.MENA,
            latitude = 25.6710,
            longitude = 32.7066,
            timezone = "EEST (UTC+3)",
            hubAirlines = listOf("EgyptAir")
        ),
        AirportNode(
            iata = "ASW",
            icao = "HESN",
            name = "Aswan International Airport",
            city = "Aswan",
            country = "Egypt",
            region = RouteRegion.MENA,
            latitude = 23.9644,
            longitude = 32.8200,
            timezone = "EEST (UTC+3)",
            hubAirlines = listOf("EgyptAir")
        ),
        AirportNode(
            iata = "DXB",
            icao = "OMDB",
            name = "Dubai International Airport",
            city = "Dubai",
            country = "United Arab Emirates",
            region = RouteRegion.MENA,
            latitude = 25.2532,
            longitude = 55.3657,
            timezone = "GST (UTC+4)",
            hubAirlines = listOf("Emirates", "flydubai")
        ),
        AirportNode(
            iata = "AUH",
            icao = "OMAA",
            name = "Zayed International Airport",
            city = "Abu Dhabi",
            country = "United Arab Emirates",
            region = RouteRegion.MENA,
            latitude = 24.4430,
            longitude = 54.6511,
            timezone = "GST (UTC+4)",
            hubAirlines = listOf("Etihad Airways", "Air Arabia Abu Dhabi")
        ),
        AirportNode(
            iata = "DOH",
            icao = "OTHH",
            name = "Hamad International Airport",
            city = "Doha",
            country = "Qatar",
            region = RouteRegion.MENA,
            latitude = 25.2731,
            longitude = 51.6081,
            timezone = "AST (UTC+3)",
            hubAirlines = listOf("Qatar Airways")
        ),
        AirportNode(
            iata = "JED",
            icao = "OEJN",
            name = "King Abdulaziz International Airport",
            city = "Jeddah",
            country = "Saudi Arabia",
            region = RouteRegion.MENA,
            latitude = 21.6796,
            longitude = 39.1565,
            timezone = "AST (UTC+3)",
            hubAirlines = listOf("Saudia", "Flynas", "Flyadeal")
        ),
        AirportNode(
            iata = "RUH",
            icao = "OERK",
            name = "King Khalid International Airport",
            city = "Riyadh",
            country = "Saudi Arabia",
            region = RouteRegion.MENA,
            latitude = 24.9576,
            longitude = 46.6988,
            timezone = "AST (UTC+3)",
            hubAirlines = listOf("Saudia", "Flynas")
        ),
        AirportNode(
            iata = "AMM",
            icao = "OJAI",
            name = "Queen Alia International Airport",
            city = "Amman",
            country = "Jordan",
            region = RouteRegion.MENA,
            latitude = 31.7226,
            longitude = 35.9932,
            timezone = "EEST (UTC+3)",
            hubAirlines = listOf("Royal Jordanian")
        ),
        AirportNode(
            iata = "BEY",
            icao = "OLBA",
            name = "Beirut Rafic Hariri International",
            city = "Beirut",
            country = "Lebanon",
            region = RouteRegion.MENA,
            latitude = 33.8209,
            longitude = 35.4884,
            timezone = "EEST (UTC+3)",
            hubAirlines = listOf("Middle East Airlines")
        ),
        AirportNode(
            iata = "KWI",
            icao = "OKKK",
            name = "Kuwait International Airport",
            city = "Kuwait City",
            country = "Kuwait",
            region = RouteRegion.MENA,
            latitude = 29.2266,
            longitude = 47.9689,
            timezone = "AST (UTC+3)",
            hubAirlines = listOf("Kuwait Airways", "Jazeera Airways")
        ),
        AirportNode(
            iata = "BAH",
            icao = "OBBI",
            name = "Bahrain International Airport",
            city = "Manama",
            country = "Bahrain",
            region = RouteRegion.MENA,
            latitude = 26.2708,
            longitude = 50.6336,
            timezone = "AST (UTC+3)",
            hubAirlines = listOf("Gulf Air")
        ),
        AirportNode(
            iata = "CMN",
            icao = "GMMN",
            name = "Mohammed V International Airport",
            city = "Casablanca",
            country = "Morocco",
            region = RouteRegion.MENA,
            latitude = 33.3675,
            longitude = -7.5899,
            timezone = "WEST (UTC+1)",
            hubAirlines = listOf("Royal Air Maroc")
        ),
        AirportNode(
            iata = "TUN",
            icao = "DTTA",
            name = "Tunis–Carthage International Airport",
            city = "Tunis",
            country = "Tunisia",
            region = RouteRegion.MENA,
            latitude = 36.8510,
            longitude = 10.2272,
            timezone = "CET (UTC+1)",
            hubAirlines = listOf("Tunisair")
        ),

        // EUROPE HUBS
        AirportNode(
            iata = "IST",
            icao = "LTFM",
            name = "Istanbul Airport",
            city = "Istanbul",
            country = "Turkey",
            region = RouteRegion.EUROPE,
            latitude = 41.2753,
            longitude = 28.7519,
            timezone = "TRT (UTC+3)",
            hubAirlines = listOf("Turkish Airlines")
        ),
        AirportNode(
            iata = "ATH",
            icao = "LGAV",
            name = "Athens International Airport",
            city = "Athens",
            country = "Greece",
            region = RouteRegion.EUROPE,
            latitude = 37.9364,
            longitude = 23.9445,
            timezone = "EEST (UTC+3)",
            hubAirlines = listOf("Aegean Airlines")
        ),
        AirportNode(
            iata = "LHR",
            icao = "EGLL",
            name = "London Heathrow Airport",
            city = "London",
            country = "United Kingdom",
            region = RouteRegion.EUROPE,
            latitude = 51.4700,
            longitude = -0.4543,
            timezone = "BST (UTC+1)",
            hubAirlines = listOf("British Airways", "Virgin Atlantic")
        ),
        AirportNode(
            iata = "CDG",
            icao = "LFPG",
            name = "Paris Charles de Gaulle Airport",
            city = "Paris",
            country = "France",
            region = RouteRegion.EUROPE,
            latitude = 49.0097,
            longitude = 2.5479,
            timezone = "CEST (UTC+2)",
            hubAirlines = listOf("Air France")
        ),
        AirportNode(
            iata = "FRA",
            icao = "EDDF",
            name = "Frankfurt Main Airport",
            city = "Frankfurt",
            country = "Germany",
            region = RouteRegion.EUROPE,
            latitude = 50.0379,
            longitude = 8.5622,
            timezone = "CEST (UTC+2)",
            hubAirlines = listOf("Lufthansa")
        ),
        AirportNode(
            iata = "MUC",
            icao = "EDDM",
            name = "Munich International Airport",
            city = "Munich",
            country = "Germany",
            region = RouteRegion.EUROPE,
            latitude = 48.3538,
            longitude = 11.7861,
            timezone = "CEST (UTC+2)",
            hubAirlines = listOf("Lufthansa")
        ),
        AirportNode(
            iata = "FCO",
            icao = "LIRF",
            name = "Rome Fiumicino Airport",
            city = "Rome",
            country = "Italy",
            region = RouteRegion.EUROPE,
            latitude = 41.8003,
            longitude = 12.2389,
            timezone = "CEST (UTC+2)",
            hubAirlines = listOf("ITA Airways")
        ),
        AirportNode(
            iata = "MXP",
            icao = "LIMC",
            name = "Milan Malpensa Airport",
            city = "Milan",
            country = "Italy",
            region = RouteRegion.EUROPE,
            latitude = 45.6306,
            longitude = 8.7281,
            timezone = "CEST (UTC+2)",
            hubAirlines = listOf("ITA Airways", "easyJet")
        ),
        AirportNode(
            iata = "MAD",
            icao = "LEMD",
            name = "Adolfo Suárez Madrid–Barajas",
            city = "Madrid",
            country = "Spain",
            region = RouteRegion.EUROPE,
            latitude = 40.4983,
            longitude = -3.5676,
            timezone = "CEST (UTC+2)",
            hubAirlines = listOf("Iberia", "Air Europa")
        ),
        AirportNode(
            iata = "BCN",
            icao = "LEBL",
            name = "Josep Tarradellas Barcelona–El Prat",
            city = "Barcelona",
            country = "Spain",
            region = RouteRegion.EUROPE,
            latitude = 41.2974,
            longitude = 2.0833,
            timezone = "CEST (UTC+2)",
            hubAirlines = listOf("Vueling")
        ),
        AirportNode(
            iata = "AMS",
            icao = "EHAM",
            name = "Amsterdam Airport Schiphol",
            city = "Amsterdam",
            country = "Netherlands",
            region = RouteRegion.EUROPE,
            latitude = 52.3105,
            longitude = 4.7683,
            timezone = "CEST (UTC+2)",
            hubAirlines = listOf("KLM Royal Dutch Airlines")
        ),
        AirportNode(
            iata = "VIE",
            icao = "LOWW",
            name = "Vienna International Airport",
            city = "Vienna",
            country = "Austria",
            region = RouteRegion.EUROPE,
            latitude = 48.1103,
            longitude = 16.5697,
            timezone = "CEST (UTC+2)",
            hubAirlines = listOf("Austrian Airlines")
        ),
        AirportNode(
            iata = "ZRH",
            icao = "LSZH",
            name = "Zurich Airport",
            city = "Zurich",
            country = "Switzerland",
            region = RouteRegion.EUROPE,
            latitude = 47.4582,
            longitude = 8.5555,
            timezone = "CEST (UTC+2)",
            hubAirlines = listOf("SWISS")
        ),
        AirportNode(
            iata = "BRU",
            icao = "EBBR",
            name = "Brussels Airport",
            city = "Brussels",
            country = "Belgium",
            region = RouteRegion.EUROPE,
            latitude = 50.9014,
            longitude = 4.4844,
            timezone = "CEST (UTC+2)",
            hubAirlines = listOf("Brussels Airlines")
        ),
        AirportNode(
            iata = "CPH",
            icao = "EKCH",
            name = "Copenhagen Airport",
            city = "Copenhagen",
            country = "Denmark",
            region = RouteRegion.EUROPE,
            latitude = 55.6180,
            longitude = 12.6508,
            timezone = "CEST (UTC+2)",
            hubAirlines = listOf("SAS")
        ),

        // SUB-SAHARAN AFRICA HUBS
        AirportNode(
            iata = "ADD",
            icao = "HAAB",
            name = "Addis Ababa Bole International",
            city = "Addis Ababa",
            country = "Ethiopia",
            region = RouteRegion.AFRICA,
            latitude = 8.9779,
            longitude = 38.7993,
            timezone = "EAT (UTC+3)",
            hubAirlines = listOf("Ethiopian Airlines")
        ),
        AirportNode(
            iata = "NBO",
            icao = "HKJK",
            name = "Jomo Kenyatta International Airport",
            city = "Nairobi",
            country = "Kenya",
            region = RouteRegion.AFRICA,
            latitude = -1.3192,
            longitude = 36.9278,
            timezone = "EAT (UTC+3)",
            hubAirlines = listOf("Kenya Airways")
        ),
        AirportNode(
            iata = "JNB",
            icao = "FAOR",
            name = "O.R. Tambo International Airport",
            city = "Johannesburg",
            country = "South Africa",
            region = RouteRegion.AFRICA,
            latitude = -26.1392,
            longitude = 28.2460,
            timezone = "SAST (UTC+2)",
            hubAirlines = listOf("South African Airways", "Airlink")
        ),
        AirportNode(
            iata = "LOS",
            icao = "DNMM",
            name = "Murtala Muhammed International",
            city = "Lagos",
            country = "Nigeria",
            region = RouteRegion.AFRICA,
            latitude = 6.5774,
            longitude = 3.3212,
            timezone = "WAT (UTC+1)",
            hubAirlines = listOf("Air Peace")
        ),

        // AMERICAS HUBS
        AirportNode(
            iata = "JFK",
            icao = "KJFK",
            name = "John F. Kennedy International Airport",
            city = "New York",
            country = "United States",
            region = RouteRegion.AMERICAS,
            latitude = 40.6413,
            longitude = -73.7781,
            timezone = "EDT (UTC-4)",
            hubAirlines = listOf("Delta Air Lines", "American Airlines", "JetBlue")
        ),
        AirportNode(
            iata = "IAD",
            icao = "KIAD",
            name = "Washington Dulles International",
            city = "Washington D.C.",
            country = "United States",
            region = RouteRegion.AMERICAS,
            latitude = 38.9531,
            longitude = -77.4565,
            timezone = "EDT (UTC-4)",
            hubAirlines = listOf("United Airlines")
        ),
        AirportNode(
            iata = "YYZ",
            icao = "CYYZ",
            name = "Toronto Pearson International",
            city = "Toronto",
            country = "Canada",
            region = RouteRegion.AMERICAS,
            latitude = 43.6777,
            longitude = -79.6248,
            timezone = "EDT (UTC-4)",
            hubAirlines = listOf("Air Canada")
        ),
        AirportNode(
            iata = "SFO",
            icao = "KSFO",
            name = "San Francisco International Airport",
            city = "San Francisco",
            country = "United States",
            region = RouteRegion.AMERICAS,
            latitude = 37.6213,
            longitude = -122.3790,
            timezone = "PDT (UTC-7)",
            hubAirlines = listOf("United Airlines", "Alaska Airlines")
        ),
        AirportNode(
            iata = "LAX",
            icao = "KLAX",
            name = "Los Angeles International Airport",
            city = "Los Angeles",
            country = "United States",
            region = RouteRegion.AMERICAS,
            latitude = 33.9416,
            longitude = -118.4085,
            timezone = "PDT (UTC-7)",
            hubAirlines = listOf("Delta Air Lines", "United Airlines", "American Airlines")
        ),
        AirportNode(
            iata = "ORD",
            icao = "KORD",
            name = "Chicago O'Hare International Airport",
            city = "Chicago",
            country = "United States",
            region = RouteRegion.AMERICAS,
            latitude = 41.9742,
            longitude = -87.9073,
            timezone = "CDT (UTC-5)",
            hubAirlines = listOf("United Airlines", "American Airlines")
        ),
        AirportNode(
            iata = "ATL",
            icao = "KATL",
            name = "Hartsfield-Jackson Atlanta International",
            city = "Atlanta",
            country = "United States",
            region = RouteRegion.AMERICAS,
            latitude = 33.6407,
            longitude = -84.4277,
            timezone = "EDT (UTC-4)",
            hubAirlines = listOf("Delta Air Lines")
        ),
        AirportNode(
            iata = "GRU",
            icao = "SBGR",
            name = "São Paulo/Guarulhos International",
            city = "São Paulo",
            country = "Brazil",
            region = RouteRegion.AMERICAS,
            latitude = -23.4356,
            longitude = -46.4731,
            timezone = "BRT (UTC-3)",
            hubAirlines = listOf("LATAM Brasil", "GOL")
        ),

        // ASIA-PACIFIC HUBS
        AirportNode(
            iata = "PEK",
            icao = "ZBAA",
            name = "Beijing Capital International Airport",
            city = "Beijing",
            country = "China",
            region = RouteRegion.ASIA_PACIFIC,
            latitude = 40.0799,
            longitude = 116.6031,
            timezone = "CST (UTC+8)",
            hubAirlines = listOf("Air China")
        ),
        AirportNode(
            iata = "CAN",
            icao = "ZGGG",
            name = "Guangzhou Baiyun International",
            city = "Guangzhou",
            country = "China",
            region = RouteRegion.ASIA_PACIFIC,
            latitude = 23.3924,
            longitude = 113.2988,
            timezone = "CST (UTC+8)",
            hubAirlines = listOf("China Southern")
        ),
        AirportNode(
            iata = "HND",
            icao = "RJTT",
            name = "Tokyo Haneda International Airport",
            city = "Tokyo",
            country = "Japan",
            region = RouteRegion.ASIA_PACIFIC,
            latitude = 35.5494,
            longitude = 139.7798,
            timezone = "JST (UTC+9)",
            hubAirlines = listOf("ANA", "Japan Airlines")
        ),
        AirportNode(
            iata = "NRT",
            icao = "RJAA",
            name = "Tokyo Narita International Airport",
            city = "Tokyo",
            country = "Japan",
            region = RouteRegion.ASIA_PACIFIC,
            latitude = 35.7720,
            longitude = 140.3929,
            timezone = "JST (UTC+9)",
            hubAirlines = listOf("ANA", "Japan Airlines")
        ),
        AirportNode(
            iata = "SIN",
            icao = "WSSS",
            name = "Singapore Changi Airport",
            city = "Singapore",
            country = "Singapore",
            region = RouteRegion.ASIA_PACIFIC,
            latitude = 1.3644,
            longitude = 103.9915,
            timezone = "SGT (UTC+8)",
            hubAirlines = listOf("Singapore Airlines")
        ),
        AirportNode(
            iata = "BOM",
            icao = "VABB",
            name = "Chhatrapati Shivaji Maharaj International",
            city = "Mumbai",
            country = "India",
            region = RouteRegion.ASIA_PACIFIC,
            latitude = 19.0896,
            longitude = 72.8656,
            timezone = "IST (UTC+5:30)",
            hubAirlines = listOf("Air India", "IndiGo")
        ),
        AirportNode(
            iata = "SYD",
            icao = "YSSY",
            name = "Sydney Kingsford Smith Airport",
            city = "Sydney",
            country = "Australia",
            region = RouteRegion.ASIA_PACIFIC,
            latitude = -33.9399,
            longitude = 151.1753,
            timezone = "AEST (UTC+10)",
            hubAirlines = listOf("Qantas", "Virgin Australia")
        )
    )

    private data class RouteSpec(
        val originIata: String,
        val destIata: String,
        val dailyFlights: Int,
        val carriers: List<OperatingCarrierRoute>
    )

    private fun carrier(
        code: String,
        name: String,
        flights: List<String>,
        daily: Int = 1,
        aircraft: String = "Boeing 787-9"
    ) = OperatingCarrierRoute(
        airlineCode = code,
        airlineName = name,
        flightNumbers = flights,
        dailyFrequencies = daily,
        aircraftTypes = listOf(aircraft)
    )

    private val coreRoutes: List<RouteSpec> = listOf(
        // =========================================================================
        // CAIRO (CAI) DIRECT FLIGHT NETWORK (35 Nonstop Global & Domestic Routes)
        // =========================================================================
        RouteSpec("CAI", "LHR", 4, listOf(
            carrier("MS", "EgyptAir", listOf("MS 777", "MS 779"), 2, "Boeing 787-9 Dreamliner"),
            carrier("BA", "British Airways", listOf("BA 401", "BA 405"), 2, "Airbus A321neo")
        )),
        RouteSpec("CAI", "DXB", 7, listOf(
            carrier("MS", "EgyptAir", listOf("MS 910", "MS 912", "MS 914"), 3, "Boeing 787-9"),
            carrier("EK", "Emirates", listOf("EK 922", "EK 924", "EK 926", "EK 928"), 4, "Airbus A380-800")
        )),
        RouteSpec("CAI", "JED", 14, listOf(
            carrier("MS", "EgyptAir", listOf("MS 661", "MS 665", "MS 671"), 6, "Boeing 777-300ER"),
            carrier("SV", "Saudia", listOf("SV 300", "SV 304", "SV 308"), 5, "Airbus A330-300"),
            carrier("SM", "Air Cairo", listOf("SM 471", "SM 473"), 3, "Airbus A320neo")
        )),
        RouteSpec("CAI", "RUH", 10, listOf(
            carrier("MS", "EgyptAir", listOf("MS 647", "MS 649", "MS 651"), 4, "Boeing 787-9"),
            carrier("SV", "Saudia", listOf("SV 312", "SV 314", "SV 318"), 4, "Boeing 777-300"),
            carrier("XY", "flynas", listOf("XY 562", "XY 564"), 2, "Airbus A320neo")
        )),
        RouteSpec("CAI", "DOH", 6, listOf(
            carrier("QR", "Qatar Airways", listOf("QR 1302", "QR 1304", "QR 1308"), 4, "Boeing 777-300ER"),
            carrier("MS", "EgyptAir", listOf("MS 935", "MS 937"), 2, "Airbus A330-300")
        )),
        RouteSpec("CAI", "IST", 6, listOf(
            carrier("TK", "Turkish Airlines", listOf("TK 691", "TK 693", "TK 695"), 3, "Airbus A350-900"),
            carrier("MS", "EgyptAir", listOf("MS 735", "MS 737", "MS 739"), 3, "Boeing 737-800")
        )),
        RouteSpec("CAI", "FRA", 4, listOf(
            carrier("MS", "EgyptAir", listOf("MS 785", "MS 787"), 2, "Boeing 787-9"),
            carrier("LH", "Lufthansa", listOf("LH 581", "LH 583"), 2, "Airbus A321neo")
        )),
        RouteSpec("CAI", "MUC", 3, listOf(
            carrier("MS", "EgyptAir", listOf("MS 787"), 1, "Boeing 737-800"),
            carrier("LH", "Lufthansa", listOf("LH 585", "LH 587"), 2, "Airbus A320neo")
        )),
        RouteSpec("CAI", "CDG", 4, listOf(
            carrier("MS", "EgyptAir", listOf("MS 799", "MS 801"), 2, "Boeing 787-9"),
            carrier("AF", "Air France", listOf("AF 570", "AF 566"), 2, "Airbus A350-900")
        )),
        RouteSpec("CAI", "JFK", 2, listOf(
            carrier("MS", "EgyptAir", listOf("MS 985", "MS 986"), 2, "Boeing 777-300ER")
        )),
        RouteSpec("CAI", "IAD", 1, listOf(
            carrier("MS", "EgyptAir", listOf("MS 981"), 1, "Boeing 787-9 Dreamliner")
        )),
        RouteSpec("CAI", "YYZ", 1, listOf(
            carrier("MS", "EgyptAir", listOf("MS 995"), 1, "Boeing 787-9 Dreamliner")
        )),
        RouteSpec("CAI", "FCO", 4, listOf(
            carrier("MS", "EgyptAir", listOf("MS 791", "MS 793"), 2, "Boeing 737-800"),
            carrier("AZ", "ITA Airways", listOf("AZ 895", "AZ 897"), 2, "Airbus A321neo")
        )),
        RouteSpec("CAI", "MXP", 3, listOf(
            carrier("MS", "EgyptAir", listOf("MS 703", "MS 705"), 2, "Boeing 737-800"),
            carrier("SM", "Air Cairo", listOf("SM 805"), 1, "Airbus A320neo")
        )),
        RouteSpec("CAI", "MAD", 2, listOf(
            carrier("MS", "EgyptAir", listOf("MS 753"), 1, "Boeing 787-9"),
            carrier("IB", "Iberia", listOf("IB 3735"), 1, "Airbus A321")
        )),
        RouteSpec("CAI", "BCN", 2, listOf(
            carrier("MS", "EgyptAir", listOf("MS 767"), 1, "Boeing 737-800"),
            carrier("VY", "Vueling", listOf("VY 7765"), 1, "Airbus A320")
        )),
        RouteSpec("CAI", "ATH", 4, listOf(
            carrier("MS", "EgyptAir", listOf("MS 747", "MS 749"), 2, "Boeing 737-800"),
            carrier("A3", "Aegean Airlines", listOf("A3 931", "A3 933"), 2, "Airbus A320neo")
        )),
        RouteSpec("CAI", "VIE", 3, listOf(
            carrier("OS", "Austrian Airlines", listOf("OS 864", "OS 866"), 2, "Airbus A320"),
            carrier("MS", "EgyptAir", listOf("MS 797"), 1, "Boeing 737-800")
        )),
        RouteSpec("CAI", "ZRH", 2, listOf(
            carrier("LX", "SWISS", listOf("LX 237"), 1, "Airbus A321neo"),
            carrier("MS", "EgyptAir", listOf("MS 771"), 1, "Boeing 737-800")
        )),
        RouteSpec("CAI", "AMS", 2, listOf(
            carrier("MS", "EgyptAir", listOf("MS 757", "MS 758"), 2, "Boeing 787-9")
        )),
        RouteSpec("CAI", "BRU", 1, listOf(
            carrier("MS", "EgyptAir", listOf("MS 725"), 1, "Boeing 737-800")
        )),
        RouteSpec("CAI", "CPH", 1, listOf(
            carrier("MS", "EgyptAir", listOf("MS 759"), 1, "Boeing 737-800")
        )),
        RouteSpec("CAI", "AMM", 5, listOf(
            carrier("RJ", "Royal Jordanian", listOf("RJ 502", "RJ 504", "RJ 506"), 3, "Embraer E195-E2"),
            carrier("MS", "EgyptAir", listOf("MS 701", "MS 719"), 2, "Boeing 737-800")
        )),
        RouteSpec("CAI", "BEY", 4, listOf(
            carrier("ME", "Middle East Airlines", listOf("ME 305", "ME 307"), 2, "Airbus A321neo"),
            carrier("MS", "EgyptAir", listOf("MS 711", "MS 713"), 2, "Boeing 737-800")
        )),
        RouteSpec("CAI", "KWI", 6, listOf(
            carrier("KU", "Kuwait Airways", listOf("KU 542", "KU 544"), 3, "Airbus A330-800"),
            carrier("MS", "EgyptAir", listOf("MS 610", "MS 612", "MS 614"), 3, "Boeing 777-300ER")
        )),
        RouteSpec("CAI", "BAH", 3, listOf(
            carrier("GF", "Gulf Air", listOf("GF 070", "GF 072"), 2, "Airbus A321neo"),
            carrier("MS", "EgyptAir", listOf("MS 918"), 1, "Boeing 737-800")
        )),
        RouteSpec("CAI", "AUH", 5, listOf(
            carrier("EY", "Etihad Airways", listOf("EY 652", "EY 654", "EY 656"), 3, "Boeing 787-9"),
            carrier("MS", "EgyptAir", listOf("MS 916", "MS 917"), 2, "Airbus A320neo")
        )),
        RouteSpec("CAI", "CMN", 3, listOf(
            carrier("AT", "Royal Air Maroc", listOf("AT 273", "AT 275"), 2, "Boeing 787-8"),
            carrier("MS", "EgyptAir", listOf("MS 847"), 1, "Boeing 787-9")
        )),
        RouteSpec("CAI", "TUN", 2, listOf(
            carrier("TU", "Tunisair", listOf("TU 814"), 1, "Airbus A320"),
            carrier("MS", "EgyptAir", listOf("MS 843"), 1, "Boeing 737-800")
        )),
        RouteSpec("CAI", "ADD", 3, listOf(
            carrier("ET", "Ethiopian Airlines", listOf("ET 453", "ET 455"), 2, "Boeing 787-8"),
            carrier("MS", "EgyptAir", listOf("MS 851"), 1, "Boeing 737-800")
        )),
        RouteSpec("CAI", "NBO", 2, listOf(
            carrier("MS", "EgyptAir", listOf("MS 849", "MS 850"), 2, "Boeing 737-800")
        )),
        RouteSpec("CAI", "JNB", 1, listOf(
            carrier("MS", "EgyptAir", listOf("MS 839"), 1, "Boeing 787-9 Dreamliner")
        )),
        RouteSpec("CAI", "LOS", 2, listOf(
            carrier("MS", "EgyptAir", listOf("MS 875", "MS 877"), 2, "Boeing 787-9")
        )),
        RouteSpec("CAI", "PEK", 1, listOf(
            carrier("MS", "EgyptAir", listOf("MS 955"), 1, "Boeing 787-9 Dreamliner")
        )),
        RouteSpec("CAI", "CAN", 2, listOf(
            carrier("MS", "EgyptAir", listOf("MS 958"), 1, "Boeing 777-300ER"),
            carrier("CZ", "China Southern", listOf("CZ 8098"), 1, "Boeing 787-9")
        )),
        RouteSpec("CAI", "NRT", 1, listOf(
            carrier("MS", "EgyptAir", listOf("MS 964"), 1, "Boeing 787-9 Dreamliner")
        )),
        RouteSpec("CAI", "BOM", 1, listOf(
            carrier("MS", "EgyptAir", listOf("MS 968"), 1, "Boeing 737-800")
        )),
        RouteSpec("CAI", "HRG", 8, listOf(
            carrier("MS", "EgyptAir", listOf("MS 042", "MS 044", "MS 048", "MS 052"), 6, "Airbus A320neo"),
            carrier("SM", "Air Cairo", listOf("SM 105", "SM 109"), 2, "ATR 72-600")
        )),
        RouteSpec("CAI", "SSH", 9, listOf(
            carrier("MS", "EgyptAir", listOf("MS 022", "MS 024", "MS 028", "MS 032"), 7, "Airbus A321neo"),
            carrier("SM", "Air Cairo", listOf("SM 115", "SM 117"), 2, "Airbus A320")
        )),
        RouteSpec("CAI", "LXR", 6, listOf(
            carrier("MS", "EgyptAir", listOf("MS 060", "MS 064", "MS 066"), 5, "Boeing 737-800"),
            carrier("SM", "Air Cairo", listOf("SM 132"), 1, "Embraer E190")
        )),
        RouteSpec("CAI", "ASW", 5, listOf(
            carrier("MS", "EgyptAir", listOf("MS 082", "MS 084", "MS 086"), 5, "Boeing 737-800")
        )),

        // =========================================================================
        // GLOBAL TRUNK CONNECTIONS (Ensuring every hub has a dense network)
        // =========================================================================
        RouteSpec("LHR", "JFK", 14, listOf(
            carrier("BA", "British Airways", listOf("BA 117", "BA 175", "BA 177"), 6, "Boeing 777-300ER"),
            carrier("AA", "American Airlines", listOf("AA 100", "AA 106"), 4, "Boeing 777-300ER"),
            carrier("VS", "Virgin Atlantic", listOf("VS 003", "VS 045"), 4, "Airbus A350-1000")
        )),
        RouteSpec("LHR", "SFO", 5, listOf(
            carrier("BA", "British Airways", listOf("BA 285", "BA 287"), 2, "Airbus A380-800"),
            carrier("UA", "United Airlines", listOf("UA 901", "UA 930"), 2, "Boeing 787-9"),
            carrier("VS", "Virgin Atlantic", listOf("VS 019"), 1, "Boeing 787-9")
        )),
        RouteSpec("LHR", "DXB", 9, listOf(
            carrier("EK", "Emirates", listOf("EK 001", "EK 003", "EK 005", "EK 007"), 6, "Airbus A380-800"),
            carrier("BA", "British Airways", listOf("BA 105", "BA 107", "BA 109"), 3, "Airbus A350-1000")
        )),
        RouteSpec("LHR", "SIN", 6, listOf(
            carrier("SQ", "Singapore Airlines", listOf("SQ 305", "SQ 317", "SQ 321"), 4, "Airbus A380-800"),
            carrier("BA", "British Airways", listOf("BA 011", "BA 015"), 2, "Boeing 787-9")
        )),
        RouteSpec("LHR", "HND", 4, listOf(
            carrier("JL", "Japan Airlines", listOf("JL 041", "JL 043"), 2, "Airbus A350-1000"),
            carrier("NH", "ANA", listOf("NH 211"), 1, "Boeing 777-300ER"),
            carrier("BA", "British Airways", listOf("BA 007"), 1, "Airbus A350-1000")
        )),
        RouteSpec("LHR", "FRA", 9, listOf(
            carrier("LH", "Lufthansa", listOf("LH 901", "LH 905", "LH 907"), 5, "Airbus A320neo"),
            carrier("BA", "British Airways", listOf("BA 902", "BA 904", "BA 910"), 4, "Airbus A320neo")
        )),
        RouteSpec("LHR", "CDG", 8, listOf(
            carrier("AF", "Air France", listOf("AF 1681", "AF 1181", "AF 1381"), 4, "Airbus A220-300"),
            carrier("BA", "British Airways", listOf("BA 304", "BA 308", "BA 314"), 4, "Airbus A320neo")
        )),
        RouteSpec("LHR", "DOH", 7, listOf(
            carrier("QR", "Qatar Airways", listOf("QR 004", "QR 006", "QR 008"), 5, "Airbus A380-800"),
            carrier("BA", "British Airways", listOf("BA 123"), 2, "Boeing 777-200ER")
        )),
        RouteSpec("LHR", "IST", 5, listOf(
            carrier("TK", "Turkish Airlines", listOf("TK 1980", "TK 1984"), 3, "Boeing 777-300ER"),
            carrier("BA", "British Airways", listOf("BA 676", "BA 680"), 2, "Airbus A320neo")
        )),
        RouteSpec("LHR", "JNB", 4, listOf(
            carrier("BA", "British Airways", listOf("BA 055", "BA 057"), 2, "Airbus A380-800"),
            carrier("VS", "Virgin Atlantic", listOf("VS 449"), 2, "Boeing 787-9")
        )),
        RouteSpec("DXB", "JFK", 4, listOf(
            carrier("EK", "Emirates", listOf("EK 201", "EK 203", "EK 205"), 4, "Airbus A380-800")
        )),
        RouteSpec("DXB", "SIN", 5, listOf(
            carrier("EK", "Emirates", listOf("EK 352", "EK 354"), 3, "Airbus A380-800"),
            carrier("SQ", "Singapore Airlines", listOf("SQ 495"), 2, "Airbus A350-900")
        )),
        RouteSpec("DXB", "SYD", 3, listOf(
            carrier("EK", "Emirates", listOf("EK 412", "EK 414"), 3, "Airbus A380-800")
        )),
        RouteSpec("DXB", "BOM", 8, listOf(
            carrier("EK", "Emirates", listOf("EK 500", "EK 502", "EK 504"), 5, "Boeing 777-300ER"),
            carrier("AI", "Air India", listOf("AI 984", "AI 986"), 3, "Boeing 787-8")
        )),
        RouteSpec("DXB", "FRA", 4, listOf(
            carrier("EK", "Emirates", listOf("EK 043", "EK 045", "EK 047"), 3, "Airbus A380-800"),
            carrier("LH", "Lufthansa", listOf("LH 631"), 1, "Airbus A330-300")
        )),
        RouteSpec("DXB", "CDG", 4, listOf(
            carrier("EK", "Emirates", listOf("EK 071", "EK 073", "EK 075"), 3, "Airbus A380-800"),
            carrier("AF", "Air France", listOf("AF 662"), 1, "Boeing 777-300ER")
        )),
        RouteSpec("DXB", "IST", 5, listOf(
            carrier("EK", "Emirates", listOf("EK 121", "EK 123"), 3, "Boeing 777-300ER"),
            carrier("TK", "Turkish Airlines", listOf("TK 761", "TK 763"), 2, "Airbus A330-300")
        )),
        RouteSpec("JFK", "CDG", 8, listOf(
            carrier("AF", "Air France", listOf("AF 001", "AF 007", "AF 011"), 5, "Boeing 777-300ER"),
            carrier("DL", "Delta Air Lines", listOf("DL 262", "DL 264"), 3, "Airbus A330-900neo")
        )),
        RouteSpec("JFK", "FRA", 5, listOf(
            carrier("LH", "Lufthansa", listOf("LH 401", "LH 405"), 3, "Boeing 747-8"),
            carrier("DE", "Condor", listOf("DE 2017"), 1, "Airbus A330-900neo"),
            carrier("DL", "Delta Air Lines", listOf("DL 106"), 1, "Boeing 767-400ER")
        )),
        RouteSpec("JFK", "SFO", 12, listOf(
            carrier("DL", "Delta Air Lines", listOf("DL 415", "DL 429"), 5, "Boeing 767-300ER"),
            carrier("AA", "American Airlines", listOf("AA 017", "AA 177"), 4, "Airbus A321T"),
            carrier("B6", "JetBlue", listOf("B6 415", "B6 615"), 3, "Airbus A321 Mint")
        )),
        RouteSpec("JFK", "LAX", 15, listOf(
            carrier("DL", "Delta Air Lines", listOf("DL 301", "DL 315"), 6, "Boeing 767-400ER"),
            carrier("AA", "American Airlines", listOf("AA 001", "AA 003"), 5, "Airbus A321T"),
            carrier("B6", "JetBlue", listOf("B6 123", "B6 523"), 4, "Airbus A321 Mint")
        )),
        RouteSpec("JFK", "HND", 3, listOf(
            carrier("JL", "Japan Airlines", listOf("JL 003", "JL 005"), 2, "Airbus A350-1000"),
            carrier("NH", "ANA", listOf("NH 109"), 1, "Boeing 777-300ER")
        )),
        RouteSpec("JFK", "DOH", 3, listOf(
            carrier("QR", "Qatar Airways", listOf("QR 702", "QR 704", "QR 706"), 3, "Boeing 777-300ER")
        )),
        RouteSpec("JFK", "IST", 4, listOf(
            carrier("TK", "Turkish Airlines", listOf("TK 001", "TK 003", "TK 011"), 4, "Boeing 777-300ER")
        )),
        RouteSpec("JFK", "GRU", 3, listOf(
            carrier("LA", "LATAM Airlines", listOf("LA 8181"), 2, "Boeing 787-9"),
            carrier("AA", "American Airlines", listOf("AA 951"), 1, "Boeing 777-300ER")
        )),
        RouteSpec("SFO", "HND", 4, listOf(
            carrier("NH", "ANA", listOf("NH 107"), 1, "Boeing 777-300ER"),
            carrier("JL", "Japan Airlines", listOf("JL 001"), 1, "Boeing 777-300ER"),
            carrier("UA", "United Airlines", listOf("UA 875"), 2, "Boeing 787-9")
        )),
        RouteSpec("SFO", "SIN", 3, listOf(
            carrier("SQ", "Singapore Airlines", listOf("SQ 031", "SQ 033"), 2, "Airbus A350-900ULR"),
            carrier("UA", "United Airlines", listOf("UA 001"), 1, "Boeing 787-9")
        )),
        RouteSpec("SIN", "SYD", 6, listOf(
            carrier("SQ", "Singapore Airlines", listOf("SQ 211", "SQ 221", "SQ 231"), 4, "Airbus A380-800"),
            carrier("QF", "Qantas", listOf("QF 002", "QF 082"), 2, "Airbus A380-800")
        )),
        RouteSpec("SIN", "HND", 4, listOf(
            carrier("SQ", "Singapore Airlines", listOf("SQ 632", "SQ 634"), 2, "Boeing 787-10"),
            carrier("NH", "ANA", listOf("NH 842"), 1, "Boeing 787-9"),
            carrier("JL", "Japan Airlines", listOf("JL 036"), 1, "Boeing 787-9")
        ))
    )

    fun registerDynamicAirport(node: AirportNode) {
        dynamicAirports[node.iata.uppercase(Locale.ROOT)] = node
    }

    fun findAirportOrNull(iata: String): AirportNode? {
        val code = iata.trim().uppercase(Locale.ROOT)
        return airports.find { it.iata == code } ?: dynamicAirports[code]
    }

    fun getAirport(iata: String): AirportNode {
        return findAirportOrNull(iata) ?: airports.first() // Default CAI
    }

    fun searchAirports(query: String): List<AirportNode> {
        val all = (airports + dynamicAirports.values).distinctBy { it.iata }
        if (query.isBlank()) return all
        val q = query.trim().lowercase(Locale.ROOT)
        return all.filter { node ->
            node.iata.lowercase(Locale.ROOT).contains(q) ||
                node.icao.lowercase(Locale.ROOT).contains(q) ||
                node.city.lowercase(Locale.ROOT).contains(q) ||
                node.name.lowercase(Locale.ROOT).contains(q) ||
                node.country.lowercase(Locale.ROOT).contains(q)
        }
    }

    fun getConnectionsForOrigin(origin: AirportNode): List<DirectFlightConnection> {
        val code = origin.iata.uppercase(Locale.ROOT)

        // 1. Collect all explicit forward + reverse routes from coreRoutes
        val matchedSpecs = mutableListOf<RouteSpec>()
        for (spec in coreRoutes) {
            if (spec.originIata == code) {
                matchedSpecs.add(spec)
            } else if (spec.destIata == code) {
                matchedSpecs.add(
                    RouteSpec(
                        originIata = code,
                        destIata = spec.originIata,
                        dailyFlights = spec.dailyFlights,
                        carriers = spec.carriers
                    )
                )
            }
        }

        // 2. If user pivoted to a secondary hub that only had 1-2 explicit trunk lines,
        // connect it to key regional & global hubs so pivoting is always rich and interactive
        if (matchedSpecs.size < 8) {
            val existingDests = matchedSpecs.map { it.destIata }.toMutableSet()
            existingDests.add(code)
            val fallbackHubCodes = listOf("CAI", "LHR", "DXB", "IST", "FRA", "CDG", "DOH", "JFK", "SIN", "AMS", "MAD", "ATH")
            for (hubCode in fallbackHubCodes) {
                if (hubCode !in existingDests) {
                    val hubNode = getAirport(hubCode)
                    val airlineName = origin.hubAirlines.firstOrNull()
                        ?: hubNode.hubAirlines.firstOrNull()
                        ?: "Global Airways"
                    val airlineCode = airlineName.take(2).uppercase(Locale.ROOT)
                    val num = 200 + ((code.hashCode() + hubCode.hashCode()) and 0xFF)
                    matchedSpecs.add(
                        RouteSpec(
                            originIata = code,
                            destIata = hubCode,
                            dailyFlights = 2,
                            carriers = listOf(
                                carrier(airlineCode, airlineName, listOf("$airlineCode $num"), 2, "Boeing 787-9")
                            )
                        )
                    )
                    existingDests.add(hubCode)
                }
                if (matchedSpecs.size >= 12) break
            }
        }

        return matchedSpecs
            .distinctBy { it.destIata }
            .map { spec ->
                val dest = getAirport(spec.destIata)
                val distKm = GeodesicRouteCalculator.calculateDistanceKm(
                    origin.latitude, origin.longitude,
                    dest.latitude, dest.longitude
                )
                val distNm = GeodesicRouteCalculator.kmToNm(distKm)
                val durationMin = GeodesicRouteCalculator.estimateDurationMinutes(distKm)
                DirectFlightConnection(
                    id = "${origin.iata}-${dest.iata}",
                    origin = origin,
                    destination = dest,
                    distanceKm = distKm,
                    distanceNm = distNm,
                    estimatedDurationMinutes = durationMin,
                    durationFormatted = GeodesicRouteCalculator.formatDuration(durationMin),
                    haulCategory = GeodesicRouteCalculator.classifyHaul(distKm),
                    dailyFlightsCount = spec.dailyFlights,
                    hasDepartures = true,
                    hasArrivals = true,
                    operatingCarriers = spec.carriers,
                    isLiveVerified = false
                )
            }
            .sortedByDescending { it.dailyFlightsCount }
    }

    fun getAllUniqueConnections(): List<DirectFlightConnection> {
        return coreRoutes.map { spec ->
            val origin = getAirport(spec.originIata)
            val dest = getAirport(spec.destIata)
            val distKm = GeodesicRouteCalculator.calculateDistanceKm(
                origin.latitude, origin.longitude,
                dest.latitude, dest.longitude
            )
            val distNm = GeodesicRouteCalculator.kmToNm(distKm)
            val durationMin = GeodesicRouteCalculator.estimateDurationMinutes(distKm)
            DirectFlightConnection(
                id = "${origin.iata}-${dest.iata}",
                origin = origin,
                destination = dest,
                distanceKm = distKm,
                distanceNm = distNm,
                estimatedDurationMinutes = durationMin,
                durationFormatted = GeodesicRouteCalculator.formatDuration(durationMin),
                haulCategory = GeodesicRouteCalculator.classifyHaul(distKm),
                dailyFlightsCount = spec.dailyFlights,
                hasDepartures = true,
                hasArrivals = true,
                operatingCarriers = spec.carriers,
                isLiveVerified = false
            )
        }.sortedByDescending { it.dailyFlightsCount }
    }

    fun inferRegionFromCoords(lat: Double, lon: Double): RouteRegion {
        return when {
            lon < -25.0 -> RouteRegion.AMERICAS
            lat in 15.0..38.0 && lon in -18.0..60.0 -> RouteRegion.MENA
            lat < 15.0 && lon in -20.0..55.0 -> RouteRegion.AFRICA
            lon > 60.0 -> RouteRegion.ASIA_PACIFIC
            else -> RouteRegion.EUROPE
        }
    }
}

private fun ConsoleRouteStat.toDomainNode(origin: AirportNode? = null): AirportNode? {
    val dest = ConsoleAirportNode(
        iata = destination,
        icao = icao ?: "",
        name = destinationName ?: destination,
        city = city ?: destination,
        country = country ?: "",
        region = "",
        latitude = latitude,
        longitude = longitude,
        timezone = timezone ?: "UTC",
        hubAirlines = emptyList()
    )
    return dest.toDomainNode()
}

private fun ConsoleAirportNode.toDomainNode(origin: AirportNode? = null): AirportNode? {
    if (iata.isBlank() || iata.length != 3) return null
    return AirportNode(
        iata = iata.uppercase(),
        icao = icao,
        name = name,
        city = city,
        country = country,
        region = try {
            RouteRegion.valueOf(region.uppercase())
        } catch (_: Exception) {
            RouteRegion.EUROPE
        },
        latitude = latitude,
        longitude = longitude,
        timezone = timezone,
        hubAirlines = hubAirlines
    )
}
