import { describe, expect, it, vi } from "vitest";
import {
  IncompleteOpenMeteoDataError,
  OpenMeteoWeatherService,
  mapToDestinationForecast,
  mapToRealtimeAirportWeather,
} from "../src/services/weatherService.js";

const airport = {
  code: "LHR",
  name: "London Heathrow",
  city: "London",
  latitude: 51.47,
  longitude: -0.4543,
};

const completeDto = {
  latitude: 51.47,
  longitude: -0.4543,
  timezone: "Europe/London",
  current: {
    time: "2026-11-14T12:00",
    temperature_2m: 11.6,
    relative_humidity_2m: 72,
    precipitation: 0,
    weather_code: 3,
    wind_speed_10m: 12.2,
    wind_direction_10m: 225,
    surface_pressure: 1008.4,
    visibility: 20_000,
  },
  hourly: {
    time: Array.from({ length: 10 }, (_, index) => `2026-11-14T${String(8 + index).padStart(2, "0")}:00`),
    temperature_2m: Array.from({ length: 10 }, (_, index) => 9 + index * 0.4),
    precipitation_probability: Array.from({ length: 10 }, (_, index) => index * 5),
    weather_code: Array.from({ length: 10 }, () => 3),
    wind_speed_10m: Array.from({ length: 10 }, () => 10),
  },
  daily: {
    time: ["2026-11-14", "2026-11-15", "2026-11-16"],
    weather_code: [3, 61, 2],
    temperature_2m_max: [13, 12, 14],
    temperature_2m_min: [7, 6, 8],
    precipitation_probability_max: [20, 70, 10],
  },
};

describe("Open-Meteo mapping", () => {
  it("maps a complete current observation", () => {
    const weather = mapToRealtimeAirportWeather("EGLL", completeDto);
    expect(weather).toMatchObject({
      tempC: 12,
      tempF: 54,
      condition: "Overcast",
      wind: "12 kt SW",
      reported: true,
      metarRaw: "",
    });
    expect(weather.flightCategory).toBe("VFR");
    expect(weather.pressureInHg).toBeCloseTo(29.78, 1);
  });

  it("throws rather than substituting placeholder values", () => {
    expect(() =>
      mapToRealtimeAirportWeather("EGLL", {
        current: { temperature_2m: 20 },
      }),
    ).toThrow(IncompleteOpenMeteoDataError);
    expect(() =>
      mapToDestinationForecast(airport, "12:00", {
        current: { temperature_2m: 20 },
      }),
    ).toThrow(/incomplete/i);
  });

  it("keeps non-provider advisory fields explicitly unavailable", () => {
    const forecast = mapToDestinationForecast(airport, "14:00", completeDto);
    expect(forecast.source).toBe("OPEN_METEO");
    expect(forecast.dataAvailable).toBe(true);
    expect(forecast.advisory.crosswindKnots).toBe(0);
    expect(forecast.advisory.crosswindRisk).toBe("Not reported");
    expect(forecast.advisory.runwayVisualRange).toBe("Not reported");
    expect(forecast.advisory.arrivalNotice).toMatch(/not an operational observation/i);
    expect(forecast.hourlyForecast.length).toBeGreaterThan(0);
    expect(forecast.hourlyForecast.some((hour) => hour.isArrivalTarget)).toBe(true);
    expect(forecast.dailyForecast).toHaveLength(3);
  });

  it("caches forecasts and falls back to cache on failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => completeDto,
    } as Response);
    const service = new OpenMeteoWeatherService({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      ttlMs: 60_000,
      now: () => Date.parse("2026-11-14T12:00:00Z"),
    });
    const first = await service.getDestinationForecast(airport, "14:00");
    expect(first.source).toBe("OPEN_METEO");
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const cached = await service.getDestinationForecast(airport, "14:00");
    expect(cached).toEqual(first);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    fetchImpl.mockRejectedValueOnce(new Error("offline"));
    const fallback = await service.getDestinationForecast(airport, "14:00", {
      forceRefresh: true,
    });
    expect(fallback.source).toBe("CACHE");
  });
});
