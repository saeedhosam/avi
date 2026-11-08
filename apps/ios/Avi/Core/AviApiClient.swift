import Foundation

public actor AviApiClient {
    public static let shared = AviApiClient()

    private let session: URLSession
    private let baseURL: URL

    public init(session: URLSession = .shared, baseURL: URL? = nil) {
        self.session = session
        self.baseURL = baseURL
            ?? AppConfig.apiBaseURL
            ?? URL(string: "https://api.codestep.org")!
    }

    public enum ApiError: Error, LocalizedError {
        case invalidURL
        case invalidResponse
        case httpError(statusCode: Int, message: String)
        case decodingError(Error)

        public var errorDescription: String? {
            switch self {
            case .invalidURL: return "Invalid request URL."
            case .invalidResponse: return "Received invalid response from server."
            case let .httpError(code, msg): return "HTTP \(code): \(msg)"
            case let .decodingError(err): return "Failed to decode response: \(err.localizedDescription)"
            }
        }
    }

    /**
     * Looks up flights by flight number and optional date (YYYY-MM-DD).
     */
    public func lookupFlight(number: String, date: String? = nil) async throws -> [Flight] {
        var components = URLComponents(url: baseURL.appendingPathComponent("/v1/flights/lookup"), resolvingAgainstBaseURL: true)
        var queryItems = [URLQueryItem(name: "number", value: number.trimmingCharacters(in: .whitespacesAndNewlines))]
        if let date = date, !date.isEmpty {
            queryItems.append(URLQueryItem(name: "date", value: date))
        }
        components?.queryItems = queryItems

        guard let url = components?.url else { throw ApiError.invalidURL }
        var request = URLRequest(url: url)
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw ApiError.invalidResponse }
        guard (200...299).contains(http.statusCode) else {
            let msg = String(data: data, encoding: .utf8) ?? "Unknown server error"
            throw ApiError.httpError(statusCode: http.statusCode, message: msg)
        }

        do {
            let decoded = try JSONDecoder().decode(GatewayLookupResponse.self, data: data)
            return decoded.flights
        } catch {
            throw ApiError.decodingError(error)
        }
    }

    /**
     * Fetches FIDS departure or arrival boards for an airport code (e.g. JFK, LHR).
     */
    public func fetchAirportFlights(code: String, direction: String = "departures") async throws -> [Flight] {
        let clean = code.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        var components = URLComponents(url: baseURL.appendingPathComponent("/v1/airports/\(clean)/flights"), resolvingAgainstBaseURL: true)
        components?.queryItems = [URLQueryItem(name: "direction", value: direction)]

        guard let url = components?.url else { throw ApiError.invalidURL }
        var request = URLRequest(url: url)
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw ApiError.invalidResponse }
        guard (200...299).contains(http.statusCode) else {
            let msg = String(data: data, encoding: .utf8) ?? "Unknown server error"
            throw ApiError.httpError(statusCode: http.statusCode, message: msg)
        }

        do {
            let decoded = try JSONDecoder().decode(GatewayFidsResponse.self, data: data)
            return decoded.flights
        } catch {
            throw ApiError.decodingError(error)
        }
    }
}
