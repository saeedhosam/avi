import { NextResponse } from "next/server";
import { realtimeAirports } from "@/lib/data";
import { conditionFromWmo, determineFlightCategory } from "@/lib/weather";

interface OpenMeteoCurrent {
  temperature_2m?: number;
  relative_humidity_2m?: number;
  weather_code?: number;
  wind_speed_10m?: number;
  wind_direction_10m?: number;
  surface_pressure?: number;
  visibility?: number;
}

function directionLabel(degrees: number) {
  const labels = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return labels[Math.round(degrees / 22.5) % 16];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requested = (searchParams.get("codes") ?? "")
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);
  const codes = requested.length
    ? realtimeAirports.filter((airport) => requested.includes(airport.code))
    : realtimeAirports;

  if (!codes.length) {
    return NextResponse.json({ live: false, weather: {} });
  }

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", codes.map((airport) => airport.latitude).join(","));
  url.searchParams.set("longitude", codes.map((airport) => airport.longitude).join(","));
  url.searchParams.set(
    "current",
    "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,visibility",
  );
  url.searchParams.set("wind_speed_unit", "kn");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "1");

  try {
    const response = await fetch(url, {
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Open-Meteo ${response.status}`);
    const data = await response.json();
    const results = Array.isArray(data) ? data : [data];
    const weather: Record<string, unknown> = {};

    codes.forEach((airport, index) => {
      const current: OpenMeteoCurrent | undefined = results[index]?.current;
      if (!current) return;
      const tempC = Math.round(current.temperature_2m ?? airport.weather.tempC);
      const tempF = Math.round((tempC * 9) / 5 + 32);
      const humidity = Math.round(
        current.relative_humidity_2m ?? airport.weather.humidity,
      );
      const windSpeed = Math.round(current.wind_speed_10m ?? 10);
      const windDirection = Math.round(current.wind_direction_10m ?? 270);
      const visibilityMeters = current.visibility ?? 16000;
      const visibilityMiles = visibilityMeters / 1609.34;
      const pressureHpa = current.surface_pressure ?? 1013.25;
      const condition = conditionFromWmo(current.weather_code);
      const category = determineFlightCategory(visibilityMeters, current.weather_code);

      weather[airport.code] = {
        tempC,
        tempF,
        condition,
        wind: `${windSpeed} kt ${directionLabel(windDirection)}`,
        visibility:
          visibilityMiles >= 10
            ? "10+ mi"
            : `${visibilityMiles.toFixed(1)} mi`,
        humidity,
        pressureInHg: Math.round(pressureHpa * 0.02953 * 100) / 100,
        flightCategory: category.startsWith("IFR")
          ? "IFR"
          : category.startsWith("MVFR")
            ? "MVFR"
            : "VFR",
        metarRaw: `${airport.weather.metarRaw} · LIVE ${condition.toUpperCase()} ${tempC}C ${windSpeed}KT`,
      };
    });

    return NextResponse.json({ live: true, weather });
  } catch {
    return NextResponse.json({ live: false, weather: {} });
  }
}
