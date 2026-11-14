import type { FeatureCollection, MultiPolygon, Point } from "geojson";
import rawCountries from "@avi/shared/assets/world_countries.json";

interface RawCountry {
  n: string;
  lat: number;
  lon: number;
  a: number;
  r: number[][][]; // rings of [lat, lon]
}

export interface CountryProperties {
  id: number;
  name: string;
  lat: number;
  lon: number;
  area: number;
}

let cachedPolygons: FeatureCollection<MultiPolygon, CountryProperties> | null = null;
let cachedPoints: FeatureCollection<Point, CountryProperties> | null = null;

export function getCountriesGeoJson(): {
  polygons: FeatureCollection<MultiPolygon, CountryProperties>;
  points: FeatureCollection<Point, CountryProperties>;
} {
  if (cachedPolygons && cachedPoints) {
    return { polygons: cachedPolygons, points: cachedPoints };
  }

  const polygonFeatures: FeatureCollection<MultiPolygon, CountryProperties>["features"] = [];
  const pointFeatures: FeatureCollection<Point, CountryProperties>["features"] = [];

  const list = rawCountries as unknown as RawCountry[];

  for (let idx = 0; idx < list.length; idx++) {
    const item = list[idx];
    const id = idx + 1;
    const name = item.n.replace(/\n/g, " ").trim();
    const polyCoords: [number, number][][][] = [];

    for (const ring of item.r) {
      if (!ring || ring.length < 3) continue;
      const pts: [number, number][] = ring.map(([lat, lon]) => [lon, lat]);
      // Ensure the linear ring is closed
      if (
        pts[0][0] !== pts[pts.length - 1][0] ||
        pts[0][1] !== pts[pts.length - 1][1]
      ) {
        pts.push([pts[0][0], pts[0][1]]);
      }
      if (pts.length >= 4) {
        polyCoords.push([pts]);
      }
    }

    if (polyCoords.length > 0) {
      const properties: CountryProperties = {
        id,
        name,
        lat: item.lat,
        lon: item.lon,
        area: item.a,
      };

      polygonFeatures.push({
        type: "Feature",
        id,
        properties,
        geometry: {
          type: "MultiPolygon",
          coordinates: polyCoords,
        },
      });

      pointFeatures.push({
        type: "Feature",
        id,
        properties,
        geometry: {
          type: "Point",
          coordinates: [item.lon, item.lat],
        },
      });
    }
  }

  cachedPolygons = { type: "FeatureCollection", features: polygonFeatures };
  cachedPoints = { type: "FeatureCollection", features: pointFeatures };

  return { polygons: cachedPolygons, points: cachedPoints };
}
