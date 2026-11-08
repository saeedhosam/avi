import SwiftUI

public struct FlightSearchScreen: View {
    @State private var query = ""
    @State private var flights: [Flight] = []
    @State private var isLoading = false
    @State private var errorMessage: String? = nil

    public init() {}

    public var body: some View {
        ZStack {
            AviTheme.background.ignoresSafeArea()

            VStack(spacing: 0) {
                // Search Input Header
                HStack(spacing: 12) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(AviTheme.radarCyan)

                    TextField("Flight (e.g. BA286, AA100, UA1)", text: $query)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled(true)
                        .foregroundStyle(AviTheme.textPrimary)
                        .submitLabel(.search)
                        .onSubmit {
                            performSearch()
                        }

                    if !query.isEmpty {
                        Button {
                            query = ""
                            flights = []
                            errorMessage = nil
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(AviTheme.textSecondary)
                        }
                    }

                    if isLoading {
                        ProgressView()
                            .tint(AviTheme.radarCyan)
                    }
                }
                .padding(14)
                .background(AviTheme.surfaceRaised)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(AviTheme.border, lineWidth: 1)
                )
                .padding(.horizontal, 16)
                .padding(.vertical, 12)

                // Results or Empty/Error State
                if let error = errorMessage {
                    VStack(spacing: 12) {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.system(size: 36))
                            .foregroundStyle(AviTheme.statusDelayed)
                        Text(error)
                            .font(.callout)
                            .foregroundStyle(AviTheme.textSecondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 24)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if flights.isEmpty && !isLoading {
                    VStack(spacing: 16) {
                        Image(systemName: "airplane.circle")
                            .font(.system(size: 48, weight: .light))
                            .foregroundStyle(AviTheme.radarCyan.opacity(0.7))

                        VStack(spacing: 6) {
                            Text("Track Any Flight")
                                .font(.headline)
                                .foregroundStyle(AviTheme.textPrimary)
                            Text("Enter a commercial flight number to view live radar, schedule status, gate, and baggage updates.")
                                .font(.footnote)
                                .foregroundStyle(AviTheme.textSecondary)
                                .multilineTextAlignment(.center)
                                .frame(maxWidth: 280)
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ScrollView {
                        LazyVStack(spacing: 14) {
                            ForEach(flights) { flight in
                                FlightCard(flight: flight)
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.top, 4)
                        .padding(.bottom, 24)
                    }
                }
            }
        }
    }

    private func performSearch() {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        isLoading = true
        errorMessage = nil

        Task {
            do {
                let results = try await AviApiClient.shared.lookupFlight(number: trimmed)
                await MainActor.run {
                    self.flights = results
                    self.isLoading = false
                    if results.isEmpty {
                        self.errorMessage = "No flights found matching \"\(trimmed)\"."
                    }
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

// MARK: - Flight Card Component

struct FlightCard: View {
    let flight: Flight

    var body: some View {
        VStack(spacing: 14) {
            // Header Row: Airline, Flight Number, Status Pill
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(flight.airline)
                        .font(.caption)
                        .foregroundStyle(AviTheme.textSecondary)
                    Text(flight.flightNumber)
                        .font(.system(.title3, design: .rounded, weight: .bold))
                        .foregroundStyle(AviTheme.textPrimary)
                }
                Spacer()
                StatusBadge(status: flight.status, delay: flight.delayMinutes)
            }

            Divider().background(AviTheme.border)

            // Route & Times Row
            HStack(alignment: .top) {
                // Origin
                VStack(alignment: .leading, spacing: 3) {
                    Text(flight.origin.code)
                        .font(.system(size: 24, weight: .black, design: .monospaced))
                        .foregroundStyle(AviTheme.textPrimary)
                    Text(flight.origin.city)
                        .font(.caption2)
                        .foregroundStyle(AviTheme.textSecondary)
                    Text(flight.departureTimeScheduled)
                        .font(.subheadline.monospaced())
                        .foregroundStyle(AviTheme.radarCyan)
                }

                Spacer()

                // Route Line & Airplane Icon
                VStack(spacing: 4) {
                    Image(systemName: "airplane")
                        .font(.subheadline)
                        .foregroundStyle(AviTheme.textSecondary)
                    Rectangle()
                        .fill(AviTheme.border)
                        .frame(height: 1)
                        .frame(width: 80)
                    if flight.delayMinutes > 0 {
                        Text("+\(flight.delayMinutes)m")
                            .font(.caption2.bold())
                            .foregroundStyle(AviTheme.statusDelayed)
                    }
                }
                .padding(.top, 6)

                Spacer()

                // Destination
                VStack(alignment: .trailing, spacing: 3) {
                    Text(flight.destination.code)
                        .font(.system(size: 24, weight: .black, design: .monospaced))
                        .foregroundStyle(AviTheme.textPrimary)
                    Text(flight.destination.city)
                        .font(.caption2)
                        .foregroundStyle(AviTheme.textSecondary)
                    Text(flight.arrivalTimeScheduled)
                        .font(.subheadline.monospaced())
                        .foregroundStyle(AviTheme.radarCyan)
                }
            }

            // Footer Chips: Gate, Terminal, Baggage
            if !flight.gateDeparture.isEmpty || !flight.terminalDeparture.isEmpty || !flight.baggageCarousel.isEmpty {
                HStack(spacing: 8) {
                    if !flight.terminalDeparture.isEmpty {
                        InfoChip(label: "Term", value: flight.terminalDeparture)
                    }
                    if !flight.gateDeparture.isEmpty {
                        InfoChip(label: "Gate", value: flight.gateDeparture)
                    }
                    if !flight.baggageCarousel.isEmpty {
                        InfoChip(label: "Baggage", value: flight.baggageCarousel)
                    }
                    Spacer()
                }
                .padding(.top, 2)
            }
        }
        .padding(16)
        .background(AviTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(AviTheme.border, lineWidth: 1)
        )
    }
}

struct StatusBadge: View {
    let status: FlightStatus
    let delay: Int

    var color: Color {
        switch status {
        case .scheduled: return AviTheme.textSecondary
        case .boarding: return AviTheme.radarCyan
        case .departed: return AviTheme.radarCyan
        case .delayed: return AviTheme.statusDelayed
        case .landed: return AviTheme.statusLanded
        case .cancelled: return AviTheme.statusCancelled
        }
    }

    var label: String {
        if status == .delayed && delay > 0 {
            return "+\(delay)m DELAYED"
        }
        return status.displayName.uppercased()
    }

    var body: some View {
        Text(label)
            .font(.system(size: 11, weight: .bold, design: .monospaced))
            .foregroundStyle(color)
            .padding(.horizontal, 9)
            .padding(.vertical, 4)
            .background(color.opacity(0.12))
            .clipShape(Capsule())
            .overlay(Capsule().stroke(color.opacity(0.3), lineWidth: 1))
    }
}

struct InfoChip: View {
    let label: String
    let value: String

    var body: some View {
        HStack(spacing: 4) {
            Text(label)
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(AviTheme.textSecondary)
            Text(value)
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .foregroundStyle(AviTheme.textPrimary)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(AviTheme.surfaceRaised)
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }
}
