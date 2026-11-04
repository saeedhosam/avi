"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Compass,
  Layers,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  Moon,
  Plane,
  Sun,
  Telescope,
  TriangleAlert,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { airportNodeByIata } from "@/lib/data";
import type { Airport, AirportNode, DirectFlightConnection } from "@/lib/types";
import { cn, geodesicDistanceKm, kmToNm } from "@/lib/utils";
import { WorldMap } from "@/components/world-map";
import { Button, EmptyState, Panel, StatusBadge } from "@/components/ui";

function toNode(airport: Airport): AirportNode {
  return (
    airportNodeByIata.get(airport.code) ?? {
      iata: airport.code,
      icao: `K${airport.code}`,
      name: airport.name,
      city: airport.city,
      country: airport.country,
      region: "AMERICAS",
      latitude: airport.latitude,
      longitude: airport.longitude,
      timezone: airport.timezone,
      hubAirlines: [],
    }
  );
}

export default function FlightMapPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { flights } = useApp();
  const flight = useMemo(() => {
    const id = decodeURIComponent(params.id ?? "");
    return flights.find(
      (item) =>
        item.id.toLowerCase() === id.toLowerCase() ||
        item.flightNumber.replace(/\s+/g, "").toLowerCase() ===
          id.replace(/\s+/g, "").toLowerCase(),
    );
  }, [flights, params.id]);

  const [variant, setVariant] = useState<"light" | "dark">("dark");
  const [showHud, setShowHud] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  if (!flight) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <Panel>
          <EmptyState
            icon={<MapIcon className="size-6" />}
            title="Flight map unavailable"
            description="This flight is not in the local cache. Search for it first to open the live map."
            action={
              <Link href="/search">
                <Button size="sm">Back to search</Button>
              </Link>
            }
          />
        </Panel>
      </div>
    );
  }

  const origin = toNode(flight.origin);
  const destination = toNode(flight.destination);
  const distance = geodesicDistanceKm(
    origin.latitude,
    origin.longitude,
    destination.latitude,
    destination.longitude,
  );
  const connection: DirectFlightConnection = {
    id: `${origin.iata}-${destination.iata}`,
    origin,
    destination,
    distanceKm: distance,
    distanceNm: kmToNm(distance),
    estimatedDurationMinutes: Math.round((distance / 815) * 60 + 32),
    durationFormatted: `${Math.floor((distance / 815) * 60 + 32) / 60}h`,
    haulCategory: distance > 4000 ? "LONG_HAUL" : distance > 1500 ? "MEDIUM_HAUL" : "SHORT_HAUL",
    dailyFlightsCount: 1,
    hasDepartures: true,
    hasArrivals: true,
    operatingCarriers: [],
    isLiveVerified: true,
  };

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setFullscreen(true);
      } else {
        await document.exitFullscreen();
        setFullscreen(false);
      }
    } catch {
      setFullscreen((value) => !value);
    }
  };

  return (
    <div className="flex flex-col gap-3 px-3 py-3 lg:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <button
            onClick={() => router.back()}
            className="flex size-8 items-center justify-center rounded-lg border border-line bg-surface-2 text-muted transition-colors hover:text-ink"
            aria-label="Back"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div className="min-w-0">
            <p className="label-caps text-accent">Live flight map</p>
            <h2 className="flex items-center gap-2 text-base font-bold text-ink lg:text-lg">
              {flight.flightNumber}
              <span className="text-[11px] font-medium text-muted">
                {flight.origin.code} → {flight.destination.code}
              </span>
              <StatusBadge status={flight.status} delayMinutes={flight.delayMinutes} />
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 rounded-lg border border-line bg-surface-2 p-1">
            <button
              onClick={() => setVariant("light")}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 text-[9px] font-bold transition-colors",
                variant === "light" ? "bg-accent text-[color:var(--bg)]" : "text-muted",
              )}
            >
              <Sun className="size-3" /> Vector
            </button>
            <button
              onClick={() => setVariant("dark")}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 text-[9px] font-bold transition-colors",
                variant === "dark" ? "bg-accent text-[color:var(--bg)]" : "text-muted",
              )}
            >
              <Moon className="size-3" /> Night
            </button>
          </div>
          <button
            onClick={() => setShowHud((value) => !value)}
            className="flex h-8 items-center gap-1 rounded-lg border border-line bg-surface-2 px-2.5 text-[9px] font-bold text-muted transition-colors hover:text-accent"
          >
            <Telescope className="size-3" /> HUD
          </button>
          <button
            onClick={toggleFullscreen}
            className="flex size-8 items-center justify-center rounded-lg border border-line bg-surface-2 text-muted transition-colors hover:text-accent"
            aria-label="Toggle fullscreen"
          >
            {fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>
          <Link href={`/flight/${encodeURIComponent(flight.id)}`}>
            <Button size="sm" variant="outline">
              Dossier
            </Button>
          </Link>
        </div>
      </div>

      <div className="relative h-[calc(100vh-160px)] min-h-[520px]">
        <WorldMap
          airports={[origin, destination]}
          connections={[connection]}
          origin={origin}
          selected={destination}
          selectedRoute={connection}
          onSelectAirport={(iata) => {
            if (iata === origin.iata || iata === destination.iata) return;
          }}
          variant={variant}
          className="h-full"
          progress={flight.telemetry.progressPercent}
          showBadge={false}
        />

        {/* Floating flight info */}
        <div className="pointer-events-none absolute left-3 top-3 w-[260px] max-w-[calc(100%-80px)]">
          <div className="pointer-events-auto rounded-xl border border-line/80 bg-surface/92 p-3 shadow-xl backdrop-blur">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-lg border border-accent/35 bg-accent-soft text-accent">
                  <Plane className="size-4" />
                </div>
                <div>
                  <p className="font-mono text-xs font-black text-ink">
                    {flight.flightNumber}
                  </p>
                  <p className="text-[9px] text-subtle">{flight.airline}</p>
                </div>
              </div>
              <span className="flex items-center gap-1 text-[8px] font-bold text-landed">
                <span className="size-1.5 animate-pulse-dot rounded-full bg-landed" />
                LIVE
              </span>
            </div>
            <div className="mt-2.5 flex items-center justify-between rounded-lg border border-line/60 bg-surface-2 px-2 py-1.5">
              <span className="text-center">
                <span className="block font-mono text-base font-black text-ink">
                  {flight.origin.code}
                </span>
                <span className="text-[8px] text-subtle">{flight.origin.city}</span>
              </span>
              <span className="flex flex-1 flex-col items-center px-2">
                <Plane className="size-3 rotate-90 text-accent" />
                <span className="mt-0.5 text-[8px] font-semibold text-accent">
                  {Math.round(flight.telemetry.progressPercent * 100)}%
                </span>
              </span>
              <span className="text-center">
                <span className="block font-mono text-base font-black text-ink">
                  {flight.destination.code}
                </span>
                <span className="text-[8px] text-subtle">{flight.destination.city}</span>
              </span>
            </div>
            <div className="mt-2 space-y-1 text-[9px]">
              <p className="flex items-center justify-between">
                <span className="text-subtle">Position</span>
                <span className="font-mono font-semibold text-ink">
                  {flight.telemetry.currentLatitude.toFixed(2)},{" "}
                  {flight.telemetry.currentLongitude.toFixed(2)}
                </span>
              </p>
              <p className="flex items-center justify-between">
                <span className="text-subtle">Heading</span>
                <span className="font-semibold text-ink">
                  {Math.round(flight.telemetry.headingDegrees)}° ·{" "}
                  {flight.telemetry.groundSpeedKnots} kt
                </span>
              </p>
              <p className="flex items-center justify-between">
                <span className="text-subtle">Aircraft</span>
                <span className="truncate font-semibold text-ink">
                  {flight.aircraft.model}
                </span>
              </p>
            </div>
            <div className="mt-2 flex items-center gap-1.5 rounded-md border border-delayed/30 bg-delayed/10 px-2 py-1 text-[8px] text-delayed">
              <TriangleAlert className="size-2.5" />
              {flight.statusNote || "Normal operations"}
            </div>
          </div>
        </div>

        {/* Floating route data */}
        <div className="pointer-events-none absolute right-3 top-3 hidden w-[230px] sm:block">
          <div className="pointer-events-auto rounded-xl border border-line/80 bg-surface/92 p-3 shadow-xl backdrop-blur">
            <p className="label-caps text-subtle">Great circle route</p>
            <div className="mt-1.5 space-y-1 text-[9px]">
              <p className="flex justify-between gap-2">
                <span className="text-subtle">Distance</span>
                <span className="font-semibold text-ink">
                  {connection.distanceKm.toLocaleString()} km ·{" "}
                  {connection.distanceNm.toLocaleString()} nm
                </span>
              </p>
              <p className="flex justify-between gap-2">
                <span className="text-subtle">Remaining</span>
                <span className="font-semibold text-accent">
                  {flight.telemetry.distanceRemainingNm} nm
                </span>
              </p>
              <p className="flex justify-between gap-2">
                <span className="text-subtle">ETA</span>
                <span className="font-semibold text-ink">
                  {flight.arrivalTimeEstimated} · {flight.telemetry.etaMinutesRemaining}m
                </span>
              </p>
              <p className="flex justify-between gap-2">
                <span className="text-subtle">Waypoints</span>
                <span className="font-semibold text-ink">
                  {flight.telemetry.waypoints.length}
                </span>
              </p>
            </div>
            <div className="mt-2 flex items-center gap-1 border-t border-line/60 pt-2 text-[8px] text-subtle">
              <Compass className="size-2.5 text-accent" /> Geodesic projection · Mercator basemap
            </div>
          </div>
        </div>

        {/* Bottom HUD */}
        {showHud && (
          <div className="pointer-events-none absolute inset-x-3 bottom-3">
            <div className="pointer-events-auto rounded-xl border border-line/80 bg-surface/92 px-3 py-2 shadow-xl backdrop-blur">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                <HudItem label="Altitude" value={`${flight.telemetry.altitudeFeet.toLocaleString()} ft`} accent />
                <HudItem label="Ground speed" value={`${flight.telemetry.groundSpeedKnots} kt`} />
                <HudItem label="Mach" value={flight.telemetry.mach.toFixed(2)} />
                <HudItem label="Vertical speed" value={`${flight.telemetry.verticalSpeedFpm} fpm`} />
                <HudItem label="Remaining" value={`${flight.telemetry.distanceRemainingNm} nm`} />
                <HudItem label="ETA" value={`${flight.telemetry.etaMinutesRemaining} min`} accent />
              </div>
            </div>
          </div>
        )}

        <div className="pointer-events-none absolute bottom-20 left-3 flex items-center gap-1.5 rounded-md border border-line/70 bg-surface/85 px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-subtle backdrop-blur">
          <Layers className="size-2.5 text-accent" /> {variant === "dark" ? "Radar night" : "Positron vector"} · drag to pan · scroll to zoom
        </div>
      </div>
    </div>
  );
}

function HudItem({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <p className="text-[8px] font-bold uppercase tracking-wider text-subtle">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-[11px] font-bold tabular",
          accent ? "text-accent" : "text-ink",
        )}
      >
        {value}
      </p>
    </div>
  );
}
