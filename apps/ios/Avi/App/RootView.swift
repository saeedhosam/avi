import SwiftUI

struct RootView: View {
    var body: some View {
        TabView {
            NavigationStack {
                PlaceholderScreen(
                    title: "Search",
                    subtitle: "Flight number and route lookup, live AeroDataBox results.",
                    systemImage: "magnifyingglass",
                    accent: AviTheme.radarCyan
                )
                .navigationTitle("Avi")
            }
            .tabItem { Label("Search", systemImage: "magnifyingglass") }

            NavigationStack {
                RadarPreviewScreen()
                    .navigationTitle("Live Radar")
            }
            .tabItem { Label("Radar", systemImage: "radar") }

            NavigationStack {
                PlaceholderScreen(
                    title: "Routes",
                    subtitle: "Global direct connections, hub filters, and route arcs.",
                    systemImage: "point.3.connected.trianglepath.dotted",
                    accent: AviTheme.routeCrimson
                )
                .navigationTitle("Routes")
            }
            .tabItem { Label("Routes", systemImage: "point.3.connected.trianglepath.dotted") }

            NavigationStack {
                PlaceholderScreen(
                    title: "Airports",
                    subtitle: "Live FIDS boards, weather, runways, and airport explorer.",
                    systemImage: "airplane.departure",
                    accent: AviTheme.aeroBlue
                )
                .navigationTitle("Airports")
            }
            .tabItem { Label("Airports", systemImage: "airplane.departure") }

            NavigationStack {
                PlaceholderScreen(
                    title: "Terminals",
                    subtitle: "Multi-floor indoor wayfinding, WCs, dining, duty-free, and gates.",
                    systemImage: "building.2.crop.circle",
                    accent: AviTheme.indoorDining
                )
                .navigationTitle("Terminals")
            }
            .tabItem { Label("Terminals", systemImage: "building.2.crop.circle") }

            NavigationStack {
                PlaceholderScreen(
                    title: "Watchlist",
                    subtitle: "Tracked flights, favourites, notes, and cross-device alerts.",
                    systemImage: "star",
                    accent: AviTheme.indoorLounge
                )
                .navigationTitle("Watchlist")
            }
            .tabItem { Label("Watchlist", systemImage: "star") }

            NavigationStack {
                AccountPlaceholderScreen()
                    .navigationTitle("Account")
            }
            .tabItem { Label("Account", systemImage: "person.crop.circle") }
        }
        .tint(AviTheme.radarCyan)
    }
}

#Preview {
    RootView()
}
