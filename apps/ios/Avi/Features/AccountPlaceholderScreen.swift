import SwiftUI

struct AccountPlaceholderScreen: View {
    var body: some View {
        ZStack {
            AviTheme.background.ignoresSafeArea()
            VStack(spacing: 18) {
                Image(systemName: "person.crop.circle")
                    .font(.system(size: 58, weight: .light))
                    .foregroundStyle(AviTheme.aeroBlue)
                Text("Account")
                    .font(.system(.title2, design: .rounded, weight: .semibold))
                    .foregroundStyle(AviTheme.textPrimary)
                Text("Google sign-in, Supabase sync, and push registration will be wired with the shared client configuration.")
                    .font(.callout)
                    .foregroundStyle(AviTheme.textSecondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 320)

                HStack(spacing: 8) {
                    Circle()
                        .fill(AppConfig.isSupabaseConfigured ? AviTheme.indoorLounge : AviTheme.routeCrimson)
                        .frame(width: 8, height: 8)
                    Text(AppConfig.isSupabaseConfigured ? "Supabase configured" : "Supabase not configured")
                        .font(.caption.monospaced())
                        .foregroundStyle(AviTheme.textSecondary)
                }
            }
            .padding(32)
        }
    }
}
