import SwiftUI

enum AviTheme {
    static let background = Color(hex: 0x071018)
    static let surface = Color(hex: 0x0D1B27)
    static let surfaceRaised = Color(hex: 0x122536)
    static let border = Color(hex: 0x1E3A4F)
    static let radarCyan = Color(hex: 0x00E5FF)
    static let aeroBlue = Color(hex: 0x4DA3FF)
    static let routeCrimson = Color(hex: 0xD94A6A)
    static let indoorDining = Color(hex: 0xF59E0B)
    static let indoorLounge = Color(hex: 0x10B981)
    static let textPrimary = Color(hex: 0xEAF6FF)
    static let textSecondary = Color(hex: 0x93A9BA)
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
