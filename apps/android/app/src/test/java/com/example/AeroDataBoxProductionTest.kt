package com.example

import com.example.data.MockFlightData
import com.example.data.remote.ApiConfig
import com.example.data.remote.aerodatabox.*
import com.example.data.remote.weather.*
import com.example.model.AlertType
import com.example.model.FlightCategory
import com.example.model.FlightStatus
import org.junit.Assert.*
import org.junit.Test

class AeroDataBoxProductionTest {

    @Test
    fun `normalizeFlightNumber formats compact and spaced codes`() {
        assertEquals("AA 100", AeroDataBoxMapper.normalizeFlightNumber("AA100"))
        assertEquals("BA 178", AeroDataBoxMapper.normalizeFlightNumber("ba 178"))
        assertEquals("DL 404", AeroDataBoxMapper.normalizeFlightNumber("DL-404"))
    }

    @Test
    fun `computeDelayMinutes calculates schedule revision accurately`() {
        val scheduled = "2026-11-04 14:15-05:00"
        val revised = "2026-11-04 14:50-05:00"
        assertEquals(35, AeroDataBoxMapper.computeDelayMinutes(scheduled, revised))
        assertEquals(0, AeroDataBoxMapper.computeDelayMinutes(scheduled, scheduled))
    }

    @Test
    fun `mapDtoToFlight maps AeroDataBox payload to domain Flight`() {
        val dto = AeroFlightDto(
            number = "AA 100",
            status = "Delayed",
            airline = AeroAirlineDto(name = "American Airlines", iata = "AA"),
            aircraft = AeroAircraftDto(reg = "N732AN", model = "Boeing 777-300ER"),
            departure = AeroMovementDto(
                airport = AeroAirportDto(iata = "JFK", name = "John F. Kennedy", municipalityName = "New York"),
                scheduledTime = AeroTimeDto(local = "2026-11-04 18:30-05:00"),
                revisedTime = AeroTimeDto(local = "2026-11-04 19:05-05:00"),
                terminal = "8",
                gate = "B14",
                checkInDesk = "12-18"
            ),
            arrival = AeroMovementDto(
                airport = AeroAirportDto(iata = "LHR", name = "London Heathrow", municipalityName = "London"),
                scheduledTime = AeroTimeDto(local = "2026-11-05 06:35+00:00"),
                revisedTime = AeroTimeDto(local = "2026-11-05 07:10+00:00"),
                terminal = "3",
                gate = "22",
                baggageBelt = "7"
            )
        )

        val flight = AeroDataBoxMapper.mapDtoToFlight(dto)
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
    fun `ApiConfig rejects default placeholder keys and accepts real RapidAPI keys`() {
        assertFalse(ApiConfig.hasValidAeroDataBoxKey(""))
        assertFalse(ApiConfig.hasValidAeroDataBoxKey("DEFAULT_AERODATABOX_KEY"))
        assertFalse(ApiConfig.hasValidAeroDataBoxKey("YOUR_AERODATABOX_KEY"))
        assertTrue(ApiConfig.hasValidAeroDataBoxKey("a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"))
    }
}
