import SwiftUI

public struct AirportsScreen: View {
    @State private var airportCode = "JFK"
    @State private var direction = "departures"
    @State private var flights: [Flight] = []
    @State private var isLoading = false
    @State private var errorMessage: String? = nil

    private let majorAirports = ["JFK", "LHR", "DXB", "HND", "CDG", "SIN", "FRA", "LAX"]

    public init() {}

    public var body: some View {
        ZStack {
            AviTheme.background.ignoresSafeArea()

            VStack(spacing: 0) {
                // Airport Code Selector Strip
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(majorAirports, id: \.self) { code in
                            Button {
                                airportCode = code
                                loadFlights()
                            } label: {
                                Text(code)
                                    .font(.system(size: 13, weight: .bold, design: .monospaced))
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 7)
                                    .background(airportCode == code ? AviTheme.radarCyan.opacity(0.18) : AviTheme.surfaceRaised)
                                    .foregroundStyle(airportCode == code ? AviTheme.radarCyan : AviTheme.textSecondary)
                                    .clipShape(Capsule())
                                    .overlay(
                                        Capsule()
                                            .stroke(airportCode == code ? AviTheme.radarCyan : AviTheme.border, lineWidth: 1)
                                    )
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                }

                // Departures / Arrivals Toggle
                Picker("Direction", selection: $direction) {
                    Text("Departures").tag("departures")
                    Text("Arrivals").tag("arrivals")
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 16)
                .padding(.bottom, 12)
                .onChange(of: direction) { _ in
                    loadFlights()
                }

                // Flight Board Content
                if isLoading {
                    VStack(spacing: 12) {
                        ProgressView()
                            .tint(AviTheme.radarCyan)
                        Text("Fetching live FIDS board for \(airportCode)...")
                            .font(.footnote)
                            .foregroundStyle(AviTheme.textSecondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let error = errorMessage {
                    VStack(spacing: 12) {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.system(size: 32))
                            .foregroundStyle(AviTheme.statusDelayed)
                        Text(error)
                            .font(.footnote)
                            .foregroundStyle(AviTheme.textSecondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 24)
                        Button("Retry") { loadFlights() }
                            .font(.caption.bold())
                            .foregroundStyle(AviTheme.radarCyan)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if flights.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "airplane.departure")
                            .font(.system(size: 40, weight: .light))
                            .foregroundStyle(AviTheme.textSecondary)
                        Text("No scheduled flights reported for \(airportCode).")
                            .font(.subheadline)
                            .foregroundStyle(AviTheme.textSecondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            ForEach(flights) { flight in
                                FlightCard(flight: flight)
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 24)
                    }
                }
            }
        }
        .onAppear {
            if flights.isEmpty {
                loadFlights()
            }
        }
    }

    private func loadFlights() {
        isLoading = true
        errorMessage = nil

        Task {
            do {
                let results = try await AviApiClient.shared.fetchAirportFlights(code: airportCode, direction: direction)
                await MainActor.run {
                    self.flights = results
                    self.isLoading = false
                }
            } catch {
                await MainActor.run {
                    self.isLoading = false
                    self.errorMessage = error.localizedDescription
                }
            }
        }
    }
}
