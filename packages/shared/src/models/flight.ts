import { z } from "zod";

/** Canonical flight lifecycle states shared by web, mobile, and the gateway. */
export const FLIGHT_STATUSES = [
  "SCHEDULED",
  "BOARDING",
  "DEPARTED",
  "DELAYED",
  "LANDED",
  "CANCELLED",
] as const;

export type FlightStatus = (typeof FLIGHT_STATUSES)[number];

export const FLIGHT_STATUS_LABELS: Record<FlightStatus, string> = {
  SCHEDULED: "Scheduled",
  BOARDING: "Boarding",
  DEPARTED: "En Route",
  DELAYED: "Delayed",
  LANDED: "Landed",
  CANCELLED: "Cancelled",
};

export const flightStatusSchema = z.enum(FLIGHT_STATUSES);

export interface AirportWeather {
  tempC: number;
  tempF: number;
  condition: string;
  wind: string;
  visibility: string;
  humidity: number;
}

export const airportWeatherSchema: z.ZodType<AirportWeather> = z.object({
  tempC: z.number().finite(),
  tempF: z.number().finite(),
  condition: z.string(),
  wind: z.string(),
  visibility: z.string(),
  humidity: z.number().finite(),
});

export interface Airport {
  code: string;
  name: string;
  city: string;
  country: string;
  timezone: string;
  latitude: number;
  longitude: number;
  weather: AirportWeather;
  /** False when weather values are placeholders, not an observation. */
  weatherReported?: boolean;
}

export const airportSchema: z.ZodType<Airport> = z.object({
  code: z.string().min(1),
  name: z.string(),
  city: z.string(),
  country: z.string(),
  timezone: z.string(),
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  weather: airportWeatherSchema,
  weatherReported: z.boolean().optional(),
});

export interface AircraftInfo {
  model: string;
  registration: string;
  /** Null when the provider did not report the airframe age. */
  age: string | null;
  /** Null when the provider did not report onboard Wi-Fi. */
  wifiAvailable: boolean | null;
  /** Null when the provider did not report seat power. */
  powerOutlets: boolean | null;
  /** Null when the provider did not report a cabin layout. */
  seatLayout: string | null;
}

export const aircraftInfoSchema: z.ZodType<AircraftInfo> = z.object({
  model: z.string(),
  registration: z.string(),
  age: z.string().nullable(),
  wifiAvailable: z.boolean().nullable(),
  powerOutlets: z.boolean().nullable(),
  seatLayout: z.string().nullable(),
});

export interface Waypoint {
  name: string;
  latitude: number;
  longitude: number;
  altitudeFeet: number;
}

export const waypointSchema: z.ZodType<Waypoint> = z.object({
  name: z.string(),
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  altitudeFeet: z.number().finite(),
});

export interface FlightTelemetry {
  hasLiveLocation: boolean;
  locationUpdatedAt?: number;
  currentLatitude: number;
  currentLongitude: number;
  altitudeFeet: number;
  groundSpeedKnots: number;
  headingDegrees: number;
  verticalSpeedFpm: number;
  mach: number;
  /** 0..1 along the great-circle route. */
  progressPercent: number;
  distanceCoveredNm: number;
  distanceRemainingNm: number;
  etaMinutesRemaining: number;
  waypoints: Waypoint[];
  /** True when progress/ETA were derived from a live position. */
  isDerived?: boolean;
}

export const flightTelemetrySchema: z.ZodType<FlightTelemetry> = z.object({
  hasLiveLocation: z.boolean(),
  locationUpdatedAt: z.number().optional(),
  currentLatitude: z.number().finite(),
  currentLongitude: z.number().finite(),
  altitudeFeet: z.number().finite(),
  groundSpeedKnots: z.number().finite(),
  headingDegrees: z.number().finite(),
  verticalSpeedFpm: z.number().finite(),
  mach: z.number().finite(),
  progressPercent: z.number().min(0).max(1),
  distanceCoveredNm: z.number().finite(),
  distanceRemainingNm: z.number().finite(),
  etaMinutesRemaining: z.number().finite(),
  waypoints: z.array(waypointSchema),
  isDerived: z.boolean().optional(),
});

export interface FlightTimelineEvent {
  title: string;
  time: string;
  isCompleted: boolean;
  isCurrent: boolean;
  description: string;
}

export const flightTimelineEventSchema: z.ZodType<FlightTimelineEvent> =
  z.object({
    title: z.string(),
    time: z.string(),
    isCompleted: z.boolean(),
    isCurrent: z.boolean(),
    description: z.string(),
  });

export interface Flight {
  /** Stable flight identity, typically `<COMPACT>-<YYYY-MM-DD>`. */
  id: string;
  /** Operating date (departure airport local time), ISO YYYY-MM-DD. */
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
  /** False when the provider did not report a status. */
  statusReported: boolean;
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
  source?: string;
  fetchedAt?: string;
}

export const flightSchema: z.ZodType<Flight> = z.object({
  id: z.string().min(1),
  flightDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
    .optional(),
  flightNumber: z.string().min(1),
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
  delayMinutes: z.number().finite(),
  delayReported: z.boolean(),
  delaySource: z.enum(["provider", "derived", "unknown"]),
  delayReason: z.string().nullable(),
  terminalDeparture: z.string(),
  gateDeparture: z.string(),
  checkInCounter: z.string(),
  terminalArrival: z.string(),
  gateArrival: z.string(),
  baggageCarousel: z.string(),
  aircraft: aircraftInfoSchema,
  telemetry: flightTelemetrySchema,
  timeline: z.array(flightTimelineEventSchema),
  isWatchlisted: z.boolean(),
  customNotes: z.string(),
  source: z.string().optional(),
  fetchedAt: z.string().optional(),
});

export const ALERT_TYPES = [
  "GATE_CHANGE",
  "TERMINAL_CHANGE",
  "DELAY",
  "BOARDING",
  "CANCELLATION",
  "BAGGAGE",
] as const;

export type AlertType = (typeof ALERT_TYPES)[number];

export interface FlightAlert {
  id: string;
  flightNumber: string;
  flightDate?: string;
  type: AlertType;
  title: string;
  message: string;
  /** Display timestamp (HH:mm) or full ISO timestamp. */
  timestamp: string;
  isRead: boolean;
}

export const flightAlertSchema: z.ZodType<FlightAlert> = z.object({
  id: z.string().min(1),
  flightNumber: z.string().min(1),
  flightDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  type: z.enum(ALERT_TYPES),
  title: z.string(),
  message: z.string(),
  timestamp: z.string(),
  isRead: z.boolean(),
});

/** Date-scoped watchlist identity shared with the gateway and Supabase. */
export function watchRowId(input: {
  id?: string;
  flightNumber: string;
  flightDate?: string | null;
}): string {
  const compact = (input.flightNumber || input.id || "")
    .replace(/\s+/g, "")
    .toUpperCase();
  const date = input.flightDate?.trim();
  return date ? `${compact}-${date}` : compact;
}
