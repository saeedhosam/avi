package com.example.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

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
    version = 7,
    exportSchema = false
)
abstract class SkyTrackDatabase : RoomDatabase() {
    abstract fun flightDao(): FlightDao

    companion object {
        private val MIGRATION_6_7 = object : Migration(6, 7) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL(
                    "ALTER TABLE cached_flights ADD COLUMN flightDate TEXT"
                )
            }
        }

        @Volatile
        private var INSTANCE: SkyTrackDatabase? = null

        fun getDatabase(context: Context): SkyTrackDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    SkyTrackDatabase::class.java,
                    "skytrack_database"
                )
                    .addMigrations(MIGRATION_6_7)
                    .fallbackToDestructiveMigrationOnDowngrade(false)
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
