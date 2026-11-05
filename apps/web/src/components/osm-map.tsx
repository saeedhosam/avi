"use client";

import { useEffect, useRef } from "react";
import { LngLatBounds, type MapLayerMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { AirportNode, DirectFlightConnection, Flight } from "@/lib/types";
import { routeCoordinates } from "@/lib/geo";
import {
  MAP_COLORS,
  collection,
  ensureLayer,
  lineFeature,
  pointFeature,
  setGeoJson,
} from "@/lib/maplibre";
import { useMapLibre } from "@/lib/use-maplibre";
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
  const { containerRef, map } = useMapLibre({
    center: [10, 22],
    zoom: 2,
    minZoom: 1.4,
    maxZoom: 8,
  });
  const lastFitRef = useRef("");
  const clickHandlerRef = useRef<((event: MapLayerMouseEvent) => void) | null>(null);

  useEffect(() => {
    if (!map) return;

    const airportMap = new Map<string, AirportNode>();
    for (const connection of connections) {
      airportMap.set(connection.origin.iata, connection.origin);
      airportMap.set(connection.destination.iata, connection.destination);
    }
    if (origin) airportMap.set(origin.iata, origin);
    if (selected) airportMap.set(selected.iata, selected);

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
      id: "avi-route-airport-labels",
      type: "symbol",
      source: "avi-route-airports",
      layout: {
        "text-field": ["get", "iata"],
        "text-font": ["Noto Sans Bold"],
        "text-size": 10,
        "text-offset": [0, -1.25],
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
    map.on("mouseenter", "avi-route-airport-circles", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "avi-route-airport-circles", () => {
      map.getCanvas().style.cursor = "";
    });

    const fitKey = `${origin?.iata ?? "all"}:${selectedRoute?.id ?? "none"}:${connections.length}`;
    if (lastFitRef.current !== fitKey) {
      lastFitRef.current = fitKey;
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

    return () => {
      if (clickHandlerRef.current) {
        map.off("click", "avi-route-airport-circles", clickHandlerRef.current);
      }
    };
  }, [connections, map, onSelectAirport, origin, selected, selectedRoute]);

  return (
    <div className={className}>
      <div ref={containerRef} className="h-full w-full" />
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
