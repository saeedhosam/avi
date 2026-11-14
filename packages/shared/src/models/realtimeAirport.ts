import { z } from "zod";

export const FLIGHT_CATEGORIES = ["VFR", "MVFR", "IFR"] as const;
export type FlightCategory = (typeof FLIGHT_CATEGORIES)[number];

export const FLIGHT_CATEGORY_LABELS: Record<FlightCategory, string> = {
  VFR: "VFR · Visual",
  MVFR: "MVFR · Marginal",
  IFR: "IFR · Low Vis",
};

export interface RealtimeAirportWeather {
  tempC: number;
  tempF: number;
  condition: string;
  wind: string;
  visibility: string;
  humidity: number;
  pressureInHg: number;
  /** Never synthesized: empty when no METAR feed is configured. */
  metarRaw: string;
  flightCategory: FlightCategory;
  reportTime?: string;
  /** False when these values are placeholders, not an observation. */
  reported: boolean;
}

export const realtimeAirportWeatherSchema: z.ZodType<RealtimeAirportWeather> =
  z.object({
    tempC: z.number().finite(),
    tempF: z.number().finite(),
    condition: z.string(),
    wind: z.string(),
    visibility: z.string(),
    humidity: z.number().finite(),
    pressureInHg: z.number().finite(),
    metarRaw: z.string(),
    flightCategory: z.enum(FLIGHT_CATEGORIES),
    reportTime: z.string().optional(),
    reported: z.boolean(),
  });

export interface RealtimeAirportInfo {
  code: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  region: string;
  timezone: string;
  latitude: number;
  longitude: number;
  elevationFeet: number;
  operationalStatus: string;
  /** False when operational status/delay were not reported by a provider. */
  statusReported: boolean;
  isDelayed: boolean;
  delayMinutes: number;
  delayReason: string | null;
  onTimePercentage: number;
  activeDeparturesCount: number;
  activeArrivalsCount: number;
  activeRunways: string[];
  terminalCount: number;
  weather: RealtimeAirportWeather;
  hubAirlines: string[];
}

export const realtimeAirportInfoSchema: z.ZodType<RealtimeAirportInfo> =
  z.object({
    code: z.string().length(3),
    icao: z.string(),
    name: z.string(),
    city: z.string(),
    country: z.string(),
    region: z.string(),
    timezone: z.string(),
    latitude: z.number().finite(),
    longitude: z.number().finite(),
    elevationFeet: z.number().finite(),
    operationalStatus: z.string(),
    statusReported: z.boolean(),
    isDelayed: z.boolean(),
    delayMinutes: z.number().finite(),
    delayReason: z.string().nullable(),
    onTimePercentage: z.number().min(0).max(100),
    activeDeparturesCount: z.number().int().nonnegative(),
    activeArrivalsCount: z.number().int().nonnegative(),
    activeRunways: z.array(z.string()),
    terminalCount: z.number().int().nonnegative(),
    weather: realtimeAirportWeatherSchema,
    hubAirlines: z.array(z.string()),
  });
