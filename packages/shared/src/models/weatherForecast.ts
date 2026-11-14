import { z } from "zod";

export const WEATHER_CATEGORIES = [
  "CLEAR",
  "CLOUDY",
  "OVERCAST",
  "RAIN",
  "THUNDERSTORM",
  "FOG",
  "SNOW",
] as const;
export type WeatherCategory = (typeof WEATHER_CATEGORIES)[number];

export const WEATHER_CATEGORY_LABELS: Record<WeatherCategory, string> = {
  CLEAR: "Clear Sky",
  CLOUDY: "Partly Cloudy",
  OVERCAST: "Overcast",
  RAIN: "Rain / Showers",
  THUNDERSTORM: "Thunderstorms",
  FOG: "Fog / Mist",
  SNOW: "Snow / Freezing Rain",
};

export interface HourlyForecast {
  time: string;
  tempC: number;
  tempF: number;
  condition: string;
  precipProbabilityPercent: number;
  windSpeedKnots: number;
  isArrivalTarget: boolean;
}

export const hourlyForecastSchema: z.ZodType<HourlyForecast> = z.object({
  time: z.string(),
  tempC: z.number().finite(),
  tempF: z.number().finite(),
  condition: z.string(),
  precipProbabilityPercent: z.number().min(0).max(100),
  windSpeedKnots: z.number().finite(),
  isArrivalTarget: z.boolean(),
});

export interface DailyForecast {
  dayName: string;
  dateString: string;
  tempHighC: number;
  tempHighF: number;
  tempLowC: number;
  tempLowF: number;
  condition: string;
  precipProbabilityPercent: number;
  packingTip: string;
}

export const dailyForecastSchema: z.ZodType<DailyForecast> = z.object({
  dayName: z.string(),
  dateString: z.string(),
  tempHighC: z.number().finite(),
  tempHighF: z.number().finite(),
  tempLowC: z.number().finite(),
  tempLowF: z.number().finite(),
  condition: z.string(),
  precipProbabilityPercent: z.number().min(0).max(100),
  packingTip: z.string(),
});

export interface ArrivalAviationAdvisory {
  flightCategory: string;
  crosswindKnots: number;
  crosswindRisk: string;
  runwayVisualRange: string;
  arrivalNotice: string;
}

export const arrivalAviationAdvisorySchema: z.ZodType<ArrivalAviationAdvisory> =
  z.object({
    flightCategory: z.string(),
    crosswindKnots: z.number().finite(),
    crosswindRisk: z.string(),
    runwayVisualRange: z.string(),
    arrivalNotice: z.string(),
  });

export interface DestinationArrivalForecast {
  airportCode: string;
  airportName: string;
  airportCity: string;
  arrivalTime: string;
  arrivalTempC: number;
  arrivalTempF: number;
  arrivalCondition: string;
  precipitationChance: number;
  windCondition: string;
  visibility: string;
  humidity: number;
  hourlyForecast: HourlyForecast[];
  dailyForecast: DailyForecast[];
  advisory: ArrivalAviationAdvisory;
  packingAdvice: string;
  lastUpdated: number;
  /** False when no live/cached forecast exists; numeric fields are placeholders. */
  dataAvailable: boolean;
  source: "OPEN_METEO" | "CACHE" | "NONE";
}

export const destinationArrivalForecastSchema: z.ZodType<DestinationArrivalForecast> =
  z.object({
    airportCode: z.string().length(3),
    airportName: z.string(),
    airportCity: z.string(),
    arrivalTime: z.string(),
    arrivalTempC: z.number().finite(),
    arrivalTempF: z.number().finite(),
    arrivalCondition: z.string(),
    precipitationChance: z.number().min(0).max(100),
    windCondition: z.string(),
    visibility: z.string(),
    humidity: z.number().min(0).max(100),
    hourlyForecast: z.array(hourlyForecastSchema),
    dailyForecast: z.array(dailyForecastSchema),
    advisory: arrivalAviationAdvisorySchema,
    packingAdvice: z.string(),
    lastUpdated: z.number().finite(),
    dataAvailable: z.boolean(),
    source: z.enum(["OPEN_METEO", "CACHE", "NONE"]),
  });
