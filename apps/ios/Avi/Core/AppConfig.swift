import Foundation

enum AppConfig {
    private static func string(_ key: String) -> String {
        (Bundle.main.object(forInfoDictionaryKey: key) as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    static var supabaseURL: URL? {
        guard let url = URL(string: string("SUPABASE_URL")), url.scheme == "https" else {
            return nil
        }
        return url
    }

    static var supabaseKey: String {
        string("SUPABASE_PUBLISHABLE_KEY")
    }

    static var apiBaseURL: URL? {
        guard let url = URL(string: string("AVI_API_BASE_URL")), url.scheme == "https" else {
            return nil
        }
        return url
    }

    static var isSupabaseConfigured: Bool {
        supabaseURL != nil && !supabaseKey.isEmpty
    }
}
