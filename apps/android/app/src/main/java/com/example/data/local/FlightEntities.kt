package com.example.data.local

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "cached_flights")
data class CachedFlightEntity(
    @PrimaryKey val id: String,
    val flightNumber: String,
    val airline: String,
    val airlineCode: String,
    val originCode: String,
    val originCity: String,
    val originName: String,
    val destCode: String,
    val destCity: String,
    val destName: String,
    val departureTimeScheduled: String,
    val departureTimeEstimated: String,
    val arrivalTimeScheduled: String,
    val arrivalTimeEstimated: String,
    val status: String,
    val statusNote: String,
    val delayMinutes: Int,
    val delayReason: String?,
    val terminalDeparture: String,
    val gateDeparture: String,
    val checkInCounter: String,
    val terminalArrival: String,
    val gateArrival: String,
    val baggageCarousel: String,
    val aircraftModel: String,
    val aircraftRegistration: String,
    val altitudeFeet: Int,
    val groundSpeedKnots: Int,
    val headingDegrees: Float,
    val progressPercent: Float,
    val isFavorite: Boolean,
    val customNotes: String,
    val cachedTimestamp: Long = System.currentTimeMillis()
)

@Entity(tableName = "favorite_flights")
data class FavoriteFlightEntity(
    @PrimaryKey val flightNumber: String,
    val savedTimestamp: Long = System.currentTimeMillis(),
    val customNotes: String = "",
    val notifyGateChanges: Boolean = true,
    val notifyDelays: Boolean = true,
    val notifyBoarding: Boolean = true
)

@Entity(tableName = "flight_alerts")
data class FlightAlertEntity(
    @PrimaryKey val id: String,
    val flightNumber: String,
    val type: String,
    val title: String,
    val message: String,
    val timestamp: String,
    val isRead: Boolean = false
)

@Entity(tableName = "scheduled_notifications")
data class ScheduledNotificationEntity(
    @PrimaryKey val id: String,
    val flightNumber: String,
    val alertType: String,
    val title: String,
    val message: String,
    val scheduledTimeMillis: Long,
    val scheduledTimeString: String,
    val isTriggered: Boolean = false,
    val isCancelled: Boolean = false
)

@Entity(tableName = "recent_searches")
data class RecentSearchEntity(
    @PrimaryKey val flightNumber: String,
    val airline: String,
    val originCode: String,
    val originCity: String,
    val destCode: String,
    val destCity: String,
    val status: String,
    val searchTimestamp: Long = System.currentTimeMillis()
)

@Entity(tableName = "tracked_flights")
data class TrackedFlightEntity(
    @PrimaryKey val flightNumber: String,
    val airline: String,
    val airlineCode: String,
    val originCode: String,
    val originCity: String,
    val destCode: String,
    val destCity: String,
    val departureTimeScheduled: String,
    val arrivalTimeScheduled: String,
    val status: String,
    val terminalGate: String,
    val trackedSinceMillis: Long = System.currentTimeMillis(),
    val notes: String = "",
    val isAutoAlertEnabled: Boolean = true
)

@Entity(tableName = "destination_weather_cache")
data class DestinationWeatherEntity(
    @PrimaryKey val airportCode: String,
    val airportCity: String,
    val airportName: String,
    val arrivalTime: String,
    val tempC: Int,
    val tempF: Int,
    val condition: String,
    val precipChance: Int,
    val windCondition: String,
    val visibility: String,
    val humidity: Int,
    val flightCategory: String,
    val crosswindRisk: String,
    val packingAdvice: String,
    val hourlyJson: String,
    val dailyJson: String,
    val cachedTimestamp: Long = System.currentTimeMillis()
)

@Dao
interface FlightDao {
    @Query("SELECT * FROM cached_flights ORDER BY flightNumber ASC")
    fun getAllCachedFlights(): Flow<List<CachedFlightEntity>>

    @Query("SELECT * FROM cached_flights WHERE id = :flightId")
    suspend fun getFlightById(flightId: String): CachedFlightEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertFlights(flights: List<CachedFlightEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertFlight(flight: CachedFlightEntity)

    @Query("UPDATE cached_flights SET gateDeparture = :newGate WHERE flightNumber = :flightNumber")
    suspend fun updateFlightGate(flightNumber: String, newGate: String)

    @Query("UPDATE cached_flights SET status = :status, delayMinutes = :delayMinutes, delayReason = :delayReason, statusNote = :statusNote WHERE flightNumber = :flightNumber")
    suspend fun updateFlightDelay(flightNumber: String, status: String, delayMinutes: Int, delayReason: String?, statusNote: String)

    @Query("UPDATE cached_flights SET status = :status, statusNote = :statusNote WHERE flightNumber = :flightNumber")
    suspend fun updateFlightStatus(flightNumber: String, status: String, statusNote: String)

    @Query("SELECT * FROM favorite_flights ORDER BY savedTimestamp DESC")
    fun getAllFavorites(): Flow<List<FavoriteFlightEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun addFavorite(favorite: FavoriteFlightEntity)

    @Query("DELETE FROM favorite_flights WHERE flightNumber = :flightNumber")
    suspend fun removeFavorite(flightNumber: String)

    @Query("SELECT * FROM flight_alerts ORDER BY id DESC")
    fun getAllAlerts(): Flow<List<FlightAlertEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAlert(alert: FlightAlertEntity)

    @Query("UPDATE flight_alerts SET isRead = 1 WHERE id = :alertId")
    suspend fun markAlertRead(alertId: String)

    @Query("UPDATE flight_alerts SET isRead = 1")
    suspend fun markAllAlertsRead()

    // Scheduled Notifications (Local Room Scheduling)
    @Query("SELECT * FROM scheduled_notifications ORDER BY scheduledTimeMillis ASC")
    fun getAllScheduledNotifications(): Flow<List<ScheduledNotificationEntity>>

    @Query("SELECT * FROM scheduled_notifications WHERE isTriggered = 0 AND isCancelled = 0 AND scheduledTimeMillis <= :currentTimeMillis")
    suspend fun getDueScheduledNotifications(currentTimeMillis: Long): List<ScheduledNotificationEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertScheduledNotification(notification: ScheduledNotificationEntity)

    @Query("UPDATE scheduled_notifications SET isTriggered = 1 WHERE id = :id")
    suspend fun markScheduledNotificationTriggered(id: String)

    @Query("UPDATE scheduled_notifications SET isCancelled = 1 WHERE id = :id")
    suspend fun cancelScheduledNotification(id: String)

    @Query("DELETE FROM scheduled_notifications WHERE id = :id")
    suspend fun deleteScheduledNotification(id: String)

    // Recent Searches (Saves last 5 searched flights)
    @Query("SELECT * FROM recent_searches ORDER BY searchTimestamp DESC LIMIT 5")
    fun getRecentSearches(): Flow<List<RecentSearchEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertRecentSearch(search: RecentSearchEntity)

    @Query("DELETE FROM recent_searches WHERE flightNumber = :flightNumber")
    suspend fun deleteRecentSearch(flightNumber: String)

    @Query("DELETE FROM recent_searches")
    suspend fun clearRecentSearches()

    @Query("DELETE FROM recent_searches WHERE flightNumber NOT IN (SELECT flightNumber FROM recent_searches ORDER BY searchTimestamp DESC LIMIT 5)")
    suspend fun trimRecentSearches()

    // Tracked Flights (Saved to local Room Database for active monitoring)
    @Query("SELECT * FROM tracked_flights ORDER BY trackedSinceMillis DESC")
    fun getAllTrackedFlights(): Flow<List<TrackedFlightEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTrackedFlight(flight: TrackedFlightEntity)

    @Query("DELETE FROM tracked_flights WHERE flightNumber = :flightNumber")
    suspend fun deleteTrackedFlight(flightNumber: String)

    @Query("SELECT EXISTS(SELECT 1 FROM tracked_flights WHERE flightNumber = :flightNumber)")
    fun isFlightTracked(flightNumber: String): Flow<Boolean>

    @Query("DELETE FROM tracked_flights")
    suspend fun clearAllTrackedFlights()

    @Query("DELETE FROM favorite_flights")
    suspend fun clearAllFavorites()

    @Query("DELETE FROM flight_alerts")
    suspend fun clearAllAlerts()

    @Query("DELETE FROM cached_flights")
    suspend fun clearAllCachedFlights()

    @Query("DELETE FROM scheduled_notifications")
    suspend fun clearAllScheduledNotifications()

    // Destination Airport Weather Forecast Cache
    @Query("SELECT * FROM destination_weather_cache WHERE airportCode = :airportCode")
    fun getDestinationWeather(airportCode: String): Flow<DestinationWeatherEntity?>

    @Query("SELECT * FROM destination_weather_cache WHERE airportCode = :airportCode")
    suspend fun getCachedDestinationWeather(airportCode: String): DestinationWeatherEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertDestinationWeather(weather: DestinationWeatherEntity)

    @Query("DELETE FROM destination_weather_cache WHERE airportCode = :airportCode")
    suspend fun deleteDestinationWeather(airportCode: String)

    // Airport Direct Route Connections Cache
    @Query("SELECT * FROM airport_route_connections WHERE originIata = :originIata ORDER BY dailyFlightsCount DESC")
    suspend fun getCachedRoutesForOrigin(originIata: String): List<CachedAirportRouteEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertCachedRoutes(routes: List<CachedAirportRouteEntity>)
}

@Entity(tableName = "airport_route_connections")
data class CachedAirportRouteEntity(
    @PrimaryKey val routeId: String, // e.g. "CAI-LHR"
    val originIata: String,
    val destinationIata: String,
    val destinationName: String,
    val destinationCity: String,
    val destinationCountry: String,
    val destinationLat: Double,
    val destinationLon: Double,
    val distanceKm: Int,
    val dailyFlightsCount: Int,
    val airlinesSummary: String, // e.g. "MS:EgyptAir:MS 777|BA:British Airways:BA 401"
    val isLiveVerified: Boolean = false,
    val cachedTimestamp: Long = System.currentTimeMillis()
)

