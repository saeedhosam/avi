/**
 * The "console" flight contract: the web client's `Flight` face, now served by
 * the gateway so every client (web today, Android/iOS later) consumes one
 * mapping. Ported verbatim from apps/web/src/lib/types.ts.
 */

export type FlightStatus =
  | "SCHEDULED"
  | "BOARDING"
  | "DEPARTED"
  | "DELAYED"
  | "LANDED"
  | "CANCELLED";

export interface AirportWeather {
  tempC: number;
  tempF: number;
  condition: string;
  wind: string;
  visibility: string;
  humidity: number;
}

export interface Airport {
  code: string;
  name: string;
  city: string;
  country: string;
  timezone: string;
  latitude: number;
  longitude: number;
  weather: AirportWeather;
  /** False when the weather block is a placeholder, not an observation. */
  weatherReported?: boolean;
}

export interface AircraftInfo {
  model: string;
  registration: string;
  /** `null` when the provider did not report the airframe age. */
  age: string | null;
  /** `null` when the provider did not report onboard Wi-Fi. */
  wifiAvailable: boolean | null;
  /** `null` when the provider did not report seat power. */
  powerOutlets: boolean | null;
  /** `null` when the provider did not report a cabin layout. */
  seatLayout: string | null;
}

export interface Waypoint {
  name: string;
  latitude: number;
  longitude: number;
  altitudeFeet: number;
}

export interface FlightTelemetry {
  hasLiveLocation?: boolean;
  locationUpdatedAt?: number;
  currentLatitude: number;
  currentLongitude: number;
  altitudeFeet: number;
  groundSpeedKnots: number;
  headingDegrees: number;
  verticalSpeedFpm: number;
  mach: number;
  progressPercent: number;
  distanceCoveredNm: number;
  distanceRemainingNm: number;
  etaMinutesRemaining: number;
  waypoints: Waypoint[];
  /** True when progress/ETA were calculated from a live position, not reported. */
  isDerived?: boolean;
}

export interface FlightTimelineEvent {
  title: string;
  time: string;
  isCompleted: boolean;
  isCurrent: boolean;
  description: string;
}

export interface Flight {
  id: string;
  /** Departure date in the flight's local timezone as ISO YYYY-MM-DD, when known. */
  flightDate?: string;
  flightNumber: string;
  airline: string;
  airlineCode: string;
  origin: Airport;
  destination: Airport;
  departureTimeScheduled: string;
  departureTimeEstimated: string;
  departureTimeActual: string | null;
  arrivalTimeScheduled: string;
  arrivalTimeEstimated: string;
  arrivalTimeActual: string | null;
  status: FlightStatus;
  /** False when the provider did not report a status we can verify. */
  statusReported: boolean;
  /** Raw provider status text, preserved for auditability. */
  statusRaw: string;
  statusNote: string;
  /** Always numeric for client compatibility; check `delayReported` first. */
  delayMinutes: number;
  /** False when the provider did not report enough time data to compute a delay. */
  delayReported: boolean;
  delaySource: "provider" | "derived" | "unknown";
  delayReason: string | null;
  terminalDeparture: string;
  gateDeparture: string;
  checkInCounter: string;
  terminalArrival: string;
  gateArrival: string;
  baggageCarousel: string;
  aircraft: AircraftInfo;
  telemetry: FlightTelemetry;
  timeline: FlightTimelineEvent[];
  isWatchlisted: boolean;
  customNotes: string;
  /** Provider that produced this record, when known. */
  source?: string;
  /** ISO timestamp of the provider response that produced this record. */
  fetchedAt?: string;
}

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
