package com.example.data.remote.gateway

import com.example.model.AircraftInfo
import com.example.model.Airport
import com.example.model.AirportWeather
import com.example.model.Flight
import com.example.model.FlightStatus
import com.example.model.FlightTelemetry
import com.example.model.FlightTimelineEvent
import com.example.model.OperatingCarrierRoute
import com.example.model.DirectFlightConnection
import com.example.model.HaulCategory
import com.squareup.moshi.JsonClass
import com.squareup.moshi.Moshi
import com.example.data.remote.gateway.GatewayNetworkClient.moshi

// ── Console payload shapes (same JSON the web consumes from the gateway) ────

@JsonClass(generateAdapter = false)
data class GatewayLookupResponse(
    val mode: String = "",
    val flights: List<ConsoleFlightDto> = emptyList()
)

@JsonClass(generateAdapter = false)
data class GatewayFidsResponse(
    val mode: String = "",
    val flights: List<ConsoleFlightDto> = emptyList()
)

@JsonClass(generateAdapter = false)
data class GatewayAirportSearchResponse(
    val mode: String = "",
    val airports: List<ConsoleAirportNode> = emptyList()
)

@JsonClass(generateAdapter = false)
data class GatewayRoutesResponse(
    val mode: String = "",
    val routes: List<ConsoleRouteStat> = emptyList()
)

@JsonClass(generateAdapter = false)
data class ConsoleFlightDto(
    val id: String = "",
    val flightDate: String? = null,
    val flightNumber: String = "",
    val airline: String = "",
    val airlineCode: String = "",
    val origin: ConsoleAirportDto? = null,
    val destination: ConsoleAirportDto? = null,
    val departureTimeScheduled: String = "",
    val departureTimeEstimated: String = "",
    val departureTimeActual: String? = null,
    val arrivalTimeScheduled: String = "",
    val arrivalTimeEstimated: String = "",
    val arrivalTimeActual: String? = null,
    val status: String = "",
    val statusNote: String = "",
    val delayMinutes: Int = 0,
    val delayReason: String? = null,
    val terminalDeparture: String = "",
    val gateDeparture: String = "",
    val checkInCounter: String = "",
    val terminalArrival: String = "",
    val gateArrival: String = "",
    val baggageCarousel: String = "",
    val aircraft: ConsoleAircraftDto? = null,
    val telemetry: ConsoleTelemetryDto? = null,
    val timeline: List<ConsoleTimelineDto> = emptyList(),
    val customNotes: String = ""
)

@JsonClass(generateAdapter = false)
data class ConsoleAirportDto(
    val code: String = "",
    val name: String = "",
    val city: String = "",
    val country: String = "",
    val timezone: String = "",
    val latitude: Double = 0.0,
    val longitude: Double = 0.0,
    val weather: ConsoleAirportWeatherDto? = null
)

@JsonClass(generateAdapter = false)
data class ConsoleAirportWeatherDto(
    val tempC: Int = 0,
    val tempF: Int = 68,
    val condition: String = "",
    val wind: String = "",
    val visibility: String = "",
    val humidity: Int = 0
)

@JsonClass(generateAdapter = false)
data class ConsoleAircraftDto(
    val model: String = "",
    val registration: String = "",
    val age: String = "",
    val wifiAvailable: Boolean = false,
    val powerOutlets: Boolean = false,
    val seatLayout: String = ""
)

@JsonClass(generateAdapter = false)
data class ConsoleTelemetryDto(
    val hasLiveLocation: Boolean = false,
    val currentLatitude: Double = 0.0,
    val currentLongitude: Double = 0.0,
    val altitudeFeet: Int = 0,
    val groundSpeedKnots: Int = 0,
    val headingDegrees: Float = 0f,
    val verticalSpeedFpm: Int = 0,
    val mach: Double = 0.0,
    val progressPercent: Float = 0f,
    val distanceCoveredNm: Int = 0,
    val distanceRemainingNm: Int = 0,
    val etaMinutesRemaining: Int = 0
)

@JsonClass(generateAdapter = false)
data class ConsoleTimelineDto(
    val title: String = "",
    val time: String = "",
    val isCompleted: Boolean = false,
    val isCurrent: Boolean = false,
    val description: String = ""
)

@JsonClass(generateAdapter = false)
data class ConsoleAirportNode(
    val iata: String = "",
    val icao: String = "",
    val name: String = "",
    val city: String = "",
    val country: String = "",
    val region: String = "",
    val latitude: Double = 0.0,
    val longitude: Double = 0.0,
    val timezone: String = "",
    val hubAirlines: List<String> = emptyList()
)

@JsonClass(generateAdapter = false)
data class ConsoleRouteStat(
    val destination: String = "",
    val destinationName: String? = null,
    val city: String? = null,
    val country: String? = null,
    val icao: String? = null,
    val timezone: String? = null,
    val latitude: Double = 0.0,
    val longitude: Double = 0.0,
    val dailyFlights: Int = 1,
    val operators: List<ConsoleRouteOperator> = emptyList()
)

@JsonClass(generateAdapter = false)
data class ConsoleRouteOperator(
    val code: String = "",
    val name: String = ""
)

// ── Console DTO → domain mappers ─────────────────────────────────────────────

fun ConsoleAirportDto.toDomainAirport(): Airport = Airport(
    code = code,
    name = name.ifBlank { code },
    city = city.ifBlank { code },
    country = country,
    timezone = timezone.ifBlank { "UTC" },
    latitude = latitude,
    longitude = longitude,
    weather = weather.toDomainWeather()
)

private fun ConsoleAirportWeatherDto?.toDomainWeather(): AirportWeather = AirportWeather(
    tempC = this?.tempC ?: 0,
    tempF = this?.tempF ?: 32,
    condition = this?.condition ?: "",
    wind = this?.wind ?: "",
    visibility = this?.visibility ?: "",
    humidity = this?.humidity ?: 0
)

fun mapConsoleStatus(raw: String): FlightStatus = try {
    FlightStatus.valueOf(raw.uppercase())
} catch (_: Exception) {
    FlightStatus.SCHEDULED
}

fun ConsoleFlightDto.toDomainFlight(): Flight? {
    val originDto = origin ?: return null
    val destDto = destination ?: return null
    return Flight(
        id = id.ifBlank { flightNumber.replace(" ", "") },
        flightDate = flightDate,
        flightNumber = flightNumber,
        airline = airline,
        airlineCode = airlineCode,
        origin = originDto.toDomainAirport(),
        destination = destDto.toDomainAirport(),
        departureTimeScheduled = departureTimeScheduled,
        departureTimeEstimated = departureTimeEstimated,
        departureTimeActual = departureTimeActual,
        arrivalTimeScheduled = arrivalTimeScheduled,
        arrivalTimeEstimated = arrivalTimeEstimated,
        arrivalTimeActual = arrivalTimeActual,
        status = mapConsoleStatus(status),
        statusNote = statusNote,
        delayMinutes = delayMinutes,
        delayReason = delayReason,
        terminalDeparture = terminalDeparture,
        gateDeparture = gateDeparture,
        checkInCounter = checkInCounter,
        terminalArrival = terminalArrival,
        gateArrival = gateArrival,
        baggageCarousel = baggageCarousel,
        aircraft = aircraft.toDomainAircraft(),
        telemetry = telemetry.toDomainTelemetry(),
        timeline = timeline.map { event ->
            FlightTimelineEvent(
                title = event.title,
                time = event.time,
                isCompleted = event.isCompleted,
                isCurrent = event.isCurrent,
                description = event.description
            )
        },
        customNotes = customNotes
    )
}

private fun ConsoleAircraftDto?.toDomainAircraft(): AircraftInfo = AircraftInfo(
    model = this?.model ?: "Not reported",
    registration = this?.registration ?: "Not reported",
    age = this?.age ?: "Not reported",
    wifiAvailable = this?.wifiAvailable ?: false,
    powerOutlets = this?.powerOutlets ?: false,
    seatLayout = this?.seatLayout ?: "Not reported by the live feed"
)

private fun ConsoleTelemetryDto?.toDomainTelemetry(): FlightTelemetry = FlightTelemetry(
    currentLatitude = this?.currentLatitude ?: 0.0,
    currentLongitude = this?.currentLongitude ?: 0.0,
    altitudeFeet = this?.altitudeFeet ?: 0,
    groundSpeedKnots = this?.groundSpeedKnots ?: 0,
    headingDegrees = this?.headingDegrees ?: 0f,
    verticalSpeedFpm = this?.verticalSpeedFpm ?: 0,
    mach = this?.mach ?: 0.0,
    progressPercent = this?.progressPercent ?: 0f,
    distanceCoveredNm = this?.distanceCoveredNm ?: 0,
    distanceRemainingNm = this?.distanceRemainingNm ?: 0,
    etaMinutesRemaining = this?.etaMinutesRemaining ?: 0,
    waypoints = emptyList()
)
