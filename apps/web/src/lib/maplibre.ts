import {
  AttributionControl,
  type GeoJSONSource,
  type LayerSpecification,
  type Map as MapLibreMap,
  NavigationControl,
  Map as MapLibreMapClass,
  setWorkerUrl,
  type StyleSpecification,
} from "maplibre-gl";
import type {
  Feature,
  FeatureCollection,
  Geometry,
  LineString,
  Point,
  Position,
} from "geojson";
import { PALETTE } from "./palette";

setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

/** The single dark cockpit basemap used by every map surface. */
export const MAP_STYLE_URL = "/map/style.json";

export const MAP_COLORS = {
  ocean: PALETTE.map.ocean,
  land: PALETTE.map.land,
  border: PALETTE.map.border,
  routeRemaining: PALETTE.map.routeRemaining,
  routeTraveled: PALETTE.map.routeTraveled,
  accent: PALETTE.accent,
  ink: PALETTE.background,
  highlight: PALETTE.map.highlight,
} as const;

export function createBaseMap(
  container: HTMLElement,
  options: {
    center?: [number, number];
    zoom?: number;
    minZoom?: number;
    maxZoom?: number;
    attribution?: boolean;
    /** Built-in +/- control. Custom map HUDs supply their own controls. */
    navigation?: boolean;
    /** Local style for a network-free first paint; defaults to the full style. */
    style?: StyleSpecification | string | (() => StyleSpecification | string);
  } = {},
): MapLibreMap {
  const style =
    typeof options.style === "function"
      ? options.style()
      : (options.style ?? MAP_STYLE_URL);
  const map = new MapLibreMapClass({
    container,
    style,
    center: options.center ?? [10, 24],
    zoom: options.zoom ?? 2,
    minZoom: options.minZoom ?? 1,
    maxZoom: options.maxZoom ?? 12,
    renderWorldCopies: true,
    dragRotate: false,
    pitchWithRotate: false,
    attributionControl: false,
  });

  if (options.attribution !== false) {
    const attribControl = new AttributionControl({
      compact: true,
      customAttribution:
        "© OpenStreetMap contributors · Tiles by OpenFreeMap · Weather data by Open-Meteo",
    });
    map.addControl(attribControl, "bottom-right");

    const collapseAttribution = () => {
      const attribContainer = (
        attribControl as unknown as { _container?: HTMLElement }
      )._container;
      if (attribContainer) {
        attribContainer.classList.add("maplibregl-compact");
        attribContainer.classList.remove("maplibregl-compact-show");
        attribContainer.removeAttribute("open");
      }
    };

    collapseAttribution();
    map.on("load", collapseAttribution);
    map.on("styledata", collapseAttribution);
  }

  if (options.navigation) {
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
  }

  return map;
}

export function setGeoJson(
  map: MapLibreMap,
  id: string,
  data:
    | FeatureCollection<Geometry>
    | FeatureCollection<Geometry, Record<string, unknown>>,
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

/**
 * Hide base-map place names while a hub or route is selected so the IATA and
 * route labels remain readable. Custom avi-* layers are never touched.
 */
export function setBaseSymbolLayersVisible(map: MapLibreMap, visible: boolean) {
  const style = map.getStyle();
  if (!style) return;
  const layers = style.layers ?? [];
  for (const layer of layers) {
    if (layer.type !== "symbol" || layer.id.startsWith("avi-")) continue;
    if (!map.getLayer(layer.id)) continue;
    map.setLayoutProperty(layer.id, "visibility", visible ? "visible" : "none");
  }
}

export function ensureAircraftImage(map: MapLibreMap) {
  if (map.hasImage("avi-aircraft")) return;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, 64, 64);
  context.translate(32, 32);
  context.beginPath();
  context.moveTo(0, -27);
  context.lineTo(6, -7);
  context.lineTo(28, 4);
  context.lineTo(28, 11);
  context.lineTo(6, 6);
  context.lineTo(6, 21);
  context.lineTo(14, 27);
  context.lineTo(14, 31);
  context.lineTo(0, 27);
  context.lineTo(-14, 31);
  context.lineTo(-14, 27);
  context.lineTo(-6, 21);
  context.lineTo(-6, 6);
  context.lineTo(-28, 11);
  context.lineTo(-28, 4);
  context.lineTo(-6, -7);
  context.closePath();
  context.fillStyle = MAP_COLORS.accent;
  context.strokeStyle = MAP_COLORS.ink;
  context.lineWidth = 2;
  context.fill();
  context.stroke();
  map.addImage("avi-aircraft", context.getImageData(0, 0, 64, 64));
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
  const id = properties.id;
  return {
    type: "Feature",
    ...(typeof id === "string" || typeof id === "number" ? { id } : {}),
    geometry: { type: "LineString", coordinates },
    properties,
  };
}

export function collection(features: Feature[]): FeatureCollection<Geometry> {
  return { type: "FeatureCollection", features };
}
