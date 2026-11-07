package com.example.data.cloud

data class CloudUserProfile(
    val id: String = "",
    val userId: String = "",
    val displayName: String = "",
    val email: String = "",
    val photoUrl: String = "",
    val homeAirport: String = "JFK",
    val themePreference: String = "SYSTEM"
)

data class CloudTrackedFlight(
    val id: String = "",
    val userId: String = "",
    val flightNumber: String = "",
    val flightDate: String? = null,
    val airline: String = "",
    val originCode: String = "",
    val destCode: String = "",
    val status: String = "SCHEDULED",
    val customNotes: String = "",
    val isFavorite: Boolean = false
) {
    /**
     * Date-scoped watchlist identity matching the web client:
     * `"<COMPACT>-<YYYY-MM-DD>"` so the same flight number on two operating
     * dates occupies two independent rows (web migration 20261106000200).
     */
    fun watchRowId(): String {
        val compact = (id.ifBlank { flightNumber }).replace(" ", "").uppercase()
        return flightDate?.takeIf { it.isNotBlank() }?.let { "$compact-$it" } ?: compact
    }
}

data class CloudAlert(
    val id: String = "",
    val userId: String = "",
    val flightNumber: String = "",
    val alertType: String = "DELAY",
    val title: String = "",
    val message: String = "",
    val isRead: Boolean = false,
    val timestamp: String = ""
)

/** Plan tier + concurrent-tracked limit, mirroring the gateway's engine limits. */
data class CloudPlanState(
    val plan: String = "FREE",
    val concurrentLimit: Int = 3
) {
    val isFree: Boolean get() = plan.toUpperCase() == "FREE"
}
