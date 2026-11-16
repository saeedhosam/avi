/**
 * The "console" flight contract: the web client's `Flight` face, now served by
 * the gateway so every consumer receives the same mapping.
 * Ported verbatim from apps/web/src/lib/types.ts.
 */

/**
 * Canonical Avi flight domain types. `@avi/shared` is the single source
 * of truth; these re-exports keep the legacy console contract compatible for
 * the OpenAPI export, web client, and gateway mapper.
 */
export type {
  AircraftInfo,
  Airport,
  AirportWeather,
  Flight,
  FlightStatus,
  FlightTelemetry,
  FlightTimelineEvent,
  Waypoint,
} from "@avi/shared";

export type RouteRegion =
  | "ALL"
  | "MENA"
  | "EUROPE"
  | "AFRICA"
  | "ASIA_PACIFIC"
  | "AMERICAS";

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

export interface RouteOperator {
  code: string;
  name: string;
}

/** AeroDataBox daily-route stats, reduced to destination summaries. */
export interface ConsoleRouteStat {
  destination: string;
  destinationName?: string;
  city?: string;
  country?: string;
  icao?: string;
  timezone?: string;
  latitude: number;
  longitude: number;
  /** Null when the provider did not report a daily average. */
  dailyFlights: number | null;
  operators: RouteOperator[];
}

// ── Forward schedule (published operating dates) ────────────────────────────

export type RouteScheduleStatus = "verified" | "partial" | "unavailable";

export interface ScheduledFlight {
  ident: string;
  identIata: string | null;
  actualIdent: string | null;
  actualIdentIata: string | null;
  aircraftType: string | null;
  origin: string;
  destination: string;
  /** Scheduled gate departure in the provider's time basis. */
  scheduledOut: string;
  /** Scheduled gate arrival in the provider's time basis. */
  scheduledIn: string | null;
  /** Operating date in the provider's time basis. */
  serviceDate: string;
}

/**
 * A forward schedule for one route.
 *
 * `status: "unavailable"` is a real state, not an empty schedule: clients must
 * render "schedule unavailable" and never infer operating days.
 */
export interface RouteSchedule {
  status: RouteScheduleStatus;
  /** Provider id, or "none" when no schedule provider is configured. */
  source: string;
  attribution: string | null;
  fetchedAt: string;
  /** Time basis of the schedule timestamps. */
  timeBasis: "utc" | null;
  /** First operating date covered (inclusive), when the source supplied one. */
  validFrom: string | null;
  /** Last operating date covered (inclusive), when the source supplied one. */
  validTo: string | null;
  flights: ScheduledFlight[];
  /** Why the schedule is partial/unavailable. */
  reason: string | null;
  omittedFlights: number;
  cached?: boolean;
  stale?: boolean;
  cacheAgeSeconds?: number;
}
