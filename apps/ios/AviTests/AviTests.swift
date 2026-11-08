import XCTest
@testable import Avi

final class AviTests: XCTestCase {

    func testFlightDecodingWithMissingOptionalFields() throws {
        let json = """
        {
            "id": "BA1",
            "flightNumber": "BA 1",
            "airline": "British Airways",
            "airlineCode": "BA",
            "origin": {
                "code": "LCY",
                "name": "London City",
                "city": "London",
                "country": "UK",
                "timezone": "Europe/London",
                "latitude": 51.505,
                "longitude": 0.055
            },
            "destination": {
                "code": "JFK",
                "name": "John F. Kennedy",
                "city": "New York",
                "country": "USA",
                "timezone": "America/New_York",
                "latitude": 40.641,
                "longitude": -73.778
            },
            "departureTimeScheduled": "09:45",
            "departureTimeEstimated": "09:50",
            "arrivalTimeScheduled": "14:15",
            "arrivalTimeEstimated": "14:10",
            "status": "DEPARTED"
        }
        """.data(using: .utf8)!

        let flight = try JSONDecoder().decode(Flight.self, data: json)
        XCTAssertEqual(flight.id, "BA1")
        XCTAssertEqual(flight.flightNumber, "BA 1")
        XCTAssertEqual(flight.status, .departed)
        XCTAssertEqual(flight.delayMinutes, 0)
        XCTAssertEqual(flight.isWatchlisted, false)
        XCTAssertEqual(flight.origin.code, "LCY")
        XCTAssertEqual(flight.destination.code, "JFK")
    }

    func testFlightStatusDisplayNames() {
        XCTAssertEqual(FlightStatus.scheduled.displayName, "Scheduled")
        XCTAssertEqual(FlightStatus.boarding.displayName, "Boarding")
        XCTAssertEqual(FlightStatus.departed.displayName, "En Route")
        XCTAssertEqual(FlightStatus.delayed.displayName, "Delayed")
        XCTAssertEqual(FlightStatus.landed.displayName, "Landed")
        XCTAssertEqual(FlightStatus.cancelled.displayName, "Cancelled")
    }

    func testRouteDistanceCalculation() {
        let route = RouteConnection(
            id: "LHR-JFK",
            originCode: "LHR",
            originCity: "London",
            destinationCode: "JFK",
            destinationCity: "New York",
            distanceKm: 5555,
            dailyFlights: 24,
            operators: ["BA", "AA", "VS"]
        )

        XCTAssertEqual(route.distanceKm, 5555)
        XCTAssertEqual(route.distanceNm, 2999)
        XCTAssertEqual(route.operators.count, 3)
    }

    func testWatchlistPersistenceRoundtrip() throws {
        let sampleFlight = Flight(
            id = "DL404",
            flightNumber = "DL 404",
            airline = "Delta Air Lines",
            airlineCode = "DL",
            origin = Airport(code: "ATL", name: "Hartsfield-Jackson", city: "Atlanta", country: "USA"),
            destination = Airport(code: "LAX", name: "Los Angeles", city: "Los Angeles", country: "USA"),
            departureTimeScheduled = "08:00",
            departureTimeEstimated = "08:00",
            arrivalTimeScheduled = "10:15",
            arrivalTimeEstimated = "10:15",
            status = .scheduled,
            isWatchlisted = true
        )

        let encoded = try JSONEncoder().encode([sampleFlight])
        let decoded = try JSONDecoder().decode([Flight].self, from: encoded)

        XCTAssertEqual(decoded.count, 1)
        XCTAssertEqual(decoded[0].id, "DL404")
        XCTAssertEqual(decoded[0].isWatchlisted, true)
    }
}
