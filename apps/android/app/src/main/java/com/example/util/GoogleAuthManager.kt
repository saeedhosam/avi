package com.example.util

import android.app.Activity
import android.content.Context
import android.util.Log
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import com.example.R
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider
import kotlinx.coroutines.tasks.await

object GoogleAuthManager {

    suspend fun signInWithGoogle(activity: Activity): Result<String> {
        val webClientId = activity.getString(R.string.default_web_client_id)
        if (webClientId.isBlank()) {
            return Result.failure(IllegalStateException("default_web_client_id is not configured"))
        }

        val credentialManager = CredentialManager.create(activity)
        val signInOption = GetSignInWithGoogleOption.Builder(webClientId)
            .build()

        val request = GetCredentialRequest.Builder()
            .addCredentialOption(signInOption)
            .build()

        return try {
            val response = credentialManager.getCredential(activity, request)
            val credential = response.credential
            if (credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                val googleIdTokenCredential = GoogleIdTokenCredential.createFrom(credential.data)
                val authCredential = GoogleAuthProvider.getCredential(googleIdTokenCredential.idToken, null)
                val authResult = FirebaseAuth.getInstance().signInWithCredential(authCredential).await()
                val user = authResult.user
                Result.success(user?.displayName ?: user?.email ?: "Google Aviator")
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

    fun signOut() {
        FirebaseAuth.getInstance().signOut()
    }

    fun isUserSignedIn(): Boolean {
        return FirebaseAuth.getInstance().currentUser != null
    }

    fun getCurrentUser() = FirebaseAuth.getInstance().currentUser
}
