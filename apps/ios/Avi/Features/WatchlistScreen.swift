import SwiftUI

public struct WatchlistScreen: View {
    @State private var watchlistedFlights: [Flight] = []
    @State private var newFlightInput = ""
    @State private var isAdding = false
    @State private var statusMessage: String? = nil

    private static let storageKey = "avi.watchlisted_flights"

    public init() {}

    public var body: some View {
        ZStack {
            AviTheme.background.ignoresSafeArea()

            VStack(spacing: 0) {
                // Add to Watchlist Header
                HStack(spacing: 10) {
                    TextField("Watch flight (e.g. BA1, AA100)", text: $newFlightInput)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled(true)
                        .foregroundStyle(AviTheme.textPrimary)
                        .padding(12)
                        .background(AviTheme.surfaceRaised)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .stroke(AviTheme.border, lineWidth: 1)
                        )

                    Button {
                        addFlight()
                    } label: {
                        if isAdding {
                            ProgressView()
                                .tint(AviTheme.background)
                                .frame(width: 44, height: 44)
                        } else {
                            Image(systemName: "plus")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundStyle(AviTheme.background)
                                .frame(width: 44, height: 44)
                        }
                    }
                    .background(AviTheme.radarCyan)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .disabled(isAdding || newFlightInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)

                if let msg = statusMessage {
                    Text(msg)
                        .font(.caption)
                        .foregroundStyle(AviTheme.statusDelayed)
                        .padding(.horizontal, 16)
                        .padding(.bottom, 6)
                }

                // Watchlist Cards
                if watchlistedFlights.isEmpty {
                    VStack(spacing: 16) {
                        Image(systemName: "bell.badge")
                            .font(.system(size: 44, weight: .light))
                            .foregroundStyle(AviTheme.radarCyan.opacity(0.8))

                        VStack(spacing: 6) {
                            Text("No Tracked Flights")
                                .font(.headline)
                                .foregroundStyle(AviTheme.textPrimary)
                            Text("Add flight numbers to monitor departure status, gate updates, and delay alerts.")
                                .font(.footnote)
                                .foregroundStyle(AviTheme.textSecondary)
                                .multilineTextAlignment(.center)
                                .frame(maxWidth: 280)
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            ForEach(watchlistedFlights) { flight in
                                VStack(alignment: .trailing, spacing: 4) {
                                    FlightCard(flight: flight)
                                    Button(role: .destructive) {
                                        removeFlight(flight)
                                    } label: {
                                        Label("Stop Watching", systemImage: "bell.slash")
                                            .font(.caption2.bold())
                                            .foregroundStyle(AviTheme.statusCancelled)
                                    }
                                    .padding(.trailing, 8)
                                }
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 24)
                    }
                }
            }
        }
        .onAppear {
            loadStoredFlights()
        }
    }

    private func loadStoredFlights() {
        guard let data = UserDefaults.standard.data(forKey: Self.storageKey),
              let decoded = try? JSONDecoder().decode([Flight].self, data) else { return }
        watchlistedFlights = decoded
    }

    private func saveFlights(_ flights: [Flight]) {
        if let data = try? JSONEncoder().encode(flights) {
            UserDefaults.standard.set(data, forKey: Self.storageKey)
        }
    }

    private func addFlight() {
        let code = newFlightInput.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard !code.isEmpty else { return }

        isAdding = true
        statusMessage = nil

        Task {
            do {
                let matches = try await AviApiClient.shared.lookupFlight(number: code)
                await MainActor.run {
                    self.isAdding = false
                    if let first = matches.first {
                        var updated = first
                        updated.isWatchlisted = true
                        if !self.watchlistedFlights.contains(where: { $0.id == updated.id }) {
                            self.watchlistedFlights.insert(updated, at: 0)
                            self.saveFlights(self.watchlistedFlights)
                        }
                        self.newFlightInput = ""
                    } else {
                        self.statusMessage = "Flight \(code) not found."
                    }
                }
            } catch {
                await MainActor.run {
                    self.isAdding = false
                    self.statusMessage = error.localizedDescription
                }
            }
        }
    }

    private func removeFlight(_ flight: Flight) {
        watchlistedFlights.removeAll(where: { $0.id == flight.id })
        saveFlights(watchlistedFlights)
    }
}
