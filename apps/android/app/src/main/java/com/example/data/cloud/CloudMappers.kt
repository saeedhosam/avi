package com.example.data.cloud

import com.example.model.AircraftInfo
import com.example.model.Airport
import com.example.model.AirportWeather
import com.example.model.Flight
import com.example.model.FlightStatus
import com.example.model.FlightTelemetry
import com.example.model.FlightTimelineEvent
import com.example.data.supabase.CloudAirportSnapshot
import com.example.data.supabase.CloudAircraftSnapshot
import com.example.data.supabase.CloudFlightSnapshot
import com.example.data.supabase.CloudTelemetrySnapshot
import com.example.data.supabase.CloudTimelineSnapshot
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject

fun CloudFlightSnapshot.toFlight(): Flight = Flight(
    id = id,
    flightDate = flightDate,
    flightNumber = flightNumber,
    airline = airline,
    airlineCode = airlineCode,
    origin = origin.toAirport(),
    destination = destination.toAirport(),
    departureTimeScheduled = departureTimeScheduled,
    departureTimeEstimated = departureTimeEstimated,
    departureTimeActual = departureTimeActual,
    arrivalTimeScheduled = arrivalTimeScheduled,
    arrivalTimeEstimated = arrivalTimeEstimated,
    arrivalTimeActual = arrivalTimeActual,
    status = runCatching { FlightStatus.valueOf(status) }.getOrDefault(FlightStatus.SCHEDULED),
    statusReported = statusReported && status.isNotBlank(),
    statusNote = statusNote,
    delayMinutes = delayMinutes,
    delayReported = delayReported,
    delayReason = delayReason,
    terminalDeparture = terminalDeparture,
    gateDeparture = gateDeparture,
    checkInCounter = checkInCounter,
    terminalArrival = terminalArrival,
    gateArrival = gateArrival,
    baggageCarousel = baggageCarousel,
    aircraft = AircraftInfo(
        model = aircraft.model,
        registration = aircraft.registration,
        age = aircraft.age,
        wifiAvailable = aircraft.wifiAvailable,
        powerOutlets = aircraft.powerOutlets,
        seatLayout = aircraft.seatLayout
    ),
    telemetry = FlightTelemetry(
        currentLatitude = telemetry.currentLatitude,
        currentLongitude = telemetry.currentLongitude,
        altitudeFeet = telemetry.altitudeFeet,
        groundSpeedKnots = telemetry.groundSpeedKnots,
        headingDegrees = telemetry.headingDegrees,
        verticalSpeedFpm = telemetry.verticalSpeedFpm,
        mach = telemetry.mach,
        progressPercent = telemetry.progressPercent,
        distanceCoveredNm = telemetry.distanceCoveredNm,
        distanceRemainingNm = telemetry.distanceRemainingNm,
        etaMinutesRemaining = telemetry.etaMinutesRemaining,
        waypoints = emptyList()
    ),
    timeline = timeline.map {
        FlightTimelineEvent(
            title = it.title,
            time = it.time,
            isCompleted = it.isCompleted,
            isCurrent = it.isCurrent,
            description = it.description
        )
    },
    isFavorite = isFavorite,
    isTracked = isTracked,
    customNotes = customNotes,
    source = source,
    fetchedAt = fetchedAt
)

fun Flight.toCloudSnapshot(): CloudFlightSnapshot = CloudFlightSnapshot(
    id = id,
    flightNumber = flightNumber,
    flightDate = flightDate,
    airline = airline,
    airlineCode = airlineCode,
    origin = CloudAirportSnapshot(
        code = origin.code,
        name = origin.name,
        city = origin.city,
        country = origin.country,
        timezone = origin.timezone,
        latitude = origin.latitude,
        longitude = origin.longitude,
        weather = com.example.data.supabase.CloudAirportWeatherSnapshot(
            tempC = origin.weather.tempC,
            tempF = origin.weather.tempF,
            condition = origin.weather.condition,
            wind = origin.weather.wind,
            visibility = origin.weather.visibility,
            humidity = origin.weather.humidity
        ),
        weatherReported = origin.weatherReported
    ),
    destination = CloudAirportSnapshot(
        code = destination.code,
        name = destination.name,
        city = destination.city,
        country = destination.country,
        timezone = destination.timezone,
        latitude = destination.latitude,
        longitude = destination.longitude,
        weather = com.example.data.supabase.CloudAirportWeatherSnapshot(
            tempC = destination.weather.tempC,
            tempF = destination.weather.tempF,
            condition = destination.weather.condition,
            wind = destination.weather.wind,
            visibility = destination.weather.visibility,
            humidity = destination.weather.humidity
        ),
        weatherReported = destination.weatherReported
    ),
    departureTimeScheduled = departureTimeScheduled,
    departureTimeEstimated = departureTimeEstimated,
    departureTimeActual = departureTimeActual,
    arrivalTimeScheduled = arrivalTimeScheduled,
    arrivalTimeEstimated = arrivalTimeEstimated,
    arrivalTimeActual = arrivalTimeActual,
    status = status.name,
    statusReported = statusReported,
    statusNote = statusNote,
    delayMinutes = delayMinutes,
    delayReported = delayReported,
    delayReason = delayReason,
    terminalDeparture = terminalDeparture,
    gateDeparture = gateDeparture,
    checkInCounter = checkInCounter,
    terminalArrival = terminalArrival,
    gateArrival = gateArrival,
    baggageCarousel = baggageCarousel,
    aircraft = CloudAircraftSnapshot(
        model = aircraft.model,
        registration = aircraft.registration,
        age = aircraft.age,
        wifiAvailable = aircraft.wifiAvailable,
        powerOutlets = aircraft.powerOutlets,
        seatLayout = aircraft.seatLayout
    ),
    telemetry = CloudTelemetrySnapshot(
        currentLatitude = telemetry.currentLatitude,
        currentLongitude = telemetry.currentLongitude,
        altitudeFeet = telemetry.altitudeFeet,
        groundSpeedKnots = telemetry.groundSpeedKnots,
        headingDegrees = telemetry.headingDegrees,
        verticalSpeedFpm = telemetry.verticalSpeedFpm,
        mach = telemetry.mach,
        progressPercent = telemetry.progressPercent,
        distanceCoveredNm = telemetry.distanceCoveredNm,
        distanceRemainingNm = telemetry.distanceRemainingNm,
        etaMinutesRemaining = telemetry.etaMinutesRemaining
    ),
    timeline = timeline.map {
        CloudTimelineSnapshot(
            title = it.title,
            time = it.time,
            isCompleted = it.isCompleted,
            isCurrent = it.isCurrent,
            description = it.description
        )
    },
    isFavorite = isFavorite,
    isTracked = isTracked,
    customNotes = customNotes,
    source = source,
    fetchedAt = fetchedAt
)

fun CloudFlightSnapshot.toJsonObject(): JsonObject =
    Json.encodeToJsonElement(CloudFlightSnapshot.serializer(), this).jsonObject

fun CloudAirportSnapshot.toAirport(): Airport = Airport(
    code = code,
    name = name,
    city = city,
    country = country,
    timezone = timezone,
    latitude = latitude,
    longitude = longitude,
    weather = AirportWeather(
        tempC = weather.tempC,
        tempF = weather.tempF,
        condition = weather.condition,
        wind = weather.wind,
        visibility = weather.visibility,
        humidity = weather.humidity
    ),
    weatherReported = weatherReported
)
