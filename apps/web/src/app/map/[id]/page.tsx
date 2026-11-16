"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Compass,
  Glasses,
  Layers,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  Plane,
  RefreshCw,
  Telescope,
  TriangleAlert,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { authFetch } from "@/lib/authed-fetch";
import {
  cn,
  geodesicDistanceKm,
  isFreshTimestamp,
  kmToNm,
  normalizeFlightNumber,
} from "@/lib/utils";
import type { Flight } from "@/lib/types";
import {
  Button,
  EmptyState,
  IconButton,
  Panel,
  StatusBadge,
} from "@/components/ui";

const FlightMap = dynamic(() => import("@/components/flight-map").then((m) => m.FlightMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center rounded-xl border border-line/70 bg-surface">
      <p className="flex items-center gap-2 text-sm text-muted">
        <RefreshCw className="size-4 animate-spin text-accent" />
        Loading live map…
      </p>
    </div>
  ),
});

export default function FlightMapPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { flights, upsertFlights, offlineMode } = useApp();
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupAttempted, setLookupAttempted] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const dateParam = searchParams.get("date") ?? "";
  const flight = useMemo(() => {
    const id = decodeURIComponent(params.id ?? "").trim();
    const cleanId = id.replace(/\s+/g, "").toLowerCase();
    const numberMatch = (item: Flight) =>
      item.id.replace(/\s+/g, "").toLowerCase() === cleanId ||
      normalizeFlightNumber(item.flightNumber).toLowerCase() === cleanId;
    const dateMatch = (item: Flight) =>
      !dateParam || (item.flightDate ?? "") === dateParam;
    if (dateParam) {
      return flights.find((item) => numberMatch(item) && dateMatch(item));
    }
    return flights.find(numberMatch);
  }, [flights, params.id, dateParam]);

  useEffect(() => {
    if (flight || lookupAttempted || lookupLoading || offlineMode) return;
    const rawId = decodeURIComponent(params.id ?? "").replace(/\s+/g, "");
    if (!/^[A-Za-z0-9]{2,3}\d{1,4}[A-Za-z]?$/.test(rawId)) {
      setLookupAttempted(true);
      return;
    }

    let active = true;
    setLookupLoading(true);
    const dateQuery = dateParam ? `&date=${encodeURIComponent(dateParam)}` : "";
    authFetch(`/api/flights/search?flight=${encodeURIComponent(rawId)}${dateQuery}`)
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as
          | { flights?: Flight[]; error?: string }
          | null;
        if (!active) return;
        if (!res.ok || data?.error) {
          setLookupError(
            data?.error ?? "Live flight lookup is temporarily unavailable.",
          );
          return;
        }
        if (Array.isArray(data?.flights) && data.flights.length > 0) {
          upsertFlights(data.flights);
        }
      })
      .catch(() => {
        if (active) {
          setLookupError("Live flight lookup is temporarily unavailable.");
        }
      })
      .finally(() => {
        if (active) {
          setLookupLoading(false);
          setLookupAttempted(true);
        }
      });

    return () => {
      active = false;
    };
  }, [flight, lookupAttempted, lookupLoading, offlineMode, params.id, dateParam, upsertFlights]);

  const [showHud, setShowHud] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  if (lookupLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="flex flex-col items-center gap-2.5">
          <RefreshCw className="size-6 animate-spin text-accent" />
          <p className="text-sm text-muted">Loading live flight telemetry…</p>
        </div>
      </div>
    );
  }

  if (!flight) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <Panel>
          <EmptyState
            icon={<MapIcon className="size-5" />}
            title={
              lookupError ? "Live flight lookup unavailable" : "Flight map unavailable"
            }
            description={
              lookupError
                ? `${lookupError} This is not evidence that the flight does not operate.`
                : "We could not find a live record for this flight and date. The provider may not cover it."
            }
            action={
              <Link href="/explore/CAI">
                <Button size="sm">Back to explore</Button>
              </Link>
            }
          />
        </Panel>
      </div>
    );
  }

  const distance = geodesicDistanceKm(
    flight.origin.latitude,
    flight.origin.longitude,
    flight.destination.latitude,
    flight.destination.longitude,
  );
  const distanceNm = kmToNm(distance);
  const hasFreshPosition =
    Boolean(flight.telemetry.hasLiveLocation) &&
    isFreshTimestamp(flight.fetchedAt);

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
    <div className="flex flex-col gap-3 px-3 py-3 lg:px-5 lg:py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <IconButton
            label="Back"
            onClick={() => router.back()}
            className="border border-line/70 bg-surface-2/60"
          >
            <ArrowLeft className="size-4" />
          </IconButton>
          <div className="min-w-0">
            <p className="label-caps text-accent">
              {hasFreshPosition ? "Live flight map" : "Flight route map"}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <h1 className="flex items-center gap-1.5 font-mono text-lg font-semibold text-ink">
                {flight.flightNumber}
                {flight.isWatchlisted && (
                  <Glasses
                    className="size-3.5 shrink-0 fill-current text-accent"
                    aria-label="On your watchlist"
                  />
                )}
              </h1>
              <span className="font-mono text-[13px] text-muted">
                {flight.origin.code} → {flight.destination.code}
              </span>
              <StatusBadge
                status={flight.status}
                statusReported={flight.statusReported}
                delayMinutes={flight.delayMinutes}
                delayReported={flight.delayReported}
              />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowHud((value) => !value)}
            aria-pressed={showHud}
            className={cn(
              "inline-flex h-10 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium transition-colors",
              showHud
                ? "border-accent/35 bg-accent-soft text-accent"
                : "border-line/70 bg-surface-2/60 text-muted hover:text-ink",
            )}
          >
            <Telescope className="size-4" /> HUD
          </button>
          <IconButton
            label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            onClick={toggleFullscreen}
            className="border border-line/70 bg-surface-2/60"
          >
            {fullscreen ? (
              <Minimize2 className="size-4" />
            ) : (
              <Maximize2 className="size-4" />
            )}
          </IconButton>
          <Link
            href={
              flight.flightDate
                ? `/flight/${encodeURIComponent(flight.id)}?date=${encodeURIComponent(flight.flightDate)}`
                : `/flight/${encodeURIComponent(flight.id)}`
            }
          >
            <Button size="sm" variant="outline">
              Dossier
            </Button>
          </Link>
        </div>
      </div>

      <div className="relative h-[calc(100vh-168px)] min-h-[520px] overflow-hidden rounded-xl border border-line/70">
        <FlightMap flight={flight} className="h-full" showAttribution={false} />

        {/* Floating flight info */}
        <div className="pointer-events-none absolute left-3 top-3 w-[280px] max-w-[calc(100%-80px)]">
          <div className="pointer-events-auto rounded-lg border border-line/80 bg-surface/95 p-3.5 shadow-xl backdrop-blur">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-lg border border-accent/35 bg-accent-soft text-accent">
                  <Plane className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-mono text-[13px] font-semibold text-ink">
                    {flight.flightNumber}
                  </p>
                  <p className="truncate text-xs text-subtle">{flight.airline}</p>
                </div>
              </div>
              <span
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-md border px-1.5 py-1 text-xs font-medium",
                  hasFreshPosition
                    ? "border-landed/35 bg-landed/10 text-landed"
                    : "border-line/70 bg-surface-2 text-subtle",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    hasFreshPosition
                      ? "animate-pulse-dot bg-landed"
                      : "bg-subtle",
                  )}
                />
                {hasFreshPosition ? "Live" : "No position"}
              </span>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-line/60 bg-surface-2/60 px-3 py-2">
              <span className="min-w-0 text-center">
                <span className="block font-mono text-base font-semibold text-ink">
                  {flight.origin.code}
                </span>
                <span className="block truncate text-xs text-subtle">
                  {flight.origin.city}
                </span>
              </span>
              <span className="flex flex-1 flex-col items-center px-1">
                <Plane className="size-3.5 rotate-90 text-accent" />
                <span className="mt-1 text-xs font-medium text-accent">
                  {hasFreshPosition
                    ? `${Math.round(flight.telemetry.progressPercent * 100)}%`
                    : "—"}
                </span>
              </span>
              <span className="min-w-0 text-center">
                <span className="block font-mono text-base font-semibold text-ink">
                  {flight.destination.code}
                </span>
                <span className="block truncate text-xs text-subtle">
                  {flight.destination.city}
                </span>
              </span>
            </div>

            <dl className="mt-2.5 space-y-1.5 text-[13px]">
              <HudRow
                label="Position"
                value={
                  hasFreshPosition
                    ? `${flight.telemetry.currentLatitude.toFixed(2)}, ${flight.telemetry.currentLongitude.toFixed(2)}`
                    : "Not reported"
                }
                mono
              />
              <HudRow
                label="Heading / speed"
                value={
                  hasFreshPosition
                    ? `${Math.round(flight.telemetry.headingDegrees)}° · ${flight.telemetry.groundSpeedKnots} kt`
                    : "Not reported"
                }
              />
              <HudRow label="Aircraft" value={flight.aircraft.model} />
            </dl>

            <div className="mt-2.5 flex items-start gap-1.5 rounded-md border border-delayed/30 bg-delayed/8 px-2.5 py-2 text-xs leading-relaxed text-muted">
              <TriangleAlert className="mt-0.5 size-3 shrink-0 text-delayed" />
              <span>
                {flight.statusReported
                  ? flight.statusNote || "No status note reported"
                  : "Status not reported by provider"}
              </span>
            </div>
            {!hasFreshPosition && (
              <p className="mt-2 rounded-md border border-line/70 bg-surface-2/60 px-2.5 py-2 text-xs leading-relaxed text-subtle">
                A live aircraft position is not available for this flight. The
                route is shown, but no aircraft marker is fabricated.
              </p>
            )}
          </div>
        </div>

        {/* Floating route data */}
        <div className="pointer-events-none absolute right-3 top-3 hidden w-[250px] sm:block">
          <div className="pointer-events-auto rounded-lg border border-line/80 bg-surface/95 p-3.5 shadow-xl backdrop-blur">
            <p className="label-caps text-subtle">Great circle route</p>
            <dl className="mt-2 space-y-1.5 text-[13px]">
              <HudRow
                label="Distance"
                value={`${distance.toLocaleString()} km · ${distanceNm.toLocaleString()} nm`}
              />
              <HudRow
                label="Remaining"
                value={
                  hasFreshPosition
                    ? `${flight.telemetry.distanceRemainingNm} nm`
                    : "Not reported"
                }
                accent
              />
              <HudRow
                label="ETA"
                value={
                  hasFreshPosition && flight.telemetry.etaMinutesRemaining > 0
                    ? `${flight.arrivalTimeEstimated} · ${flight.telemetry.etaMinutesRemaining}m`
                    : flight.arrivalTimeEstimated || "Not reported"
                }
              />
              <HudRow
                label="Waypoints"
                value={String(flight.telemetry.waypoints.length)}
              />
            </dl>
            <p className="mt-2.5 flex items-center gap-1.5 border-t border-line/60 pt-2.5 text-xs text-subtle">
              <Compass className="size-3 shrink-0 text-accent" />
              Geodesic projection · Mercator basemap
            </p>
          </div>
        </div>

        {/* Bottom HUD */}
        {showHud && (
          <div className="pointer-events-none absolute inset-x-3 bottom-3">
            <div className="pointer-events-auto rounded-lg border border-line/80 bg-surface/95 px-3.5 py-2.5 shadow-xl backdrop-blur">
              <div className="grid grid-cols-3 gap-x-3 gap-y-2.5 sm:grid-cols-6">
                <HudItem
                  label="Altitude"
                  value={
                    hasFreshPosition
                      ? `${flight.telemetry.altitudeFeet.toLocaleString()} ft`
                      : "—"
                  }
                  accent
                />
                <HudItem
                  label="Ground speed"
                  value={
                    hasFreshPosition
                      ? `${flight.telemetry.groundSpeedKnots} kt`
                      : "—"
                  }
                />
                <HudItem label="Mach" value="—" />
                <HudItem label="Vertical speed" value="—" />
                <HudItem
                  label="Remaining"
                  value={
                    hasFreshPosition
                      ? `${flight.telemetry.distanceRemainingNm} nm`
                      : "—"
                  }
                />
                <HudItem
                  label="ETA (calc.)"
                  value={
                    hasFreshPosition && flight.telemetry.etaMinutesRemaining > 0
                      ? `${flight.telemetry.etaMinutesRemaining} min`
                      : "—"
                  }
                  accent
                />
              </div>
            </div>
          </div>
        )}

        <div className="pointer-events-none absolute bottom-24 left-3 hidden items-center gap-1.5 rounded-md border border-line/70 bg-surface/90 px-2.5 py-1.5 text-xs text-subtle backdrop-blur sm:flex">
          <Layers className="size-3 shrink-0 text-accent" />
          © OpenStreetMap contributors · tiles by OpenFreeMap · drag to pan ·
          scroll to zoom
        </div>
      </div>
    </div>
  );
}

function HudRow({
  label,
  value,
  mono,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-subtle">{label}</dt>
      <dd
        className={cn(
          "text-right font-medium",
          mono && "font-mono text-xs",
          accent ? "text-accent" : "text-ink",
        )}
      >
        {value}
      </dd>
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
      <p className="label-caps text-subtle">{label}</p>
      <p
        className={cn(
          "mt-1 text-[13px] font-medium tabular",
          accent ? "text-accent" : "text-ink",
        )}
      >
        {value}
      </p>
    </div>
  );
}
