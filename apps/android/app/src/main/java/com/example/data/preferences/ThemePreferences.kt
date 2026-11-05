package com.example.data.preferences

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

val Context.skyTrackThemeDataStore: DataStore<Preferences> by preferencesDataStore(name = "skytrack_theme_preferences")

enum class ThemeMode(
    val title: String,
    val description: String
) {
    SYSTEM("System Default", "Automatically match device light / dark appearance"),
    LIGHT("Light Mode", "Crisp daytime high-visibility cockpit theme"),
    DARK("Dark Mode", "Deep space aviation radar night theme")
}

class ThemePreferences(private val context: Context) {

    companion object {
        val KEY_THEME_MODE = stringPreferencesKey("app_theme_mode")
    }

    val themeMode: Flow<ThemeMode> = context.skyTrackThemeDataStore.data.map { preferences ->
        val saved = preferences[KEY_THEME_MODE] ?: ThemeMode.SYSTEM.name
        try {
            ThemeMode.valueOf(saved)
        } catch (_: Exception) {
            ThemeMode.SYSTEM
        }
    }

    suspend fun setThemeMode(mode: ThemeMode) {
        context.skyTrackThemeDataStore.edit { preferences ->
            preferences[KEY_THEME_MODE] = mode.name
        }
    }
}
