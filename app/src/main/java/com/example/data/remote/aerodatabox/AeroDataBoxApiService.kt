package com.example.data.remote.aerodatabox

import com.example.data.remote.ApiConfig
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query
import java.util.concurrent.TimeUnit

/**
 * Retrofit API definition for AeroDataBox endpoints on RapidAPI.
 */
interface AeroDataBoxApiService {

    /**
     * Fetch live flight status by flight number (nearest/today's operational window).
     */
    @GET("flights/number/{flightNumber}")
    suspend fun getFlightByNumber(
        @Path("flightNumber") flightNumber: String,
        @Query("withAircraftImage") withAircraftImage: Boolean = false,
        @Query("withLocation") withLocation: Boolean = true
    ): Response<List<AeroFlightDto>>

    /**
     * Fetch live airport FIDS departures and arrivals board for a given IATA code.
     */
    @GET("airports/iata/{code}/flights")
    suspend fun getAirportFlights(
        @Path("code") airportIata: String,
        @Query("direction") direction: String = "Both",
        @Query("withLeg") withLeg: Boolean = true,
        @Query("withCancelled") withCancelled: Boolean = true,
        @Query("withCodeshared") withCodeshared: Boolean = false
    ): Response<AeroFidsResponseDto>

    /**
     * Fetch current airport departure and arrival delay indexes.
     */
    @GET("airports/iata/{code}/delays")
    suspend fun getAirportDelays(
        @Path("code") airportIata: String
    ): Response<AeroAirportDelayDto>

    /**
     * Free-text search for global airports by city, name, IATA, or ICAO code.
     */
    @GET("airports/search/term")
    suspend fun searchAirportsByTerm(
        @Query("q") query: String,
        @Query("limit") limit: Int = 10
    ): Response<AeroAirportSearchResponseDto>

    /**
     * Fetch daily direct route statistics and operating carriers from an airport by IATA code.
     */
    @GET("airports/iata/{code}/stats/routes/daily")
    suspend fun getAirportDailyRoutes(
        @Path("code") airportIata: String
    ): Response<AeroRoutesResponseDto>
}

/**
 * Provides a pre-configured Retrofit instance with RapidAPI authentication headers
 * and Moshi JSON serialization.
 */
object AeroDataBoxNetworkClient {

    val moshi: Moshi by lazy {
        Moshi.Builder()
            .addLast(KotlinJsonAdapterFactory())
            .build()
    }

    private val authInterceptor = Interceptor { chain ->
        val original = chain.request()
        val requestBuilder = original.newBuilder()
            .header("Accept", "application/json")

        val key = ApiConfig.aeroDataBoxApiKey
        val host = ApiConfig.aeroDataBoxApiHost
        if (key.isNotBlank()) {
            requestBuilder.header("X-RapidAPI-Key", key)
            requestBuilder.header("X-RapidAPI-Host", host)
        }

        chain.proceed(requestBuilder.build())
    }

    val apiService: AeroDataBoxApiService by lazy {
        val okHttpClient = OkHttpClient.Builder()
            .addInterceptor(authInterceptor)
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(12, TimeUnit.SECONDS)
            .writeTimeout(10, TimeUnit.SECONDS)
            .build()

        Retrofit.Builder()
            .baseUrl(ApiConfig.aeroDataBoxBaseUrl)
            .client(okHttpClient)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
            .create(AeroDataBoxApiService::class.java)
    }
}
