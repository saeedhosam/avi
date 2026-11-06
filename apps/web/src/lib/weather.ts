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
  return WMO_CONDITIONS[code ?? 0] ?? "Fair / Clear";
}

export function determineFlightCategory(
  visibilityMeters: number | null | undefined,
  wmoCode: number | null | undefined,
) {
  const visMiles = (visibilityMeters ?? 16000) / 1609.34;
  const code = wmoCode ?? 0;
  if (visMiles < 3 || [45, 48, 65, 95, 96, 99].includes(code)) {
    return "IFR (Instrument Flight Rules)";
  }
  if (visMiles < 5 || [51, 53, 55, 61, 63, 71, 73, 80, 81].includes(code)) {
    return "MVFR (Marginal VFR)";
  }
  return "VFR (Visual Flight Rules)";
}

function parseArrivalHour(arrivalTime: string) {
  const match = arrivalTime.match(/(\d{1,2}):(\d{2})/);
  if (!match) return 12;
  const hour = Number(match[1]);
  if (!Number.isFinite(hour)) return 12;
  return Math.min(23, Math.max(0, hour));
}

function crosswindFor(code: string) {
  const map: Record<string, number> = {
    SFO: 16,
    LHR: 14,
    ORD: 18,
    HND: 11,
    JFK: 12,
    DXB: 7,
    CAI: 9,
    CDG: 10,
  };
  return map[code] ?? 8;
}

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
): DestinationArrivalForecast {
  const arrivalHour = parseArrivalHour(arrivalTime);
  const hourlyTimes = data.hourly?.time ?? [];
  let arrivalIndex = hourlyTimes.findIndex((time) => {
    const hour = Number(time.slice(11, 13));
    return hour === arrivalHour;
  });
  if (arrivalIndex < 0) arrivalIndex = 0;

  const hourlyTemps = data.hourly?.temperature_2m ?? [];
  const hourlyPrecip = data.hourly?.precipitation_probability ?? [];
  const hourlyCodes = data.hourly?.weather_code ?? [];
  const hourlyWind = data.hourly?.wind_speed_10m ?? [];

  const hourlyForecast: HourlyForecast[] = [];
  for (let offset = -1; offset <= 5; offset += 1) {
    const index = Math.min(
      Math.max(0, arrivalIndex + offset),
      Math.max(0, hourlyTimes.length - 1),
    );
    if (!hourlyTimes.length) break;
    const tempC = Math.round(hourlyTemps[index] ?? data.current?.temperature_2m ?? airport.weather.tempC);
    hourlyForecast.push({
      time:
        hourlyTimes[index]?.slice(11, 16) ??
        `${String(arrivalHour).padStart(2, "0")}:00`,
      tempC,
      tempF: Math.round((tempC * 9) / 5 + 32),
      condition: conditionFromWmo(hourlyCodes[index]),
      precipProbabilityPercent: Math.round(hourlyPrecip[index] ?? 0),
      windSpeedKnots: Math.round(hourlyWind[index] ?? 10),
      isArrivalTarget: offset === 0,
    });
  }

  if (!hourlyForecast.length) {
    hourlyForecast.push({
      time: arrivalTime,
      tempC: airport.weather.tempC,
      tempF: airport.weather.tempF,
      condition: airport.weather.condition,
      precipProbabilityPercent: 10,
      windSpeedKnots: 10,
      isArrivalTarget: true,
    });
  }

  const dailyTimes = data.daily?.time ?? [];
  const dailyCodes = data.daily?.weather_code ?? [];
  const dailyMax = data.daily?.temperature_2m_max ?? [];
  const dailyMin = data.daily?.temperature_2m_min ?? [];
  const dailyPrecip = data.daily?.precipitation_probability_max ?? [];

  const dailyForecast: DailyForecast[] = dailyTimes.slice(0, 4).map((date, index) => {
    const high = Math.round(dailyMax[index] ?? airport.weather.tempC + 3);
    const low = Math.round(dailyMin[index] ?? airport.weather.tempC - 4);
    const precip = Math.round(dailyPrecip[index] ?? 0);
    const condition = conditionFromWmo(dailyCodes[index]);
    return {
      dayName: formatDay(date, index),
      dateString: new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      tempHighC: high,
      tempHighF: Math.round((high * 9) / 5 + 32),
      tempLowC: low,
      tempLowF: Math.round((low * 9) / 5 + 32),
      condition,
      precipProbabilityPercent: precip,
      packingTip: packingAdviceFor(low, precip, condition),
    };
  });

  const target = hourlyForecast.find((hour) => hour.isArrivalTarget) ?? hourlyForecast[0];
  const visibilityMeters = data.current?.visibility;
  const category = determineFlightCategory(
    visibilityMeters,
    data.current?.weather_code,
  );
  const crosswindKnots = crosswindFor(airport.code);
  const windDirection = data.current?.wind_direction_10m ?? 270;
  const windSpeed = Math.round(data.current?.wind_speed_10m ?? 10);
  const humidity = Math.round(
    data.current?.relative_humidity_2m ?? airport.weather.humidity,
  );
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
    visibility:
      visibilityMeters != null
        ? `${(visibilityMeters / 1609.34).toFixed(1)} mi`
        : airport.weather.visibility,
    humidity,
    hourlyForecast,
    dailyForecast,
    advisory: {
      flightCategory: category,
      crosswindKnots,
      crosswindRisk:
        crosswindKnots >= 18
          ? "Moderate crosswind caution"
          : crosswindKnots >= 12
            ? "Standard approach winds"
            : "Light crosswinds · smooth final",
      runwayVisualRange:
        category.startsWith("IFR")
          ? "RVR 1,800–2,600 ft"
          : category.startsWith("MVFR")
            ? "RVR 3,200–4,500 ft"
            : "RVR > 6,000 ft",
      arrivalNotice:
        precip >= 60
          ? "Expect reduced arrival spacing and possible gate holding during precipitation."
          : category.startsWith("IFR")
            ? "Low-visibility approach procedures active. Taxi-in may take longer than scheduled."
            : "Normal arrival operations expected. Gate and baggage timing on profile.",
    },
    packingAdvice: packingAdviceFor(
      target.tempC,
      precip,
      condition,
    ),
    lastUpdated: Date.now(),
    isEstimated: false,
  };
}

export function generateFallbackForecast(
  airport: Airport,
  arrivalTime: string,
): DestinationArrivalForecast {
  const arrivalHour = parseArrivalHour(arrivalTime);
  const isNight = arrivalHour < 6 || arrivalHour > 21;
  const adjustment = isNight ? -3 : 1;
  const base = airport.weather;
  const arrivalTempC = base.tempC + adjustment;
  const arrivalTempF = Math.round((arrivalTempC * 9) / 5 + 32);
  const conditionLower = base.condition.toLowerCase();
  const precipChance = conditionLower.includes("rain") || conditionLower.includes("drizzle")
    ? 75
    : conditionLower.includes("thunder")
      ? 90
      : conditionLower.includes("fog")
        ? 40
        : conditionLower.includes("cloud")
          ? 20
          : 5;
  const category = conditionLower.includes("thunder")
    ? "IFR (Instrument Flight Rules)"
    : conditionLower.includes("fog") || conditionLower.includes("rain")
      ? "MVFR (Marginal VFR)"
      : "VFR (Visual Flight Rules)";
  const crosswind = crosswindFor(airport.code);

  const hourlyForecast: HourlyForecast[] = Array.from({ length: 6 }, (_, index) => {
    const hour = (arrivalHour + index - 1 + 24) % 24;
    const temp = arrivalTempC + (index % 3) - 1;
    return {
      time: `${String(hour).padStart(2, "0")}:00`,
      tempC: temp,
      tempF: Math.round((temp * 9) / 5 + 32),
      condition: base.condition,
      precipProbabilityPercent: Math.max(0, precipChance - index * 4),
      windSpeedKnots: 8 + index * 2,
      isArrivalTarget: index === 1,
    };
  });

  const dailyForecast: DailyForecast[] = Array.from({ length: 4 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    const high = base.tempC + 3 - index;
    const low = base.tempC - 4 - index;
    return {
      dayName: index === 0 ? "Today" : date.toLocaleDateString("en-US", { weekday: "short" }),
      dateString: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      tempHighC: high,
      tempHighF: Math.round((high * 9) / 5 + 32),
      tempLowC: low,
      tempLowF: Math.round((low * 9) / 5 + 32),
      condition: base.condition,
      precipProbabilityPercent: precipChance,
      packingTip: packingAdviceFor(low, precipChance, base.condition),
    };
  });

  return {
    airportCode: airport.code,
    airportName: airport.name,
    airportCity: airport.city,
    arrivalTime,
    arrivalTempC,
    arrivalTempF,
    arrivalCondition: base.condition,
    precipitationChance: precipChance,
    windCondition: base.wind,
    visibility: base.visibility,
    humidity: base.humidity,
    hourlyForecast,
    dailyForecast,
    advisory: {
      flightCategory: category,
      crosswindKnots: crosswind,
      crosswindRisk:
        crosswind >= 18
          ? "Moderate crosswind caution"
          : crosswind >= 12
            ? "Standard approach winds"
            : "Light crosswinds · smooth final",
      runwayVisualRange: category.startsWith("IFR")
        ? "RVR 1,800–2,600 ft"
        : "RVR > 6,000 ft",
      arrivalNotice:
        precipChance >= 60
          ? "Precipitation may reduce arrival throughput. Monitor gate assignments."
          : "Normal arrival operations expected.",
    },
    packingAdvice: packingAdviceFor(arrivalTempC, precipChance, base.condition),
    lastUpdated: Date.now(),
    // This path is used when the Open-Meteo call fails: it models conditions
    // from cached values, so the UI must never present it as live data.
    isEstimated: true,
  };
}

export async function fetchDestinationForecast(
  airport: Airport,
  arrivalTime: string,
): Promise<DestinationArrivalForecast> {
  try {
    const params = new URLSearchParams({
      lat: String(airport.latitude),
      lon: String(airport.longitude),
      code: airport.code,
      name: airport.name,
      city: airport.city,
      aircraft: airport.country,
      arrival: arrivalTime,
      tempC: String(airport.weather.tempC),
      tempF: String(airport.weather.tempF),
      condition: airport.weather.condition,
      wind: airport.weather.wind,
      visibility: airport.weather.visibility,
      humidity: String(airport.weather.humidity),
    });
    const response = await fetch(`/api/weather?${params.toString()}`);
    if (!response.ok) throw new Error("Weather request failed");
    const data = (await response.json()) as { forecast: DestinationArrivalForecast };
    return data.forecast;
  } catch {
    return generateFallbackForecast(airport, arrivalTime);
  }
}
