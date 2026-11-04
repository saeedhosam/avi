package com.example.data.remote.aerodatabox

import com.example.data.MockFlightData
import com.example.model.*
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import kotlin.math.*

/**
 * Pure mapper converting AeroDataBox DTOs into SkyTrack domain models (`Flight`, `Airport`,
 * `RealtimeAirportInfo`) and computing state diffs (`FlightStateDiffer`) for background alerts.
 */
object AeroDataBoxMapper {

    /**
     * Maps an AeroFlightDto from `/flights/number/{flightNumber}` or `/airports/iata/{code}/flights`
     * into a complete SkyTrack [Flight] domain object.
     */
    fun mapDtoToFlight(
        dto: AeroFlightDto,
        fallbackAirportIata: String? = null,
        isDepartureFromFallback: Boolean = true
    ): Flight? {
        val rawNumber = dto.number?.trim()?.takeIf { it.isNotBlank() } ?: return null
        val normalizedNumber = normalizeFlightNumber(rawNumber)
        val compactId = normalizedNumber.replace(" ", "")

        val depMovement = dto.departure ?: if (!isDepartureFromFallback) dto.movement else null
        val arrMovement = dto.arrival ?: if (isDepartureFromFallback) dto.movement else null

        val originAirport = resolveAirport(
            dtoAirport = depMovement?.airport,
            fallbackIata = if (isDepartureFromFallback) fallbackAirportIata else null,
            defaultIata = "JFK"
        )
        val destAirport = resolveAirport(
            dtoAirport = arrMovement?.airport,
            fallbackIata = if (!isDepartureFromFallback) fallbackAirportIata else null,
            defaultIata = "LHR"
        )

        val depScheduled = extractTimeHHmm(depMovement?.scheduledTime?.local ?: depMovement?.scheduledTime?.utc) ?: "12:00"
        val depRevised = extractTimeHHmm(
            depMovement?.revisedTime?.local
                ?: depMovement?.predictedTime?.local
                ?: depMovement?.runwayTime?.local
        ) ?: depScheduled
        val depActual = extractTimeHHmm(depMovement?.runwayTime?.local)

        val arrScheduled = extractTimeHHmm(arrMovement?.scheduledTime?.local ?: arrMovement?.scheduledTime?.utc) ?: "16:30"
        val arrRevised = extractTimeHHmm(
            arrMovement?.revisedTime?.local
                ?: arrMovement?.predictedTime?.local
                ?: arrMovement?.runwayTime?.local
        ) ?: arrScheduled
        val arrActual = extractTimeHHmm(arrMovement?.runwayTime?.local)

        val calculatedDelayMinutes = computeDelayMinutes(
            scheduledIso = depMovement?.scheduledTime?.local ?: arrMovement?.scheduledTime?.local,
            revisedIso = depMovement?.revisedTime?.local ?: arrMovement?.revisedTime?.local
        )

        val mappedStatus = mapFlightStatus(dto.status, calculatedDelayMinutes)
        val airlineName = dto.airline?.name?.takeIf { it.isNotBlank() } ?: inferAirlineName(normalizedNumber)
        val airlineCode = dto.airline?.iata?.takeIf { it.isNotBlank() }
            ?: normalizedNumber.substringBefore(" ").take(2).uppercase(Locale.ROOT)

        val terminalDep = depMovement?.terminal?.takeIf { it.isNotBlank() } ?: "1"
        val gateDep = depMovement?.gate?.takeIf { it.isNotBlank() }?.let {
            if (it.startsWith("Gate", ignoreCase = true)) it else "Gate $it"
        } ?: "Gate TBD"
        val checkIn = depMovement?.checkInDesk?.takeIf { it.isNotBlank() } ?: "Zone A"

        val terminalArr = arrMovement?.terminal?.takeIf { it.isNotBlank() } ?: "1"
        val gateArr = arrMovement?.gate?.takeIf { it.isNotBlank() }?.let {
            if (it.startsWith("Gate", ignoreCase = true)) it else "Gate $it"
        } ?: "Gate TBD"
        val carousel = arrMovement?.baggageBelt?.takeIf { it.isNotBlank() }?.let {
            if (it.startsWith("Carousel", ignoreCase = true) || it.startsWith("Belt", ignoreCase = true)) it else "Carousel $it"
        } ?: "Carousel TBD"

        val aircraftModel = dto.aircraft?.model?.takeIf { it.isNotBlank() } ?: "Boeing 787-9 Dreamliner"
        val aircraftReg = dto.aircraft?.reg?.takeIf { it.isNotBlank() } ?: "N${(100..999).random()}ST"

        val telemetry = buildTelemetry(
            origin = originAirport,
            destination = destAirport,
            status = mappedStatus,
            location = dto.location,
            greatCircle = dto.greatCircleDistance,
            depScheduledIso = depMovement?.scheduledTime?.utc ?: depMovement?.scheduledTime?.local,
            arrScheduledIso = arrMovement?.scheduledTime?.utc ?: arrMovement?.scheduledTime?.local
        )

        val statusNote = buildStatusNote(mappedStatus, calculatedDelayMinutes, gateDep, carousel)
        val delayReason = if (calculatedDelayMinutes >= 15 || mappedStatus == FlightStatus.DELAYED) {
            "Operational / Air Traffic Control Revision (+${maxOf(calculatedDelayMinutes, 15)}m)"
        } else null

        val timeline = buildTimeline(
            origin = originAirport,
            destination = destAirport,
            depScheduled = depScheduled,
            depEstimated = depRevised,
            arrEstimated = arrRevised,
            gateDep = gateDep,
            carousel = carousel,
            status = mappedStatus
        )

        return Flight(
            id = compactId,
            flightNumber = normalizedNumber,
            airline = airlineName,
            airlineCode = airlineCode,
            origin = originAirport,
            destination = destAirport,
            departureTimeScheduled = depScheduled,
            departureTimeEstimated = depRevised,
            departureTimeActual = depActual,
            arrivalTimeScheduled = arrScheduled,
            arrivalTimeEstimated = arrRevised,
            arrivalTimeActual = arrActual,
            status = mappedStatus,
            statusNote = statusNote,
            delayMinutes = calculatedDelayMinutes,
            delayReason = delayReason,
            terminalDeparture = terminalDep,
            gateDeparture = gateDep,
            checkInCounter = checkIn,
            terminalArrival = terminalArr,
            gateArrival = gateArr,
            baggageCarousel = carousel,
            aircraft = AircraftInfo(
                model = aircraftModel,
                registration = aircraftReg,
                age = "4.5 yrs"
            ),
            telemetry = telemetry,
            timeline = timeline
        )
    }

    /**
     * Maps an AeroDataBox FIDS response (`departures` + `arrivals`) into a list of [Flight] items.
     */
    fun mapFidsToFlights(airportCode: String, fids: AeroFidsResponseDto): List<Flight> {
        val depFlights = fids.departures.orEmpty().mapNotNull { dto ->
            mapDtoToFlight(dto, fallbackAirportIata = airportCode, isDepartureFromFallback = true)
        }
        val arrFlights = fids.arrivals.orEmpty().mapNotNull { dto ->
            mapDtoToFlight(dto, fallbackAirportIata = airportCode, isDepartureFromFallback = false)
        }
        return (depFlights + arrFlights).distinctBy { "${it.id}_${it.origin.code}_${it.destination.code}" }
    }

    /**
     * Maps an [AeroAirportDto] and optional [AeroAirportDelayDto] into [RealtimeAirportInfo].
     */
    fun mapAirportToRealtimeInfo(
        dto: AeroAirportDto,
        delayDto: AeroAirportDelayDto? = null,
        baseInfo: RealtimeAirportInfo? = null
    ): RealtimeAirportInfo? {
        val code = dto.iata?.trim()?.uppercase(Locale.ROOT)?.takeIf { it.length == 3 }
            ?: baseInfo?.code
            ?: return null

        val icao = dto.icao?.trim()?.uppercase(Locale.ROOT)?.takeIf { it.isNotBlank() }
            ?: baseInfo?.icao
            ?: "K$code"

        val name = dto.name?.takeIf { it.isNotBlank() }
            ?: dto.shortName?.takeIf { it.isNotBlank() }
            ?: baseInfo?.name
            ?: "$code International Airport"

        val city = dto.municipalityName?.takeIf { it.isNotBlank() }
            ?: baseInfo?.city
            ?: name.substringBefore(" ")

        val country = dto.countryCode?.takeIf { it.isNotBlank() }
            ?: baseInfo?.country
            ?: "International"

        val lat = dto.location?.lat ?: baseInfo?.latitude ?: 40.6413
        val lon = dto.location?.lon ?: baseInfo?.longitude ?: -73.7781

        val depDelayIndex = delayDto?.departuresDelayInformation?.delayIndex ?: 0.0
        val arrDelayIndex = delayDto?.arrivalsDelayInformation?.delayIndex ?: 0.0
        val maxDelayIndex = maxOf(depDelayIndex, arrDelayIndex)

        val parsedMedianDelay = parseMedianDelayMinutes(
            delayDto?.departuresDelayInformation?.medianDelay
                ?: delayDto?.arrivalsDelayInformation?.medianDelay
        )
        val delayMinutes = when {
            parsedMedianDelay > 0 -> parsedMedianDelay
            maxDelayIndex >= 2.0 -> (maxDelayIndex * 15).toInt()
            else -> baseInfo?.delayMinutes ?: 4
        }

        val isDelayed = delayMinutes >= 15 || maxDelayIndex >= 2.0
        val operationalStatus = when {
            maxDelayIndex >= 3.5 || delayMinutes >= 45 -> "Severe Ground Delay (${delayMinutes}m avg)"
            isDelayed -> "Moderate Flow Delay (${delayMinutes}m avg)"
            else -> "Normal Operations · Live Feed"
        }

        val onTimePct = when {
            delayMinutes >= 45 -> 62
            delayMinutes >= 25 -> 74
            delayMinutes >= 15 -> 81
            else -> (96 - delayMinutes).coerceIn(85, 98)
        }

        return RealtimeAirportInfo(
            code = code,
            icao = icao,
            name = name,
            city = city,
            country = country,
            region = baseInfo?.region ?: inferRegion(country, lon),
            timezone = dto.timeZone ?: baseInfo?.timezone ?: "UTC",
            latitude = lat,
            longitude = lon,
            elevationFeet = baseInfo?.elevationFeet ?: 55,
            operationalStatus = operationalStatus,
            isDelayed = isDelayed,
            delayMinutes = delayMinutes,
            delayReason = if (isDelayed) "Live AeroDataBox Delay Index ${String.format(Locale.US, "%.1f", maxDelayIndex)}" else null,
            onTimePercentage = onTimePct,
            activeDeparturesCount = delayDto?.departuresDelayInformation?.numTotal ?: baseInfo?.activeDeparturesCount ?: 45,
            activeArrivalsCount = delayDto?.arrivalsDelayInformation?.numTotal ?: baseInfo?.activeArrivalsCount ?: 45,
            activeRunways = baseInfo?.activeRunways ?: listOf("09L / 27R", "09R / 27L"),
            terminalCount = baseInfo?.terminalCount ?: 3,
            weather = baseInfo?.weather ?: RealtimeAirportWeather(
                tempC = 20,
                tempF = 68,
                condition = "Clear Sky",
                wind = "10 kt W",
                visibility = "10+ mi",
                humidity = 55,
                pressureInHg = 30.02,
                metarRaw = "$icao AUTO 10KT 10SM CLR 20/11 A3002",
                flightCategory = FlightCategory.VFR
            ),
            hubAirlines = baseInfo?.hubAirlines ?: emptyList()
        )
    }

    /**
     * Normalizes compact flight numbers like `"AA100"` or `"ba 178"` into `"AA 100"`, `"BA 178"`.
     */
    fun normalizeFlightNumber(raw: String): String {
        val cleaned = raw.trim().uppercase(Locale.ROOT).replace("-", " ")
        val regex = Regex("^([A-Z]{2,3}|[A-Z][0-9]|[0-9][A-Z])\\s*([0-9]{1,4}[A-Z]?)$")
        val match = regex.matchEntire(cleaned.replace(" ", ""))
        return if (match != null) {
            "${match.groupValues[1]} ${match.groupValues[2]}"
        } else {
            cleaned
        }
    }

    /**
     * Extracts `"HH:mm"` from AeroDataBox timestamps like `"2026-11-04 18:55-05:00"` or `"2026-11-04T18:55:00Z"`.
     */
    fun extractTimeHHmm(rawIso: String?): String? {
        if (rawIso.isNullOrBlank()) return null
        val regex = Regex("(\\d{2}:\\d{2})")
        return regex.find(rawIso)?.groupValues?.get(1)
    }

    /**
     * Computes delay in minutes between two local/UTC timestamp strings.
     */
    fun computeDelayMinutes(scheduledIso: String?, revisedIso: String?): Int {
        if (scheduledIso.isNullOrBlank() || revisedIso.isNullOrBlank()) return 0
        val schedHHmm = extractTimeHHmm(scheduledIso) ?: return 0
        val revHHmm = extractTimeHHmm(revisedIso) ?: return 0
        if (schedHHmm == revHHmm) return 0

        return try {
            val sParts = schedHHmm.split(":")
            val rParts = revHHmm.split(":")
            val sMins = sParts[0].toInt() * 60 + sParts[1].toInt()
            val rMins = rParts[0].toInt() * 60 + rParts[1].toInt()
            var diff = rMins - sMins
            if (diff < -720) diff += 1440 // crossed midnight forward
            if (diff > 720) diff -= 1440
            maxOf(0, diff)
        } catch (_: Exception) {
            0
        }
    }

    fun mapFlightStatus(rawStatus: String?, delayMinutes: Int): FlightStatus {
        val s = rawStatus?.trim()?.lowercase(Locale.ROOT) ?: ""
        return when {
            s.contains("cancel") -> FlightStatus.CANCELLED
            s.contains("arrived") || s.contains("landed") -> FlightStatus.LANDED
            s.contains("board") || s.contains("gateclosed") -> FlightStatus.BOARDING
            s.contains("enroute") || s.contains("departed") || s.contains("approaching") || s.contains("airborne") -> FlightStatus.DEPARTED
            s.contains("delay") || delayMinutes >= 15 -> FlightStatus.DELAYED
            else -> FlightStatus.SCHEDULED
        }
    }

    private fun parseMedianDelayMinutes(medianStr: String?): Int {
        if (medianStr.isNullOrBlank()) return 0
        // Format is often "00:25:00" or "PT25M"
        val hhMmRegex = Regex("(\\d{2}):(\\d{2})")
        val match = hhMmRegex.find(medianStr)
        if (match != null) {
            return match.groupValues[1].toInt() * 60 + match.groupValues[2].toInt()
        }
        val digits = Regex("(\\d+)").find(medianStr)?.groupValues?.get(1)?.toIntOrNull() ?: 0
        return digits
    }

    private fun resolveAirport(
        dtoAirport: AeroAirportDto?,
        fallbackIata: String?,
        defaultIata: String
    ): Airport {
        val iata = dtoAirport?.iata?.trim()?.uppercase(Locale.ROOT)?.takeIf { it.isNotBlank() }
            ?: fallbackIata?.uppercase(Locale.ROOT)
            ?: defaultIata

        val existing = MockFlightData.airports.find { it.code.equals(iata, ignoreCase = true) }
        val lat = dtoAirport?.location?.lat ?: existing?.latitude ?: 40.6413
        val lon = dtoAirport?.location?.lon ?: existing?.longitude ?: -73.7781

        return Airport(
            code = iata,
            name = dtoAirport?.name?.takeIf { it.isNotBlank() }
                ?: dtoAirport?.shortName?.takeIf { it.isNotBlank() }
                ?: existing?.name
                ?: "$iata International Airport",
            city = dtoAirport?.municipalityName?.takeIf { it.isNotBlank() }
                ?: existing?.city
                ?: iata,
            country = dtoAirport?.countryCode?.takeIf { it.isNotBlank() }
                ?: existing?.country
                ?: "International",
            timezone = dtoAirport?.timeZone?.takeIf { it.isNotBlank() }
                ?: existing?.timezone
                ?: "UTC",
            latitude = lat,
            longitude = lon,
            weather = existing?.weather ?: AirportWeather(
                tempC = 20,
                tempF = 68,
                condition = "Clear Sky",
                wind = "10 kt W",
                visibility = "10+ mi",
                humidity = 55
            )
        )
    }

    private fun buildTelemetry(
        origin: Airport,
        destination: Airport,
        status: FlightStatus,
        location: AeroLocationDto?,
        greatCircle: AeroDistanceDto?,
        depScheduledIso: String?,
        arrScheduledIso: String?
    ): FlightTelemetry {
        val totalDistanceNm = greatCircle?.nm?.toInt()?.takeIf { it > 0 }
            ?: computeGreatCircleNm(origin.latitude, origin.longitude, destination.latitude, destination.longitude)

        val progress = when (status) {
            FlightStatus.LANDED -> 1.0f
            FlightStatus.DEPARTED -> estimateAirborneProgress(depScheduledIso, arrScheduledIso)
            else -> 0.0f
        }

        val currentLat = location?.lat
            ?: (origin.latitude + (destination.latitude - origin.latitude) * progress)
        val currentLon = location?.lon
            ?: (origin.longitude + (destination.longitude - origin.longitude) * progress)

        val altitudeFeet = location?.pressureAltitude?.feet?.toInt()
            ?: location?.altitude?.feet?.toInt()
            ?: if (status == FlightStatus.DEPARTED) 36000 else 0

        val groundSpeedKnots = location?.groundSpeed?.kt?.toInt()
            ?: if (status == FlightStatus.DEPARTED) 495 else 0

        val headingDegrees = location?.trueTrack?.deg?.toFloat()
            ?: computeBearing(currentLat, currentLon, destination.latitude, destination.longitude)

        val distCovered = (totalDistanceNm * progress).toInt().coerceIn(0, totalDistanceNm)
        val distRemaining = maxOf(0, totalDistanceNm - distCovered)
        val etaMins = if (status == FlightStatus.DEPARTED && groundSpeedKnots > 100) {
            maxOf(5, ((distRemaining.toDouble() / groundSpeedKnots) * 60).toInt())
        } else if (status == FlightStatus.LANDED) {
            0
        } else {
            maxOf(30, ((totalDistanceNm.toDouble() / 480.0) * 60).toInt())
        }

        val midLat = (origin.latitude + destination.latitude) / 2.0
        val midLon = (origin.longitude + destination.longitude) / 2.0

        return FlightTelemetry(
            currentLatitude = currentLat,
            currentLongitude = currentLon,
            altitudeFeet = altitudeFeet,
            groundSpeedKnots = groundSpeedKnots,
            headingDegrees = headingDegrees,
            verticalSpeedFpm = if (status == FlightStatus.DEPARTED) 0 else 0,
            mach = if (status == FlightStatus.DEPARTED) 0.84 else 0.0,
            progressPercent = progress,
            distanceCoveredNm = distCovered,
            distanceRemainingNm = distRemaining,
            etaMinutesRemaining = etaMins,
            waypoints = listOf(
                Waypoint(origin.code, origin.latitude, origin.longitude, 0),
                Waypoint("CRUISE", midLat, midLon, 36000),
                Waypoint(destination.code, destination.latitude, destination.longitude, 0)
            )
        )
    }

    private fun estimateAirborneProgress(depIso: String?, arrIso: String?): Float {
        val depHHmm = extractTimeHHmm(depIso) ?: return 0.52f
        val arrHHmm = extractTimeHHmm(arrIso) ?: return 0.52f
        return try {
            val nowFormat = SimpleDateFormat("HH:mm", Locale.US)
            val nowParts = nowFormat.format(Date()).split(":")
            val nowMins = nowParts[0].toInt() * 60 + nowParts[1].toInt()

            val dParts = depHHmm.split(":")
            val aParts = arrHHmm.split(":")
            val dMins = dParts[0].toInt() * 60 + dParts[1].toInt()
            var aMins = aParts[0].toInt() * 60 + aParts[1].toInt()
            if (aMins <= dMins) aMins += 1440

            var adjNow = nowMins
            if (adjNow < dMins) adjNow += 1440

            val duration = maxOf(30, aMins - dMins)
            ((adjNow - dMins).toFloat() / duration.toFloat()).coerceIn(0.12f, 0.94f)
        } catch (_: Exception) {
            0.52f
        }
    }

    private fun computeGreatCircleNm(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Int {
        val rNm = 3440.065
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = sin(dLat / 2).pow(2.0) +
            cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLon / 2).pow(2.0)
        val c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return maxOf(120, (rNm * c).toInt())
    }

    private fun computeBearing(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Float {
        val phi1 = Math.toRadians(lat1)
        val phi2 = Math.toRadians(lat2)
        val dLon = Math.toRadians(lon2 - lon1)
        val y = sin(dLon) * cos(phi2)
        val x = cos(phi1) * sin(phi2) - sin(phi1) * cos(phi2) * cos(dLon)
        val brng = Math.toDegrees(atan2(y, x))
        return ((brng + 360.0) % 360.0).toFloat()
    }

    private fun buildStatusNote(
        status: FlightStatus,
        delayMinutes: Int,
        gateDep: String,
        carousel: String
    ): String {
        return when (status) {
            FlightStatus.BOARDING -> "Boarding in progress at $gateDep"
            FlightStatus.DEPARTED -> "En route · Live AeroDataBox telemetry"
            FlightStatus.DELAYED -> "Delayed +${maxOf(delayMinutes, 15)}m · Revised schedule"
            FlightStatus.LANDED -> "Arrived · Baggage at $carousel"
            FlightStatus.CANCELLED -> "Flight cancelled by operator"
            FlightStatus.SCHEDULED -> "On schedule · Departing $gateDep"
        }
    }

    private fun buildTimeline(
        origin: Airport,
        destination: Airport,
        depScheduled: String,
        depEstimated: String,
        arrEstimated: String,
        gateDep: String,
        carousel: String,
        status: FlightStatus
    ): List<FlightTimelineEvent> {
        val isBoardingOrLater = status in setOf(FlightStatus.BOARDING, FlightStatus.DEPARTED, FlightStatus.LANDED)
        val isDepartedOrLater = status in setOf(FlightStatus.DEPARTED, FlightStatus.LANDED)
        val isLanded = status == FlightStatus.LANDED

        return listOf(
            FlightTimelineEvent(
                title = "Check-In & Bag Drop (${origin.code})",
                time = depScheduled,
                isCompleted = isBoardingOrLater,
                isCurrent = status == FlightStatus.SCHEDULED || status == FlightStatus.DELAYED,
                description = "Terminal departure check-in open"
            ),
            FlightTimelineEvent(
                title = "Boarding at $gateDep",
                time = depEstimated,
                isCompleted = isDepartedOrLater,
                isCurrent = status == FlightStatus.BOARDING,
                description = "Gate $gateDep · Priority & main cabin"
            ),
            FlightTimelineEvent(
                title = "Takeoff & En Route",
                time = depEstimated,
                isCompleted = isLanded,
                isCurrent = status == FlightStatus.DEPARTED,
                description = "${origin.code} ➔ ${destination.code} active airway"
            ),
            FlightTimelineEvent(
                title = "Touchdown & Baggage (${destination.code})",
                time = arrEstimated,
                isCompleted = isLanded,
                isCurrent = isLanded,
                description = "Arrival at ${destination.name} · $carousel"
            )
        )
    }

    private fun inferAirlineName(flightNumber: String): String {
        val prefix = flightNumber.take(2).uppercase(Locale.ROOT)
        return when (prefix) {
            "AA" -> "American Airlines"
            "BA" -> "British Airways"
            "DL" -> "Delta Air Lines"
            "UA" -> "United Airlines"
            "AF" -> "Air France"
            "LH" -> "Lufthansa"
            "EK" -> "Emirates"
            "SQ" -> "Singapore Airlines"
            "NH" -> "All Nippon Airways"
            "JL" -> "Japan Airlines"
            "QF" -> "Qantas"
            "KL" -> "KLM Royal Dutch Airlines"
            "QR" -> "Qatar Airways"
            "AC" -> "Air Canada"
            "B6" -> "JetBlue Airways"
            "AS" -> "Alaska Airlines"
            else -> "$prefix Aviation"
        }
    }

    private fun inferRegion(countryCode: String, lon: Double): String {
        return when {
            countryCode in setOf("US", "CA", "MX", "BR", "AR", "CL", "CO") || lon < -30.0 -> "Americas"
            countryCode in setOf("AE", "QA", "SA", "IL", "TR", "OM", "KW") -> "Middle East"
            lon > 65.0 -> "Asia-Pacific"
            else -> "Europe"
        }
    }
}

/**
 * Diffs previous vs. updated [Flight] state snapshots for tracked flights and emits
 * real-time [FlightAlert] records only when a genuine operational change occurred.
 */
object FlightStateDiffer {

    fun diffFlights(previous: Flight, updated: Flight): List<FlightAlert> {
        val alerts = mutableListOf<FlightAlert>()
        val timeLabel = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date())

        // 1. Check Gate Change
        if (updated.gateDeparture.isNotBlank() &&
            !updated.gateDeparture.contains("TBD", ignoreCase = true) &&
            !previous.gateDeparture.equals(updated.gateDeparture, ignoreCase = true)
        ) {
            alerts.add(
                FlightAlert(
                    id = UUID.randomUUID().toString(),
                    flightNumber = updated.flightNumber,
                    type = AlertType.GATE_CHANGE,
                    title = "Gate Reassigned: ${updated.flightNumber}",
                    message = "${updated.airline} ${updated.flightNumber} departure gate changed from ${previous.gateDeparture} to ${updated.gateDeparture} (Terminal ${updated.terminalDeparture}).",
                    timestamp = timeLabel,
                    isRead = false
                )
            )
        }

        // 2. Check Delay Increase (>= 15m difference)
        if (updated.delayMinutes - previous.delayMinutes >= 15) {
            alerts.add(
                FlightAlert(
                    id = UUID.randomUUID().toString(),
                    flightNumber = updated.flightNumber,
                    type = AlertType.DELAY,
                    title = "Schedule Delay: ${updated.flightNumber} (+${updated.delayMinutes}m)",
                    message = "Flight ${updated.flightNumber} (${updated.origin.code} ➔ ${updated.destination.code}) is now delayed by ${updated.delayMinutes} minutes. Revised departure: ${updated.departureTimeEstimated}.",
                    timestamp = timeLabel,
                    isRead = false
                )
            )
        }

        // 3. Check Operational Status Transition
        if (previous.status != updated.status) {
            when (updated.status) {
                FlightStatus.BOARDING -> {
                    alerts.add(
                        FlightAlert(
                            id = UUID.randomUUID().toString(),
                            flightNumber = updated.flightNumber,
                            type = AlertType.BOARDING,
                            title = "Boarding Commenced: ${updated.flightNumber}",
                            message = "${updated.airline} ${updated.flightNumber} is now boarding at ${updated.gateDeparture}.",
                            timestamp = timeLabel,
                            isRead = false
                        )
                    )
                }
                FlightStatus.CANCELLED -> {
                    alerts.add(
                        FlightAlert(
                            id = UUID.randomUUID().toString(),
                            flightNumber = updated.flightNumber,
                            type = AlertType.CANCELLATION,
                            title = "Flight Cancelled: ${updated.flightNumber}",
                            message = "${updated.airline} ${updated.flightNumber} (${updated.origin.code} ➔ ${updated.destination.code}) has been cancelled.",
                            timestamp = timeLabel,
                            isRead = false
                        )
                    )
                }
                FlightStatus.LANDED -> {
                    alerts.add(
                        FlightAlert(
                            id = UUID.randomUUID().toString(),
                            flightNumber = updated.flightNumber,
                            type = AlertType.BAGGAGE,
                            title = "Touchdown at ${updated.destination.code}: ${updated.flightNumber}",
                            message = "${updated.flightNumber} has landed at ${updated.destination.city}. Baggage claim assigned to ${updated.baggageCarousel}.",
                            timestamp = timeLabel,
                            isRead = false
                        )
                    )
                }
                else -> {}
            }
        }

        return alerts
    }
}
