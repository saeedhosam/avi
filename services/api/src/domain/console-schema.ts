import { z } from "zod";

// ── Console contract schemas (web Flight shape) ──────────────────────────────

export const flightStatusSchema = z.enum([
  "SCHEDULED",
  "BOARDING",
  "DEPARTED",
  "DELAYED",
  "LANDED",
  "CANCELLED",
]);

export const airportWeatherSchema = z.object({
  tempC: z.number(),
  tempF: z.number(),
  condition: z.string(),
  wind: z.string(),
  visibility: z.string(),
  humidity: z.number(),
});

export const airportSchema = z.object({
  code: z.string(),
  name: z.string(),
  city: z.string(),
  country: z.string(),
  timezone: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  weather: airportWeatherSchema,
});

export const aircraftSchema = z.object({
  model: z.string(),
  registration: z.string(),
  age: z.string().nullable(),
  wifiAvailable: z.boolean().nullable(),
  powerOutlets: z.boolean().nullable(),
  seatLayout: z.string().nullable(),
});

export const waypointSchema = z.object({
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  altitudeFeet: z.number(),
});

export const flightTelemetrySchema = z.object({
  hasLiveLocation: z.boolean().optional(),
  locationUpdatedAt: z.number().optional(),
  currentLatitude: z.number(),
  currentLongitude: z.number(),
  altitudeFeet: z.number(),
  groundSpeedKnots: z.number(),
  headingDegrees: z.number(),
  verticalSpeedFpm: z.number(),
  mach: z.number(),
  progressPercent: z.number(),
  distanceCoveredNm: z.number(),
  distanceRemainingNm: z.number(),
  etaMinutesRemaining: z.number(),
  waypoints: z.array(waypointSchema),
  isDerived: z.boolean().optional(),
});

export const flightTimelineEventSchema = z.object({
  title: z.string(),
  time: z.string(),
  isCompleted: z.boolean(),
  isCurrent: z.boolean(),
  description: z.string(),
});

// `isWatchlisted` / `customNotes` / `flightDate` are client-owned; the
// contract accepts and strips them upstream so they round-trip safely.
export const consoleFlightSchema = z.object({
  id: z.string(),
  flightDate: z.string().optional(),
  flightNumber: z.string(),
  airline: z.string(),
  airlineCode: z.string(),
  origin: airportSchema,
  destination: airportSchema,
  departureTimeScheduled: z.string(),
  departureTimeEstimated: z.string(),
  departureTimeActual: z.string().nullable(),
  arrivalTimeScheduled: z.string(),
  arrivalTimeEstimated: z.string(),
  arrivalTimeActual: z.string().nullable(),
  status: flightStatusSchema,
  statusReported: z.boolean(),
  statusRaw: z.string(),
  statusNote: z.string(),
  delayMinutes: z.number(),
  delayReported: z.boolean(),
  delaySource: z.enum(["provider", "derived", "unknown"]),
  delayReason: z.string().nullable(),
  terminalDeparture: z.string(),
  gateDeparture: z.string(),
  checkInCounter: z.string(),
  terminalArrival: z.string(),
  gateArrival: z.string(),
  baggageCarousel: z.string(),
  aircraft: aircraftSchema,
  telemetry: flightTelemetrySchema,
  timeline: z.array(flightTimelineEventSchema),
  isWatchlisted: z.boolean().optional(),
  customNotes: z.string().optional(),
  source: z.string().optional(),
  fetchedAt: z.string().optional(),
});

export const routeOperatorSchema = z.object({
  code: z.string(),
  name: z.string(),
});

export const consoleRouteStatSchema = z.object({
  destination: z.string(),
  destinationName: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  icao: z.string().optional(),
  timezone: z.string().optional(),
  latitude: z.number(),
  longitude: z.number(),
  /** Null when the provider did not report a daily average. */
  dailyFlights: z.number().nullable(),
  operators: z.array(routeOperatorSchema),
});

export const regionSchema = z.enum([
  "ALL",
  "MENA",
  "EUROPE",
  "AFRICA",
  "ASIA_PACIFIC",
  "AMERICAS",
]);

export const airportNodeSchema = z.object({
  iata: z.string(),
  icao: z.string(),
  name: z.string(),
  city: z.string(),
  country: z.string(),
  region: regionSchema,
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string(),
  hubAirlines: z.array(z.string()),
});

export const dataProvenanceSchema = z.object({
  source: z.literal("AERODATABOX"),
  fetchedAt: z.string(),
  attribution: z.literal("AeroDataBox"),
});

export const consoleSearchResponseSchema = z.object({
  mode: z.string(),
  flights: z.array(consoleFlightSchema),
  ...dataProvenanceSchema.shape,
});

export const consoleFidsResponseSchema = z.object({
  mode: z.string(),
  flights: z.array(consoleFlightSchema),
  ...dataProvenanceSchema.shape,
  /** Provider board window in UTC, when the board is time-windowed. */
  window: z
    .object({ from: z.string(), to: z.string() })
    .nullable()
    .optional(),
});

export const consoleRoutesResponseSchema = z.object({
  mode: z.string(),
  status: z.number(),
  routes: z.array(consoleRouteStatSchema),
  ...dataProvenanceSchema.shape,
  /** AeroDataBox daily route stats are calculated over the prior 7 days. */
  statisticsWindowDays: z.literal(7),
  note: z.string(),
  /** Route records the provider returned without plotable coordinates. */
  omittedRoutes: z.number().int().nonnegative(),
});

export const consoleAirportSearchResponseSchema = z.object({
  mode: z.string(),
  status: z.number(),
  airports: z.array(airportNodeSchema),
  ...dataProvenanceSchema.shape,
});

export { errorResponseSchema } from "./schemas.js";
