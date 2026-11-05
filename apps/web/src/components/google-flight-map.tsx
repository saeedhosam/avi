"use client";

import { useEffect, useRef, useState } from "react";
import type { Flight } from "@/lib/types";
import { cn } from "@/lib/utils";

let mapsPromise: Promise<void> | null = null;

function loadGoogleMaps(apiKey: string) {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (window.google?.maps) return Promise.resolve();
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&libraries=geometry`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps failed to load"));
    document.head.appendChild(script);
  });
  return mapsPromise;
}

const DARK_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#0b1a2a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8aa0b8" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0b1a2a" }] },
  {
    featureType: "administrative",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1e3a55" }],
  },
  {
    featureType: "landscape",
    elementType: "geometry",
    stylers: [{ color: "#102238" }],
  },
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#13283e" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#1b334c" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#07131f" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#4a6a85" }],
  },
];

function planeDataUrl(heading: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><g transform="rotate(${heading} 32 32)"><path d="M32 4 L38 26 L60 38 L60 44 L38 38 L38 52 L46 58 L32 54 L18 58 L26 52 L26 38 L4 44 L4 38 L26 26 Z" fill="%2300E5FF" stroke="%23071018" stroke-width="2"/></g></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${svg}`;
}

export function GoogleFlightMap({
  flight,
  mapTypeId = "roadmap",
  dark = true,
  className,
}: {
  flight: Flight;
  mapTypeId?: "roadmap" | "satellite" | "terrain";
  dark?: boolean;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<
    Array<google.maps.Marker | google.maps.Polyline>
  >([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      setError("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not configured.");
      return;
    }
    let cancelled = false;
    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        mapRef.current = new google.maps.Map(containerRef.current, {
          center: { lat: 25, lng: 10 },
          zoom: 3,
          mapTypeId,
          styles: dark && mapTypeId === "roadmap" ? DARK_STYLE : undefined,
          streetViewControl: false,
          fullscreenControl: false,
          mapTypeControl: false,
          zoomControl: true,
        });
        setReady(true);
      })
      .catch((loadError) => {
        if (!cancelled)
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Google Maps failed to load.",
          );
      });
    return () => {
      cancelled = true;
      overlaysRef.current.forEach((overlay) => overlay.setMap(null));
      overlaysRef.current = [];
      mapRef.current = null;
      setReady(false);
    };
    // mapTypeId changes are handled by the update effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark]);

  // Update visual map type without rebuilding the map.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    mapRef.current.setMapTypeId(mapTypeId);
    mapRef.current.setOptions({
      styles: dark && mapTypeId === "roadmap" ? DARK_STYLE : undefined,
    });
  }, [ready, mapTypeId, dark]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    overlaysRef.current = [];

    const origin = {
      lat: flight.origin.latitude,
      lng: flight.origin.longitude,
    };
    const destination = {
      lat: flight.destination.latitude,
      lng: flight.destination.longitude,
    };

    const plannedPath: google.maps.LatLngLiteral[] = [
      origin,
      ...flight.telemetry.waypoints.map((waypoint) => ({
        lat: waypoint.latitude,
        lng: waypoint.longitude,
      })),
      destination,
    ];

    const planned = new google.maps.Polyline({
      path: plannedPath,
      geodesic: true,
      strokeColor: "#94A3B8",
      strokeOpacity: 0.6,
      strokeWeight: 2,
      icons: [
        {
          icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 },
          offset: "0",
          repeat: "14px",
        },
      ],
    });
    planned.setMap(map);
    overlaysRef.current.push(planned);

    if (flight.telemetry.hasLiveLocation) {
      const current = {
        lat: flight.telemetry.currentLatitude,
        lng: flight.telemetry.currentLongitude,
      };
      const flown = new google.maps.Polyline({
        path: [origin, current],
        geodesic: true,
        strokeColor: "#00E5FF",
        strokeOpacity: 0.95,
        strokeWeight: 4,
      });
      flown.setMap(map);
      overlaysRef.current.push(flown);

      const plane = new google.maps.Marker({
        position: current,
        map,
        title: `${flight.flightNumber} live position`,
        icon: {
          url: planeDataUrl(flight.telemetry.headingDegrees),
          scaledSize: new google.maps.Size(40, 40),
          anchor: new google.maps.Point(20, 20),
        },
        zIndex: 1000,
      });
      overlaysRef.current.push(plane);
    }

    const originMarker = new google.maps.Marker({
      position: origin,
      map,
      title: `${flight.origin.code} · ${flight.origin.city}`,
      label: flight.origin.code,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 9,
        fillColor: "#0077FF",
        fillOpacity: 1,
        strokeColor: "#FFFFFF",
        strokeWeight: 2,
      },
    });
    const destinationMarker = new google.maps.Marker({
      position: destination,
      map,
      title: `${flight.destination.code} · ${flight.destination.city}`,
      label: flight.destination.code,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 9,
        fillColor: "#10B981",
        fillOpacity: 1,
        strokeColor: "#FFFFFF",
        strokeWeight: 2,
      },
    });
    overlaysRef.current.push(originMarker, destinationMarker);

    const bounds = new google.maps.LatLngBounds();
    bounds.extend(origin);
    bounds.extend(destination);
    if (flight.telemetry.hasLiveLocation) {
      bounds.extend({
        lat: flight.telemetry.currentLatitude,
        lng: flight.telemetry.currentLongitude,
      });
    }
    map.fitBounds(bounds, 80);
  }, [ready, flight]);

  return (
    <div
      className={cn(
        "relative z-0 overflow-hidden rounded-2xl border border-line bg-surface",
        className,
      )}
    >
      <div ref={containerRef} className="h-full w-full" />
      {!ready && !error && (
        <div className="absolute inset-0 z-[500] flex items-center justify-center bg-surface/80 text-xs text-muted">
          Loading Google Maps…
        </div>
      )}
      {error && (
        <div className="absolute inset-0 z-[500] flex items-center justify-center bg-surface/90 px-6 text-center text-xs text-muted">
          {error}
        </div>
      )}
      <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded-lg border border-line/70 bg-surface/90 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-muted shadow backdrop-blur">
        Google Maps · live flight route
      </div>
    </div>
  );
}

export const GOOGLE_MAPS_KEY_CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
);
