"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BellPlus,
  Bookmark,
  BookmarkCheck,
  ChevronRight,
  Crosshair,
  Gauge,
  Layers,
  Plane,
  Radar as RadarIcon,
  Radio,
  Wind,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { RadarMap } from "@/components/radar-map";
import { EmptyState, Panel, StatusBadge } from "@/components/ui";

export default function RadarPage() {
  const { flights, toggleTrack, refreshData, syncing } = useApp();
  const savedFlights = useMemo(
    () => flights.filter((flight) => flight.isTracked || flight.isFavorite),
    [flights],
  );
  const activeFlights = useMemo(
    () =>
      savedFlights.filter((flight) =>
        ["DEPARTED", "BOARDING", "DELAYED"].includes(flight.status),
      ),
    [savedFlights],
  );

  const [selectedId, setSelectedId] = useState(
    () => activeFlights[0]?.id ?? "",
  );
  const selected =
    activeFlights.find((flight) => flight.id === selectedId) ?? activeFlights[0] ?? null;
  const [focusMode, setFocusMode] = useState(false);

  if (!selected) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <Panel>
          <EmptyState
            icon={<RadarIcon className="size-6" />}
            title="No live airborne traffic"
            description="Radar only displays live flights you have tracked or saved. Search a flight number, open its dossier, and tap Track. No simulated aircraft are shown."
            action={
              <Link href="/search">
                <button className="rounded-xl bg-accent px-4 py-2 text-xs font-bold text-[color:var(--bg)]">
                  Search live flights
                </button>
              </Link>
            }
          />
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1680px] px-4 py-4 lg:px-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="label-caps text-accent">Tactical airborne picture</p>
          <h2 className="mt-1 flex items-center gap-2 text-xl font-black tracking-tight text-ink">
            Live tactical radar
            <span className="rounded-md border border-accent/40 bg-accent-soft px-1.5 py-0.5 text-[9px] font-bold text-accent">
              AIRBORNE
            </span>
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-lg border border-line/60 bg-surface-2 px-2.5 py-1.5 text-[10px] font-semibold text-muted">
            <Radio className="size-3 animate-pulse text-accent" />
            {activeFlights.length} live saved targets
          </span>
          <button
            onClick={() => void refreshData()}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5 text-[10px] font-semibold text-muted transition-colors hover:text-accent"
          >
            <Radio className={cn("size-3", syncing && "animate-pulse")} />
            {syncing ? "Refreshing" : "Refresh live"}
          </button>
          <button
            onClick={() => setFocusMode((value) => !value)}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-semibold transition-colors",
              focusMode
                ? "border-accent/50 bg-accent-soft text-accent"
                : "border-line bg-surface-2 text-muted hover:text-ink",
            )}
          >
            <Crosshair className="size-3" />
            {focusMode ? "Exit focus" : "Focus map"}
          </button>
        </div>
      </div>

      <div
        className={cn(
          "grid gap-3",
          focusMode ? "grid-cols-1" : "xl:grid-cols-[minmax(0,1fr)_330px]",
        )}
      >
        <div className="min-w-0">
          <RadarMap
            flight={selected}
            className={cn(
              "w-full",
              focusMode ? "h-[calc(100vh-190px)]" : "h-[calc(100vh-250px)] min-h-[560px]",
            )}
            isExpanded={focusMode}
            onToggleExpand={() => setFocusMode((value) => !value)}
          />
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <RadarMetric
              icon={<Gauge className="size-3.5" />}
              label="Ground speed"
              value={`${selected.telemetry.groundSpeedKnots} kt`}
            />
            <RadarMetric
              icon={<Wind className="size-3.5" />}
              label="Heading"
              value={`${Math.round(selected.telemetry.headingDegrees)}°`}
            />
            <RadarMetric
              icon={<Layers className="size-3.5" />}
              label="Altitude"
              value={`${selected.telemetry.altitudeFeet.toLocaleString()} ft`}
            />
            <RadarMetric
              icon={<Plane className="size-3.5" />}
              label="ETA"
              value={`${selected.telemetry.etaMinutesRemaining} min`}
            />
          </div>
        </div>

        {!focusMode && (
          <aside className="space-y-3">
            <div className="rounded-2xl border border-line bg-surface p-3">
              <div className="flex items-center justify-between pb-2">
                <p className="label-caps text-subtle">Airborne traffic</p>
                <RadarIcon className="size-3.5 text-accent" />
              </div>
              <div className="max-h-[340px] space-y-1.5 overflow-y-auto pr-1">
                {activeFlights.map((flight) => {
                  const active = flight.id === selected.id;
                  return (
                    <button
                      key={flight.id}
                      onClick={() => setSelectedId(flight.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-xl border p-2 text-left transition-colors",
                        active
                          ? "border-accent/50 bg-accent-soft"
                          : "border-line/60 bg-surface-2/60 hover:border-accent/35",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-7 shrink-0 items-center justify-center rounded-lg border text-[9px] font-bold",
                          active
                            ? "border-accent/40 text-accent"
                            : "border-line bg-surface-3 text-muted",
                        )}
                      >
                        {flight.airlineCode}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "truncate font-mono text-[11px] font-bold",
                              active ? "text-accent" : "text-ink",
                            )}
                          >
                            {flight.flightNumber}
                          </span>
                          <StatusBadge
                            status={flight.status}
                            delayMinutes={flight.delayMinutes}
                          />
                        </span>
                        <span className="mt-0.5 flex items-center gap-1 text-[9px] text-subtle">
                          {flight.origin.code}
                          <ArrowRight className="size-2.5" />
                          {flight.destination.code}
                          <span>·</span>
                          <span className="tabular">
                            {flight.telemetry.altitudeFeet.toLocaleString()} ft
                          </span>
                        </span>
                      </span>
                      <span className="shrink-0 text-[9px] font-bold text-accent tabular">
                        {Math.round(flight.telemetry.progressPercent * 100)}%
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-surface p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-sm font-black text-ink">
                    {selected.flightNumber}
                  </p>
                  <p className="text-[10px] text-subtle">{selected.airline}</p>
                </div>
                <StatusBadge
                  status={selected.status}
                  delayMinutes={selected.delayMinutes}
                />
              </div>
              <div className="mt-2.5 rounded-lg border border-line/60 bg-surface-2 px-2.5 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-center">
                    <span className="block font-mono text-base font-black text-ink">
                      {selected.origin.code}
                    </span>
                    <span className="text-[8px] text-subtle">
                      {selected.departureTimeEstimated}
                    </span>
                  </span>
                  <span className="flex flex-col items-center text-accent">
                    <Plane className="size-3 rotate-90" />
                    <span className="mt-0.5 text-[8px] font-bold">
                      {Math.round(selected.telemetry.progressPercent * 100)}%
                    </span>
                  </span>
                  <span className="text-center">
                    <span className="block font-mono text-base font-black text-ink">
                      {selected.destination.code}
                    </span>
                    <span className="text-[8px] text-subtle">
                      {selected.arrivalTimeEstimated}
                    </span>
                  </span>
                </div>
              </div>
              <div className="mt-2 space-y-1 text-[9px]">
                <p className="flex items-center justify-between">
                  <span className="text-subtle">Position</span>
                  <span className="font-mono font-semibold text-ink">
                    {selected.telemetry.currentLatitude.toFixed(2)},{" "}
                    {selected.telemetry.currentLongitude.toFixed(2)}
                  </span>
                </p>
                <p className="flex items-center justify-between">
                  <span className="text-subtle">Remaining</span>
                  <span className="font-semibold text-ink">
                    {selected.telemetry.distanceRemainingNm} nm ·{" "}
                    {selected.telemetry.etaMinutesRemaining} min
                  </span>
                </p>
                <p className="flex items-center justify-between">
                  <span className="text-subtle">Gate</span>
                  <span className="font-semibold text-ink">
                    T{selected.terminalDeparture} · {selected.gateDeparture}
                  </span>
                </p>
                <p className="flex items-center justify-between">
                  <span className="text-subtle">Aircraft</span>
                  <span className="max-w-[170px] truncate font-semibold text-ink">
                    {selected.aircraft.model}
                  </span>
                </p>
              </div>
              <p className="mt-2 rounded-md border border-accent/25 bg-accent-soft px-2 py-1.5 text-[9px] leading-relaxed text-accent">
                {selected.statusNote}
              </p>
              <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => toggleTrack(selected)}
                  className={cn(
                    "flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[9px] font-bold transition-colors",
                    selected.isTracked
                      ? "border-accent/50 bg-accent-soft text-accent"
                      : "border-line bg-surface-2 text-muted hover:text-ink",
                  )}
                >
                  {selected.isTracked ? (
                    <BookmarkCheck className="size-3" />
                  ) : (
                    <Bookmark className="size-3" />
                  )}
                  {selected.isTracked ? "Tracked" : "Track"}
                </button>
                <Link
                  href={`/flight/${encodeURIComponent(selected.id)}`}
                  className="flex items-center justify-center gap-1 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-[9px] font-bold text-accent transition-colors hover:border-accent/40"
                >
                  Dossier <ChevronRight className="size-3" />
                </Link>
              </div>
            </div>

            <div className="rounded-xl border border-dashed border-line bg-surface-2/50 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[10px] font-bold text-muted">
                <BellPlus className="size-3 text-accent" /> Real-time telemetry
              </p>
              <p className="mt-1 text-[9px] leading-relaxed text-subtle">
                Aircraft positions come from AeroDataBox when the live feed reports
                a location. Flights without a reported position are labelled and
                never simulated.
              </p>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function RadarMetric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line/70 bg-surface px-2.5 py-2">
      <span className="text-accent">{icon}</span>
      <span>
        <span className="block text-[8px] font-bold uppercase tracking-wider text-subtle">
          {label}
        </span>
        <span className="block text-[11px] font-bold text-ink tabular">{value}</span>
      </span>
    </div>
  );
}
