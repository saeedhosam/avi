import { z } from "zod";

// ── Supabase row contracts (PostgREST JSON) ──────────────────────────────────
// Names are snake_case to match the database. The gateway and mobile client
// share these so a column rename cannot silently diverge.

export interface ProfileRow {
  id: string;
  display_name: string;
  email: string;
  photo_url: string | null;
  home_airport: string | null;
  plan: string;
  trip_pass_expires_at?: string | null;
}

export const profileRowSchema: z.ZodType<ProfileRow> = z.object({
  id: z.string().uuid(),
  display_name: z.string(),
  email: z.string(),
  photo_url: z.string().nullable(),
  home_airport: z.string().nullable(),
  plan: z.string(),
  trip_pass_expires_at: z.string().nullable().optional(),
});

export interface ProfileUpsert {
  id: string;
  display_name: string;
  email: string;
  photo_url: string | null;
  home_airport: string | null;
}

export const profileUpsertSchema: z.ZodType<ProfileUpsert> = z.object({
  id: z.string().uuid(),
  display_name: z.string(),
  email: z.string(),
  photo_url: z.string().nullable(),
  home_airport: z.string().nullable(),
});

export interface WatchlistItemRow {
  user_id: string;
  flight_id: string;
  flight_number: string;
  flight_date: string | null;
  airline: string;
  origin_code: string;
  dest_code: string;
  status: string;
  notes: string;
  snapshot: Record<string, unknown> | null;
}

export const watchlistItemRowSchema: z.ZodType<WatchlistItemRow> = z.object({
  user_id: z.string().uuid(),
  flight_id: z.string(),
  flight_number: z.string(),
  flight_date: z.string().nullable(),
  airline: z.string(),
  origin_code: z.string(),
  dest_code: z.string(),
  status: z.string(),
  notes: z.string(),
  snapshot: z.record(z.string(), z.unknown()).nullable(),
});

export interface WatchlistItemUpsert {
  user_id: string;
  flight_id: string;
  flight_number: string;
  flight_date: string | null;
  airline: string;
  origin_code: string;
  dest_code: string;
  status: string;
  notes: string;
  snapshot: Record<string, unknown> | null;
}

export const watchlistItemUpsertSchema: z.ZodType<WatchlistItemUpsert> =
  watchlistItemRowSchema;

export interface AlertRow {
  id: string;
  user_id: string;
  flight_number: string;
  flight_date: string | null;
  alert_type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string | null;
  delivered_at?: string | null;
}

export const alertRowSchema: z.ZodType<AlertRow> = z.object({
  id: z.string(),
  user_id: z.string().uuid(),
  flight_number: z.string(),
  flight_date: z.string().nullable(),
  alert_type: z.string(),
  title: z.string(),
  message: z.string(),
  is_read: z.boolean(),
  created_at: z.string().nullable(),
  delivered_at: z.string().nullable().optional(),
});

export interface AlertUpsert {
  id: string;
  user_id: string;
  flight_number: string;
  flight_date?: string | null;
  alert_type: string;
  title: string;
  message: string;
  is_read: boolean;
}

export const alertUpsertSchema: z.ZodType<AlertUpsert> = z.object({
  id: z.string(),
  user_id: z.string().uuid(),
  flight_number: z.string(),
  flight_date: z.string().nullable().optional(),
  alert_type: z.string(),
  title: z.string(),
  message: z.string(),
  is_read: z.boolean(),
});

// ── Cached snapshots ─────────────────────────────────────────────────────────

export interface CloudAirportWeatherSnapshot {
  tempC: number;
  tempF: number;
  condition: string;
  wind: string;
  visibility: string;
  humidity: number;
}

export const cloudAirportWeatherSnapshotSchema: z.ZodType<CloudAirportWeatherSnapshot> =
  z.object({
    tempC: z.number().finite(),
    tempF: z.number().finite(),
    condition: z.string(),
    wind: z.string(),
    visibility: z.string(),
    humidity: z.number().finite(),
  });

export interface CloudAirportSnapshot {
  code: string;
  name: string;
  city: string;
  country: string;
  timezone: string;
  latitude: number;
  longitude: number;
  weather: CloudAirportWeatherSnapshot;
  weatherReported: boolean;
}

export const cloudAirportSnapshotSchema: z.ZodType<CloudAirportSnapshot> =
  z.object({
    code: z.string().length(3),
    name: z.string(),
    city: z.string(),
    country: z.string(),
    timezone: z.string(),
    latitude: z.number().finite(),
    longitude: z.number().finite(),
    weather: cloudAirportWeatherSnapshotSchema,
    weatherReported: z.boolean(),
  });

export interface CloudAircraftSnapshot {
  model: string;
  registration: string;
  age: string | null;
  wifiAvailable: boolean | null;
  powerOutlets: boolean | null;
  seatLayout: string | null;
}

export const cloudAircraftSnapshotSchema: z.ZodType<CloudAircraftSnapshot> =
  z.object({
    model: z.string(),
    registration: z.string(),
    age: z.string().nullable(),
    wifiAvailable: z.boolean().nullable(),
    powerOutlets: z.boolean().nullable(),
    seatLayout: z.string().nullable(),
  });

export interface CloudTelemetrySnapshot {
  hasLiveLocation: boolean;
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
}

export const cloudTelemetrySnapshotSchema: z.ZodType<CloudTelemetrySnapshot> =
  z.object({
    hasLiveLocation: z.boolean(),
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
  });

export interface CloudTimelineSnapshot {
  title: string;
  time: string;
  isCompleted: boolean;
  isCurrent: boolean;
  description: string;
}

export const cloudTimelineSnapshotSchema: z.ZodType<CloudTimelineSnapshot> =
  z.object({
    title: z.string(),
    time: z.string(),
    isCompleted: z.boolean(),
    isCurrent: z.boolean(),
    description: z.string(),
  });

export interface CloudFlightSnapshot {
  id: string;
  flightNumber: string;
  flightDate?: string | null;
  airline: string;
  airlineCode: string;
  origin: CloudAirportSnapshot;
  destination: CloudAirportSnapshot;
  departureTimeScheduled: string;
  departureTimeEstimated: string;
  departureTimeActual: string | null;
  arrivalTimeScheduled: string;
  arrivalTimeEstimated: string;
  arrivalTimeActual: string | null;
  status: string;
  statusReported: boolean;
  statusNote: string;
  delayMinutes: number;
  delayReported: boolean;
  delayReason: string | null;
  terminalDeparture: string;
  gateDeparture: string;
  checkInCounter: string;
  terminalArrival: string;
  gateArrival: string;
  baggageCarousel: string;
  aircraft: CloudAircraftSnapshot;
  telemetry: CloudTelemetrySnapshot;
  timeline: CloudTimelineSnapshot[];
  isFavorite: boolean;
  isTracked: boolean;
  customNotes: string;
  source?: string | null;
  fetchedAt?: string | null;
}

export const cloudFlightSnapshotSchema: z.ZodType<CloudFlightSnapshot> =
  z.object({
    id: z.string(),
    flightNumber: z.string(),
    flightDate: z.string().nullable().optional(),
    airline: z.string(),
    airlineCode: z.string(),
    origin: cloudAirportSnapshotSchema,
    destination: cloudAirportSnapshotSchema,
    departureTimeScheduled: z.string(),
    departureTimeEstimated: z.string(),
    departureTimeActual: z.string().nullable(),
    arrivalTimeScheduled: z.string(),
    arrivalTimeEstimated: z.string(),
    arrivalTimeActual: z.string().nullable(),
    status: z.string(),
    statusReported: z.boolean(),
    statusNote: z.string(),
    delayMinutes: z.number().finite(),
    delayReported: z.boolean(),
    delayReason: z.string().nullable(),
    terminalDeparture: z.string(),
    gateDeparture: z.string(),
    checkInCounter: z.string(),
    terminalArrival: z.string(),
    gateArrival: z.string(),
    baggageCarousel: z.string(),
    aircraft: cloudAircraftSnapshotSchema,
    telemetry: cloudTelemetrySnapshotSchema,
    timeline: z.array(cloudTimelineSnapshotSchema),
    isFavorite: z.boolean(),
    isTracked: z.boolean(),
    customNotes: z.string(),
    source: z.string().nullable().optional(),
    fetchedAt: z.string().nullable().optional(),
  });
