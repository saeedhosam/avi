package com.example.data

import com.example.base.FirestoreEmulatorTestBase
import com.example.data.firestore.FirestoreAlert
import com.example.data.firestore.FirestoreRepository
import com.example.data.firestore.FirestoreTrackedFlight
import com.example.data.firestore.FirestoreUserProfile
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FirestoreRepositoryRuleTest : FirestoreEmulatorTestBase() {

    @Test
    fun saveUserProfile_authenticated_succeeds() = runBlocking {
        val aliceUid = signInTestUser("alice@example.com")
        val repo = FirestoreRepository(firestore, auth)

        val profile = FirestoreUserProfile(
            userId = aliceUid,
            displayName = "Alice Navigator",
            email = "alice@example.com",
            homeAirport = "JFK",
            themePreference = "DARK"
        )

        val result = withTimeout(10000L) {
            repo.saveUserProfile(profile)
        }
        assertTrue(result.isSuccess)

        val savedProfile = withTimeout(10000L) {
            repo.observeUserProfile(aliceUid).first()
        }
        assertNotNull(savedProfile)
        assertEquals("Alice Navigator", savedProfile?.displayName)
        assertEquals("JFK", savedProfile?.homeAirport)
    }

    @Test
    fun saveTrackedFlight_authenticated_succeeds() = runBlocking {
        val aliceUid = signInTestUser("alice@example.com")
        val repo = FirestoreRepository(firestore, auth)

        val flight = FirestoreTrackedFlight(
            userId = aliceUid,
            flightNumber = "AA 100",
            airline = "American Airlines",
            originCode = "JFK",
            destCode = "LHR",
            status = "SCHEDULED",
            isFavorite = true
        )

        val result = withTimeout(10000L) {
            repo.saveTrackedFlight(flight)
        }
        assertTrue(result.isSuccess)
        val flightId = result.getOrThrow()
        assertEquals("AA100", flightId)

        val flights = withTimeout(10000L) {
            repo.observeTrackedFlights(aliceUid).first()
        }
        assertTrue(flights.isNotEmpty())
        assertEquals("AA 100", flights.first().flightNumber)
    }

    @Test
    fun unauthenticated_saveTrackedFlight_fails() = runBlocking {
        auth.signOut()
        val repo = FirestoreRepository(firestore, auth)

        val flight = FirestoreTrackedFlight(
            userId = "unauth_user",
            flightNumber = "DL 404",
            airline = "Delta Air Lines",
            originCode = "ATL",
            destCode = "CDG",
            status = "SCHEDULED"
        )

        val result = repo.saveTrackedFlight(flight)
        assertTrue(result.isFailure)
    }

    @Test
    fun crossUser_readTrackedFlights_isBlocked() = runBlocking {
        val aliceUid = signInTestUser("alice@example.com")
        val aliceRepo = FirestoreRepository(firestore, auth)

        aliceRepo.saveTrackedFlight(
            FirestoreTrackedFlight(
                userId = aliceUid,
                flightNumber = "BA 178",
                airline = "British Airways",
                originCode = "JFK",
                destCode = "LHR",
                status = "BOARDING"
            )
        ).getOrThrow()

        // Switch to Bob
        val bobUid = signInTestUser("bob@example.com")
        assertTrue(bobUid != aliceUid)

        // Directly attempt to read Alice's subcollection using Bob's credentials
        val denied = try {
            firestore.collection("users").document(aliceUid)
                .collection("trackedFlights")
                .get()
                .await()
            false
        } catch (e: Exception) {
            true
        }
        assertTrue(denied)
    }

    @Test
    fun saveAlert_and_markRead_succeeds() = runBlocking {
        val aliceUid = signInTestUser("alice@example.com")
        val repo = FirestoreRepository(firestore, auth)

        val alert = FirestoreAlert(
            id = "alert_delay_1",
            userId = aliceUid,
            flightNumber = "AA 100",
            alertType = "DELAY",
            title = "Delay Alert",
            message = "Flight AA 100 is delayed 25 mins",
            isRead = false
        )

        val saveRes = withTimeout(10000L) {
            repo.saveAlert(alert)
        }
        assertTrue(saveRes.isSuccess)

        val readRes = withTimeout(10000L) {
            repo.markAlertRead("alert_delay_1")
        }
        assertTrue(readRes.isSuccess)
    }
}
