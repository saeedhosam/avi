import SwiftUI

struct RootView: View {
    var body: some View {
        TabView {
            NavigationStack {
                FlightSearchScreen()
                    .navigationTitle("Avi")
            }
            .tabItem { Label("Search", systemImage: "magnifyingglass") }

            NavigationStack {
                RoutesScreen()
                    .navigationTitle("Routes")
            }
            .tabItem { Label("Routes", systemImage: "point.3.connected.trianglepath.dotted") }

            NavigationStack {
                AirportsScreen()
                    .navigationTitle("Airports")
            }
            .tabItem { Label("Airports", systemImage: "airplane.departure") }

            NavigationStack {
                TerminalsScreen()
                    .navigationTitle("Terminals")
            }
            .tabItem { Label("Terminals", systemImage: "building.2.crop.circle") }

            NavigationStack {
                WatchlistScreen()
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
