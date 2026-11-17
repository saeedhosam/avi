import type {
  ExpressionSpecification,
  GeoJSONSourceSpecification,
  LayerSpecification,
  Map as MapLibreMap,
  MapSourceDataEvent,
  StyleSpecification,
} from "maplibre-gl";
import { getCountriesGeoJson } from "./country-geojson";
import { MAP_STYLE_URL } from "./maplibre";
import { PALETTE } from "./palette";

const LOCAL_COUNTRY_SOURCE_ID = "avi-local-countries";
const LOCAL_LAND_LAYER_ID = "avi-local-land";
const LOCAL_BORDER_LAYER_ID = "avi-local-border";
const DETAIL_SOURCE_ID = "openmaptiles";
const DETAIL_ZOOM_THRESHOLD = 3.5;

const countries: GeoJSONSourceSpecification = {
  type: "geojson",
  data: getCountriesGeoJson().polygons,
};

/**
 * An intentionally network-free basemap. The ocean, country fills, and borders
 * are rendered from the bundled `world_countries.json`, so the globe and its
 * airport dots can paint before any tile request starts.
 */
const LOCAL_BASEMAP_STYLE: StyleSpecification = {
  version: 8,
  name: "Avi local globe",
  glyphs: "/map/glyphs/{fontstack}/{range}.pbf",
  sources: {
    [LOCAL_COUNTRY_SOURCE_ID]: countries,
  },
  layers: [
    {
      id: "avi-local-ocean",
      type: "background",
      paint: { "background-color": PALETTE.map.ocean },
    },
    {
      id: LOCAL_LAND_LAYER_ID,
      type: "fill",
      source: LOCAL_COUNTRY_SOURCE_ID,
      paint: {
        "fill-color": PALETTE.map.land,
        "fill-opacity": 1,
      },
    },
    {
      id: LOCAL_BORDER_LAYER_ID,
      type: "line",
      source: LOCAL_COUNTRY_SOURCE_ID,
      paint: {
        "line-color": PALETTE.map.border,
        "line-width": 0.6,
        "line-opacity": 0.9,
      },
    },
  ],
};

/**
 * MapLibre requires sprite URLs to be absolute when the style is passed as an
 * object. Resolve it at map-creation time, after `window` is available.
 */
export function createLocalBasemapStyle(): StyleSpecification {
  return {
    ...LOCAL_BASEMAP_STYLE,
    sprite: new URL("/map/sprite/ofm", window.location.origin).toString(),
  };
}

/**
 * The detail style is worldwide, but the globe only reaches zoom 6. Prefer
 * English/Latin labels there so the local glyph subset can serve every visible
 * label range.
 */
const LATIN_NAME_EXPRESSION: ExpressionSpecification = [
  "coalesce",
  ["get", "name_en"],
  ["get", "name:latin"],
  ["get", "name"],
];

function preferLatinLabels(style: StyleSpecification): StyleSpecification {
  for (const layer of style.layers) {
    if (layer.type !== "symbol") continue;
    if (!layer.id.startsWith("label_") && !layer.id.startsWith("water_name")) {
      continue;
    }
    const layout = layer.layout as unknown as
      Record<string, unknown> | undefined;
    if (!layout || !("text-field" in layout)) continue;
    layout["text-field"] = LATIN_NAME_EXPRESSION;
    layer.layout = layout as typeof layer.layout;
  }
  return style;
}

let detailStylePromise: Promise<StyleSpecification> | null = null;

function loadDetailStyle(): Promise<StyleSpecification> {
  if (!detailStylePromise) {
    detailStylePromise = fetch(MAP_STYLE_URL, { cache: "force-cache" })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Map style request failed (${response.status}).`);
        }
        return response.json() as Promise<StyleSpecification>;
      })
      .then(preferLatinLabels)
      .catch((error: unknown) => {
        detailStylePromise = null;
        throw error;
      });
  }
  return detailStylePromise;
}

function fadeLocalCountries(map: MapLibreMap): void {
  let fadeScheduled = false;
  let faded = false;
  let fadeTimer: number | undefined;

  const cleanup = () => {
    try {
      map.off("sourcedata", onSourceData);
    } catch {
      // The map may already be removed.
    }
    if (fadeTimer !== undefined) window.clearTimeout(fadeTimer);
  };

  const fade = () => {
    if (faded) return;
    faded = true;
    cleanup();
    try {
      if (map.getLayer(LOCAL_LAND_LAYER_ID)) {
        map.setPaintProperty(LOCAL_LAND_LAYER_ID, "fill-opacity-transition", {
          duration: 500,
          delay: 0,
        });
        map.setPaintProperty(LOCAL_LAND_LAYER_ID, "fill-opacity", 0);
      }
      if (map.getLayer(LOCAL_BORDER_LAYER_ID)) {
        map.setPaintProperty(LOCAL_BORDER_LAYER_ID, "line-opacity-transition", {
          duration: 500,
          delay: 0,
        });
        map.setPaintProperty(LOCAL_BORDER_LAYER_ID, "line-opacity", 0);
      }
    } catch {
      return;
    }

    window.setTimeout(() => {
      try {
        if (map.getLayer(LOCAL_LAND_LAYER_ID)) {
          map.removeLayer(LOCAL_LAND_LAYER_ID);
        }
        if (map.getLayer(LOCAL_BORDER_LAYER_ID)) {
          map.removeLayer(LOCAL_BORDER_LAYER_ID);
        }
        if (map.getSource(LOCAL_COUNTRY_SOURCE_ID)) {
          map.removeSource(LOCAL_COUNTRY_SOURCE_ID);
        }
      } catch {
        // The map may have been removed while the fade was running.
      }
    }, 550);
  };

  const onSourceData = (event: MapSourceDataEvent) => {
    if (event.sourceId !== DETAIL_SOURCE_ID || !event.tile || fadeScheduled) {
      return;
    }
    fadeScheduled = true;
    fadeTimer = window.setTimeout(fade, 250);
  };

  map.on("sourcedata", onSourceData);
  // If tiles never arrive, keep the local globe visible instead of blanking.
  window.setTimeout(cleanup, 15000);
}

async function upgradeBasemap(map: MapLibreMap): Promise<void> {
  const style = await loadDetailStyle();
  if (!map.getStyle()) return;

  const referencedSources = new Set<string>();
  for (const layer of style.layers) {
    if (
      layer.type !== "background" &&
      "source" in layer &&
      typeof layer.source === "string"
    ) {
      referencedSources.add(layer.source);
    }
  }

  for (const sourceId of referencedSources) {
    if (map.getSource(sourceId)) continue;
    const source = style.sources[sourceId];
    if (source) map.addSource(sourceId, source);
  }

  const layers = map.getStyle()?.layers ?? [];
  const firstLocalLayer = map.getLayer(LOCAL_LAND_LAYER_ID)
    ? LOCAL_LAND_LAYER_ID
    : layers.find(
        (layer) => layer.id.startsWith("avi-") && layer.type !== "background",
      )?.id;
  const anchor = firstLocalLayer;

  for (const layer of style.layers) {
    if (layer.type === "background") continue;
    if (
      "source" in layer &&
      typeof layer.source === "string" &&
      !map.getSource(layer.source)
    ) {
      continue;
    }
    if (map.getLayer(layer.id)) continue;
    try {
      map.addLayer(layer as LayerSpecification, anchor);
    } catch (error) {
      console.warn(`Unable to add basemap layer ${layer.id}.`, error);
    }
  }

  fadeLocalCountries(map);
}

/**
 * Starts the tile-backed basemap after the local globe has painted, on idle,
 * or immediately when the user zooms far enough to need detail.
 */
export function scheduleBasemapUpgrade(map: MapLibreMap): () => void {
  let started = false;
  let cancelled = false;

  const start = () => {
    if (started || cancelled) return;
    started = true;
    void upgradeBasemap(map).catch((error: unknown) => {
      console.warn("Avi basemap tiles could not be loaded.", error);
    });
  };

  const onZoom = () => {
    if (map.getZoom() >= DETAIL_ZOOM_THRESHOLD) start();
  };
  map.on("zoom", onZoom);

  const idleWindow = window as Window & {
    requestIdleCallback?: (
      callback: () => void,
      options?: { timeout: number },
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  let idleHandle: number;
  const useIdleCallback = typeof idleWindow.requestIdleCallback === "function";
  if (useIdleCallback) {
    idleHandle = idleWindow.requestIdleCallback!(start, { timeout: 1800 });
  } else {
    idleHandle = window.setTimeout(start, 400);
  }

  return () => {
    cancelled = true;
    try {
      map.off("zoom", onZoom);
    } catch {
      // The map may already be removed.
    }
    if (useIdleCallback) idleWindow.cancelIdleCallback?.(idleHandle);
    else window.clearTimeout(idleHandle);
  };
}
