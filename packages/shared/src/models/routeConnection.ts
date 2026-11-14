import { z } from "zod";

export const ROUTE_REGIONS = [
  "ALL",
  "MENA",
  "EUROPE",
  "AFRICA",
  "ASIA_PACIFIC",
  "AMERICAS",
] as const;
export type RouteRegion = (typeof ROUTE_REGIONS)[number];

export const HAUL_CATEGORIES = [
  "ALL",
  "SHORT_HAUL",
  "MEDIUM_HAUL",
  "LONG_HAUL",
] as const;
export type HaulCategory = (typeof HAUL_CATEGORIES)[number];

export const CONNECTION_DIRECTIONS = [
  "ALL",
  "DEPARTURES",
  "ARRIVALS",
] as const;
export type ConnectionDirection = (typeof CONNECTION_DIRECTIONS)[number];

export const HAUL_META: Record<
  HaulCategory,
  { label: string; rangeDescription: string }
> = {
  ALL: { label: "All Ranges", rangeDescription: "Any distance" },
  SHORT_HAUL: { label: "Short-Haul", rangeDescription: "< 1,500 km" },
  MEDIUM_HAUL: { label: "Medium-Haul", rangeDescription: "1,500 – 4,000 km" },
  LONG_HAUL: { label: "Long-Haul", rangeDescription: "> 4,000 km" },
};

export const REGION_META: Record<RouteRegion, { label: string; short: string }> =
  {
    ALL: { label: "All Regions", short: "All" },
    MENA: { label: "Middle East & N. Africa", short: "MENA" },
    EUROPE: { label: "Europe", short: "Europe" },
    AFRICA: { label: "Sub-Saharan Africa", short: "Africa" },
    ASIA_PACIFIC: { label: "Asia-Pacific", short: "Asia-Pacific" },
    AMERICAS: { label: "Americas", short: "Americas" },
  };

export interface AirportNode {
  iata: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  region: RouteRegion;
  latitude: number;
  longitude: number;
  timezone: string;
  hubAirlines: string[];
}

export const airportNodeSchema: z.ZodType<AirportNode> = z.object({
  iata: z.string().length(3),
  icao: z.string(),
  name: z.string(),
  city: z.string(),
  country: z.string(),
  region: z.enum(ROUTE_REGIONS),
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  timezone: z.string(),
  hubAirlines: z.array(z.string()),
});

export interface OperatingCarrierRoute {
  airlineCode: string;
  airlineName: string;
  flightNumbers: string[];
  /** Null when the provider did not report per-carrier frequency. */
  dailyFrequencies: number | null;
  /** Only present when a verified schedule source reported the days. */
  operatingDays?: number[];
  aircraftTypes: string[];
}

export const operatingCarrierRouteSchema: z.ZodType<OperatingCarrierRoute> =
  z.object({
    airlineCode: z.string(),
    airlineName: z.string(),
    flightNumbers: z.array(z.string()),
    dailyFrequencies: z.number().finite().nullable(),
    operatingDays: z.array(z.number().int().min(1).max(7)).optional(),
    aircraftTypes: z.array(z.string()),
  });

export interface DirectFlightConnection {
  id: string;
  origin: AirportNode;
  destination: AirportNode;
  distanceKm: number;
  distanceNm: number;
  /** Null when no verified schedule source reported a duration. */
  estimatedDurationMinutes: number | null;
  durationFormatted: string | null;
  /** True when duration is a distance-derived estimate, not a schedule fact. */
  durationEstimated: boolean;
  haulCategory: HaulCategory;
  /** Null when the provider did not report a daily average. */
  dailyFlightsCount: number | null;
  hasDepartures: boolean;
  hasArrivals: boolean;
  operatingCarriers: OperatingCarrierRoute[];
  /** Only true when a verified source confirmed the route as live. */
  isLiveVerified: boolean;
  dataSource: "AERODATABOX" | "SCHEDULE";
  updatedAt?: string;
}

export const directFlightConnectionSchema: z.ZodType<DirectFlightConnection> =
  z.object({
    id: z.string(),
    origin: airportNodeSchema,
    destination: airportNodeSchema,
    distanceKm: z.number().positive(),
    distanceNm: z.number().positive(),
    estimatedDurationMinutes: z.number().positive().nullable(),
    durationFormatted: z.string().nullable(),
    durationEstimated: z.boolean(),
    haulCategory: z.enum(HAUL_CATEGORIES),
    dailyFlightsCount: z.number().nonnegative().nullable(),
    hasDepartures: z.boolean(),
    hasArrivals: z.boolean(),
    operatingCarriers: z.array(operatingCarrierRouteSchema),
    isLiveVerified: z.boolean(),
    dataSource: z.enum(["AERODATABOX", "SCHEDULE"]),
    updatedAt: z.string().optional(),
  });

export interface AirlineFilterChipItem {
  code: string;
  name: string;
  destinationCount: number;
}

export const airlineFilterChipItemSchema: z.ZodType<AirlineFilterChipItem> =
  z.object({
    code: z.string(),
    name: z.string(),
    destinationCount: z.number().int().nonnegative(),
  });

export interface AirportRouteNetworkSummary {
  originAirport: AirportNode | null;
  connections: DirectFlightConnection[];
  totalDirectDestinations: number;
  totalCountriesServed: number;
  totalOperatingAirlines: number;
  /** Null when no connection reported a provider daily average. */
  totalDailyFlights: number | null;
  availableAirlines: AirlineFilterChipItem[];
}

export const airportRouteNetworkSummarySchema: z.ZodType<AirportRouteNetworkSummary> =
  z.object({
    originAirport: airportNodeSchema.nullable(),
    connections: z.array(directFlightConnectionSchema),
    totalDirectDestinations: z.number().int().nonnegative(),
    totalCountriesServed: z.number().int().nonnegative(),
    totalOperatingAirlines: z.number().int().nonnegative(),
    totalDailyFlights: z.number().nonnegative().nullable(),
    availableAirlines: z.array(airlineFilterChipItemSchema),
  });
