import SwiftUI

struct PlaceholderScreen: View {
    let title: String
    let subtitle: String
    let systemImage: String
    let accent: Color

    var body: some View {
        ZStack {
            AviTheme.background.ignoresSafeArea()
            VStack(spacing: 22) {
                Image(systemName: systemImage)
                    .font(.system(size: 54, weight: .light))
                    .foregroundStyle(accent)
                    .padding(28)
                    .background(
                        Circle()
                            .fill(AviTheme.surfaceRaised)
                            .overlay(Circle().stroke(AviTheme.border, lineWidth: 1))
                    )

                VStack(spacing: 8) {
                    Text(title)
                        .font(.system(.title2, design: .rounded, weight: .semibold))
                        .foregroundStyle(AviTheme.textPrimary)
                    Text(subtitle)
                        .font(.callout)
                        .foregroundStyle(AviTheme.textSecondary)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: 320)
                }

                Text("iOS client placeholder")
                    .font(.caption.monospaced())
                    .foregroundStyle(AviTheme.textSecondary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(
                        Capsule()
                            .fill(AviTheme.surface)
                            .overlay(Capsule().stroke(AviTheme.border, lineWidth: 1))
                    )
            }
            .padding(32)
        }
    }
}
