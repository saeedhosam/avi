package com.example.data.remote.aerodatabox

import com.squareup.moshi.Json

/**
 * Data Transfer Objects (DTOs) for the AeroDataBox REST API.
 * Supports `/flights/number/{flightNumber}`, `/flights/airports/iata/{code}`,
 * `/airports/iata/{code}/delays`, and `/airports/search/term`.
 */
data class AeroFlightDto(
    @Json(name = "number") val number: String? = null,
    @Json(name = "callSign") val callSign: String? = null,
    @Json(name = "status") val status: String? = null,
    @Json(name = "codeshareStatus") val codeshareStatus: String? = null,
    @Json(name = "isCargo") val isCargo: Boolean? = false,
    @Json(name = "departure") val departure: AeroMovementDto? = null,
    @Json(name = "arrival") val arrival: AeroMovementDto? = null,
    @Json(name = "movement") val movement: AeroMovementDto? = null,
    @Json(name = "airline") val airline: AeroAirlineDto? = null,
    @Json(name = "aircraft") val aircraft: AeroAircraftDto? = null,
    @Json(name = "location") val location: AeroLocationDto? = null,
    @Json(name = "greatCircleDistance") val greatCircleDistance: AeroDistanceDto? = null
)

data class AeroMovementDto(
    @Json(name = "airport") val airport: AeroAirportDto? = null,
    @Json(name = "scheduledTime") val scheduledTime: AeroTimeDto? = null,
    @Json(name = "revisedTime") val revisedTime: AeroTimeDto? = null,
    @Json(name = "runwayTime") val runwayTime: AeroTimeDto? = null,
    @Json(name = "predictedTime") val predictedTime: AeroTimeDto? = null,
    @Json(name = "terminal") val terminal: String? = null,
    @Json(name = "checkInDesk") val checkInDesk: String? = null,
    @Json(name = "gate") val gate: String? = null,
    @Json(name = "baggageBelt") val baggageBelt: String? = null,
    @Json(name = "runway") val runway: String? = null,
    @Json(name = "quality") val quality: List<String>? = null
)

data class AeroTimeDto(
    @Json(name = "utc") val utc: String? = null,
    @Json(name = "local") val local: String? = null
)

data class AeroAirportDto(
    @Json(name = "iata") val iata: String? = null,
    @Json(name = "icao") val icao: String? = null,
    @Json(name = "name") val name: String? = null,
    @Json(name = "shortName") val shortName: String? = null,
    @Json(name = "municipalityName") val municipalityName: String? = null,
    @Json(name = "countryCode") val countryCode: String? = null,
    @Json(name = "timeZone") val timeZone: String? = null,
    @Json(name = "location") val location: AeroLatLonDto? = null
)

data class AeroLatLonDto(
    @Json(name = "lat") val lat: Double? = null,
    @Json(name = "lon") val lon: Double? = null
)

data class AeroAirlineDto(
    @Json(name = "name") val name: String? = null,
    @Json(name = "iata") val iata: String? = null,
    @Json(name = "icao") val icao: String? = null
)

data class AeroAircraftDto(
    @Json(name = "reg") val reg: String? = null,
    @Json(name = "modeS") val modeS: String? = null,
    @Json(name = "model") val model: String? = null
)

data class AeroLocationDto(
    @Json(name = "lat") val lat: Double? = null,
    @Json(name = "lon") val lon: Double? = null,
    @Json(name = "pressureAltitude") val pressureAltitude: AeroMeasureDto? = null,
    @Json(name = "altitude") val altitude: AeroMeasureDto? = null,
    @Json(name = "groundSpeed") val groundSpeed: AeroMeasureDto? = null,
    @Json(name = "trueTrack") val trueTrack: AeroMeasureDto? = null
)

data class AeroMeasureDto(
    @Json(name = "feet") val feet: Double? = null,
    @Json(name = "kt") val kt: Double? = null,
    @Json(name = "deg") val deg: Double? = null,
    @Json(name = "km") val km: Double? = null,
    @Json(name = "nm") val nm: Double? = null
)

data class AeroDistanceDto(
    @Json(name = "km") val km: Double? = null,
    @Json(name = "nm") val nm: Double? = null,
    @Json(name = "mile") val mile: Double? = null
)

/**
 * Airport FIDS (Flight Information Display System) response from
 * `GET /flights/airports/iata/{code}`
 */
data class AeroFidsResponseDto(
    @Json(name = "departures") val departures: List<AeroFlightDto>? = null,
    @Json(name = "arrivals") val arrivals: List<AeroFlightDto>? = null
)

/**
 * Airport Delay Index response from `GET /airports/iata/{code}/delays`
 */
data class AeroAirportDelayDto(
    @Json(name = "airportIata") val airportIata: String? = null,
    @Json(name = "departuresDelayInformation") val departuresDelayInformation: AeroDelayStatsDto? = null,
    @Json(name = "arrivalsDelayInformation") val arrivalsDelayInformation: AeroDelayStatsDto? = null
)

data class AeroDelayStatsDto(
    @Json(name = "numTotal") val numTotal: Int? = null,
    @Json(name = "numCancelled") val numCancelled: Int? = null,
    @Json(name = "medianDelay") val medianDelay: String? = null,
    @Json(name = "delayIndex") val delayIndex: Double? = null
)

/**
 * Airport Search by term response from `GET /airports/search/term`
 */
data class AeroAirportSearchResponseDto(
    @Json(name = "items") val items: List<AeroAirportDto>? = null
)

/**
 * Daily Route Statistics response from `GET /airports/iata/{code}/stats/routes/daily`
 */
data class AeroRoutesResponseDto(
    @Json(name = "routes") val routes: List<AeroRouteStatDto>? = null
)

data class AeroRouteStatDto(
    @Json(name = "destination") val destination: AeroAirportDto? = null,
    @Json(name = "averageDailyFlights") val averageDailyFlights: Double? = null,
    @Json(name = "operators") val operators: List<AeroAirlineDto>? = null
)

