import SwiftUI

public struct RouteConnection: Identifiable, Sendable {
    public let id: String
    public let originCode: String
    public let originCity: String
    public let destinationCode: String
    public let destinationCity: String
    public let distanceKm: Int
    public let dailyFlights: Int
    public let operators: [String]

    public var distanceNm: Int {
        Int(Double(distanceKm) * 0.539957)
    }
}

public struct RoutesScreen: View {
    @State private var selectedHub = "ALL"
    @State private var searchQuery = ""

    private let hubs = ["ALL", "JFK", "LHR", "DXB", "SIN", "HND"]

    private let popularRoutes: [RouteConnection] = [
        RouteConnection(id: "LHR-JFK", originCode: "LHR", originCity: "London", destinationCode: "JFK", destinationCity: "New York", distanceKm: 5555, dailyFlights: 24, operators: ["BA", "AA", "VS", "DL"]),
        RouteConnection(id: "DXB-LHR", originCode: "DXB", originCity: "Dubai", destinationCode: "LHR", destinationCity: "London", distanceKm: 5490, dailyFlights: 16, operators: ["EK", "BA"]),
        RouteConnection(id: "SIN-SYD", originCode: "SIN", originCity: "Singapore", destinationCode: "SYD", destinationCity: "Sydney", distanceKm: 6305, dailyFlights: 10, operators: ["SQ", "QF"]),
        RouteConnection(id: "HND-LAX", originCode: "HND", originCity: "Tokyo", destinationCode: "LAX", destinationCity: "Los Angeles", distanceKm: 8815, dailyFlights: 8, operators: ["NH", "JL", "DL"]),
        RouteConnection(id: "JFK-CDG", originCode: "JFK", originCity: "New York", destinationCode: "CDG", destinationCity: "Paris", distanceKm: 5835, dailyFlights: 14, operators: ["AF", "DL", "AA"]),
        RouteConnection(id: "DXB-SIN", originCode: "DXB", originCity: "Dubai", destinationCode: "SIN", destinationCity: "Singapore", distanceKm: 5850, dailyFlights: 12, operators: ["EK", "SQ"]),
    ]

    public init() {}

    public var filteredRoutes: [RouteConnection] {
        popularRoutes.filter { route in
            let matchesHub = selectedHub == "ALL" || route.originCode == selectedHub || route.destinationCode == selectedHub
            let q = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let matchesQuery = q.isEmpty ||
                route.originCode.lowercased().contains(q) ||
                route.destinationCode.lowercased().contains(q) ||
                route.originCity.lowercased().contains(q) ||
                route.destinationCity.lowercased().contains(q)
            return matchesHub && matchesQuery
        }
    }

    public var body: some View {
        ZStack {
            AviTheme.background.ignoresSafeArea()

            VStack(spacing: 0) {
                // Search Field
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(AviTheme.routeCrimson)

                    TextField("Search route or city...", text: $searchQuery)
                        .foregroundStyle(AviTheme.textPrimary)
                }
                .padding(12)
                .background(AviTheme.surfaceRaised)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(AviTheme.border, lineWidth: 1))
                .padding(.horizontal, 16)
                .padding(.vertical, 10)

                // Hub Filter Strip
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(hubs, id: \.self) { hub in
                            Button {
                                selectedHub = hub
                            } label: {
                                Text(hub == "ALL" ? "All Hubs" : hub)
                                    .font(.system(size: 13, weight: .semibold))
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 6)
                                    .background(selectedHub == hub ? AviTheme.routeCrimson.opacity(0.18) : AviTheme.surfaceRaised)
                                    .foregroundStyle(selectedHub == hub ? AviTheme.routeCrimson : AviTheme.textSecondary)
                                    .clipShape(Capsule())
                                    .overlay(
                                        Capsule().stroke(selectedHub == hub ? AviTheme.routeCrimson : AviTheme.border, lineWidth: 1)
                                    )
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 10)
                }

                // Route Cards List
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(filteredRoutes) { route in
                            RouteCard(route: route)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 24)
                }
            }
        }
    }
}

struct RouteCard: View {
    let route: RouteConnection

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(route.originCode)
                        .font(.system(size: 22, weight: .black, design: .monospaced))
                        .foregroundStyle(AviTheme.textPrimary)
                    Text(route.originCity)
                        .font(.caption2)
                        .foregroundStyle(AviTheme.textSecondary)
                }

                Spacer()

                VStack(spacing: 4) {
                    Text("\(route.distanceKm) km · \(route.distanceNm) nm")
                        .font(.system(size: 11, weight: .medium, design: .monospaced))
                        .foregroundStyle(AviTheme.textSecondary)
                    Image(systemName: "arrow.right")
                        .font(.caption.bold())
                        .foregroundStyle(AviTheme.routeCrimson)
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 2) {
                    Text(route.destinationCode)
                        .font(.system(size: 22, weight: .black, design: .monospaced))
                        .foregroundStyle(AviTheme.textPrimary)
                    Text(route.destinationCity)
                        .font(.caption2)
                        .foregroundStyle(AviTheme.textSecondary)
                }
            }

            Divider().background(AviTheme.border)

            HStack {
                Text("\(route.dailyFlights) flights daily")
                    .font(.caption.bold())
                    .foregroundStyle(AviTheme.radarCyan)

                Spacer()

                HStack(spacing: 4) {
                    Text("Carriers:")
                        .font(.caption2)
                        .foregroundStyle(AviTheme.textSecondary)
                    ForEach(route.operators, id: \.self) { op in
                        Text(op)
                            .font(.system(size: 10, weight: .bold, design: .monospaced))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(AviTheme.surfaceRaised)
                            .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                    }
                }
            }
        }
        .padding(14)
        .background(AviTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(AviTheme.border, lineWidth: 1))
    }
}
