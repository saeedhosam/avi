import Foundation
import Supabase

@MainActor
final class SupabaseService {
    static let shared = SupabaseService()

    let client: SupabaseClient?

    private init() {
        guard
            let url = AppConfig.supabaseURL,
            !AppConfig.supabaseKey.isEmpty
        else {
            client = nil
            return
        }
        client = SupabaseClient(
            supabaseURL: url,
            supabaseKey: AppConfig.supabaseKey
        )
    }
}
