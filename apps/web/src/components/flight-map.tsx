"use client";

import { useEffect, useRef } from "react";
import { LngLatBounds } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Flight } from "@/lib/types";
import {
  destinationAlong,
  headingDestination,
  routeCoordinates,
  type LngLat,
} from "@/lib/geo";
import {
  MAP_COLORS,
  collection,
  ensureAircraftImage,
  ensureLayer,
  lineFeature,
  pointFeature,
  setGeoJson,
} from "@/lib/maplibre";
import { useMapLibre } from "@/lib/use-maplibre";
import { cn } from "@/lib/utils";

export function FlightMap({
  flight,
  className,
  showAttribution = true,
  recenterSignal = 0,
}: {
  flight: Flight;
  className?: string;
  showAttribution?: boolean;
  recenterSignal?: number;
}) {
  const { containerRef, map } = useMapLibre({
    center: [10, 24],
    zoom: 2.4,
    minZoom: 1.4,
    maxZoom: 9,
  });
  const lastFitRef = useRef<string>("");

  useEffect(() => {
    if (!map) return;

    const origin: LngLat = [flight.origin.longitude, flight.origin.latitude];
    const destination: LngLat = [
      flight.destination.longitude,
      flight.destination.latitude,
    ];
    const route = routeCoordinates(origin, destination);
    const live =
      flight.telemetry.hasLiveLocation &&
      Number.isFinite(flight.telemetry.currentLatitude) &&
      Number.isFinite(flight.telemetry.currentLongitude);
    const aircraft: LngLat = [
      flight.telemetry.currentLongitude,
      flight.telemetry.currentLatitude,
    ];
    const traveled =
      live && flight.status === "DEPARTED"
        ? routeCoordinates(origin, aircraft)
        : [];
    const progressPoint =
      live && flight.status !== "SCHEDULED"
        ? destinationAlong(origin, destination, Math.min(1, Math.max(0, flight.telemetry.progressPercent)))
        : null;
    const heading =
      live && flight.telemetry.groundSpeedKnots > 40
        ? [aircraft, headingDestination(aircraft, flight.telemetry.headingDegrees, 28)]
        : [];

    setGeoJson(map, "avi-route", collection([lineFeature(route, { kind: "remaining" })]));
    setGeoJson(
      map,
      "avi-traveled",
      collection(traveled.length ? [lineFeature(traveled, { kind: "traveled" })] : []),
    );
    setGeoJson(
      map,
      "avi-heading",
      collection(heading.length ? [lineFeature(heading, { kind: "heading" })] : []),
    );
    setGeoJson(
      map,
      "avi-airports",
      collection([
        pointFeature("origin", origin, {
          iata: flight.origin.code,
          city: flight.origin.city,
          role: "origin",
        }),
        pointFeature("destination", destination, {
          iata: flight.destination.code,
          city: flight.destination.city,
          role: "destination",
        }),
      ]),
    );
    setGeoJson(
      map,
      "avi-aircraft",
      collection(
        live
          ? [
              pointFeature("aircraft", aircraft, {
                heading: flight.telemetry.headingDegrees,
                flight: flight.flightNumber,
              }),
            ]
          : progressPoint
            ? [
                pointFeature("progress", progressPoint, {
                  heading: flight.telemetry.headingDegrees,
                  flight: flight.flightNumber,
                }),
              ]
            : [],
      ),
    );

    ensureLayer(map, {
      id: "avi-route-line",
      type: "line",
      source: "avi-route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": MAP_COLORS.routeRemaining,
        "line-width": 2.2,
        "line-opacity": 0.9,
      },
    });
    ensureLayer(map, {
      id: "avi-traveled-line",
      type: "line",
      source: "avi-traveled",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": MAP_COLORS.routeTraveled, "line-width": 3.2 },
    });
    ensureLayer(map, {
      id: "avi-heading-line",
      type: "line",
      source: "avi-heading",
      layout: { "line-cap": "round" },
      paint: {
        "line-color": MAP_COLORS.radarCyan,
        "line-width": 1.4,
        "line-opacity": 0.9,
      },
    });
    ensureLayer(map, {
      id: "avi-airport-circles",
      type: "circle",
      source: "avi-airports",
      paint: {
        "circle-radius": 5,
        "circle-color": MAP_COLORS.routeTraveled,
        "circle-stroke-color": MAP_COLORS.white,
        "circle-stroke-width": 2,
      },
    });
    ensureLayer(map, {
      id: "avi-airport-labels",
      type: "symbol",
      source: "avi-airports",
      layout: {
        "text-field": ["get", "iata"],
        "text-font": ["Noto Sans Bold"],
        "text-size": 11,
        "text-offset": [0, -1.35],
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
    ensureLayer(map, {
      id: "avi-aircraft-circle",
      type: "circle",
      source: "avi-aircraft",
      paint: {
        "circle-radius": 7,
        "circle-color": MAP_COLORS.radarCyan,
        "circle-stroke-color": MAP_COLORS.ink,
        "circle-stroke-width": 2,
        "circle-opacity": 0.24,
      },
    });
    ensureAircraftImage(map);
    ensureLayer(map, {
      id: "avi-aircraft-icon",
      type: "symbol",
      source: "avi-aircraft",
      layout: {
        "icon-image": "avi-aircraft",
        "icon-size": 0.52,
        "icon-rotate": ["get", "heading"],
        "icon-rotation-alignment": "map",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    });

    const fitKey = `${flight.id}:${flight.status}:${live ? "live" : "static"}`;
    if (lastFitRef.current !== fitKey) {
      lastFitRef.current = fitKey;
      const bounds = new LngLatBounds();
      for (const point of [origin, destination, ...(live ? [aircraft] : [])]) {
        bounds.extend(point);
      }
      map.fitBounds(bounds, {
        padding: { top: 70, right: 70, bottom: 70, left: 70 },
        maxZoom: 5.8,
        duration: 800,
      });
    }
  }, [flight, map]);

  useEffect(() => {
    if (!map || recenterSignal === 0) return;
    if (!flight.telemetry.hasLiveLocation) return;
    map.flyTo({
      center: [
        flight.telemetry.currentLongitude,
        flight.telemetry.currentLatitude,
      ],
      zoom: Math.max(4, map.getZoom()),
      duration: 700,
    });
  }, [flight, map, recenterSignal]);

  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      <div ref={containerRef} className="h-full w-full" />
      {showAttribution && (
        <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-md border border-slate-300/70 bg-white/85 px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-600 shadow-sm backdrop-blur">
          OSM · Positron
        </div>
      )}
    </div>
  );
}
