package com.example.data.supabase

import com.example.BuildConfig
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime

object SupabaseClientProvider {

    private val supabaseUrl: String
        get() = BuildConfig.SUPABASE_URL.trim()

    private val supabaseKey: String
        get() = BuildConfig.SUPABASE_PUBLISHABLE_KEY.trim()

    val isReady: Boolean
        get() = supabaseUrl.startsWith("https://") &&
            supabaseKey.length > 20 &&
            !supabaseKey.startsWith("DEFAULT_")

    val client: SupabaseClient by lazy {
        check(isReady) {
            "Supabase is not configured. Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to apps/android/.env."
        }
        createSupabaseClient(
            supabaseUrl = supabaseUrl,
            supabaseKey = supabaseKey
        ) {
            install(Auth)
            install(Postgrest)
            install(Realtime)
        }
    }

    val auth get() = client.auth
}
