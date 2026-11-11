import { NextResponse } from "next/server";
import { routeAirports } from "@/lib/data";
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
  const labels = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];
  return labels[Math.round(degrees / 22.5) % 16];
}

function flightCategory(
  visibilityMeters: number,
  weatherCode: number,
): "VFR" | "MVFR" | "IFR" | "UNKNOWN" {
  const category = determineFlightCategory(visibilityMeters, weatherCode);
  if (category.startsWith("IFR")) return "IFR";
  if (category.startsWith("MVFR")) return "MVFR";
  if (category.startsWith("VFR")) return "VFR";
  return "UNKNOWN";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requested = (searchParams.get("codes") ?? "")
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);

  if (!requested.length) {
    return NextResponse.json(
      { live: false, weather: {}, error: "At least one airport code is required." },
      { status: 400 },
    );
  }
  if (requested.length > 4) {
    return NextResponse.json(
      { live: false, weather: {}, error: "At most four airport codes are allowed." },
      { status: 400 },
    );
  }

  const codes = routeAirports.filter((airport) =>
    requested.includes(airport.iata),
  );
  const missing = requested.filter(
    (code) => !codes.some((airport) => airport.iata === code),
  );
  if (!codes.length) {
    return NextResponse.json(
      {
        live: false,
        weather: {},
        error: `Unknown airport code${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`,
      },
      { status: 404 },
    );
  }

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set(
    "latitude",
    codes.map((airport) => airport.latitude).join(","),
  );
  url.searchParams.set(
    "longitude",
    codes.map((airport) => airport.longitude).join(","),
  );
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
    let omitted = 0;

    codes.forEach((airport, index) => {
      const current: OpenMeteoCurrent | undefined = results[index]?.current;
      // Only publish a complete observation. Missing fields are never
      // converted into calm/VFR defaults.
      if (
        !current ||
        current.temperature_2m == null ||
        current.relative_humidity_2m == null ||
        current.weather_code == null ||
        current.wind_speed_10m == null ||
        current.wind_direction_10m == null ||
        current.surface_pressure == null ||
        current.visibility == null
      ) {
        omitted += 1;
        return;
      }

      const tempC = Math.round(current.temperature_2m);
      const tempF = Math.round((tempC * 9) / 5 + 32);
      const humidity = Math.round(current.relative_humidity_2m);
      const windSpeed = Math.round(current.wind_speed_10m);
      const windDirection = Math.round(current.wind_direction_10m);
      const visibilityMeters = current.visibility;
      const visibilityMiles = visibilityMeters / 1609.34;
      const pressureHpa = current.surface_pressure;
      const condition = conditionFromWmo(current.weather_code);

      weather[airport.iata] = {
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
        flightCategory: flightCategory(
          visibilityMeters,
          current.weather_code,
        ),
      };
    });

    if (!Object.keys(weather).length) {
      return NextResponse.json(
        {
          live: false,
          weather: {},
          error:
            "Open-Meteo returned incomplete current conditions for the requested airports.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      live: true,
      weather,
      fetchedAt: new Date().toISOString(),
      omitted,
      ...(missing.length
        ? { error: `Unknown airport code(s): ${missing.join(", ")}` }
        : {}),
    });
  } catch {
    return NextResponse.json(
      {
        live: false,
        weather: {},
        error: "Open-Meteo current conditions are temporarily unavailable.",
      },
      { status: 502 },
    );
  }
}
