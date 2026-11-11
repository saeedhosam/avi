import type {
  Airport,
  DailyForecast,
  DestinationArrivalForecast,
  HourlyForecast,
} from "./types";

const WMO_CONDITIONS: Record<number, string> = {
  0: "Clear Sky",
  1: "Mainly Clear",
  2: "Partly Cloudy",
  3: "Overcast",
  45: "Fog / Low Visibility",
  48: "Fog / Low Visibility",
  51: "Light Drizzle",
  53: "Light Drizzle",
  55: "Light Drizzle",
  56: "Freezing Drizzle",
  57: "Freezing Drizzle",
  61: "Rain Showers",
  63: "Rain Showers",
  65: "Heavy Rain",
  66: "Freezing Rain",
  67: "Freezing Rain",
  71: "Snow / Flurries",
  73: "Snow / Flurries",
  75: "Snow / Flurries",
  77: "Snow / Flurries",
  80: "Scattered Showers",
  81: "Scattered Showers",
  82: "Heavy Rain",
  85: "Snow / Flurries",
  86: "Snow / Flurries",
  95: "Thunderstorms",
  96: "Thunderstorms",
  99: "Thunderstorms",
};

export function conditionFromWmo(code: number | null | undefined) {
  if (code == null) return "Not reported";
  return WMO_CONDITIONS[code] ?? "Unknown condition";
}

export function determineFlightCategory(
  visibilityMeters: number | null | undefined,
  wmoCode: number | null | undefined,
) {
  // Without visibility or a weather code there is no honest flight category.
  if (visibilityMeters == null && wmoCode == null) return "Not reported";
  const visMiles =
    visibilityMeters != null ? visibilityMeters / 1609.34 : null;
  const code = wmoCode ?? null;
  if (
    (visMiles != null && visMiles < 3) ||
    (code != null && [45, 48, 65, 95, 96, 99].includes(code))
  ) {
    return "IFR (Instrument Flight Rules)";
  }
  if (
    (visMiles != null && visMiles < 5) ||
    (code != null && [51, 53, 55, 61, 63, 71, 73, 80, 81].includes(code))
  ) {
    return "MVFR (Marginal VFR)";
  }
  if (visMiles != null) return "VFR (Visual Flight Rules)";
  return "Not reported";
}

function parseArrivalHour(arrivalTime: string) {
  const match = arrivalTime.match(/(\d{1,2}):(\d{2})/);
  if (!match) return 12;
  const hour = Number(match[1]);
  if (!Number.isFinite(hour)) return 12;
  return Math.min(23, Math.max(0, hour));
}

// Crosswind, runway visual range, and operational arrival notices are not
// exposed by Open-Meteo. They are reported as unavailable rather than guessed.

function packingAdviceFor(
  tempC: number,
  precipChance: number,
  condition: string,
) {
  if (condition.toLowerCase().includes("snow") || tempC <= 3) {
    return "Thermal layers, insulated coat, and gloves recommended. Allow extra deplaning time for cold-weather operations.";
  }
  if (precipChance >= 65) {
    return "Pack a compact umbrella and water-resistant outer layer. Expect wet apron conditions and possible arrival delays.";
  }
  if (precipChance >= 35) {
    return "A light rain shell is advisable. Conditions may shift during descent, so keep a layer accessible.";
  }
  if (tempC >= 30) {
    return "Breathable clothing, hydration, and sun protection recommended. Terminal cooling may be strained during peak hours.";
  }
  if (tempC <= 12) {
    return "Bring a warm mid-layer for the arrival terminal and onward transit. Evening temperatures may drop quickly.";
  }
  return "Comfortable travel layers are sufficient. No significant weather preparation required for arrival.";
}

function formatDay(dateString: string, index: number) {
  if (index === 0) return "Today";
  const date = new Date(`${dateString}T12:00:00`);
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

interface OpenMeteoPayload {
  current?: {
    temperature_2m?: number;
    relative_humidity_2m?: number;
    precipitation?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
    surface_pressure?: number;
    visibility?: number;
    time?: string;
  };
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    precipitation_probability?: number[];
    weather_code?: number[];
    wind_speed_10m?: number[];
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
  };
  timezone?: string;
}

export function mapOpenMeteoToForecast(
  airport: Airport,
  arrivalTime: string,
  data: OpenMeteoPayload,
  arrivalDate?: string,
): DestinationArrivalForecast {
  const arrivalHour = parseArrivalHour(arrivalTime);
  const hourly = data.hourly;
  const current = data.current;
  if (
    !current ||
    current.temperature_2m == null ||
    current.relative_humidity_2m == null ||
    current.wind_speed_10m == null ||
    current.wind_direction_10m == null ||
    current.visibility == null ||
    current.weather_code == null ||
    !hourly?.time?.length ||
    !hourly.temperature_2m?.length ||
    !hourly.precipitation_probability?.length ||
    !hourly.weather_code?.length ||
    !hourly.wind_speed_10m?.length
  ) {
    throw new Error("Open-Meteo returned incomplete forecast fields.");
  }

  const arrivalIndex = hourly.time.findIndex((time) => {
    if (arrivalDate && !time.startsWith(arrivalDate)) return false;
    const hour = Number(time.slice(11, 13));
    return hour === arrivalHour;
  });
  if (arrivalIndex < 0) {
    throw new Error("Open-Meteo has no hourly forecast for the arrival time.");
  }

  const hourlyForecast: HourlyForecast[] = [];
  for (let offset = -1; offset <= 5; offset += 1) {
    const index = arrivalIndex + offset;
    if (index < 0 || index >= hourly.time.length) continue;
    const tempC = hourly.temperature_2m[index];
    const precip = hourly.precipitation_probability[index];
    const code = hourly.weather_code[index];
    const wind = hourly.wind_speed_10m[index];
    if (
      tempC == null ||
      precip == null ||
      code == null ||
      wind == null
    ) {
      throw new Error("Open-Meteo returned an incomplete hourly row.");
    }
    hourlyForecast.push({
      time: hourly.time[index].slice(11, 16),
      tempC: Math.round(tempC),
      tempF: Math.round((tempC * 9) / 5 + 32),
      condition: conditionFromWmo(code),
      precipProbabilityPercent: Math.round(precip),
      windSpeedKnots: Math.round(wind),
      isArrivalTarget: offset === 0,
    });
  }
  if (!hourlyForecast.length) {
    throw new Error("Open-Meteo has no usable hourly forecast.");
  }

  const dailyTimes = data.daily?.time ?? [];
  const dailyCodes = data.daily?.weather_code ?? [];
  const dailyMax = data.daily?.temperature_2m_max ?? [];
  const dailyMin = data.daily?.temperature_2m_min ?? [];
  const dailyPrecip = data.daily?.precipitation_probability_max ?? [];
  const dailyForecast: DailyForecast[] = dailyTimes
    .slice(0, 4)
    .flatMap((date, index) => {
      const high = dailyMax[index];
      const low = dailyMin[index];
      const precip = dailyPrecip[index];
      const code = dailyCodes[index];
      if (high == null || low == null || precip == null || code == null) {
        return [];
      }
      const condition = conditionFromWmo(code);
      return [
        {
          dayName: formatDay(date, index),
          dateString: new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          tempHighC: Math.round(high),
          tempHighF: Math.round((high * 9) / 5 + 32),
          tempLowC: Math.round(low),
          tempLowF: Math.round((low * 9) / 5 + 32),
          condition,
          precipProbabilityPercent: Math.round(precip),
          packingTip: packingAdviceFor(low, precip, condition),
        },
      ];
    });

  const target = hourlyForecast.find((hour) => hour.isArrivalTarget) ?? hourlyForecast[0];
  const visibilityMeters = current.visibility;
  const category = determineFlightCategory(
    visibilityMeters,
    current.weather_code,
  );
  const windDirection = Math.round(current.wind_direction_10m);
  const windSpeed = Math.round(current.wind_speed_10m);
  const humidity = Math.round(current.relative_humidity_2m);
  const precip = Math.round(target.precipProbabilityPercent);
  const condition = target.condition;

  return {
    airportCode: airport.code,
    airportName: airport.name,
    airportCity: airport.city,
    arrivalTime,
    arrivalTempC: target.tempC,
    arrivalTempF: target.tempF,
    arrivalCondition: condition,
    precipitationChance: precip,
    windCondition: `${windSpeed} kt from ${windDirection}°`,
    visibility: `${(visibilityMeters / 1609.34).toFixed(1)} mi`,
    humidity,
    hourlyForecast,
    dailyForecast,
    advisory: {
      flightCategory: category,
      // Open-Meteo does not provide runway heading, crosswind components,
      // RVR, or operational arrival notices. These stay unavailable.
      crosswindKnots: null,
      crosswindRisk: null,
      runwayVisualRange: null,
      arrivalNotice: null,
    },
    packingAdvice: packingAdviceFor(target.tempC, precip, condition),
    lastUpdated: Date.now(),
    isEstimated: false,
  };
}

export async function fetchDestinationForecast(
  airport: Airport,
  arrivalTime: string,
  arrivalDate?: string,
): Promise<DestinationArrivalForecast> {
  if (!/^\d{1,2}:\d{2}$/.test(arrivalTime)) {
    throw new Error(
      "The provider did not report a usable estimated arrival time, so no arrival forecast is shown.",
    );
  }
  const params = new URLSearchParams({
    lat: String(airport.latitude),
    lon: String(airport.longitude),
    code: airport.code,
    name: airport.name,
    city: airport.city,
    country: airport.country,
    arrival: arrivalTime,
    ...(arrivalDate ? { date: arrivalDate } : {}),
  });
  const response = await fetch(`/api/weather?${params.toString()}`, {
    cache: "no-store",
  });
  const data = (await response.json().catch(() => null)) as
    | { forecast?: DestinationArrivalForecast; error?: string }
    | null;
  if (!response.ok || !data?.forecast) {
    throw new Error(
      data?.error ?? "Open-Meteo arrival weather is temporarily unavailable.",
    );
  }
  return data.forecast;
}
