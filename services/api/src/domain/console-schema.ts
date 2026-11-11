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
  /** True when the response came from the shared provider cache. */
  cached: z.boolean().optional(),
  /** True when the cached response is past its fresh window. */
  stale: z.boolean().optional(),
  /** Age of the cached payload in whole seconds. */
  cacheAgeSeconds: z.number().optional(),
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

// ── Flight operating dates ──────────────────────────────────────────────────

export const consoleFlightDatesResponseSchema = z.object({
  mode: z.string(),
  status: z.number(),
  dates: z.array(z.string()),
  ...dataProvenanceSchema.shape,
});

// ── Flight delay statistics ─────────────────────────────────────────────────

export const consoleDelayStatSchema = z.object({
  airportIcao: z.string().nullable(),
  class: z.string().nullable(),
  scheduledHourUtc: z.number().nullable(),
  medianDelay: z.string().nullable(),
  delayIndex: z.number().nullable(),
  numConsideredFlights: z.number().nullable(),
  brackets: z.array(
    z.object({
      delayedFrom: z.string().nullable(),
      delayedTo: z.string().nullable(),
      num: z.number().nullable(),
      percentage: z.number().nullable(),
    }),
  ),
  percentiles: z.array(
    z.object({
      percentile: z.number().nullable(),
      delay: z.string().nullable(),
    }),
  ),
  fromUtc: z.string().nullable(),
  toUtc: z.string().nullable(),
});

export const consoleFlightDelaysResponseSchema = z.object({
  mode: z.string(),
  status: z.number(),
  delays: z
    .object({
      number: z.string().nullable(),
      origins: z.array(consoleDelayStatSchema),
      destinations: z.array(consoleDelayStatSchema),
    })
    .nullable(),
  ...dataProvenanceSchema.shape,
});

// ── Aircraft details ────────────────────────────────────────────────────────

export const consoleAircraftSchema = z.object({
  reg: z.string(),
  active: z.boolean().nullable(),
  airlineName: z.string().nullable(),
  iataType: z.string().nullable(),
  icaoCode: z.string().nullable(),
  model: z.string().nullable(),
  numSeats: z.number().nullable(),
  ageYears: z.number().nullable(),
  firstFlightDate: z.string().nullable(),
  deliveryDate: z.string().nullable(),
  engineType: z.string().nullable(),
  numEngines: z.number().nullable(),
  isFreighter: z.boolean().nullable(),
  image: z
    .object({
      url: z.string(),
      webUrl: z.string().nullable(),
      author: z.string().nullable(),
      license: z.string().nullable(),
      attributions: z.array(z.string()).nullable(),
    })
    .nullable(),
});

export const consoleAircraftResponseSchema = z.object({
  mode: z.string(),
  status: z.number(),
  aircraft: consoleAircraftSchema.nullable(),
  ...dataProvenanceSchema.shape,
});

// ── Airport reference data ──────────────────────────────────────────────────

export const consoleAirportInfoSchema = z.object({
  iata: z.string(),
  icao: z.string(),
  name: z.string(),
  city: z.string(),
  country: z.string(),
  countryName: z.string().nullable(),
  continent: z.string().nullable(),
  /** Empty when the provider did not report a timezone. Never "UTC". */
  timezone: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  elevationFeet: z.number().nullable(),
  localTime: z.string().nullable(),
  urls: z.record(z.string(), z.string()),
  runways: z.array(
    z.object({
      name: z.string().nullable(),
      trueHdg: z.number().nullable(),
      lengthFeet: z.number().nullable(),
      widthFeet: z.number().nullable(),
      surface: z.string().nullable(),
      isClosed: z.boolean().nullable(),
      hasLighting: z.boolean().nullable(),
    }),
  ),
});

export const consoleAirportInfoResponseSchema = z.object({
  mode: z.string(),
  status: z.number(),
  airport: consoleAirportInfoSchema.nullable(),
  ...dataProvenanceSchema.shape,
});

export const feedStatusSchema = z.enum([
  "Down",
  "Degraded",
  "OKPartial",
  "OK",
  "Unknown",
  "Unavailable",
]);

export const consoleAirportCoverageResponseSchema = z.object({
  mode: z.string(),
  status: z.number(),
  coverage: z
    .object({
      iata: z.string(),
      icao: z.string(),
      schedules: feedStatusSchema,
      liveUpdates: feedStatusSchema,
      adsb: feedStatusSchema,
    })
    .nullable(),
  ...dataProvenanceSchema.shape,
});

// ── Forward schedule (published operating dates) ────────────────────────────

export const routeScheduleStatusSchema = z.enum([
  "verified",
  "partial",
  "unavailable",
]);

export const scheduledFlightSchema = z.object({
  ident: z.string(),
  identIata: z.string().nullable(),
  actualIdent: z.string().nullable(),
  actualIdentIata: z.string().nullable(),
  aircraftType: z.string().nullable(),
  origin: z.string(),
  destination: z.string(),
  /** Scheduled gate departure, provider timezone (Zulu for AeroAPI). */
  scheduledOut: z.string(),
  /** Scheduled gate arrival, provider timezone (Zulu for AeroAPI). */
  scheduledIn: z.string().nullable(),
  /** Operating date derived from `scheduledOut` in the provider time basis. */
  serviceDate: z.string(),
});

export const routeScheduleResponseSchema = z.object({
  status: routeScheduleStatusSchema,
  /** Provider id, or "none" when no schedule provider is configured. */
  source: z.string(),
  attribution: z.string().nullable(),
  fetchedAt: z.string(),
  timeBasis: z.enum(["utc"]).nullable(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  flights: z.array(scheduledFlightSchema),
  /** Why the schedule is partial/unavailable. Never omitted silently. */
  reason: z.string().nullable(),
  omittedFlights: z.number().int().nonnegative(),
  cached: z.boolean().optional(),
  stale: z.boolean().optional(),
  cacheAgeSeconds: z.number().optional(),
});

export { errorResponseSchema } from "./schemas.js";
