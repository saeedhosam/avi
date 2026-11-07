package com.example

import com.example.data.cloud.toFlight
import com.example.data.supabase.CloudFlightSnapshot
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Test

class CloudSnapshotDecodeTest {

    private val json = Json {
        ignoreUnknownKeys = true
    }

    @Test
    fun `decodes a web snapshot with unknown fields and keeps the operating date`() {
        val payload = """
            {
              "id": "BA117",
              "flightNumber": "BA 117",
              "flightDate": "2026-11-08",
              "airline": "British Airways",
              "origin": {
                "code": "JFK", "name": "JFK", "city": "New York",
                "country": "US", "timezone": "America/New_York",
                "latitude": 40.64, "longitude": -73.78
              },
              "destination": {
                "code": "LHR", "name": "Heathrow", "city": "London",
                "country": "GB", "timezone": "Europe/London",
                "latitude": 51.47, "longitude": -0.45
              },
              "status": "DEPARTED",
              "telemetry": {
                "hasLiveLocation": true,
                "locationUpdatedAt": 1762500000000,
                "currentLatitude": 45.0,
                "currentLongitude": -40.0,
                "waypoints": []
              },
              "isWatchlisted": true,
              "timeline": []
            }
        """.trimIndent()

        val element = json.parseToJsonElement(payload).jsonObject
        val snapshot = json.decodeFromJsonElement<CloudFlightSnapshot>(element)

        assertEquals("2026-11-08", snapshot.flightDate)
        assertEquals("2026-11-08", snapshot.toFlight().flightDate)
        assertEquals("BA 117", snapshot.toFlight().flightNumber)
    }
}
