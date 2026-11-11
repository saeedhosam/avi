import { NextResponse } from "next/server";
import type { Airport } from "@/lib/types";
import { mapOpenMeteoToForecast } from "@/lib/weather";

function finiteParam(value: string | null): number | null {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = finiteParam(searchParams.get("lat"));
  const lon = finiteParam(searchParams.get("lon"));
  const code = (searchParams.get("code") ?? "").trim().toUpperCase();
  const arrival = (searchParams.get("arrival") ?? "").trim();
  const date = (searchParams.get("date") ?? "").trim();

  if (lat == null || lon == null || !/^[A-Z]{3}$/.test(code)) {
    return NextResponse.json(
      {
        live: false,
        error:
          "A valid latitude, longitude, and 3-letter airport code are required.",
      },
      { status: 400 },
    );
  }
  if (!/^\d{1,2}:\d{2}$/.test(arrival)) {
    return NextResponse.json(
      { live: false, error: "A valid arrival time (HH:MM) is required." },
      { status: 400 },
    );
  }
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { live: false, error: "A valid arrival date (YYYY-MM-DD) is required." },
      { status: 400 },
    );
  }

  const airport: Airport = {
    code,
    name: searchParams.get("name") ?? code,
    city: searchParams.get("city") ?? "",
    country: searchParams.get("country") ?? "",
    timezone: "auto",
    latitude: lat,
    longitude: lon,
    // Weather values are intentionally empty placeholders; the forecast
    // mapper must not use them as observations.
    weather: {
      tempC: 0,
      tempF: 0,
      condition: "",
      wind: "",
      visibility: "",
      humidity: 0,
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
    const forecast = mapOpenMeteoToForecast(airport, arrival, data, date || undefined);
    return NextResponse.json({
      live: true,
      forecast,
      fetchedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      {
        live: false,
        error:
          "Open-Meteo arrival weather is temporarily unavailable. No estimated forecast is substituted.",
      },
      { status: 502 },
    );
  }
}
