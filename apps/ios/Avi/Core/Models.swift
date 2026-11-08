import Foundation

// MARK: - Flight Status & Alert Types

public enum FlightStatus: String, Codable, CaseIterable, Sendable {
    case scheduled = "SCHEDULED"
    case boarding = "BOARDING"
    case departed = "DEPARTED"
    case delayed = "DELAYED"
    case landed = "LANDED"
    case cancelled = "CANCELLED"

    public var displayName: String {
        switch self {
        case .scheduled: return "Scheduled"
        case .boarding: return "Boarding"
        case .departed: return "En Route"
        case .delayed: return "Delayed"
        case .landed: return "Landed"
        case .cancelled: return "Cancelled"
        }
    }
}

public enum AlertType: String, Codable, CaseIterable, Sendable {
    case gateChange = "GATE_CHANGE"
    case delay = "DELAY"
    case boarding = "BOARDING"
    case cancellation = "CANCELLATION"
    case baggage = "BAGGAGE"

    public var displayName: String {
        switch self {
        case .gateChange: return "Gate Change"
        case .delay: return "Delay"
        case .boarding: return "Boarding"
        case .cancellation: return "Cancellation"
        case .baggage: return "Baggage"
        }
    }
}

// MARK: - Core Domain Models

public struct AirportWeather: Codable, Sendable, Equatable {
    public let tempC: Int
    public let tempF: Int
    public let condition: String
    public let wind: String
    public let visibility: String
    public let humidity: Int

    public init(
        tempC: Int = 20,
        tempF: Int = 68,
        condition: String = "Clear Sky",
        wind: String = "10 kt",
        visibility: String = "10+ mi",
        humidity: Int = 50
    ) {
        self.tempC = tempC
        self.tempF = tempF
        self.condition = condition
        self.wind = wind
        self.visibility = visibility
        self.humidity = humidity
    }
}

public struct Airport: Codable, Identifiable, Sendable, Equatable {
    public var id: String { code }
    public let code: String
    public let name: String
    public let city: String
    public let country: String
    public let timezone: String
    public let latitude: Double
    public let longitude: Double
    public let weather: AirportWeather?

    public init(
        code: String,
        name: String,
        city: String,
        country: String,
        timezone: String = "UTC",
        latitude: Double = 0.0,
        longitude: Double = 0.0,
        weather: AirportWeather? = nil
    ) {
        self.code = code
        self.name = name
        self.city = city
        self.country = country
        self.timezone = timezone
        self.latitude = latitude
        self.longitude = longitude
        self.weather = weather
    }
}

public struct AircraftInfo: Codable, Sendable, Equatable {
    public let model: String
    public let registration: String
    public let age: String?
    public let wifiAvailable: Bool?
    public let powerOutlets: Bool?

    public init(
        model: String = "Not reported",
        registration: String = "Not reported",
        age: String? = nil,
        wifiAvailable: Bool? = nil,
        powerOutlets: Bool? = nil
    ) {
        self.model = model
        self.registration = registration
        self.age = age
        self.wifiAvailable = wifiAvailable
        self.powerOutlets = powerOutlets
    }
}

public struct FlightTelemetry: Codable, Sendable, Equatable {
    public let currentLatitude: Double
    public let currentLongitude: Double
    public let altitudeFeet: Int
    public let groundSpeedKnots: Int
    public let headingDegrees: Double
    public let progressPercent: Double
    public let distanceCoveredNm: Int?
    public let distanceRemainingNm: Int?

    public init(
        currentLatitude: Double = 0.0,
        currentLongitude: Double = 0.0,
        altitudeFeet: Int = 0,
        groundSpeedKnots: Int = 0,
        headingDegrees: Double = 0.0,
        progressPercent: Double = 0.0,
        distanceCoveredNm: Int? = nil,
        distanceRemainingNm: Int? = nil
    ) {
        self.currentLatitude = currentLatitude
        self.currentLongitude = currentLongitude
        self.altitudeFeet = altitudeFeet
        self.groundSpeedKnots = groundSpeedKnots
        self.headingDegrees = headingDegrees
        self.progressPercent = progressPercent
        self.distanceCoveredNm = distanceCoveredNm
        self.distanceRemainingNm = distanceRemainingNm
    }
}

public struct FlightAlert: Codable, Identifiable, Sendable, Equatable {
    public let id: String
    public let flightNumber: String
    public let type: AlertType
    public let title: String
    public let message: String
    public let timestamp: String
    public let isRead: Bool

    public init(
        id: String = UUID().uuidString,
        flightNumber: String,
        type: AlertType,
        title: String,
        message: String,
        timestamp: String,
        isRead: Bool = false
    ) {
        self.id = id
        self.flightNumber = flightNumber
        self.type = type
        self.title = title
        self.message = message
        self.timestamp = timestamp
        self.isRead = isRead
    }
}

public struct Flight: Codable, Identifiable, Sendable, Equatable {
    public let id: String
    public let flightDate: String?
    public let flightNumber: String
    public let airline: String
    public let airlineCode: String
    public let origin: Airport
    public let destination: Airport
    public let departureTimeScheduled: String
    public let departureTimeEstimated: String
    public let departureTimeActual: String?
    public let arrivalTimeScheduled: String
    public let arrivalTimeEstimated: String
    public let arrivalTimeActual: String?
    public let status: FlightStatus
    public let statusNote: String
    public let delayMinutes: Int
    public let delayReason: String?
    public let terminalDeparture: String
    public let gateDeparture: String
    public let checkInCounter: String
    public let terminalArrival: String
    public let gateArrival: String
    public let baggageCarousel: String
    public let aircraft: AircraftInfo
    public let telemetry: FlightTelemetry
    public var isWatchlisted: Bool

    public init(
        id: String,
        flightDate: String? = nil,
        flightNumber: String,
        airline: String,
        airlineCode: String,
        origin: Airport,
        destination: Airport,
        departureTimeScheduled: String,
        departureTimeEstimated: String,
        departureTimeActual: String? = nil,
        arrivalTimeScheduled: String,
        arrivalTimeEstimated: String,
        arrivalTimeActual: String? = nil,
        status: FlightStatus,
        statusNote: String = "",
        delayMinutes: Int = 0,
        delayReason: String? = nil,
        terminalDeparture: String = "",
        gateDeparture: String = "",
        checkInCounter: String = "",
        terminalArrival: String = "",
        gateArrival: String = "",
        baggageCarousel: String = "",
        aircraft: AircraftInfo = AircraftInfo(),
        telemetry: FlightTelemetry = FlightTelemetry(),
        isWatchlisted: Bool = false
    ) {
        self.id = id
        self.flightDate = flightDate
        self.flightNumber = flightNumber
        self.airline = airline
        self.airlineCode = airlineCode
        self.origin = origin
        self.destination = destination
        self.departureTimeScheduled = departureTimeScheduled
        self.departureTimeEstimated = departureTimeEstimated
        self.departureTimeActual = departureTimeActual
        self.arrivalTimeScheduled = arrivalTimeScheduled
        self.arrivalTimeEstimated = arrivalTimeEstimated
        self.arrivalTimeActual = arrivalTimeActual
        self.status = status
        self.statusNote = statusNote
        self.delayMinutes = delayMinutes
        self.delayReason = delayReason
        self.terminalDeparture = terminalDeparture
        self.gateDeparture = gateDeparture
        self.checkInCounter = checkInCounter
        self.terminalArrival = terminalArrival
        self.gateArrival = gateArrival
        self.baggageCarousel = baggageCarousel
        self.aircraft = aircraft
        self.telemetry = telemetry
        self.isWatchlisted = isWatchlisted
    }

    enum CodingKeys: String, CodingKey {
        case id, flightDate, flightNumber, airline, airlineCode, origin, destination
        case departureTimeScheduled, departureTimeEstimated, departureTimeActual
        case arrivalTimeScheduled, arrivalTimeEstimated, arrivalTimeActual
        case status, statusNote, delayMinutes, delayReason
        case terminalDeparture, gateDeparture, checkInCounter, terminalArrival, gateArrival, baggageCarousel
        case aircraft, telemetry, isWatchlisted
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        flightDate = try container.decodeIfPresent(String.self, forKey: .flightDate)
        flightNumber = try container.decode(String.self, forKey: .flightNumber)
        airline = try container.decode(String.self, forKey: .airline)
        airlineCode = try container.decode(String.self, forKey: .airlineCode)
        origin = try container.decode(Airport.self, forKey: .origin)
        destination = try container.decode(Airport.self, forKey: .destination)
        departureTimeScheduled = try container.decode(String.self, forKey: .departureTimeScheduled)
        departureTimeEstimated = try container.decode(String.self, forKey: .departureTimeEstimated)
        departureTimeActual = try container.decodeIfPresent(String.self, forKey: .departureTimeActual)
        arrivalTimeScheduled = try container.decode(String.self, forKey: .arrivalTimeScheduled)
        arrivalTimeEstimated = try container.decode(String.self, forKey: .arrivalTimeEstimated)
        arrivalTimeActual = try container.decodeIfPresent(String.self, forKey: .arrivalTimeActual)
        status = (try? container.decode(FlightStatus.self, forKey: .status)) ?? .scheduled
        statusNote = (try? container.decodeIfPresent(String.self, forKey: .statusNote)) ?? ""
        delayMinutes = (try? container.decodeIfPresent(Int.self, forKey: .delayMinutes)) ?? 0
        delayReason = try? container.decodeIfPresent(String.self, forKey: .delayReason)
        terminalDeparture = (try? container.decodeIfPresent(String.self, forKey: .terminalDeparture)) ?? ""
        gateDeparture = (try? container.decodeIfPresent(String.self, forKey: .gateDeparture)) ?? ""
        checkInCounter = (try? container.decodeIfPresent(String.self, forKey: .checkInCounter)) ?? ""
        terminalArrival = (try? container.decodeIfPresent(String.self, forKey: .terminalArrival)) ?? ""
        gateArrival = (try? container.decodeIfPresent(String.self, forKey: .gateArrival)) ?? ""
        baggageCarousel = (try? container.decodeIfPresent(String.self, forKey: .baggageCarousel)) ?? ""
        aircraft = (try? container.decodeIfPresent(AircraftInfo.self, forKey: .aircraft)) ?? AircraftInfo()
        telemetry = (try? container.decodeIfPresent(FlightTelemetry.self, forKey: .telemetry)) ?? FlightTelemetry()
        isWatchlisted = (try? container.decodeIfPresent(Bool.self, forKey: .isWatchlisted)) ?? false
    }
}

// MARK: - Gateway Responses

public struct GatewayLookupResponse: Codable, Sendable {
    public let mode: String?
    public let flights: [Flight]

    public init(mode: String? = nil, flights: [Flight] = []) {
        self.mode = mode
        self.flights = flights
    }
}

public struct GatewayFidsResponse: Codable, Sendable {
    public let mode: String?
    public let flights: [Flight]

    public init(mode: String? = nil, flights: [Flight] = []) {
        self.mode = mode
        self.flights = flights
    }
}
