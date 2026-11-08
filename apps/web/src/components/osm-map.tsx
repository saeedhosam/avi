"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { LngLatBounds, Marker, type MapLayerMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { AirportNode, DirectFlightConnection, Flight } from "@/lib/types";
import { findAirportNode, routeAirports, type GlobalAirportNode } from "@/lib/data";
import { routeCoordinates } from "@/lib/geo";
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
import { useResolvedTheme } from "@/lib/store";
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
  const resolvedTheme = useResolvedTheme();
  const { containerRef, map } = useMapLibre(resolvedTheme, {
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
  const clickHandlerRef = useRef<((event: MapLayerMouseEvent) => void) | null>(null);
  const lineClickHandlerRef = useRef<((event: MapLayerMouseEvent) => void) | null>(null);

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
        "pointer-events-auto flex items-center gap-1.5 rounded-lg bg-[#0077ff] px-2.5 py-1 text-white shadow-2xl text-[11px] font-black tracking-wide whitespace-nowrap select-none cursor-pointer border border-white/40 transform -translate-y-3";
      
      const label = document.createElement("span");
      label.textContent = `${origin.city} (${origin.iata})`;
      el.appendChild(label);

      if (onClearOrigin) {
        const closeBtn = document.createElement("button");
        closeBtn.innerHTML = "✕";
        closeBtn.title = "Clear origin";
        closeBtn.className =
          "ml-1 flex size-3.5 items-center justify-center rounded-full bg-white/20 hover:bg-white/40 text-[9px] leading-none transition-colors";
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
        "pointer-events-auto flex flex-col rounded-lg bg-[#0077ff] px-2.5 py-1 text-white shadow-2xl text-[11px] font-black tracking-wide whitespace-nowrap select-none cursor-pointer border border-white/40 transform -translate-y-3";

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
          "flex size-3.5 items-center justify-center rounded-full bg-white/20 hover:bg-white/40 text-[9px] leading-none transition-colors";
        closeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          onClearDestination();
        });
        header.appendChild(closeBtn);
      }
      el.appendChild(header);

      const sub = document.createElement("span");
      sub.className = "text-[9px] text-blue-100 font-semibold mt-0.5";
      sub.textContent = "Check prices ›";
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
        destCount: airport.destCount ?? 0,
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
          ["get", "selected"],
          resolvedTheme === "dark" ? "#38bdf8" : "#0284c7",
          resolvedTheme === "dark" ? "#f87171" : "#ef4444",
        ],
        "line-width": ["case", ["get", "selected"], 3.8, 1.2],
        "line-opacity": ["case", ["get", "selected"], 1, 0.65],
      },
    });

    // 3. Set Airport Features
    setGeoJson(map, "avi-route-airports", collection(airportFeatures));

    // FlightConnections tier colors & sizing
    // Tier 1 (>100): Dark Navy Blue
    // Tier 2 (>30): Light / Medium Blue
    // Tier 3 (>7): Yellow / Amber
    // Tier 4 (<=7): Red / Coral
    ensureLayer(map, {
      id: "avi-route-airport-circles",
      type: "circle",
      source: "avi-route-airports",
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          1.5,
          [
            "case",
            ["get", "isSelected"],
            9.5,
            ["get", "isOrigin"],
            9.5,
            [">", ["get", "destCount"], 100],
            6.5,
            [">", ["get", "destCount"], 30],
            5.2,
            [">", ["get", "destCount"], 7],
            4.0,
            3.0,
          ],
          6,
          [
            "case",
            ["get", "isSelected"],
            12.5,
            ["get", "isOrigin"],
            12.5,
            [">", ["get", "destCount"], 100],
            10.5,
            [">", ["get", "destCount"], 30],
            8.5,
            [">", ["get", "destCount"], 7],
            7.0,
            5.5,
          ],
        ],
        "circle-color": [
          "case",
          ["get", "isSelected"],
          "#0077ff",
          ["get", "isOrigin"],
          "#0077ff",
          [">", ["get", "destCount"], 100],
          "#0b4ea2",
          [">", ["get", "destCount"], 30],
          "#1e88e5",
          [">", ["get", "destCount"], 7],
          "#f59e0b",
          "#ef4444",
        ],
        "circle-stroke-color": "rgba(0, 0, 0, 0.25)",
        "circle-stroke-width": [
          "case",
          ["get", "isSelected"],
          2,
          ["get", "isOrigin"],
          2,
          0.75,
        ],
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
    const handleAirportMouseMove = (event: MapLayerMouseEvent) => {
      const feat = event.features?.[0];
      const iata = feat?.properties?.iata;
      const name = feat?.properties?.name;
      const city = feat?.properties?.city;

      if (typeof iata === "string") {
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
      map.getCanvas().style.cursor = "";
      setHoveredAirport(null);
    };

    const handleLineMouseEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };

    const handleLineMouseLeave = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("mousemove", "avi-route-airport-hitboxes", handleAirportMouseMove);
    map.on("mouseleave", "avi-route-airport-hitboxes", handleAirportMouseLeave);
    map.on("mousemove", "avi-route-airport-circles", handleAirportMouseMove);
    map.on("mouseleave", "avi-route-airport-circles", handleAirportMouseLeave);
    map.on("mouseenter", "avi-route-network-lines", handleLineMouseEnter);
    map.on("mouseleave", "avi-route-network-lines", handleLineMouseLeave);

    // 6. Camera Fitting with Responsive Mobile / Desktop Padding
    const isIdle = connections.length === 0 && !origin && !selected && !selectedRoute;
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
              ? { top: 75, right: 30, bottom: selectedRoute ? 310 : 50, left: 30 }
              : { top: 75, right: 65, bottom: 65, left: selectedRoute ? 430 : 65 },
            maxZoom: selectedRoute ? 5.5 : 4.4,
            duration: 800,
          });
        }
      }
    }

    return () => {
      if (clickHandlerRef.current) {
        map.off("click", "avi-route-airport-hitboxes", clickHandlerRef.current);
        map.off("click", "avi-route-airport-circles", clickHandlerRef.current);
      }
      if (lineClickHandlerRef.current) {
        map.off("click", "avi-route-network-lines", lineClickHandlerRef.current);
      }
      map.off("mousemove", "avi-route-airport-hitboxes", handleAirportMouseMove);
      map.off("mouseleave", "avi-route-airport-hitboxes", handleAirportMouseLeave);
      map.off("mousemove", "avi-route-airport-circles", handleAirportMouseMove);
      map.off("mouseleave", "avi-route-airport-circles", handleAirportMouseLeave);
      map.off("mouseenter", "avi-route-network-lines", handleLineMouseEnter);
      map.off("mouseleave", "avi-route-network-lines", handleLineMouseLeave);
    };
  }, [
    airportFeatures,
    connections,
    map,
    onSelectAirport,
    origin,
    resolvedTheme,
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
    <div className={cn("relative overflow-hidden w-full h-full select-none", className)}>
      <div ref={containerRef} className="h-full w-full" />

      {/* Top-Right Recenter View Button - positioned to the left of the +/- navigation controls */}
      <div className="absolute right-[48px] top-2.5 z-20 flex items-center gap-2">
        <button
          onClick={handleResetMap}
          className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-line/80 bg-surface/95 hover:bg-surface-2 text-ink px-2.5 py-1.5 text-xs font-semibold shadow-md backdrop-blur-md transition-all active:scale-95 cursor-pointer"
          title="Reset map view"
        >
          <span>Reset View</span>
          <RotateCcw className="size-3 text-accent" />
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
          <div className="flex items-center gap-1.5 rounded-lg border border-line/90 bg-surface/95 px-2.5 py-1 shadow-2xl backdrop-blur-md">
            <span className="font-mono text-[10px] font-black text-accent">
              {hoveredAirport.iata}
            </span>
            <span className="text-xs font-bold text-ink">
              {hoveredAirport.city}
            </span>
          </div>
        </div>
      )}

      {/* Airport Legend (Positioned on bottom-right to avoid sidebar clash) */}
      {legendVisible ? (
        <div className="pointer-events-auto absolute bottom-7 right-3 sm:bottom-8 sm:right-3.5 z-20 w-52 rounded-xl border border-line/80 bg-surface/95 p-2.5 shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-line/60">
            <span className="text-xs font-bold tracking-tight text-ink">
              Airport Connectivity
            </span>
            <button
              onClick={() => setLegendVisible(false)}
              className="text-muted hover:text-ink transition-colors p-0.5 cursor-pointer"
              aria-label="Hide airport legend"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <div className="space-y-1.5 text-[10.5px] font-medium text-ink">
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full bg-[#0b4ea2] shrink-0 border border-black/20 shadow-sm" />
              <span>&gt; 100 direct destinations</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-[#1e88e5] shrink-0 border border-black/20 shadow-sm" />
              <span>&gt; 30 direct destinations</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-[#f59e0b] shrink-0 border border-black/20 shadow-sm" />
              <span>&gt; 7 direct destinations</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-[#ef4444] shrink-0 border border-black/20 shadow-sm" />
              <span>&le; 7 direct destinations</span>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setLegendVisible(true)}
          className="pointer-events-auto absolute bottom-7 right-3 sm:bottom-8 sm:right-3.5 z-20 flex items-center gap-1.5 rounded-lg border border-line bg-surface/95 px-2.5 py-1 text-xs font-semibold text-muted hover:text-ink shadow-md backdrop-blur-md transition-colors cursor-pointer"
        >
          <Info className="size-3 text-accent" />
          <span>Legend</span>
        </button>
      )}

      {/* Far bottom-right simple attribution */}
      <div className="pointer-events-none absolute bottom-1.5 right-2 z-10 text-[9.5px] font-medium text-muted/70 select-none">
        © OpenStreetMap · OpenFreeMap · AeroDataBox
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
