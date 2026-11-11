"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Glasses,
  Luggage,
  MapPin,
  Plane,
} from "lucide-react";
import { flightKey, useApp } from "@/lib/store";
import type { Flight } from "@/lib/types";
import { STATUS_META, cn, flightDateLabel, timeAgo } from "@/lib/utils";
import { StatusBadge } from "./ui";

export function FlightCard({
  flight,
  showWatchlist = true,
  className,
}: {
  flight: Flight;
  showWatchlist?: boolean;
  className?: string;
}) {
  const { toggleWatchlist, addRecent, flights } = useApp();
  const isWatchlisted = useMemo(() => {
    const key = flightKey(flight);
    // Never fall back to another operating date with the same flight number.
    const inStore = flights.find((f) => flightKey(f) === key);
    if (inStore !== undefined) return Boolean(inStore.isWatchlisted);
    return Boolean(flight.isWatchlisted);
  }, [flights, flight]);
  const href = flight.flightDate
    ? `/flight/${encodeURIComponent(flight.id)}?date=${flight.flightDate}`
    : `/flight/${encodeURIComponent(flight.id)}`;
  const progress =
    flight.statusReported && flight.status === "LANDED"
      ? 1
      : flight.telemetry.hasLiveLocation
        ? Math.min(0.98, Math.max(0, flight.telemetry.progressPercent))
        : null;

  return (
    <Link
      href={href}
      onClick={() => {
        addRecent(flight);
      }}
      aria-label={`Open ${flight.flightNumber} flight details`}
      className={cn(
        "group relative block overflow-hidden rounded-2xl border border-line/90 bg-surface/95 p-4 transition-all hover:border-accent/35 hover:shadow-[0_18px_40px_-30px_rgba(0,229,255,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        className,
      )}
    >

      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-accent/30 bg-surface-3 text-[11px] font-bold text-accent">
            {flight.airlineCode}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-[15px] font-bold leading-none text-ink">
                {flight.flightNumber}
              </p>
              {flight.flightDate && (
                <span className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] font-bold text-muted">
                  {flightDateLabel(flight.flightDate)}
                </span>
              )}
              <StatusBadge
                status={flight.status}
                statusReported={flight.statusReported}
                delayMinutes={flight.delayMinutes}
                delayReported={flight.delayReported}
              />
            </div>
            <p className="mt-1 truncate text-[11px] text-muted">{flight.airline}</p>
            <p className="mt-0.5 text-[8px] text-subtle">
              {flight.fetchedAt &&
              Number.isFinite(Date.parse(flight.fetchedAt))
                ? `Retrieved ${timeAgo(Date.parse(flight.fetchedAt))}${
                    flight.source ? ` · ${flight.source}` : ""
                  }`
                : "Retrieval time not recorded"}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {showWatchlist && (
            <button
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                toggleWatchlist(flight);
              }}
              aria-pressed={isWatchlisted}
              aria-label={
                isWatchlisted
                  ? "Remove from watchlist"
                  : "Add to watchlist"
              }
              className={cn(
                "inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] font-bold transition-all",
                isWatchlisted
                  ? "border-accent/60 bg-accent-soft text-accent shadow-sm"
                  : "border-line bg-surface-2 text-muted hover:border-accent/40 hover:text-ink",
              )}
            >
              <Glasses
                fill={isWatchlisted ? "currentColor" : "none"}
                className={cn(
                  "size-3.5 transition-colors",
                  isWatchlisted ? "fill-current text-accent" : "text-muted",
                )}
              />
              {isWatchlisted ? "Watchlisted" : "Watchlist"}
            </button>
          )}
        </div>
      </div>

      <div className="relative z-10 mt-5 grid grid-cols-[1fr_1.35fr_1fr] items-center gap-2">
        <div>
          <p className="text-[26px] font-black leading-none tracking-tight text-ink">
            {flight.origin.code}
          </p>
          <p className="mt-1 truncate text-[11px] font-medium text-muted">
            {flight.origin.city && flight.origin.city !== flight.origin.code
              ? flight.origin.city
              : flight.origin.name}
          </p>
          <p className="mt-1.5 text-xs font-semibold text-accent tabular">
            {flight.departureTimeEstimated}
          </p>
        </div>

        <div className="flex flex-col items-center">
          <p className="truncate text-[9px] text-subtle">
            {flight.aircraft.model}
          </p>
          <div className="relative mt-2 h-6 w-full">
            <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-line" />
            <div
              className="absolute left-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-accent to-accent-2"
              style={{ width: `${(progress ?? 0) * 100}%` }}
            />
            {progress != null && (
              <div
                className="absolute top-1/2 -translate-y-1/2"
                style={{ left: `calc(${progress * 100}% - 9px)` }}
              >
                <span className="flex size-[18px] items-center justify-center rounded-full bg-accent text-[color:var(--bg)] shadow-[0_0_12px_rgba(0,229,255,0.55)]">
                  <Plane className="size-2.5 rotate-90" />
                </span>
              </div>
            )}
          </div>
          {flight.statusReported && flight.status === "DEPARTED" ? (
            <p className="mt-0.5 text-[10px] font-semibold text-accent-2">
              {flight.telemetry.hasLiveLocation &&
              flight.telemetry.etaMinutesRemaining > 0
                ? `${flight.telemetry.etaMinutesRemaining}m to arrival (calculated)`
                : "Live position not reported"}
            </p>
          ) : flight.delayReported && flight.delayMinutes > 0 ? (
            <p className="mt-0.5 text-[10px] font-semibold text-delayed">
              +{flight.delayMinutes}m delay
            </p>
          ) : (
            <p className="mt-0.5 text-[10px] text-subtle">
              {flight.statusReported
                ? STATUS_META[flight.status].label
                : "Status not reported"}
            </p>
          )}
        </div>

        <div className="text-right">
          <p className="text-[26px] font-black leading-none tracking-tight text-ink">
            {flight.destination.code}
          </p>
          <p className="mt-1 truncate text-[11px] font-medium text-muted">
            {flight.destination.city &&
            flight.destination.city !== flight.destination.code
              ? flight.destination.city
              : flight.destination.name}
          </p>
          <p className="mt-1.5 text-xs font-semibold text-ink tabular">
            {flight.arrivalTimeEstimated}
          </p>
        </div>
      </div>

      <div className="relative z-10 mt-3 border-t border-line/60 pt-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1 text-ink">
              <MapPin className="size-3 text-muted" />T{flight.terminalDeparture} ·{" "}
              {flight.gateDeparture}
            </span>
            <span className="flex items-center gap-1 text-muted">
              <Luggage className="size-3 text-muted" />
              {flight.baggageCarousel}
            </span>
          </div>
          <span className="flex items-center gap-1 text-[11px] font-semibold text-accent">
            Details <ArrowRight className="size-3" />
          </span>
        </div>
        {flight.customNotes && (
          <p className="mt-2 truncate rounded-md bg-surface-3/50 px-2 py-1 text-[10px] text-accent-2">
            Note: {flight.customNotes}
          </p>
        )}
      </div>
    </Link>
  );
}
