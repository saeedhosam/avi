"use client";

import { useEffect, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import type { AirportNode, DirectFlightConnection, Flight } from "@/lib/types";
import { cn } from "@/lib/utils";

const OSM_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

function curve(
  origin: AirportNode,
  destination: AirportNode,
): Array<[number, number]> {
  const lat1 = origin.latitude;
  const lon1 = origin.longitude;
  const lat2 = destination.latitude;
  const lon2 = destination.longitude;
  const midLat = (lat1 + lat2) / 2;
  const midLon = (lon1 + lon2) / 2;
  const arc = Math.min(10, Math.abs(lon2 - lon1) * 0.12);
  const controlLat = midLat + arc;
  const controlLon = midLon - (lat2 - lat1) * 0.04;
  return Array.from({ length: 33 }, (_, index) => {
    const t = index / 32;
    const lat =
      (1 - t) ** 2 * lat1 + 2 * (1 - t) * t * controlLat + t ** 2 * lat2;
    const lon =
      (1 - t) ** 2 * lon1 + 2 * (1 - t) * t * controlLon + t ** 2 * lon2;
    return [lat, lon] as [number, number];
  });
}

function planeIcon(heading: number) {
  const html = `<div style="width:38px;height:38px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 0 6px rgba(0,229,255,.8));">
    <svg width="30" height="30" viewBox="0 0 64 64" style="transform:rotate(${heading}deg)">
      <path d="M32 4 L38 26 L60 38 L60 44 L38 38 L38 52 L46 58 L32 54 L18 58 L26 52 L26 38 L4 44 L4 38 L26 26 Z" fill="#00E5FF" stroke="#071018" stroke-width="2"/>
    </svg>
  </div>`;
  return { html, width: 38, height: 38 };
}

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layersRef = useRef<LayerGroup | null>(null);
  const lastFitRef = useRef("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function setup() {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, {
        zoomControl: true,
        scrollWheelZoom: true,
        worldCopyJump: true,
        minZoom: 2,
        maxBoundsViscosity: 0.4,
      }).setView([22, 10], 2);
      L.tileLayer(OSM_URL, {
        attribution: OSM_ATTRIBUTION,
        maxZoom: 19,
      }).addTo(map);
      L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);
      layersRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setReady(true);
      window.setTimeout(() => map.invalidateSize(), 120);
    }
    void setup();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layersRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function draw() {
      const L = (await import("leaflet")).default;
      const map = mapRef.current;
      const layerGroup = layersRef.current;
      if (cancelled || !ready || !map || !layerGroup) return;
      layerGroup.clearLayers();

      const points: Array<[number, number]> = [];
      const seen = new Set<string>();

      for (const connection of connections) {
        const path = curve(connection.origin, connection.destination);
        const isSelected =
          selectedRoute?.origin.iata === connection.origin.iata &&
          selectedRoute?.destination.iata === connection.destination.iata;
        L.polyline(path, {
          color: isSelected ? "#C2185B" : "#D94A6A",
          weight: isSelected ? 4 : 1.6,
          opacity: isSelected ? 0.95 : 0.6,
          lineCap: "round",
        }).addTo(layerGroup);
        points.push([connection.origin.latitude, connection.origin.longitude]);
        points.push([connection.destination.latitude, connection.destination.longitude]);

        if (!seen.has(connection.destination.iata)) {
          seen.add(connection.destination.iata);
          const isSelectedDest =
            selected?.iata === connection.destination.iata;
          L.circleMarker(
            [connection.destination.latitude, connection.destination.longitude],
            {
              radius: isSelectedDest ? 7 : 4,
              color: isSelectedDest ? "#FFB800" : "#0A335C",
              weight: 1.5,
              fillColor: isSelectedDest ? "#FFB800" : "#0A335C",
              fillOpacity: 0.9,
            },
          )
            .bindTooltip(
              `${connection.destination.iata} · ${connection.destination.city}`,
              { direction: "top", opacity: 0.95 },
            )
            .on("click", () => onSelectAirport(connection.destination.iata))
            .addTo(layerGroup);
        }
      }

      if (origin) {
        points.push([origin.latitude, origin.longitude]);
        L.circleMarker([origin.latitude, origin.longitude], {
          radius: 9,
          color: "#FFFFFF",
          weight: 2,
          fillColor: "#0077FF",
          fillOpacity: 1,
        })
          .bindTooltip(`${origin.iata} · ${origin.city} (origin)`, {
            direction: "top",
            opacity: 0.95,
          })
          .addTo(layerGroup);
      }

      const fitKey = `${origin?.iata ?? "all"}:${connections.length}`;
      if (points.length > 1 && lastFitRef.current !== fitKey) {
        lastFitRef.current = fitKey;
        map.fitBounds(L.latLngBounds(points), {
          padding: [50, 50],
          maxZoom: 5,
        });
      }
      window.setTimeout(() => map.invalidateSize(), 60);
    }
    void draw();
    return () => {
      cancelled = true;
    };
  }, [ready, connections, origin, selected, selectedRoute, onSelectAirport]);

  return (
    <div
      className={cn(
        "relative z-0 overflow-hidden rounded-2xl border border-line bg-[#CBE7F9]",
        className,
      )}
    >
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layersRef = useRef<LayerGroup | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function setup() {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, {
        zoomControl: true,
        scrollWheelZoom: true,
        worldCopyJump: true,
        minZoom: 2,
      }).setView([24, 10], 2);
      L.tileLayer(OSM_URL, {
        attribution: OSM_ATTRIBUTION,
        maxZoom: 19,
      }).addTo(map);
      layersRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setReady(true);
      window.setTimeout(() => map.invalidateSize(), 120);
    }
    void setup();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layersRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function draw() {
      const L = (await import("leaflet")).default;
      const map = mapRef.current;
      const layerGroup = layersRef.current;
      if (cancelled || !ready || !map || !layerGroup) return;
      layerGroup.clearLayers();

      const origin: AirportNode = {
        iata: flight.origin.code,
        icao: "",
        name: flight.origin.name,
        city: flight.origin.city,
        country: flight.origin.country,
        region: "AMERICAS",
        latitude: flight.origin.latitude,
        longitude: flight.origin.longitude,
        timezone: flight.origin.timezone,
        hubAirlines: [],
      };
      const destination: AirportNode = {
        iata: flight.destination.code,
        icao: "",
        name: flight.destination.name,
        city: flight.destination.city,
        country: flight.destination.country,
        region: "AMERICAS",
        latitude: flight.destination.latitude,
        longitude: flight.destination.longitude,
        timezone: flight.destination.timezone,
        hubAirlines: [],
      };

      const planned = curve(origin, destination);
      L.polyline(planned, {
        color: "#64748B",
        weight: 2,
        opacity: 0.5,
        dashArray: "8 8",
      }).addTo(layerGroup);

      if (flight.telemetry.hasLiveLocation) {
        L.polyline(
          [
            [origin.latitude, origin.longitude],
            [flight.telemetry.currentLatitude, flight.telemetry.currentLongitude],
          ],
          {
            color: "#00E5FF",
            weight: 4,
            opacity: 0.9,
            lineCap: "round",
          },
        ).addTo(layerGroup);
        const icon = planeIcon(flight.telemetry.headingDegrees);
        L.marker(
          [flight.telemetry.currentLatitude, flight.telemetry.currentLongitude],
          {
            icon: L.divIcon({
              html: icon.html,
              className: "skytrack-plane-marker",
              iconSize: [icon.width, icon.height],
              iconAnchor: [19, 19],
            }),
            zIndexOffset: 1000,
          },
        )
          .bindTooltip(`${flight.flightNumber} · live position`, {
            direction: "top",
          })
          .addTo(layerGroup);
      }

      L.circleMarker([origin.latitude, origin.longitude], {
        radius: 8,
        color: "#FFFFFF",
        weight: 2,
        fillColor: "#0077FF",
        fillOpacity: 1,
      })
        .bindTooltip(`${origin.iata} · ${origin.city}`, { direction: "top" })
        .addTo(layerGroup);
      L.circleMarker([destination.latitude, destination.longitude], {
        radius: 8,
        color: "#FFFFFF",
        weight: 2,
        fillColor: "#10B981",
        fillOpacity: 1,
      })
        .bindTooltip(`${destination.iata} · ${destination.city}`, {
          direction: "top",
        })
        .addTo(layerGroup);

      const bounds = L.latLngBounds([
        [origin.latitude, origin.longitude],
        [destination.latitude, destination.longitude],
      ]);
      if (flight.telemetry.hasLiveLocation) {
        bounds.extend([
          flight.telemetry.currentLatitude,
          flight.telemetry.currentLongitude,
        ]);
      }
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 7 });
      window.setTimeout(() => map.invalidateSize(), 60);
    }
    void draw();
    return () => {
      cancelled = true;
    };
  }, [ready, flight]);

  return (
    <div
      className={cn(
        "relative z-0 overflow-hidden rounded-2xl border border-line bg-[#CBE7F9]",
        className,
      )}
    >
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
