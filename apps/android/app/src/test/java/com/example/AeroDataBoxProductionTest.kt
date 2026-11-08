package com.example

import com.example.data.FlightStateDiffer
import com.example.data.MockFlightData
import com.example.data.remote.ApiConfig
import com.example.data.remote.gateway.*
import com.example.data.remote.weather.*
import com.example.model.AlertType
import com.example.model.FlightCategory
import com.example.model.FlightStatus
import org.junit.Assert.*
import org.junit.Test

class AeroDataBoxProductionTest {

    @Test
    fun `mapConsoleFlightDto maps gateway response to domain Flight`() {
        val dto = ConsoleFlightDto(
            id = "AA100",
            flightDate = "2026-11-04",
            flightNumber = "AA 100",
            airline = "American Airlines",
            airlineCode = "AA",
            origin = ConsoleAirportDto(
                code = "JFK",
                name = "John F. Kennedy",
                city = "New York",
                country = "United States",
                timezone = "America/New_York",
                latitude = 40.6413,
                longitude = -73.7781
            ),
            destination = ConsoleAirportDto(
                code = "LHR",
                name = "London Heathrow",
                city = "London",
                country = "United Kingdom",
                timezone = "Europe/London",
                latitude = 51.4700,
                longitude = -0.4543
            ),
            departureTimeScheduled = "18:30",
            departureTimeEstimated = "19:05",
            arrivalTimeScheduled = "06:35",
            arrivalTimeEstimated = "07:10",
            status = "DELAYED",
            statusNote = "Delayed by 35m",
            delayMinutes = 35,
            terminalDeparture = "8",
            gateDeparture = "Gate B14",
            checkInCounter = "12-18",
            terminalArrival = "3",
            gateArrival = "22",
            baggageCarousel = "Carousel 7",
            aircraft = ConsoleAircraftDto(
                model = "Boeing 777-300ER",
                registration = "N732AN"
            )
        )

        val flight = dto.toDomainFlight()
        assertNotNull(flight)
        assertEquals("AA100", flight!!.id)
        assertEquals("AA 100", flight.flightNumber)
        assertEquals("American Airlines", flight.airline)
        assertEquals("JFK", flight.origin.code)
        assertEquals("LHR", flight.destination.code)
        assertEquals("18:30", flight.departureTimeScheduled)
        assertEquals("19:05", flight.departureTimeEstimated)
        assertEquals(35, flight.delayMinutes)
        assertEquals(FlightStatus.DELAYED, flight.status)
        assertEquals("Gate B14", flight.gateDeparture)
        assertEquals("Carousel 7", flight.baggageCarousel)
    }

    @Test
    fun `FlightStateDiffer emits alerts only on genuine gate delay or status changes`() {
        val baseFlight = MockFlightData.initialFlights.first().copy(
            flightNumber = "AA 100",
            status = FlightStatus.SCHEDULED,
            delayMinutes = 0,
            gateDeparture = "Gate B12"
        )

        // Identical flight snapshot -> 0 alerts
        val noAlerts = FlightStateDiffer.diffFlights(baseFlight, baseFlight)
        assertTrue(noAlerts.isEmpty())

        // Gate reassignment + 25m delay + Boarding status -> 3 alerts
        val updatedFlight = baseFlight.copy(
            gateDeparture = "Gate B28",
            delayMinutes = 25,
            status = FlightStatus.BOARDING
        )
        val alerts = FlightStateDiffer.diffFlights(baseFlight, updatedFlight)
        assertEquals(3, alerts.size)
        assertTrue(alerts.any { it.type == AlertType.GATE_CHANGE })
        assertTrue(alerts.any { it.type == AlertType.DELAY })
        assertTrue(alerts.any { it.type == AlertType.BOARDING })
    }

    @Test
    fun `OpenMeteoMapper derives VFR MVFR and IFR flight categories and forecast`() {
        assertEquals(FlightCategory.VFR, OpenMeteoMapper.determineFlightCategory(16000.0, 0))
        assertEquals(FlightCategory.MVFR, OpenMeteoMapper.determineFlightCategory(6000.0, 61))
        assertEquals(FlightCategory.IFR, OpenMeteoMapper.determineFlightCategory(2000.0, 45))

        val sampleDto = OpenMeteoResponseDto(
            current = OpenMeteoCurrentDto(
                temperature2m = 18.0,
                relativeHumidity2m = 64,
                weatherCode = 2,
                windSpeed10m = 14.0,
                windDirection10m = 270,
                surfacePressure = 1015.0,
                visibility = 16000.0
            ),
            hourly = OpenMeteoHourlyDto(
                time = listOf("2026-11-04T12:00", "2026-11-04T13:00", "2026-11-04T14:00", "2026-11-04T15:00", "2026-11-04T16:00", "2026-11-04T17:00", "2026-11-04T18:00"),
                temperature2m = listOf(17.0, 18.0, 19.0, 19.0, 18.0, 17.0, 16.0),
                precipitationProbability = listOf(10, 15, 20, 20, 15, 10, 10),
                weatherCode = listOf(1, 2, 2, 2, 1, 0, 0),
                windSpeed10m = listOf(12.0, 13.0, 14.0, 15.0, 14.0, 12.0, 11.0)
            ),
            daily = OpenMeteoDailyDto(
                time = listOf("2026-11-04", "2026-11-05", "2026-11-06"),
                weatherCode = listOf(2, 0, 61),
                temperature2mMax = listOf(20.0, 22.0, 17.0),
                temperature2mMin = listOf(12.0, 13.0, 11.0),
                precipitationProbabilityMax = listOf(20, 10, 65)
            )
        )

        val jfk = MockFlightData.getAirport("JFK")
        val forecast = OpenMeteoMapper.mapToDestinationForecast(jfk, "14:00", sampleDto)
        assertEquals("JFK", forecast.airportCode)
        assertEquals(18, forecast.arrivalTempC)
        assertEquals("Partly Cloudy", forecast.arrivalCondition)
        assertEquals(7, forecast.hourlyForecast.size)
        assertEquals(3, forecast.dailyForecast.size)
        assertTrue(forecast.advisory.flightCategory.startsWith("VFR"))
    }

    @Test
    fun `ApiConfig reports gateway readiness instead of on-device provider keys`() {
        assertTrue(ApiConfig.isGatewayConfigured)
        assertTrue(ApiConfig.hasValidAeroDataBoxKey(""))
        assertTrue(ApiConfig.hasValidAeroDataBoxKey("DEFAULT_AERODATABOX_KEY"))
    }
}
