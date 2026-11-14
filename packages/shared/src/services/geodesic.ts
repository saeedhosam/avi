import type { HaulCategory } from "../models/routeConnection.js";
const EARTH_RADIUS_KM = 6371.0088;

const toRad = (degrees: number) => (degrees * Math.PI) / 180;
const toDeg = (radians: number) => (radians * 180) / Math.PI;

/** Great-circle distance in kilometres between two verified coordinates. */
export function geodesicDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const rLat1 = toRad(lat1);
  const rLat2 = toRad(lat2);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/** Nautical miles from kilometres. */
export function kmToNm(km: number): number {
  return km * 0.539957;
}

/** Kilometres from nautical miles. */
export function nmToKm(nm: number): number {
  return nm / 0.539957;
}

export function classifyHaul(distanceKm: number): HaulCategory {
  if (distanceKm < 1500) return "SHORT_HAUL";
  if (distanceKm <= 4000) return "MEDIUM_HAUL";
  return "LONG_HAUL";
}

/**
 * Parametric block-time estimate. This is an *estimate* derived from distance
 * (cruise ~815 km/h plus 32 minutes taxi/climb/approach), never a provider
 * schedule fact. UI must label it as estimated.
 */
export function estimateBlockMinutes(distanceKm: number): number {
  const cruiseMinutes = (distanceKm / 815) * 60;
  return Math.max(45, Math.round(cruiseMinutes + 32));
}

export function formatDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return hours > 0 ? `${hours}h ${String(mins).padStart(2, "0")}m` : `${mins}m`;
}

/** Initial bearing from point 1 to point 2, degrees clockwise from north. */
export function initialBearingDegrees(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const rLat1 = toRad(lat1);
  const rLat2 = toRad(lat2);
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(rLat2);
  const x =
    Math.cos(rLat1) * Math.sin(rLat2) -
    Math.sin(rLat1) * Math.cos(rLat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export interface GeoCoordinate {
  latitude: number;
  longitude: number;
}

/**
 * Spherical linear interpolation along the shortest great-circle arc.
 * `progress` is clamped to 0..1; 0 returns the origin and 1 the destination.
 */
export function interpolateGreatCircle(
  origin: GeoCoordinate,
  destination: GeoCoordinate,
  progress: number,
): GeoCoordinate {
  const t = Math.min(1, Math.max(0, progress));
  if (t === 0) return { ...origin };
  if (t === 1) return { ...destination };

  const rLat1 = toRad(origin.latitude);
  const rLon1 = toRad(origin.longitude);
  const rLat2 = toRad(destination.latitude);
  const rLon2 = toRad(destination.longitude);

  const d = 2 * Math.asin(
    Math.sqrt(
      Math.sin((rLat2 - rLat1) / 2) ** 2 +
        Math.cos(rLat1) *
          Math.cos(rLat2) *
          Math.sin((rLon2 - rLon1) / 2) ** 2,
    ),
  );

  if (d === 0) return { ...origin };

  const a = Math.sin((1 - t) * d) / Math.sin(d);
  const b = Math.sin(t * d) / Math.sin(d);
  const x =
    a * Math.cos(rLat1) * Math.cos(rLon1) +
    b * Math.cos(rLat2) * Math.cos(rLon2);
  const y =
    a * Math.cos(rLat1) * Math.sin(rLon1) +
    b * Math.cos(rLat2) * Math.sin(rLon2);
  const z = a * Math.sin(rLat1) + b * Math.sin(rLat2);

  return {
    latitude: toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))),
    longitude: toDeg(Math.atan2(y, x)),
  };
}

export interface GreatCircleSample {
  progress: number;
  position: GeoCoordinate;
  distanceFromOriginKm: number;
}

/** Samples the route for a globe polyline. */
export function sampleGreatCircle(
  origin: GeoCoordinate,
  destination: GeoCoordinate,
  segments = 64,
): GreatCircleSample[] {
  const total = geodesicDistanceKm(
    origin.latitude,
    origin.longitude,
    destination.latitude,
    destination.longitude,
  );
  const count = Math.max(2, Math.floor(segments));
  return Array.from({ length: count + 1 }, (_, index) => {
    const progress = index / count;
    return {
      progress,
      position: interpolateGreatCircle(origin, destination, progress),
      distanceFromOriginKm: total * progress,
    };
  });
}

/** Antimeridian-safe GeoJSON line coordinates `[lon, lat]`. */
export function greatCircleGeoJsonLine(
  origin: GeoCoordinate,
  destination: GeoCoordinate,
  segments = 64,
): Array<[number, number]> {
  return sampleGreatCircle(origin, destination, segments).map((sample) => [
    sample.position.longitude,
    sample.position.latitude,
  ]);
}

/** Shared coarse region inference used by the route catalog. */
export function inferRegionFromCoords(
  latitude: number,
  longitude: number,
): import("../models/routeConnection.js").RouteRegion {
  if (longitude < -25) return "AMERICAS";
  if (latitude >= 15 && latitude <= 38 && longitude >= -18 && longitude <= 60) {
    return "MENA";
  }
  if (latitude < 15 && longitude >= -20 && longitude <= 55) return "AFRICA";
  if (longitude > 60) return "ASIA_PACIFIC";
  return "EUROPE";
}
