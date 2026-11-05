import { NextResponse } from "next/server";
import type { Airport } from "@/lib/types";
import {
  generateFallbackForecast,
  mapOpenMeteoToForecast,
} from "@/lib/weather";


function numberParam(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = numberParam(searchParams.get("lat"), 0);
  const lon = numberParam(searchParams.get("lon"), 0);
  const code = (searchParams.get("code") ?? "JFK").toUpperCase();
  const arrival = searchParams.get("arrival") ?? "12:00";

  const airport: Airport = {
    code,
    name: searchParams.get("name") ?? code,
    city: searchParams.get("city") ?? "",
    country: searchParams.get("country") ?? "",
    timezone: "auto",
    latitude: lat,
    longitude: lon,
    weather: {
      tempC: numberParam(searchParams.get("tempC"), 20),
      tempF: numberParam(searchParams.get("tempF"), 68),
      condition: searchParams.get("condition") ?? "Partly Cloudy",
      wind: searchParams.get("wind") ?? "10 kt",
      visibility: searchParams.get("visibility") ?? "10+ mi",
      humidity: numberParam(searchParams.get("humidity"), 60),
    },
  };

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set(
    "current",
    "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,visibility",
  );
  url.searchParams.set(
    "hourly",
    "temperature_2m,precipitation_probability,weather_code,wind_speed_10m",
  );
  url.searchParams.set(
    "daily",
    "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
  );
  url.searchParams.set("wind_speed_unit", "kn");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "4");

  try {
    const response = await fetch(url, {
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(9000),
    });
    if (!response.ok) throw new Error(`Open-Meteo ${response.status}`);
    const data = await response.json();
    return NextResponse.json({
      live: true,
      forecast: mapOpenMeteoToForecast(airport, arrival, data),
    });
  } catch {
    return NextResponse.json({
      live: false,
      forecast: generateFallbackForecast(airport, arrival),
    });
  }
}
