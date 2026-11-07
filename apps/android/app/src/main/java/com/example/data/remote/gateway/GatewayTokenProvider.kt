package com.example.data.remote.gateway

import com.example.data.supabase.SupabaseClientProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking

/**
 * Supplies the [SupabaseClientProvider] access token the gateway uses for
 * identity and per-plan provider quotas.
 */
interface GatewayTokenProvider {
    fun currentToken(): String?

    /** Called after a 401 so the next request carries a fresh session. */
    fun refreshedToken(): String?
}

object SupabaseGatewayTokenProvider : GatewayTokenProvider {

    override fun currentToken(): String? {
        if (!SupabaseClientProvider.isReady) return null
        return runCatching {
            SupabaseClientProvider.auth.currentSessionOrNull()?.accessToken
        }.getOrNull()
    }

    override fun refreshedToken(): String? {
        if (!SupabaseClientProvider.isReady) return null
        return runBlocking(Dispatchers.IO) {
            runCatching {
                SupabaseClientProvider.auth.refreshCurrentSession()
                SupabaseClientProvider.auth.currentSessionOrNull()?.accessToken
            }.getOrNull()
        }
    }
}
