import SwiftUI

public struct TerminalAmenity: Identifiable, Sendable {
    public let id: String
    public let name: String
    public let category: String
    public let level: Int
    public let location: String
    public let systemImage: String
}

public struct TerminalsScreen: View {
    @State private var selectedAirport = "JFK"
    @State private var selectedFloor = 1
    @State private var selectedCategory = "ALL"

    private let airports = ["JFK", "LHR", "DXB", "HND", "SIN"]
    private let floors = [0, 1, 2]
    private let categories = ["ALL", "Gates", "Dining", "Duty Free", "Lounges", "Restrooms"]

    private let sampleAmenities: [TerminalAmenity] = [
        TerminalAmenity(id: "1", name: "Gate B14", category: "Gates", level: 1, location: "Concourse B", systemImage: "door.left.hand.open"),
        TerminalAmenity(id: "2", name: "Gate B22", category: "Gates", level: 1, location: "Concourse B", systemImage: "door.left.hand.open"),
        TerminalAmenity(id: "3", name: "Shake Shack", category: "Dining", level: 1, location: "Near Gate B23", systemImage: "fork.knife"),
        TerminalAmenity(id: "4", name: "Starbucks Coffee", category: "Dining", level: 1, location: "Central Hub", systemImage: "cup.and.saucer.fill"),
        TerminalAmenity(id: "5", name: "World Duty Free", category: "Duty Free", level: 1, location: "Departures Concourse", systemImage: "bag.fill"),
        TerminalAmenity(id: "6", name: "SkyTeam Lounge", category: "Lounges", level: 2, location: "Mezzanine Level", systemImage: "bed.double.fill"),
        TerminalAmenity(id: "7", name: "Restroom & Nursery", category: "Restrooms", level: 1, location: "Near Gate B18", systemImage: "figure.walk"),
        TerminalAmenity(id: "8", name: "Baggage Claim 4-8", category: "Services", level: 0, location: "Arrivals Hall", systemImage: "bag.circle"),
    ]

    public init() {}

    public var filteredAmenities: [TerminalAmenity] {
        sampleAmenities.filter { amenity in
            let matchesFloor = amenity.level == selectedFloor
            let matchesCategory = selectedCategory == "ALL" || amenity.category == selectedCategory
            return matchesFloor && matchesCategory
        }
    }

    public var body: some View {
        ZStack {
            AviTheme.background.ignoresSafeArea()

            VStack(spacing: 0) {
                Text("Illustrative terminal guide — not live gate or amenity data.")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(AviTheme.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
                    .padding(.top, 8)

                // Airport Selector & Floor Strip
                HStack {
                    Menu {
                        ForEach(airports, id: \.self) { code in
                            Button(code) { selectedAirport = code }
                        }
                    } label: {
                        HStack(spacing: 6) {
                            Text("\(selectedAirport) Terminal Map")
                                .font(.system(size: 15, weight: .bold))
                                .foregroundStyle(AviTheme.textPrimary)
                            Image(systemName: "chevron.down")
                                .font(.caption.bold())
                                .foregroundStyle(AviTheme.indoorDining)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(AviTheme.surfaceRaised)
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    }

                    Spacer()

                    // Floor Selector Pills
                    HStack(spacing: 4) {
                        ForEach(floors, id: \.self) { floor in
                            Button {
                                selectedFloor = floor
                            } label: {
                                Text(floor == 0 ? "L0" : "L\(floor)")
                                    .font(.system(size: 12, weight: .bold, design: .monospaced))
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 6)
                                    .background(selectedFloor == floor ? AviTheme.indoorDining : AviTheme.surfaceRaised)
                                    .foregroundStyle(selectedFloor == floor ? AviTheme.background : AviTheme.textSecondary)
                                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                            }
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)

                // Category Filter Strip
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(categories, id: \.self) { cat in
                            Button {
                                selectedCategory = cat
                            } label: {
                                Text(cat)
                                    .font(.caption.bold())
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 5)
                                    .background(selectedCategory == cat ? AviTheme.indoorDining.opacity(0.18) : AviTheme.surfaceRaised)
                                    .foregroundStyle(selectedCategory == cat ? AviTheme.indoorDining : AviTheme.textSecondary)
                                    .clipShape(Capsule())
                                    .overlay(
                                        Capsule().stroke(selectedCategory == cat ? AviTheme.indoorDining : AviTheme.border, lineWidth: 1)
                                    )
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 10)
                }

                // Amenities List
                ScrollView {
                    LazyVStack(spacing: 10) {
                        ForEach(filteredAmenities) { item in
                            HStack(spacing: 14) {
                                Image(systemName: item.systemImage)
                                    .font(.system(size: 18))
                                    .foregroundStyle(AviTheme.indoorDining)
                                    .frame(width: 36, height: 36)
                                    .background(AviTheme.indoorDining.opacity(0.12))
                                    .clipShape(Circle())

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(item.name)
                                        .font(.subheadline.bold())
                                        .foregroundStyle(AviTheme.textPrimary)
                                    Text(item.location)
                                        .font(.caption2)
                                        .foregroundStyle(AviTheme.textSecondary)
                                }

                                Spacer()

                                Text("Level \(item.level)")
                                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                                    .foregroundStyle(AviTheme.textSecondary)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 3)
                                    .background(AviTheme.surfaceRaised)
                                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                            }
                            .padding(12)
                            .background(AviTheme.surface)
                            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(AviTheme.border, lineWidth: 1))
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 24)
                }
            }
        }
    }
}
