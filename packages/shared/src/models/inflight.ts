import { z } from "zod";

export const CABIN_PHASES = [
  "PRE_FLIGHT",
  "TAXI",
  "CLIMB",
  "CRUISE",
  "TOP_OF_DESCENT",
  "DESCENT",
  "APPROACH",
  "LANDED",
] as const;
export type CabinPhase = (typeof CABIN_PHASES)[number];

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export const geoPointSchema: z.ZodType<GeoPoint> = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export interface CabinAltitudeEstimate {
  pressureHpa: number;
  /** Cabin altitude in feet, estimated from cabin pressure. */
  cabinAltitudeFeet: number;
  /** Outside altitude only when a GPS/barometric source reported it. */
  aircraftAltitudeFeet: number | null;
  phase: CabinPhase;
  /** Rate of cabin-altitude change in feet per minute, when derivable. */
  verticalRateFpm: number | null;
  sampledAt: string;
  source: "BAROMETER" | "CACHE" | "NONE";
}

export const cabinAltitudeEstimateSchema: z.ZodType<CabinAltitudeEstimate> =
  z.object({
    pressureHpa: z.number().positive(),
    cabinAltitudeFeet: z.number().finite(),
    aircraftAltitudeFeet: z.number().finite().nullable(),
    phase: z.enum(CABIN_PHASES),
    verticalRateFpm: z.number().finite().nullable(),
    sampledAt: z.string(),
    source: z.enum(["BAROMETER", "CACHE", "NONE"]),
  });

export interface InflightRouteInterpolation {
  origin: GeoPoint;
  destination: GeoPoint;
  position: GeoPoint;
  /** 0..1 along the great-circle route. */
  progress: number;
  headingDegrees: number;
  distanceRemainingKm: number;
  /** ISO timestamp of the interpolation. */
  at: string;
  method: "GREAT_CIRCLE";
}

export const inflightRouteInterpolationSchema: z.ZodType<InflightRouteInterpolation> =
  z.object({
    origin: geoPointSchema,
    destination: geoPointSchema,
    position: geoPointSchema,
    progress: z.number().min(0).max(1),
    headingDegrees: z.number().min(0).max(360),
    distanceRemainingKm: z.number().nonnegative(),
    at: z.string(),
    method: z.literal("GREAT_CIRCLE"),
  });

export const CABIN_TIMELINE_KINDS = [
  "BOARDING",
  "DOORS_CLOSED",
  "TAKEOFF",
  "MEAL_SERVICE",
  "LIGHTS_DIM",
  "TOP_OF_DESCENT",
  "LIGHTS_ON",
  "LANDING",
] as const;
export type CabinTimelineKind = (typeof CABIN_TIMELINE_KINDS)[number];

export interface CabinTimelineItem {
  kind: CabinTimelineKind;
  label: string;
  /** Estimated ISO timestamp. */
  at: string;
  completed: boolean;
  detail: string;
}

export const cabinTimelineItemSchema: z.ZodType<CabinTimelineItem> = z.object({
  kind: z.enum(CABIN_TIMELINE_KINDS),
  label: z.string(),
  at: z.string(),
  completed: z.boolean(),
  detail: z.string(),
});

export interface OfflineInflightState {
  flightId: string;
  flightNumber: string;
  originCode: string;
  destinationCode: string;
  takeoffAt: string;
  landingAt: string;
  cabin: CabinAltitudeEstimate;
  position: InflightRouteInterpolation;
  timeline: CabinTimelineItem[];
  /** Offline callouts under the route, derived from bundled reference data. */
  callouts: Array<{ name: string; distanceKm: number; at: string }>;
  generatedAt: string;
}

export const offlineInflightStateSchema: z.ZodType<OfflineInflightState> =
  z.object({
    flightId: z.string(),
    flightNumber: z.string(),
    originCode: z.string().length(3),
    destinationCode: z.string().length(3),
    takeoffAt: z.string(),
    landingAt: z.string(),
    cabin: cabinAltitudeEstimateSchema,
    position: inflightRouteInterpolationSchema,
    timeline: z.array(cabinTimelineItemSchema),
    callouts: z.array(
      z.object({
        name: z.string(),
        distanceKm: z.number().nonnegative(),
        at: z.string(),
      }),
    ),
    generatedAt: z.string(),
  });
