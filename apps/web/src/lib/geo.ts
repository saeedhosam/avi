export type LngLat = [number, number];

/**
 * Interpolate a great-circle path between two airports.
 * Coordinates are [longitude, latitude] to match MapLibre/GeoJSON.
 */
export function greatCircle(
  origin: LngLat,
  destination: LngLat,
  steps = 128,
): LngLat[] {
  const [lon1, lat1] = origin.map(toRadians) as LngLat;
  const [lon2, lat2] = destination.map(toRadians) as LngLat;
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const angularDistance = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  if (angularDistance < 1e-6) return [origin, destination];

  const points: LngLat[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const fraction = index / steps;
    const A = Math.sin((1 - fraction) * angularDistance) / Math.sin(angularDistance);
    const B = Math.sin(fraction * angularDistance) / Math.sin(angularDistance);
    const x =
      A * Math.cos(lat1) * Math.cos(lon1) +
      B * Math.cos(lat2) * Math.cos(lon2);
    const y =
      A * Math.cos(lat1) * Math.sin(lon1) +
      B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    points.push([toDegrees(Math.atan2(y, x)), toDegrees(Math.atan2(z, Math.hypot(x, y)))]);
  }
  return unwrap(points);
}

/** Keep longitude continuous so MapLibre draws the short side of the date line. */
export function unwrap(line: LngLat[]): LngLat[] {
  const result: LngLat[] = [];
  for (const [lon, lat] of line) {
    if (result.length) {
      const previous = result[result.length - 1]![0];
      let candidate = lon;
      while (candidate - previous > 180) candidate -= 360;
      while (previous - candidate > 180) candidate += 360;
      result.push([candidate, lat]);
    } else {
      result.push([lon, lat]);
    }
  }
  return result;
}

export function routeCoordinates(origin: LngLat, destination: LngLat): LngLat[] {
  return greatCircle(origin, destination);
}

export function midpoint(points: LngLat[]): LngLat {
  const point = points[Math.floor(points.length / 2)] ?? [0, 0];
  return [point[0], point[1]];
}

export function destinationAlong(
  start: LngLat,
  end: LngLat,
  fraction: number,
): LngLat {
  const [lon1, lat1] = start.map(toRadians) as LngLat;
  const [lon2, lat2] = end.map(toRadians) as LngLat;
  const d = Math.acos(
    Math.min(
      1,
      Math.max(
        -1,
        Math.sin(lat1) * Math.sin(lat2) +
          Math.cos(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1),
      ),
    ),
  );
  if (d < 1e-6) return end;
  const A = Math.sin((1 - fraction) * d) / Math.sin(d);
  const B = Math.sin(fraction * d) / Math.sin(d);
  const x =
    A * Math.cos(lat1) * Math.cos(lon1) +
    B * Math.cos(lat2) * Math.cos(lon2);
  const y =
    A * Math.cos(lat1) * Math.sin(lon1) +
    B * Math.cos(lat2) * Math.sin(lon2);
  const z = A * Math.sin(lat1) + B * Math.sin(lat2);
  return [toDegrees(Math.atan2(y, x)), toDegrees(Math.atan2(z, Math.hypot(x, y)))];
}

export function headingDestination(start: LngLat, heading: number, distanceNm: number): LngLat {
  const distance = distanceNm / 60;
  const [lon, lat] = start.map(toRadians) as LngLat;
  const bearing = toRadians(heading);
  const lat2 = Math.asin(
    Math.sin(lat) * Math.cos(distance) +
      Math.cos(lat) * Math.sin(distance) * Math.cos(bearing),
  );
  const lon2 =
    lon +
    Math.atan2(
      Math.sin(bearing) * Math.sin(distance) * Math.cos(lat),
      Math.cos(distance) - Math.sin(lat) * Math.sin(lat2),
    );
  return [toDegrees(lon2), toDegrees(lat2)];
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number) {
  return (value * 180) / Math.PI;
}
