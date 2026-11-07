"use client";

import { useEffect, useRef, useState } from "react";
import { LngLatBounds, type MapLayerMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { AirportNode, DirectFlightConnection, Flight } from "@/lib/types";
import { routeAirports } from "@/lib/data";
import { routeCoordinates } from "@/lib/geo";
import { getCountriesGeoJson } from "@/lib/country-geojson";
import { cn } from "@/lib/utils";
import {
  MAP_COLORS,
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

export function OsmRouteMap({
  connections,
  origin,
  selected,
  selectedRoute,
  onSelectAirport,
  className,
}: {
  connections: DirectFlightConnection[];
  origin: AirportNode | null;
  selected: AirportNode | null;
  selectedRoute: DirectFlightConnection | null;
  onSelectAirport: (iata: string) => void;
  className?: string;
}) {
  const resolvedTheme = useResolvedTheme();
  const { containerRef, map } = useMapLibre(resolvedTheme, {
    center: [10, 22],
    zoom: 2,
    minZoom: 1.4,
    maxZoom: 8,
  });
  const [hoveredCountry, setHoveredCountry] = useState<{
    name: string;
    x: number;
    y: number;
  } | null>(null);
  const lastFitRef = useRef("");
  const clickHandlerRef = useRef<((event: MapLayerMouseEvent) => void) | null>(null);

  useEffect(() => {
    lastFitRef.current = "";
  }, [map]);

  useEffect(() => {
    if (!map) return;

    // 1. Hide state/provincial/regional borders (boundary_3) so only country borders appear at all zoom levels
    if (map.getLayer("boundary_3")) {
      map.setLayoutProperty("boundary_3", "visibility", "none");
    }

    // 2. Hide base place/country/state text labels by default
    setBaseSymbolLayersVisible(map, false);

    // 3. Country boundaries and hover layers
    const { polygons: countryPolygons, points: countryPoints } = getCountriesGeoJson();
    setGeoJson(map, "avi-countries", countryPolygons);
    setGeoJson(map, "avi-country-points", countryPoints);

    ensureLayer(map, {
      id: "avi-countries-fill",
      type: "fill",
      source: "avi-countries",
      paint: {
        "fill-color": "rgba(0, 0, 0, 0)",
        "fill-opacity": 1,
      },
    });

    ensureLayer(map, {
      id: "avi-countries-hover-fill",
      type: "fill",
      source: "avi-countries",
      filter: ["==", ["get", "id"], -1],
      paint: {
        "fill-color": resolvedTheme === "dark" ? "#00E5FF" : "#0077FF",
        "fill-opacity": resolvedTheme === "dark" ? 0.18 : 0.14,
      },
    });

    ensureLayer(map, {
      id: "avi-countries-hover-outline",
      type: "line",
      source: "avi-countries",
      filter: ["==", ["get", "id"], -1],
      paint: {
        "line-color": resolvedTheme === "dark" ? "#00E5FF" : "#0077FF",
        "line-width": 1.8,
        "line-opacity": 0.85,
      },
    });

    ensureLayer(map, {
      id: "avi-country-hover-label",
      type: "symbol",
      source: "avi-country-points",
      filter: ["==", ["get", "id"], -1],
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Bold"],
        "text-size": 13,
        "text-letter-spacing": 0.08,
        "text-anchor": "center",
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-color": resolvedTheme === "dark" ? "#00E5FF" : "#0077FF",
        "text-halo-color":
          resolvedTheme === "dark" ? "rgba(7, 16, 24, 0.95)" : "rgba(255, 255, 255, 0.95)",
        "text-halo-width": 3,
      },
    });

    // Update theme-dependent paint properties dynamically
    if (map.getLayer("avi-countries-hover-fill")) {
      map.setPaintProperty(
        "avi-countries-hover-fill",
        "fill-color",
        resolvedTheme === "dark" ? "#00E5FF" : "#0077FF",
      );
      map.setPaintProperty(
        "avi-countries-hover-fill",
        "fill-opacity",
        resolvedTheme === "dark" ? 0.18 : 0.14,
      );
    }
    if (map.getLayer("avi-countries-hover-outline")) {
      map.setPaintProperty(
        "avi-countries-hover-outline",
        "line-color",
        resolvedTheme === "dark" ? "#00E5FF" : "#0077FF",
      );
    }
    if (map.getLayer("avi-country-hover-label")) {
      map.setPaintProperty(
        "avi-country-hover-label",
        "text-color",
        resolvedTheme === "dark" ? "#00E5FF" : "#0077FF",
      );
      map.setPaintProperty(
        "avi-country-hover-label",
        "text-halo-color",
        resolvedTheme === "dark" ? "rgba(7, 16, 24, 0.95)" : "rgba(255, 255, 255, 0.95)",
      );
    }

    const airportMap = new Map<string, AirportNode>();
    if (connections.length === 0 && !origin && !selected) {
      // In idle mode before searching, show all reference airports across the globe
      for (const airport of routeAirports) {
        airportMap.set(airport.iata, airport);
      }
    } else {
      for (const connection of connections) {
        airportMap.set(connection.origin.iata, connection.origin);
        airportMap.set(connection.destination.iata, connection.destination);
      }
      if (origin) airportMap.set(origin.iata, origin);
      if (selected) airportMap.set(selected.iata, selected);
    }

    const airportFeatures = [...airportMap.values()].map((airport) =>
      pointFeature(airport.iata, [airport.longitude, airport.latitude], {
        iata: airport.iata,
        city: airport.city,
        name: airport.name,
        isOrigin: airport.iata === origin?.iata,
        isSelected: airport.iata === selected?.iata,
      }),
    );

    const routeFeatures = connections.map((connection) =>
      lineFeature(
        routeCoordinates(
          [connection.origin.longitude, connection.origin.latitude],
          [connection.destination.longitude, connection.destination.latitude],
        ),
        {
          id: connection.id,
          selected: connection.id === selectedRoute?.id,
        },
      ),
    );

    setGeoJson(map, "avi-route-network", collection(routeFeatures));
    setGeoJson(map, "avi-route-airports", collection(airportFeatures));

    ensureLayer(map, {
      id: "avi-route-network-lines",
      type: "line",
      source: "avi-route-network",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": [
          "case",
          ["get", "selected"],
          MAP_COLORS.routeTraveled,
          MAP_COLORS.routeRemaining,
        ],
        "line-width": ["case", ["get", "selected"], 2.8, 1.1],
        "line-opacity": ["case", ["get", "selected"], 1, 0.55],
      },
    });
    ensureLayer(map, {
      id: "avi-route-airport-circles",
      type: "circle",
      source: "avi-route-airports",
      paint: {
        "circle-radius": [
          "case",
          ["get", "isSelected"],
          7,
          ["get", "isOrigin"],
          6,
          4,
        ],
        "circle-color": [
          "case",
          ["get", "isSelected"],
          MAP_COLORS.radarCyan,
          MAP_COLORS.routeTraveled,
        ],
        "circle-stroke-color": MAP_COLORS.white,
        "circle-stroke-width": 2,
      },
    });
    ensureLayer(map, {
      id: "avi-route-airport-hover",
      type: "circle",
      source: "avi-route-airports",
      filter: ["==", ["get", "iata"], ""],
      paint: {
        "circle-radius": 8,
        "circle-color": MAP_COLORS.radarCyan,
        "circle-stroke-color": MAP_COLORS.white,
        "circle-stroke-width": 2,
      },
    });
    ensureLayer(map, {
      id: "avi-route-airport-labels",
      type: "symbol",
      source: "avi-route-airports",
      filter: ["==", ["get", "iata"], ""],
      layout: {
        "text-field": ["get", "iata"],
        "text-font": ["Noto Sans Bold"],
        "text-size": 11,
        "text-offset": [0, -1.3],
        "text-anchor": "bottom",
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-color": MAP_COLORS.ink,
        "text-halo-color": MAP_COLORS.white,
        "text-halo-width": 2,
      },
    });

    if (clickHandlerRef.current) {
      map.off("click", "avi-route-airport-circles", clickHandlerRef.current);
    }
    const handleClick = (event: MapLayerMouseEvent) => {
      const iata = event.features?.[0]?.properties?.iata;
      if (typeof iata === "string") onSelectAirport(iata);
    };
    clickHandlerRef.current = handleClick;
    map.on("click", "avi-route-airport-circles", handleClick);

    const handleAirportMouseMove = (event: MapLayerMouseEvent) => {
      const iata = event.features?.[0]?.properties?.iata;
      if (typeof iata === "string") {
        map.getCanvas().style.cursor = "pointer";
        if (map.getLayer("avi-route-airport-labels")) {
          map.setFilter("avi-route-airport-labels", ["==", ["get", "iata"], iata]);
        }
        if (map.getLayer("avi-route-airport-hover")) {
          map.setFilter("avi-route-airport-hover", ["==", ["get", "iata"], iata]);
        }
      }
    };

    const handleAirportMouseLeave = () => {
      map.getCanvas().style.cursor = "";
      if (map.getLayer("avi-route-airport-labels")) {
        map.setFilter("avi-route-airport-labels", ["==", ["get", "iata"], ""]);
      }
      if (map.getLayer("avi-route-airport-hover")) {
        map.setFilter("avi-route-airport-hover", ["==", ["get", "iata"], ""]);
      }
    };

    map.on("mousemove", "avi-route-airport-circles", handleAirportMouseMove);
    map.on("mouseleave", "avi-route-airport-circles", handleAirportMouseLeave);

    const handleCountryMouseMove = (event: MapLayerMouseEvent) => {
      const feat = event.features?.[0];
      const id = feat?.properties?.id;
      const name = feat?.properties?.name;
      if (typeof id === "number" && typeof name === "string") {
        if (map.getLayer("avi-countries-hover-fill")) {
          map.setFilter("avi-countries-hover-fill", ["==", ["get", "id"], id]);
        }
        if (map.getLayer("avi-countries-hover-outline")) {
          map.setFilter("avi-countries-hover-outline", ["==", ["get", "id"], id]);
        }
        if (map.getLayer("avi-country-hover-label")) {
          map.setFilter("avi-country-hover-label", ["==", ["get", "id"], id]);
        }
        const containerW = map.getContainer()?.clientWidth ?? 600;
        setHoveredCountry({
          name,
          x: Math.min(event.point.x + 14, containerW - 170),
          y: Math.max(event.point.y - 40, 10),
        });
      }
    };

    const handleCountryMouseLeave = () => {
      if (map.getLayer("avi-countries-hover-fill")) {
        map.setFilter("avi-countries-hover-fill", ["==", ["get", "id"], -1]);
      }
      if (map.getLayer("avi-countries-hover-outline")) {
        map.setFilter("avi-countries-hover-outline", ["==", ["get", "id"], -1]);
      }
      if (map.getLayer("avi-country-hover-label")) {
        map.setFilter("avi-country-hover-label", ["==", ["get", "id"], -1]);
      }
      setHoveredCountry(null);
    };

    map.on("mousemove", "avi-countries-fill", handleCountryMouseMove);
    map.on("mouseleave", "avi-countries-fill", handleCountryMouseLeave);

    const isIdle = connections.length === 0 && !origin && !selected && !selectedRoute;
    const fitKey = `${origin?.iata ?? "idle"}:${selectedRoute?.id ?? "none"}:${connections.length}`;
    if (lastFitRef.current !== fitKey) {
      lastFitRef.current = fitKey;
      if (!isIdle) {
        const bounds = new LngLatBounds();
        const points = selectedRoute
          ? [selectedRoute.origin, selectedRoute.destination]
          : origin
            ? [origin, ...connections.map((connection) => connection.destination)]
            : [...airportMap.values()];
        if (points.length) {
          for (const point of points) {
            bounds.extend([point.longitude, point.latitude]);
          }
          map.fitBounds(bounds, {
            padding: { top: 50, right: 50, bottom: 50, left: 50 },
            maxZoom: selectedRoute ? 5.2 : 4.4,
            duration: 700,
          });
        }
      }
    }

    return () => {
      if (clickHandlerRef.current) {
        map.off("click", "avi-route-airport-circles", clickHandlerRef.current);
      }
      map.off("mousemove", "avi-route-airport-circles", handleAirportMouseMove);
      map.off("mouseleave", "avi-route-airport-circles", handleAirportMouseLeave);
      map.off("mousemove", "avi-countries-fill", handleCountryMouseMove);
      map.off("mouseleave", "avi-countries-fill", handleCountryMouseLeave);
    };
  }, [connections, map, onSelectAirport, origin, resolvedTheme, selected, selectedRoute]);

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div ref={containerRef} className="h-full w-full" />
      {hoveredCountry && (
        <div
          className="pointer-events-none absolute z-30 flex items-center gap-2 rounded-lg border border-line/80 bg-surface/95 px-2.5 py-1.5 shadow-2xl backdrop-blur-md transition-all duration-75"
          style={{
            left: `${hoveredCountry.x}px`,
            top: `${hoveredCountry.y}px`,
          }}
        >
          <span className="size-2 rounded-full bg-accent animate-pulse-dot" />
          <div className="flex flex-col leading-none">
            <span className="font-mono text-[8.5px] font-bold uppercase tracking-wider text-muted">
              Country
            </span>
            <span className="mt-0.5 text-xs font-black tracking-wide text-ink">
              {hoveredCountry.name}
            </span>
          </div>
        </div>
      )}
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
