"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { LngLatBounds, Marker, type MapLayerMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { AirportNode, DirectFlightConnection, Flight } from "@/lib/types";
import {
  findAirportNode,
  routeAirports,
  type GlobalAirportNode,
} from "@/lib/data";
import { routeCoordinates } from "@/lib/geo";
import { PALETTE } from "@/lib/palette";
import { cn } from "@/lib/utils";
import {
  collection,
  ensureLayer,
  lineFeature,
  pointFeature,
  setBaseSymbolLayersVisible,
  setGeoJson,
} from "@/lib/maplibre";
import { useMapLibre } from "@/lib/use-maplibre";
import { FlightMap } from "./flight-map";
import { RotateCcw, X, Info } from "lucide-react";

export interface OsmRouteMapProps {
  connections: DirectFlightConnection[];
  origin: AirportNode | null;
  selected: AirportNode | null;
  selectedRoute: DirectFlightConnection | null;
  onSelectAirport: (iata: string) => void;
  onClearOrigin?: () => void;
  onClearDestination?: () => void;
  onReset?: () => void;
  className?: string;
}

const routeCoordsCache = new Map<string, [number, number][]>();

const NO_ROUTE_COUNT_RADIUS = 2.2;

/** Hover treatment for routes: full-contrast white on the dark basemap. */
const HOVER_COLOR = PALETTE.map.highlight;
/** Hover is an active state: highlight with the single accent hue. */
const HOVER_CIRCLE_COLOR = PALETTE.accent;
const HOVER_RADIUS_SCALE = 1.25;

const ROUTE_COUNT_BUCKETS = [
  { label: "1–3", radius: 2.6 },
  { label: "4–8", radius: 3.2 },
  { label: "9–15", radius: 3.8 },
  { label: "16+", radius: 4.5 },
] as const;

/** Origin/selected emphasis bump on top of the tier radius. */
const EMPHASIS_BOOST = 2;

/**
 * FlightConnections-style reference-count ramp: sparse airports in signal red,
 * rising through amber to blue, with mega-hubs in deep navy. Radius encodes the
 * same value, so colour and size reinforce each other.
 */
const ROUTE_COUNT_PALETTE = [
  PALETTE.status.CANCELLED.color,
  PALETTE.status.DELAYED.color,
  PALETTE.accentMuted,
  PALETTE.map.routeTraveled,
];

const NO_ROUTE_COUNT_COLOR = PALETTE.subtle;

/** Basemap-matched outline so small circles stay crisp and separated. */
const CIRCLE_STROKE = { color: "rgba(226, 239, 255, 0.65)", width: 0.5 };

/** Each color tier has one fixed radius, so same-tier circles match. */
function routeCountRadius(count: number): number {
  if (!Number.isFinite(count) || count <= 0) return NO_ROUTE_COUNT_RADIUS;
  if (count <= 3) return ROUTE_COUNT_BUCKETS[0].radius;
  if (count <= 8) return ROUTE_COUNT_BUCKETS[1].radius;
  if (count <= 15) return ROUTE_COUNT_BUCKETS[2].radius;
  return ROUTE_COUNT_BUCKETS[3].radius;
}

export function OsmRouteMap({
  connections,
  origin,
  selected,
  selectedRoute,
  onSelectAirport,
  onClearOrigin,
  onClearDestination,
  onReset,
  className,
}: OsmRouteMapProps) {
  const { containerRef, map } = useMapLibre({
    center: [10, 22],
    zoom: 2,
    minZoom: 1.4,
    maxZoom: 9,
    attribution: false, // Requirement 3: simple, non-toggleable attribution handled manually
  });

  const [hoveredAirport, setHoveredAirport] = useState<{
    iata: string;
    name: string;
    city: string;
    x: number;
    y: number;
  } | null>(null);

  const [legendVisible, setLegendVisible] = useState(true);

  const originMarkerRef = useRef<Marker | null>(null);
  const destMarkerRef = useRef<Marker | null>(null);
  const lastFitRef = useRef("");
  const clickHandlerRef = useRef<((event: MapLayerMouseEvent) => void) | null>(
    null,
  );
  const lineClickHandlerRef = useRef<
    ((event: MapLayerMouseEvent) => void) | null
  >(null);
  const hoveredAirportIdRef = useRef<string | null>(null);
  const hoveredRouteIdRef = useRef<string | null>(null);

  // Clear fit cache on map recreation
  useEffect(() => {
    lastFitRef.current = "";
  }, [map]);

  // Manage Origin DOM Marker
  useEffect(() => {
    if (!map) return;
    if (originMarkerRef.current) {
      originMarkerRef.current.remove();
      originMarkerRef.current = null;
    }

    if (origin) {
      const el = document.createElement("div");
      el.className =
        "pointer-events-auto flex items-center gap-1.5 rounded-lg border border-accent/45 bg-surface/95 px-2.5 py-1 text-xs font-medium tracking-wide text-ink shadow-xl backdrop-blur whitespace-nowrap select-none cursor-pointer transform -translate-y-3";

      const label = document.createElement("span");
      label.textContent = `${origin.city} (${origin.iata})`;
      el.appendChild(label);

      if (onClearOrigin) {
        const closeBtn = document.createElement("button");
        closeBtn.innerHTML = "✕";
        closeBtn.title = "Clear origin";
        closeBtn.className =
          "ml-1 flex size-5 items-center justify-center rounded-full bg-surface-2 text-xs leading-none text-muted transition-colors hover:bg-surface-3 hover:text-ink";
        closeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          onClearOrigin();
        });
        el.appendChild(closeBtn);
      }

      const marker = new Marker({ element: el, anchor: "bottom" })
        .setLngLat([origin.longitude, origin.latitude])
        .addTo(map);

      originMarkerRef.current = marker;
    }

    return () => {
      if (originMarkerRef.current) {
        originMarkerRef.current.remove();
        originMarkerRef.current = null;
      }
    };
  }, [map, origin, onClearOrigin]);

  // Manage Destination DOM Marker
  useEffect(() => {
    if (!map) return;
    if (destMarkerRef.current) {
      destMarkerRef.current.remove();
      destMarkerRef.current = null;
    }

    if (selected) {
      const el = document.createElement("div");
      el.className =
        "pointer-events-auto flex flex-col rounded-lg border border-accent/45 bg-surface/95 px-2.5 py-1 text-xs font-medium tracking-wide text-ink shadow-xl backdrop-blur whitespace-nowrap select-none cursor-pointer transform -translate-y-3";

      const header = document.createElement("div");
      header.className = "flex items-center justify-between gap-1.5";

      const label = document.createElement("span");
      label.textContent = `${selected.city} (${selected.iata})`;
      header.appendChild(label);

      if (onClearDestination) {
        const closeBtn = document.createElement("button");
        closeBtn.innerHTML = "✕";
        closeBtn.title = "Deselect destination";
        closeBtn.className =
          "flex size-5 items-center justify-center rounded-full bg-surface-2 text-xs leading-none text-muted transition-colors hover:bg-surface-3 hover:text-ink";
        closeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          onClearDestination();
        });
        header.appendChild(closeBtn);
      }
      el.appendChild(header);

      const sub = document.createElement("span");
      sub.className = "mt-0.5 text-xs font-medium text-accent";
      sub.textContent = "View route details ›";
      el.appendChild(sub);

      const marker = new Marker({ element: el, anchor: "bottom" })
        .setLngLat([selected.longitude, selected.latitude])
        .addTo(map);

      destMarkerRef.current = marker;
    }

    return () => {
      if (destMarkerRef.current) {
        destMarkerRef.current.remove();
        destMarkerRef.current = null;
      }
    };
  }, [map, selected, onClearDestination]);

  // Memoize Direct Route Network Lines GeoJSON features with cached geodesic coordinates
  const routeFeatures = useMemo(() => {
    return connections.map((connection) => {
      let coords = routeCoordsCache.get(connection.id);
      if (!coords) {
        coords = routeCoordinates(
          [connection.origin.longitude, connection.origin.latitude],
          [connection.destination.longitude, connection.destination.latitude],
        );
        routeCoordsCache.set(connection.id, coords);
      }
      return lineFeature(coords, {
        id: connection.id,
        selected: connection.id === selectedRoute?.id,
        destinationIata: connection.destination.iata,
      });
    });
  }, [connections, selectedRoute?.id]);

  // Memoize Airport Points GeoJSON features
  const airportFeatures = useMemo(() => {
    const airportMap = new Map<string, GlobalAirportNode>();
    if (!origin) {
      for (const airport of routeAirports) {
        airportMap.set(airport.iata, airport);
      }
    } else {
      const originFull = findAirportNode(origin.iata) ?? origin;
      airportMap.set(origin.iata, originFull);
      for (const c of connections) {
        const destFull = findAirportNode(c.destination.iata) ?? c.destination;
        airportMap.set(destFull.iata, destFull);
      }
      if (selected) {
        const selFull = findAirportNode(selected.iata) ?? selected;
        airportMap.set(selFull.iata, selFull);
      }
    }

    return Array.from(airportMap.values()).map((airport) =>
      pointFeature(airport.iata, [airport.longitude, airport.latitude], {
        iata: airport.iata,
        city: airport.city,
        name: airport.name,
        referenceRouteCount: airport.destCount ?? 0,
        referenceRouteRadius: routeCountRadius(airport.destCount ?? 0),
        isOrigin: airport.iata === origin?.iata,
        isSelected: airport.iata === selected?.iata,
        isConnected: true,
      }),
    );
  }, [connections, origin, selected]);

  // Update GeoJSON Layers & Routes
  useEffect(() => {
    if (!map) return;

    // 1. Hide state/provincial/regional borders & base symbol text labels
    if (map.getLayer("boundary_3")) {
      map.setLayoutProperty("boundary_3", "visibility", "none");
    }
    setBaseSymbolLayersVisible(map, false);

    // 2. Set Route Network Lines
    setGeoJson(map, "avi-route-network", collection(routeFeatures));

    ensureLayer(map, {
      id: "avi-route-network-lines",
      type: "line",
      source: "avi-route-network",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          HOVER_COLOR,
          ["get", "selected"],
          PALETTE.accent,
          PALETTE.map.routeTraveled,
        ],
        "line-width": [
          "case",
          ["get", "selected"],
          3.8,
          ["boolean", ["feature-state", "hover"], false],
          2.6,
          1.2,
        ],
        "line-opacity": [
          "case",
          ["get", "selected"],
          1,
          ["boolean", ["feature-state", "hover"], false],
          1,
          0.5,
        ],
      },
    });

    // 3. Set Airport Features
    setGeoJson(map, "avi-route-airports", collection(airportFeatures));

    // Circle fill and radius encode the bundled OpenFlights-derived reference
    // route count. It is not live connectivity; the legend labels it as
    // reference.
    ensureLayer(map, {
      id: "avi-route-airport-circles",
      type: "circle",
      source: "avi-route-airports",
      // Larger circles sort above smaller ones within the layer, so busy hubs
      // are never buried under specks.
      layout: { "circle-sort-key": ["get", "referenceRouteRadius"] },
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          1.5,
          [
            "*",
            [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              HOVER_RADIUS_SCALE,
              1,
            ],
            [
              "case",
              ["get", "isSelected"],
              ["+", ["get", "referenceRouteRadius"], EMPHASIS_BOOST],
              ["get", "isOrigin"],
              ["+", ["get", "referenceRouteRadius"], EMPHASIS_BOOST],
              ["get", "referenceRouteRadius"],
            ],
          ],
          6,
          [
            "*",
            [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              HOVER_RADIUS_SCALE,
              1,
            ],
            [
              "case",
              ["get", "isSelected"],
              [
                "+",
                ["*", ["get", "referenceRouteRadius"], 1.15],
                EMPHASIS_BOOST,
              ],
              ["get", "isOrigin"],
              [
                "+",
                ["*", ["get", "referenceRouteRadius"], 1.15],
                EMPHASIS_BOOST,
              ],
              ["*", ["get", "referenceRouteRadius"], 1.15],
            ],
          ],
        ],
        "circle-color": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          HOVER_CIRCLE_COLOR,
          [
            "step",
            ["coalesce", ["get", "referenceRouteCount"], 0],
            NO_ROUTE_COUNT_COLOR,
            1,
            ROUTE_COUNT_PALETTE[0],
            4,
            ROUTE_COUNT_PALETTE[1],
            9,
            ROUTE_COUNT_PALETTE[2],
            16,
            ROUTE_COUNT_PALETTE[3],
          ],
        ],
        "circle-stroke-color": CIRCLE_STROKE.color,
        "circle-stroke-width": CIRCLE_STROKE.width,
        "circle-opacity": 1.0,
      },
    });

    // Invisible hitbox layer for effortless airport clicking
    ensureLayer(map, {
      id: "avi-route-airport-hitboxes",
      type: "circle",
      source: "avi-route-airports",
      paint: {
        "circle-radius": 14,
        "circle-opacity": 0,
        "circle-stroke-opacity": 0,
      },
    });

    // 4. Click Handling (Airports & Route Lines)
    if (clickHandlerRef.current) {
      map.off("click", "avi-route-airport-hitboxes", clickHandlerRef.current);
      map.off("click", "avi-route-airport-circles", clickHandlerRef.current);
    }
    const handleAirportClick = (event: MapLayerMouseEvent) => {
      const iata = event.features?.[0]?.properties?.iata;
      if (typeof iata === "string") onSelectAirport(iata);
    };
    clickHandlerRef.current = handleAirportClick;
    map.on("click", "avi-route-airport-hitboxes", handleAirportClick);
    map.on("click", "avi-route-airport-circles", handleAirportClick);

    if (lineClickHandlerRef.current) {
      map.off("click", "avi-route-network-lines", lineClickHandlerRef.current);
    }
    const handleLineClick = (event: MapLayerMouseEvent) => {
      const destIata = event.features?.[0]?.properties?.destinationIata;
      if (typeof destIata === "string") onSelectAirport(destIata);
    };
    lineClickHandlerRef.current = handleLineClick;
    map.on("click", "avi-route-network-lines", handleLineClick);

    // 5. Hover Handling
    const setAirportHover = (id: string | null) => {
      if (!map.getStyle() || !map.getSource("avi-route-airports")) return;
      if (hoveredAirportIdRef.current === id) return;
      if (hoveredAirportIdRef.current && hoveredAirportIdRef.current !== id) {
        map.setFeatureState(
          { source: "avi-route-airports", id: hoveredAirportIdRef.current },
          { hover: false },
        );
      }
      hoveredAirportIdRef.current = id;
      if (id) {
        map.setFeatureState(
          { source: "avi-route-airports", id },
          { hover: true },
        );
      }
    };

    const setRouteHover = (id: string | null) => {
      if (!map.getStyle() || !map.getSource("avi-route-network")) return;
      if (hoveredRouteIdRef.current === id) return;
      if (hoveredRouteIdRef.current && hoveredRouteIdRef.current !== id) {
        map.setFeatureState(
          { source: "avi-route-network", id: hoveredRouteIdRef.current },
          { hover: false },
        );
      }
      hoveredRouteIdRef.current = id;
      if (id) {
        map.setFeatureState(
          { source: "avi-route-network", id },
          { hover: true },
        );
      }
    };

    const handleAirportMouseMove = (event: MapLayerMouseEvent) => {
      const feat = event.features?.[0];
      const iata = feat?.properties?.iata;
      const name = feat?.properties?.name;
      const city = feat?.properties?.city;

      if (typeof iata === "string") {
        setAirportHover(iata);
        map.getCanvas().style.cursor = "pointer";
        if (iata !== origin?.iata && iata !== selected?.iata) {
          setHoveredAirport((prev) => {
            if (
              prev?.iata === iata &&
              Math.abs(prev.x - event.point.x) < 4 &&
              Math.abs(prev.y - event.point.y) < 4
            ) {
              return prev;
            }
            return {
              iata,
              name: name ?? iata,
              city: city ?? name ?? iata,
              x: event.point.x,
              y: event.point.y,
            };
          });
        } else {
          setHoveredAirport(null);
        }
      }
    };

    const handleAirportMouseLeave = () => {
      setAirportHover(null);
      map.getCanvas().style.cursor = "";
      setHoveredAirport(null);
    };

    const handleLineMouseEnter = (event: MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties?.id;
      if (typeof id === "string") setRouteHover(id);
      map.getCanvas().style.cursor = "pointer";
    };

    const handleLineMouseMove = (event: MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties?.id;
      if (typeof id === "string") setRouteHover(id);
    };

    const handleLineMouseLeave = () => {
      setRouteHover(null);
      map.getCanvas().style.cursor = "";
    };

    map.on("mousemove", "avi-route-airport-hitboxes", handleAirportMouseMove);
    map.on("mouseleave", "avi-route-airport-hitboxes", handleAirportMouseLeave);
    map.on("mousemove", "avi-route-airport-circles", handleAirportMouseMove);
    map.on("mouseleave", "avi-route-airport-circles", handleAirportMouseLeave);
    map.on("mouseenter", "avi-route-network-lines", handleLineMouseEnter);
    map.on("mousemove", "avi-route-network-lines", handleLineMouseMove);
    map.on("mouseleave", "avi-route-network-lines", handleLineMouseLeave);

    // 6. Camera Fitting with Responsive Mobile / Desktop Padding
    const isIdle =
      connections.length === 0 && !origin && !selected && !selectedRoute;
    const fitKey = `${origin?.iata ?? "idle"}:${selectedRoute?.id ?? "none"}:${connections.length}`;
    if (lastFitRef.current !== fitKey) {
      lastFitRef.current = fitKey;
      if (!isIdle) {
        const bounds = new LngLatBounds();
        const points = selectedRoute
          ? [selectedRoute.origin, selectedRoute.destination]
          : origin
            ? [origin, ...connections.map((c) => c.destination)]
            : [];

        if (points.length) {
          for (const point of points) {
            bounds.extend([point.longitude, point.latitude]);
          }
          const isMobile =
            typeof window !== "undefined" && window.innerWidth < 640;
          map.fitBounds(bounds, {
            padding: isMobile
              ? {
                  top: 75,
                  right: 30,
                  bottom: selectedRoute ? 310 : 50,
                  left: 30,
                }
              : {
                  top: 75,
                  right: 65,
                  bottom: 65,
                  left: selectedRoute ? 430 : 65,
                },
            maxZoom: selectedRoute ? 5.5 : 4.4,
            duration: 800,
          });
        }
      }
    }

    return () => {
      try {
        setAirportHover(null);
        setRouteHover(null);
      } catch {
        // The map may already be disposed during cleanup.
      }
      if (clickHandlerRef.current) {
        map.off("click", "avi-route-airport-hitboxes", clickHandlerRef.current);
        map.off("click", "avi-route-airport-circles", clickHandlerRef.current);
      }
      if (lineClickHandlerRef.current) {
        map.off(
          "click",
          "avi-route-network-lines",
          lineClickHandlerRef.current,
        );
      }
      map.off(
        "mousemove",
        "avi-route-airport-hitboxes",
        handleAirportMouseMove,
      );
      map.off(
        "mouseleave",
        "avi-route-airport-hitboxes",
        handleAirportMouseLeave,
      );
      map.off("mousemove", "avi-route-airport-circles", handleAirportMouseMove);
      map.off(
        "mouseleave",
        "avi-route-airport-circles",
        handleAirportMouseLeave,
      );
      map.off("mouseenter", "avi-route-network-lines", handleLineMouseEnter);
      map.off("mousemove", "avi-route-network-lines", handleLineMouseMove);
      map.off("mouseleave", "avi-route-network-lines", handleLineMouseLeave);
    };
  }, [
    airportFeatures,
    connections,
    map,
    onSelectAirport,
    origin,
    routeFeatures,
    selected,
    selectedRoute,
  ]);

  const handleResetMap = useCallback(() => {
    if (onReset) onReset();
    if (map) {
      map.flyTo({
        center: [10, 22],
        zoom: 2,
        duration: 900,
      });
    }
  }, [map, onReset]);

  return (
    <div
      className={cn(
        "relative overflow-hidden w-full h-full select-none",
        className,
      )}
    >
      <div ref={containerRef} className="h-full w-full" />

      {/* Top-Right Recenter View Button - positioned to the left of the +/- navigation controls */}
      <div className="absolute right-12 top-2.5 z-20 flex items-center gap-2">
        <button
          type="button"
          onClick={handleResetMap}
          className="flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-line/70 bg-surface/95 px-3 text-[13px] font-medium text-ink shadow-md backdrop-blur transition-colors hover:bg-surface-2 active:scale-95"
          title="Reset map view"
        >
          <span>Reset view</span>
          <RotateCcw className="size-3.5 text-accent" />
        </button>
      </div>

      {/* Hover Tooltip for unchosen airports (Requirement 4) */}
      {hoveredAirport && (
        <div
          className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-full pb-3"
          style={{
            left: `${hoveredAirport.x}px`,
            top: `${hoveredAirport.y}px`,
          }}
        >
          <div className="flex items-center gap-2 rounded-lg border border-line/80 bg-surface/95 px-2.5 py-1.5 shadow-2xl backdrop-blur">
            <span className="font-mono text-[13px] font-semibold text-accent">
              {hoveredAirport.iata}
            </span>
            <span className="text-xs font-medium text-ink">
              {hoveredAirport.city}
            </span>
          </div>
        </div>
      )}

      {/* Airport Legend (Positioned on bottom-right to avoid sidebar clash) */}
      {legendVisible ? (
        <div className="pointer-events-auto absolute bottom-7 right-3 z-20 w-60 rounded-lg border border-line/70 bg-surface/95 p-3 shadow-2xl backdrop-blur sm:bottom-8 sm:right-3.5">
          <div className="mb-2 flex items-center justify-between border-b border-line/50 pb-2">
            <span className="text-[13px] font-medium text-ink">
              Airport connectivity
            </span>
            <button
              type="button"
              onClick={() => setLegendVisible(false)}
              className="flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              aria-label="Hide airport legend"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="space-y-1.5 text-xs text-ink">
            {ROUTE_COUNT_BUCKETS.map((bucket, index) => (
              <div key={bucket.label} className="flex items-center gap-2">
                <span
                  className="size-3 rounded-full shrink-0 border border-black/20 shadow-sm"
                  style={{
                    backgroundColor: ROUTE_COUNT_PALETTE[index],
                  }}
                />
                <span>{bucket.label} direct routes</span>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <span
                className="size-3 rounded-full shrink-0 border border-black/20 shadow-sm"
                style={{ backgroundColor: NO_ROUTE_COUNT_COLOR }}
              />
              <span>0 / no reference count</span>
            </div>
            <p className="pt-1.5 text-xs leading-relaxed text-subtle">
              OpenFlights-derived reference counts, not live. Sparse airports
              are red/amber, busy hubs blue. Origin and selected airports are
              enlarged.
            </p>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setLegendVisible(true)}
          className="pointer-events-auto absolute bottom-7 right-3 z-20 flex h-9 items-center gap-1.5 rounded-lg border border-line/70 bg-surface/95 px-3 text-xs font-medium text-muted shadow-md backdrop-blur transition-colors hover:text-ink sm:bottom-8 sm:right-3.5"
        >
          <Info className="size-3.5 text-accent" />
          <span>Legend</span>
        </button>
      )}

      {/* Far bottom-right simple attribution */}
      <div className="pointer-events-none absolute bottom-1.5 right-2 z-10 select-none text-[11px] text-muted/70">
        © OpenStreetMap · OpenFreeMap · AeroDataBox · OpenFlights
      </div>
    </div>
  );
}

export function OsmFlightMap({
  flight,
  className,
}: {
  flight: Flight;
  className?: string;
}) {
  return <FlightMap flight={flight} className={className} />;
}
