package com.example

import com.example.data.MockFlightData
import com.example.model.FlightStatus
import com.example.util.FlightShareHelper
import org.junit.Assert.*
import org.junit.Test

class ExampleUnitTest {
  @Test
  fun addition_isCorrect() {
    assertEquals(4, 2 + 2)
  }

  @Test
  fun mockFlightsContainActiveAirborneFlights() {
    val flights = MockFlightData.initialFlights
    assertTrue("Should have flights in dataset", flights.isNotEmpty())
    val enRoute = flights.filter { it.status == FlightStatus.DEPARTED }
    assertTrue("Should have active en route flights", enRoute.isNotEmpty())
  }

  @Test
  fun mockAirportsAvailable() {
    val jfk = MockFlightData.getAirport("JFK")
    assertEquals("JFK", jfk.code)
    assertEquals("New York", jfk.city)
    assertNotNull(jfk.weather)
  }

  @Test
  fun flightShareSummaryGeneratesCorrectText() {
    val flight = MockFlightData.initialFlights.first { it.flightNumber == "AA 100" }
    val summary = FlightShareHelper.generateFlightSummary(flight, "Meeting you at arrivals")

    assertTrue(summary.contains("AA 100"))
    assertTrue(summary.contains("American Airlines"))
    assertTrue(summary.contains("JFK"))
    assertTrue(summary.contains("LHR"))
    assertTrue(summary.contains("Meeting you at arrivals"))
    assertTrue(summary.contains("SkyTrack"))
  }

  @Test
  fun recentSearchEntityStoresSearchMetadata() {
    val search = com.example.data.local.RecentSearchEntity(
      flightNumber = "DL 415",
      airline = "Delta Air Lines",
      originCode = "ATL",
      originCity = "Atlanta",
      destCode = "LAX",
      destCity = "Los Angeles",
      status = "DEPARTED",
      searchTimestamp = 1700000000000L
    )
    assertEquals("DL 415", search.flightNumber)
    assertEquals("ATL", search.originCode)
    assertEquals("LAX", search.destCode)
    assertEquals("DEPARTED", search.status)
  }

  @Test
  fun themeModeValuesProvideExpectedOptions() {
    val modes = com.example.data.preferences.ThemeMode.values()
    assertEquals(3, modes.size)
    assertTrue(modes.contains(com.example.data.preferences.ThemeMode.SYSTEM))
    assertTrue(modes.contains(com.example.data.preferences.ThemeMode.LIGHT))
    assertTrue(modes.contains(com.example.data.preferences.ThemeMode.DARK))
  }

  @Test
  fun themeModeResolvesSystemDefaultOnInvalidValue() {
    val raw = "UNKNOWN_MODE"
    val resolved = try {
      com.example.data.preferences.ThemeMode.valueOf(raw)
    } catch (_: Exception) {
      com.example.data.preferences.ThemeMode.SYSTEM
    }
    assertEquals(com.example.data.preferences.ThemeMode.SYSTEM, resolved)
  }

  @Test
  fun fcmTopicNamingConventionFormatsCorrectly() {
    val flightNumbers = listOf("AA 100", "BA 178", "DL 415", "AF006", "LH 400")
    val topics = flightNumbers.map { "flight_" + it.replace(" ", "").lowercase(java.util.Locale.ROOT) }
    assertEquals("flight_aa100", topics[0])
    assertEquals("flight_ba178", topics[1])
    assertEquals("flight_dl415", topics[2])
    assertEquals("flight_af006", topics[3])
    assertEquals("flight_lh400", topics[4])
  }

  @Test
  fun flightAlertModelContainsStatusPayloadFields() {
    val alert = com.example.model.FlightAlert(
      id = "alert_test_123",
      flightNumber = "AA 100",
      type = com.example.model.AlertType.GATE_CHANGE,
      title = "Gate Change: AA 100",
      message = "Now departing from Gate B18 (Terminal 8)",
      timestamp = "Just now",
      isRead = false
    )
    assertEquals("AA 100", alert.flightNumber)
    assertEquals(com.example.model.AlertType.GATE_CHANGE, alert.type)
    assertFalse(alert.isRead)
    assertTrue(alert.message.contains("Gate B18"))
  }

  @Test
  fun workManagerSyncConstantsAreCorrectlyConfigured() {
    assertEquals("FlightSyncWorker", com.example.sync.FlightSyncWorker.TAG)
    assertEquals("skytrack_connectivity_sync", com.example.sync.FlightSyncWorker.WORK_NAME_CONNECTIVITY_SYNC)
    assertEquals("skytrack_periodic_sync", com.example.sync.FlightSyncWorker.WORK_NAME_PERIODIC_SYNC)
    assertEquals("skytrack_immediate_sync", com.example.sync.FlightSyncWorker.WORK_NAME_IMMEDIATE_SYNC)
    assertEquals("flights_synced", com.example.sync.FlightSyncWorker.OUTPUT_KEY_FLIGHTS_SYNCED)
  }

  @Test
  fun cachedFlightEntityConstructsWithCorrectAttributes() {
    val now = System.currentTimeMillis()
    val entity = com.example.data.local.CachedFlightEntity(
      id = "AA100",
      flightNumber = "AA 100",
      airline = "American Airlines",
      airlineCode = "AA",
      originCode = "JFK",
      originCity = "New York",
      originName = "John F. Kennedy",
      destCode = "LHR",
      destCity = "London",
      destName = "Heathrow",
      departureTimeScheduled = "18:30",
      departureTimeEstimated = "18:45",
      arrivalTimeScheduled = "06:20",
      arrivalTimeEstimated = "06:15",
      status = "DEPARTED",
      statusNote = "En route",
      delayMinutes = 15,
      delayReason = "Air Traffic Control",
      terminalDeparture = "8",
      gateDeparture = "B12",
      checkInCounter = "Row 4",
      terminalArrival = "3",
      gateArrival = "24",
      baggageCarousel = "6",
      aircraftModel = "Boeing 777-300ER",
      aircraftRegistration = "N718AN",
      altitudeFeet = 36000,
      groundSpeedKnots = 530,
      headingDegrees = 65f,
      progressPercent = 0.55f,
      isFavorite = true,
      customNotes = "Window seat 12A",
      cachedTimestamp = now
    )

    assertEquals("AA100", entity.id)
    assertEquals("AA 100", entity.flightNumber)
    assertEquals("DEPARTED", entity.status)
    assertEquals(15, entity.delayMinutes)
    assertEquals("B12", entity.gateDeparture)
    assertEquals(now, entity.cachedTimestamp)
    assertTrue(entity.isFavorite)
    assertEquals("Window seat 12A", entity.customNotes)
  }

  @Test
  fun destinationArrivalWeatherForecastContainsPlanningData() {
    val airport = MockFlightData.getAirport("LHR")
    val forecast = com.example.model.DestinationArrivalForecast(
      airportCode = airport.code,
      airportName = airport.name,
      airportCity = airport.city,
      arrivalTime = "06:15",
      arrivalTempC = 14,
      arrivalTempF = 57,
      arrivalCondition = "Light Drizzle",
      precipitationChance = 75,
      windCondition = "16 kt WSW",
      visibility = "8 mi",
      humidity = 78,
      hourlyForecast = listOf(
        com.example.model.HourlyForecast(
          time = "06:15 (ETA)",
          tempC = 14,
          tempF = 57,
          condition = "Light Drizzle",
          precipProbabilityPercent = 75,
          windSpeedKnots = 16,
          isArrivalTarget = true
        )
      ),
      dailyForecast = listOf(
        com.example.model.DailyForecast(
          dayName = "Arrival Day",
          dateString = "Today",
          tempHighC = 18,
          tempHighF = 64,
          tempLowC = 11,
          tempLowF = 52,
          condition = "Light Drizzle",
          precipProbabilityPercent = 75,
          packingTip = "Raincoat & compact umbrella recommended"
        )
      ),
      advisory = com.example.model.ArrivalAviationAdvisory(
        flightCategory = "MVFR (Marginal VFR)",
        crosswindKnots = 14,
        crosswindRisk = "Standard Approach Winds",
        runwayVisualRange = "6,000+ ft (RVR Clear)",
        arrivalNotice = "Normal arrival into LHR"
      ),
      packingAdvice = "Rain expected at arrival (75% chance). Keep an umbrella handy."
    )

    assertEquals("LHR", forecast.airportCode)
    assertEquals("London", forecast.airportCity)
    assertEquals("06:15", forecast.arrivalTime)
    assertEquals(14, forecast.arrivalTempC)
    assertEquals(75, forecast.precipitationChance)
    assertTrue(forecast.hourlyForecast.first().isArrivalTarget)
    assertTrue(forecast.packingAdvice.contains("umbrella"))
  }

  @Test
  fun destinationWeatherEntityStoresArrivalMetrics() {
    val entity = com.example.data.local.DestinationWeatherEntity(
      airportCode = "SFO",
      airportCity = "San Francisco",
      airportName = "San Francisco International",
      arrivalTime = "13:45",
      tempC = 17,
      tempF = 63,
      condition = "Coastal Fog / Mild",
      precipChance = 20,
      windCondition = "14 kt W",
      visibility = "7 mi",
      humidity = 69,
      flightCategory = "MVFR",
      crosswindRisk = "Moderate Crosswind Caution",
      packingAdvice = "Light jacket recommended",
      hourlyJson = "13:45|17|63|Fog|20|14|true",
      dailyJson = "Today|Nov 4|20|68|12|54|Fog|20|Jacket",
      cachedTimestamp = 1700000000000L
    )

    assertEquals("SFO", entity.airportCode)
    assertEquals(17, entity.tempC)
    assertEquals("Coastal Fog / Mild", entity.condition)
    assertEquals("MVFR", entity.flightCategory)
    assertEquals(1700000000000L, entity.cachedTimestamp)
  }
}

