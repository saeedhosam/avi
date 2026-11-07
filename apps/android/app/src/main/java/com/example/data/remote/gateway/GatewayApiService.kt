package com.example.data.remote.gateway

import com.example.data.remote.ApiConfig
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query
import java.util.concurrent.TimeUnit
/**
 * Retrofit API definition for the Avi gateway (`services/api`).
 *
 * The gateway is the single provider seam — it holds the AeroDataBox key and
 * returns console-shaped Flight objects (same JSON the web uses). The Android
 * app never talks to AeroDataBox directly, so no provider key lives in the APK.
 */
interface GatewayApiService {

    /**
     * Live flight lookup by number; optional ISO operating date for date-scoped
     * results. Response mode mirrors the web: LIVE_DATA, QUOTA_FALLBACK,
     * NOT_CONFIGURED, or ERROR.
     */
    @retrofit2.http.GET("v1/flights/lookup")
    suspend fun lookupFlight(
        @retrofit2.http.Query("number") flightNumber: String,
        @retrofit2.http.Query("date") date: String? = null
    ): retrofit2.Response<GatewayLookupResponse>

    /**
     * Live departures + arrivals board for an IATA code (console Flight shape).
     */
    @retrofit2.http.GET("v1/airports/{code}/flights")
    suspend fun getAirportFlights(
        @retrofit2.http.Path("code") airportCode: String
    ): retrofit2.Response<GatewayFidsResponse>

    /**
     * Live airport search by IATA, ICAO, city, or name.
     */
    @retrofit2.http.GET("v1/airports/search")
    suspend fun searchAirports(
        @retrofit2.http.Query("q") query: String
    ): retrofit2.Response<GatewayAirportSearchResponse>

    /**
     * Daily route stats from an origin airport (console shape).
     */
    @retrofit2.http.GET("v1/airports/{code}/routes")
    suspend fun getAirportRoutes(
        @retrofit2.http.Path("code") airportCode: String
    ): retrofit2.Response<GatewayRoutesResponse>
}

/**
 * Pre-configured Retrofit instance for the Avi gateway.
 */
object GatewayNetworkClient {

    val moshi: Moshi by lazy {
        Moshi.Builder()
            .addLast(KotlinJsonAdapterFactory())
            .build()
    }

    val apiService: GatewayApiService by lazy {
        val okHttpClient = OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(12, TimeUnit.SECONDS)
            .writeTimeout(10, TimeUnit.SECONDS)
            .build()

        Retrofit.Builder()
            .baseUrl(ApiConfig.aviGatewayBaseUrl)
            .client(okHttpClient)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
            .create(GatewayApiService::class.java)
    }
}
