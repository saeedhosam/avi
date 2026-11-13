import SwiftUI

/// The single dark cockpit palette used by the SwiftUI client.
enum AviTheme {
    static let background = Color(hex: 0x071018)
    static let surface = Color(hex: 0x0D1B27)
    static let surfaceRaised = Color(hex: 0x122536)
    static let border = Color(hex: 0x1E3A4F)
    static let borderStrong = Color(hex: 0x315A85)
    static let radarCyan = Color(hex: 0x00E5FF)
    static let aeroBlue = Color(hex: 0x4DA3FF)
    static let routeCrimson = Color(hex: 0xD94A6A)
    static let indoorDining = Color(hex: 0xF59E0B)
    static let indoorLounge = Color(hex: 0x10B981)
    static let textPrimary = Color(hex: 0xEAF6FF)
    static let textSecondary = Color(hex: 0x93A9BA)
    static let textSubtle = Color(hex: 0x64748B)

    static let statusScheduled = Color(hex: 0x94A3B8)
    static let statusBoarding = Color(hex: 0x38BDF8)
    static let statusDeparted = Color(hex: 0x00E5FF)
    static let statusDelayed = Color(hex: 0xF59E0B)
    static let statusLanded = Color(hex: 0x10B981)
    static let statusCancelled = Color(hex: 0xEF4444)
}

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: opacity
        )
    }
}
