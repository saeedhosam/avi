package com.example.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [
        CachedFlightEntity::class,
        FavoriteFlightEntity::class,
        FlightAlertEntity::class,
        ScheduledNotificationEntity::class,
        RecentSearchEntity::class,
        TrackedFlightEntity::class,
        DestinationWeatherEntity::class,
        CachedAirportRouteEntity::class
    ],
    version = 6,
    exportSchema = false
)
abstract class SkyTrackDatabase : RoomDatabase() {
    abstract fun flightDao(): FlightDao

    companion object {
        @Volatile
        private var INSTANCE: SkyTrackDatabase? = null

        fun getDatabase(context: Context): SkyTrackDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    SkyTrackDatabase::class.java,
                    "skytrack_database"
                )
                    .fallbackToDestructiveMigration()
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
