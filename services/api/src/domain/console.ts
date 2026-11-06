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
}

export interface AircraftInfo {
  model: string;
  registration: string;
  age: string;
  wifiAvailable: boolean;
  powerOutlets: boolean;
  seatLayout: string;
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
  statusNote: string;
  delayMinutes: number;
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
  dailyFlights: number;
  operators: RouteOperator[];
}
