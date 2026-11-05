import {
  AttributionControl,
  type GeoJSONSource,
  type LayerSpecification,
  type Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
  Map as MapLibreMapClass,
  setWorkerUrl,
} from "maplibre-gl";
import type {
  Feature,
  FeatureCollection,
  Geometry,
  LineString,
  Point,
  Position,
} from "geojson";

setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

export const MAP_STYLE_URL = "/map/style.json";

export const MAP_COLORS = {
  ocean: "#CBE7F9",
  land: "#F2F3F5",
  border: "#D3D8E0",
  routeRemaining: "#D94A6A",
  routeTraveled: "#0077FF",
  radarCyan: "#00E5FF",
  ink: "#071018",
  white: "#FFFFFF",
} as const;

export function createBaseMap(
  container: HTMLElement,
  options: { center?: [number, number]; zoom?: number; minZoom?: number; maxZoom?: number } = {},
): MapLibreMap {
  const map = new MapLibreMapClass({
    container,
    style: MAP_STYLE_URL,
    center: options.center ?? [10, 24],
    zoom: options.zoom ?? 2,
    minZoom: options.minZoom ?? 1,
    maxZoom: options.maxZoom ?? 12,
    renderWorldCopies: true,
    dragRotate: false,
    pitchWithRotate: false,
    attributionControl: false,
  });

  map.addControl(
    new AttributionControl({
      compact: true,
      customAttribution: "© OpenStreetMap contributors · OpenFreeMap",
    }),
    "bottom-right",
  );
  map.addControl(new NavigationControl({ showCompass: false }), "top-right");
  map.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");

  return map;
}

export function setGeoJson(
  map: MapLibreMap,
  id: string,
  data: FeatureCollection<Geometry> | FeatureCollection<Geometry, Record<string, unknown>>,
) {
  const source = map.getSource(id) as GeoJSONSource | undefined;
  if (source) {
    source.setData(data as never);
    return;
  }
  map.addSource(id, { type: "geojson", data: data as never });
}

export function ensureLayer(map: MapLibreMap, layer: LayerSpecification) {
  if (!map.getLayer(layer.id)) map.addLayer(layer);
}

export function pointFeature(
  id: string,
  coordinates: Position,
  properties: Record<string, unknown>,
): Feature<Point> {
  return {
    type: "Feature",
    id,
    geometry: { type: "Point", coordinates },
    properties,
  };
}

export function lineFeature(
  coordinates: Position[],
  properties: Record<string, unknown>,
): Feature<LineString> {
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates },
    properties,
  };
}

export function collection(features: Feature[]): FeatureCollection<Geometry> {
  return { type: "FeatureCollection", features };
}
