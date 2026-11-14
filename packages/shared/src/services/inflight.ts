import type { Flight } from "../models/flight.js";
import type {
  CabinAltitudeEstimate,
  CabinPhase,
  CabinTimelineItem,
  GeoPoint,
  InflightRouteInterpolation,
  OfflineInflightState,
} from "../models/inflight.js";
import {
  geodesicDistanceKm,
  initialBearingDegrees,
  interpolateGreatCircle,
} from "./geodesic.js";

const SEA_LEVEL_PRESSURE_HPA = 1013.25;

/**
 * International Standard Atmosphere inversion. Cabin pressure is measured by
 * the phone barometer; the result is an *estimate* of cabin altitude, not the
 * aircraft's actual altitude.
 */
export function pressureHpaToCabinAltitudeFeet(pressureHpa: number): number {
  if (!Number.isFinite(pressureHpa) || pressureHpa <= 0) return 0;
  return 44_330 * (1 - Math.pow(pressureHpa / SEA_LEVEL_PRESSURE_HPA, 0.1903));
}

export function cabinAltitudeFeetToPressureHpa(altitudeFeet: number): number {
  return SEA_LEVEL_PRESSURE_HPA * Math.pow(1 - altitudeFeet / 44_330, 1 / 0.1903);
}

export interface CabinPhaseInput {
  pressureHpa: number;
  aircraftAltitudeFeet?: number | null;
  /** Route progress 0..1, when the scheduled route is known. */
  progress?: number;
  onGround?: boolean;
  /** Feet per minute; positive is climb. */
  verticalRateFpm?: number | null;
}

/**
 * Classifies the current flight phase from barometric pressure and optional
 * GPS altitude/progress. No external network is used once the route is cached.
 */
export function detectCabinPhase(input: CabinPhaseInput): CabinPhase {
  const rate = input.verticalRateFpm ?? 0;
  const progress = input.progress;
  const aircraftAltitude = input.aircraftAltitudeFeet ?? null;
  if (input.onGround || (aircraftAltitude != null && aircraftAltitude < 1000 && rate > -150)) {
    return progress != null && progress > 0 ? "TAXI" : "PRE_FLIGHT";
  }
  if (progress != null && progress >= 0.98) return "LANDED";
  if (aircraftAltitude != null && aircraftAltitude < 3500 && rate < -200) {
    return "APPROACH";
  }
  if (rate > 250) return "CLIMB";
  if (rate < -300) {
    return progress != null && progress >= 0.72 ? "TOP_OF_DESCENT" : "DESCENT";
  }
  if (progress != null && progress >= 0.78 && rate < -100) {
    return "TOP_OF_DESCENT";
  }
  if (rate < -100) return "DESCENT";
  return "CRUISE";
}

export interface PressureSample {
  pressureHpa: number;
  at: number;
}

export interface CabinPressureTrackerOptions {
  smoothingWindowMs?: number;
  /** Minimum change in feet per minute that is considered a real trend. */
  noiseFloorFpm?: number;
  now?: () => number;
}

/**
 * Smooths noisy phone barometer samples and derives cabin altitude and trend.
 * A single sample is valid; the vertical rate stays null until two samples span
 * at least one second.
 */
export class CabinPressureTracker {
  private readonly samples: PressureSample[] = [];
  private readonly smoothingWindowMs: number;
  private readonly noiseFloorFpm: number;
  private readonly now: () => number;

  constructor(options: CabinPressureTrackerOptions = {}) {
    this.smoothingWindowMs = options.smoothingWindowMs ?? 15_000;
    this.noiseFloorFpm = options.noiseFloorFpm ?? 80;
    this.now = options.now ?? (() => Date.now());
  }

  add(pressureHpa: number, at?: number): CabinAltitudeEstimate {
    const timestamp = at ?? this.now();
    if (Number.isFinite(pressureHpa) && pressureHpa > 0) {
      this.samples.push({ pressureHpa, at: timestamp });
    }
    const cutoff = timestamp - this.smoothingWindowMs;
    while (this.samples.length > 1 && this.samples[0]!.at < cutoff) {
      this.samples.shift();
    }
    if (this.samples.length > 120) {
      this.samples.splice(0, this.samples.length - 120);
    }

    const latest = this.samples[this.samples.length - 1];
    if (!latest) {
      return {
        pressureHpa: 0,
        cabinAltitudeFeet: 0,
        aircraftAltitudeFeet: null,
        phase: "PRE_FLIGHT",
        verticalRateFpm: null,
        sampledAt: new Date(timestamp).toISOString(),
        source: "NONE",
      };
    }
    const altitude = pressureHpaToCabinAltitudeFeet(latest.pressureHpa);
    const first = this.samples[0]!;
    const elapsedMinutes = (latest.at - first.at) / 60_000;
    const rawRate =
      elapsedMinutes > 0.01
        ? (altitude - pressureHpaToCabinAltitudeFeet(first.pressureHpa)) /
          elapsedMinutes
        : null;
    const verticalRateFpm =
      rawRate == null
        ? null
        : Math.abs(rawRate) < this.noiseFloorFpm
          ? 0
          : Math.round(rawRate);

    return {
      pressureHpa: latest.pressureHpa,
      cabinAltitudeFeet: Math.round(altitude),
      aircraftAltitudeFeet: null,
      phase: detectCabinPhase({
        pressureHpa: latest.pressureHpa,
        verticalRateFpm,
      }),
      verticalRateFpm,
      sampledAt: new Date(timestamp).toISOString(),
      source: "BAROMETER",
    };
  }

  reset(): void {
    this.samples.length = 0;
  }
}

export function interpolatePosition(
  origin: GeoPoint,
  destination: GeoPoint,
  takeoffAt: string,
  landingAt: string,
  now: string | Date = new Date(),
): InflightRouteInterpolation {
  const takeoff = Date.parse(takeoffAt);
  const landing = Date.parse(landingAt);
  const at = now instanceof Date ? now.getTime() : Date.parse(now);
  const duration = landing - takeoff;
  const rawProgress = duration > 0 ? (at - takeoff) / duration : 0;
  const progress = Math.min(1, Math.max(0, rawProgress));
  const position = interpolateGreatCircle(origin, destination, progress);
  const totalKm = geodesicDistanceKm(
    origin.latitude,
    origin.longitude,
    destination.latitude,
    destination.longitude,
  );
  return {
    origin,
    destination,
    position,
    progress,
    headingDegrees: initialBearingDegrees(
      position.latitude,
      position.longitude,
      destination.latitude,
      destination.longitude,
    ),
    distanceRemainingKm: Math.max(0, totalKm * (1 - progress)),
    at: new Date(Number.isFinite(at) ? at : Date.now()).toISOString(),
    method: "GREAT_CIRCLE",
  };
}

/**
 * Builds an estimated cabin-service timeline from the scheduled block time.
 * Every item is an estimate, not a crew announcement.
 */
export function buildCabinTimeline(
  takeoffAt: string,
  landingAt: string,
  now: string | Date = new Date(),
): CabinTimelineItem[] {
  const takeoff = Date.parse(takeoffAt);
  const landing = Date.parse(landingAt);
  if (!Number.isFinite(takeoff) || !Number.isFinite(landing) || landing <= takeoff) {
    return [];
  }
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const durationMinutes = (landing - takeoff) / 60_000;
  const shortFlight = durationMinutes < 120;
  const items: Array<{ kind: CabinTimelineItem["kind"]; label: string; offset: number; detail: string }> = [
    {
      kind: "BOARDING",
      label: "Boarding",
      offset: -35,
      detail: "Estimated boarding start, 35 minutes before departure.",
    },
    {
      kind: "DOORS_CLOSED",
      label: "Doors closed",
      offset: -5,
      detail: "Estimated doors-closed time.",
    },
    {
      kind: "TAKEOFF",
      label: "Takeoff",
      offset: 0,
      detail: "Recorded or scheduled takeoff.",
    },
    {
      kind: "MEAL_SERVICE",
      label: shortFlight ? "Snack service" : "Meal service",
      offset: shortFlight ? 25 : 45,
      detail: shortFlight
        ? "Estimated snack service on this short sector."
        : "Estimated meal service start.",
    },
    {
      kind: "LIGHTS_DIM",
      label: "Cabin lights dim",
      offset: shortFlight ? 45 : 90,
      detail: "Estimated rest period; crew may vary.",
    },
    {
      kind: "TOP_OF_DESCENT",
      label: "Top of descent",
      offset: durationMinutes - 35,
      detail: "Estimated top-of-descent, 35 minutes before landing.",
    },
    {
      kind: "LIGHTS_ON",
      label: "Cabin lights on",
      offset: durationMinutes - 20,
      detail: "Estimated pre-landing cabin service.",
    },
    {
      kind: "LANDING",
      label: "Landing",
      offset: durationMinutes,
      detail: "Scheduled landing time.",
    },
  ];
  return items
    .sort((a, b) => a.offset - b.offset)
    .map((item) => ({
      kind: item.kind,
      label: item.label,
      at: new Date(takeoff + item.offset * 60_000).toISOString(),
      completed: Number.isFinite(nowMs) && takeoff + item.offset * 60_000 <= nowMs,
      detail: item.detail,
    }));
}

export interface Landmark {
  name: string;
  latitude: number;
  longitude: number;
}

export interface LandmarkCallout {
  name: string;
  distanceKm: number;
  at: string;
}

/**
 * Finds landmarks near the great-circle path and estimates when the aircraft
 * passes closest to each. Uses only bundled/offline data.
 */
export function findLandmarkCallouts(
  origin: GeoPoint,
  destination: GeoPoint,
  takeoffAt: string,
  landingAt: string,
  landmarks: Landmark[],
  options: { maxDistanceKm?: number; segments?: number } = {},
): LandmarkCallout[] {
  const maxDistanceKm = options.maxDistanceKm ?? 350;
  const segments = options.segments ?? 120;
  const takeoff = Date.parse(takeoffAt);
  const landing = Date.parse(landingAt);
  if (!Number.isFinite(takeoff) || !Number.isFinite(landing) || landing <= takeoff) {
    return [];
  }
  const results: LandmarkCallout[] = [];
  for (const landmark of landmarks) {
    let best = { distance: Number.POSITIVE_INFINITY, progress: 0 };
    for (let index = 0; index <= segments; index += 1) {
      const progress = index / segments;
      const point = interpolateGreatCircle(origin, destination, progress);
      const distance = geodesicDistanceKm(
        point.latitude,
        point.longitude,
        landmark.latitude,
        landmark.longitude,
      );
      if (distance < best.distance) best = { distance, progress };
    }
    if (best.distance <= maxDistanceKm) {
      results.push({
        name: landmark.name,
        distanceKm: Math.round(best.distance),
        at: new Date(takeoff + (landing - takeoff) * best.progress).toISOString(),
      });
    }
  }
  return results.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

export interface OfflineInflightInput {
  flight: {
    id: string;
    flightNumber: string;
    origin: { code: string };
    destination: { code: string };
    departureTimeActual?: string | null;
    arrivalTimeEstimated?: string | null;
  };
  origin: GeoPoint;
  destination: GeoPoint;
  takeoffAt: string;
  landingAt: string;
  now?: string;
  pressureHpa?: number | null;
  aircraftAltitudeFeet?: number | null;
  landmarks?: Landmark[];
}

export function buildOfflineInflightState(
  input: OfflineInflightInput,
): OfflineInflightState {
  const now = input.now ?? new Date().toISOString();
  const position = interpolatePosition(
    input.origin,
    input.destination,
    input.takeoffAt,
    input.landingAt,
    now,
  );
  const cabin: CabinAltitudeEstimate =
    input.pressureHpa != null && Number.isFinite(input.pressureHpa)
      ? {
          pressureHpa: input.pressureHpa,
          cabinAltitudeFeet: Math.round(
            pressureHpaToCabinAltitudeFeet(input.pressureHpa),
          ),
          aircraftAltitudeFeet: input.aircraftAltitudeFeet ?? null,
          phase: detectCabinPhase({
            pressureHpa: input.pressureHpa,
            aircraftAltitudeFeet: input.aircraftAltitudeFeet,
            progress: position.progress,
          }),
          verticalRateFpm: null,
          sampledAt: now,
          source: "BAROMETER",
        }
      : {
          pressureHpa: 0,
          cabinAltitudeFeet: 0,
          aircraftAltitudeFeet: input.aircraftAltitudeFeet ?? null,
          phase: detectCabinPhase({
            pressureHpa: SEA_LEVEL_PRESSURE_HPA,
            aircraftAltitudeFeet: input.aircraftAltitudeFeet,
            progress: position.progress,
          }),
          verticalRateFpm: null,
          sampledAt: now,
          source: "NONE",
        };

  return {
    flightId: input.flight.id,
    flightNumber: input.flight.flightNumber,
    originCode: input.flight.origin.code,
    destinationCode: input.flight.destination.code,
    takeoffAt: input.takeoffAt,
    landingAt: input.landingAt,
    cabin,
    position,
    timeline: buildCabinTimeline(input.takeoffAt, input.landingAt, now),
    callouts: input.landmarks
      ? findLandmarkCallouts(
          input.origin,
          input.destination,
          input.takeoffAt,
          input.landingAt,
          input.landmarks,
        )
      : [],
    generatedAt: now,
  };
}
