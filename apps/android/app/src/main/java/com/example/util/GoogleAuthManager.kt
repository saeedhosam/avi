package com.example.util

import android.app.Activity
import android.util.Log
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import com.example.BuildConfig
import com.example.data.supabase.SupabaseClientProvider
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.Google
import io.github.jan.supabase.auth.providers.builtin.IDToken
import kotlinx.serialization.json.JsonPrimitive
import java.security.MessageDigest
import java.util.UUID

object GoogleAuthManager {

    suspend fun signInWithGoogle(activity: Activity): Result<String> {
        if (!SupabaseClientProvider.isReady) {
            return Result.failure(
                IllegalStateException(
                    "Supabase is not configured. Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to apps/android/.env."
                )
            )
        }

        val webClientId = BuildConfig.GOOGLE_WEB_CLIENT_ID.trim()
        if (webClientId.isBlank() || webClientId.startsWith("DEFAULT_")) {
            return Result.failure(
                IllegalStateException(
                    "GOOGLE_WEB_CLIENT_ID is not configured. Add the Web OAuth client ID to apps/android/.env."
                )
            )
        }

        val rawNonce = UUID.randomUUID().toString()
        val hashedNonce = sha256(rawNonce)
        val credentialManager = CredentialManager.create(activity)
        val signInOption = GetSignInWithGoogleOption.Builder(webClientId)
            .setNonce(hashedNonce)
            .build()

        val request = GetCredentialRequest.Builder()
            .addCredentialOption(signInOption)
            .build()

        return try {
            val response = credentialManager.getCredential(activity, request)
            val credential = response.credential
            if (credential is CustomCredential &&
                credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
            ) {
                val googleIdTokenCredential = GoogleIdTokenCredential.createFrom(credential.data)
                SupabaseClientProvider.auth.signInWith(IDToken) {
                    idToken = googleIdTokenCredential.idToken
                    provider = Google
                    nonce = rawNonce
                }
                val user = SupabaseClientProvider.auth.currentUserOrNull()
                val name = (user?.userMetadata?.get("full_name") as? JsonPrimitive)
                    ?.content
                    ?.takeIf { it.isNotBlank() }
                    ?: (user?.userMetadata?.get("name") as? JsonPrimitive)
                        ?.content
                        ?.takeIf { it.isNotBlank() }
                    ?: "Google Aviator"
                Result.success(name)
            } else {
                Result.failure(IllegalStateException("Unexpected credential format received"))
            }
        } catch (e: GetCredentialCancellationException) {
            Log.d("GoogleAuth", "Sign-in cancelled by user")
            Result.failure(e)
        } catch (e: Exception) {
            Log.e("GoogleAuth", "Google Sign-in failed: ${e.message}", e)
            Result.failure(e)
        }
    }

    suspend fun signOut() {
        if (!SupabaseClientProvider.isReady) return
        SupabaseClientProvider.auth.signOut()
    }

    private fun sha256(value: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray())
        return digest.joinToString("") { "%02x".format(it) }
    }
}
