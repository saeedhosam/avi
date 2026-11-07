package com.example.data.remote.gateway

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Request
import okhttp3.Response

/**
 * Attaches the caller's Supabase access token to gateway requests so the
 * backend applies per-user quotas. Retries once with a refreshed token when
 * the gateway answers 401 (a session may have expired between polls).
 */
class GatewayAuthInterceptor(
    private val tokenProvider: GatewayTokenProvider,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (!request.header(AUTHORIZATION).isNullOrEmpty()) {
            return chain.proceed(request)
        }

        val token = safeToken { tokenProvider.currentToken() }
            ?: return chain.proceed(request)
        val response = chain.proceed(authorized(request, token))
        if (response.code != UNAUTHORIZED) return response

        val refreshed = safeToken { tokenProvider.refreshedToken() }
        if (refreshed.isNullOrBlank() || refreshed == token) return response
        response.close()
        return chain.proceed(authorized(request, refreshed))
    }

    /** OkHttp threads never join Main, so runBlocking is safe here. */
    private fun safeToken(provider: () -> String?): String? {
        return runBlocking(Dispatchers.IO) { runCatching(provider).getOrNull() }
    }

    private fun authorized(request: Request, token: String): Request =
        request.newBuilder()
            .header(AUTHORIZATION, token)
            .build()

    private companion object {
        const val AUTHORIZATION = "Authorization"
        const val UNAUTHORIZED = 401
    }
}
