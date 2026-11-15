"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, Glasses, Luggage, MapPin, Plane } from "lucide-react";
import { flightKey, useApp } from "@/lib/store";
import type { Flight } from "@/lib/types";
import { STATUS_META, cn, flightDateLabel, timeAgo } from "@/lib/utils";
import { StatusBadge } from "./ui";

function known(value: string | null | undefined): value is string {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return (
    normalized !== "" &&
    normalized !== "—" &&
    normalized !== "n/a" &&
    normalized !== "tbd" &&
    normalized !== "gate tbd" &&
    normalized !== "carousel tbd"
  );
}

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
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-line/70 bg-surface/80 p-4 transition-colors hover:border-line-strong hover:bg-surface sm:p-5",
        className,
      )}
    >
      <Link
        href={href}
        onClick={() => {
          addRecent(flight);
        }}
        aria-label={`Open ${flight.flightNumber} details`}
        className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/70"
      />

      <div className="pointer-events-none relative z-10">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line/60 bg-surface-2 text-xs font-semibold tracking-wide text-muted">
              {flight.airlineCode}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <span className="font-mono text-[15px] font-semibold tracking-wide text-ink">
                  {flight.flightNumber}
                </span>
                {flight.flightDate && (
                  <span className="font-mono text-xs text-subtle">
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
              <p className="mt-1 truncate text-[13px] text-muted">
                {flight.airline}
                {flight.fetchedAt && Number.isFinite(Date.parse(flight.fetchedAt))
                  ? ` · retrieved ${timeAgo(Date.parse(flight.fetchedAt))}`
                  : ""}
              </p>
            </div>
          </div>

          {showWatchlist && (
            <button
              type="button"
              onClick={() => toggleWatchlist(flight)}
              aria-pressed={isWatchlisted}
              aria-label={
                isWatchlisted ? "Remove from watchlist" : "Add to watchlist"
              }
              className={cn(
                "pointer-events-auto inline-flex size-10 shrink-0 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                isWatchlisted
                  ? "border-accent/40 bg-accent-soft text-accent"
                  : "border-line/60 bg-surface-2/60 text-muted hover:border-line-strong hover:text-ink",
              )}
            >
              <Glasses
                fill={isWatchlisted ? "currentColor" : "none"}
                className="size-4"
              />
            </button>
          )}
        </div>

        <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-start gap-3 sm:gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-subtle">From</p>
            <p className="mt-0.5 font-mono text-[28px] font-semibold leading-none tracking-tight text-ink sm:text-[32px]">
              {flight.origin.code}
            </p>
            <p className="mt-1.5 truncate text-[13px] text-muted">
              {flight.origin.city && flight.origin.city !== flight.origin.code
                ? flight.origin.city
                : flight.origin.name}
            </p>
            <p className="mt-1 font-mono text-sm font-medium tabular text-ink">
              {flight.departureTimeEstimated}
            </p>
          </div>

          <div className="flex w-24 flex-col items-center pt-5 sm:w-36">
            <p className="max-w-full truncate text-xs text-subtle">
              {flight.aircraft.model}
            </p>
            <div className="relative mt-2 h-5 w-full">
              <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line-strong/60" />
              <div
                className="absolute left-0 top-1/2 h-px -translate-y-1/2 bg-accent"
                style={{ width: `${(progress ?? 0) * 100}%` }}
              />
              {progress != null && (
                <div
                  className="absolute top-1/2 -translate-y-1/2"
                  style={{ left: `calc(${progress * 100}% - 8px)` }}
                >
                  <span className="flex size-4 items-center justify-center rounded-full bg-accent text-[color:var(--bg)]">
                    <Plane className="size-2.5 rotate-90" />
                  </span>
                </div>
              )}
            </div>
            {flight.statusReported && flight.status === "DEPARTED" ? (
              <p className="mt-0.5 text-center text-xs font-medium leading-tight text-accent-2">
                {flight.telemetry.hasLiveLocation &&
                flight.telemetry.etaMinutesRemaining > 0
                  ? `${flight.telemetry.etaMinutesRemaining}m to arrival`
                  : "Position not reported"}
              </p>
            ) : flight.delayReported && flight.delayMinutes > 0 ? (
              <p className="mt-0.5 text-center text-xs font-medium leading-tight text-delayed">
                +{flight.delayMinutes}m delay
              </p>
            ) : (
              <p className="mt-0.5 text-center text-xs leading-tight text-subtle">
                {flight.statusReported
                  ? STATUS_META[flight.status].label
                  : "Status not reported"}
              </p>
            )}
          </div>

          <div className="min-w-0 text-right">
            <p className="text-xs font-medium text-subtle">To</p>
            <p className="mt-0.5 font-mono text-[28px] font-semibold leading-none tracking-tight text-ink sm:text-[32px]">
              {flight.destination.code}
            </p>
            <p className="mt-1.5 truncate text-[13px] text-muted">
              {flight.destination.city &&
              flight.destination.city !== flight.destination.code
                ? flight.destination.city
                : flight.destination.name}
            </p>
            <p className="mt-1 font-mono text-sm font-medium tabular text-ink">
              {flight.arrivalTimeEstimated}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line/50 pt-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <MapPin className="size-3.5 text-subtle" />
              {[
                known(flight.terminalDeparture)
                  ? `Terminal ${flight.terminalDeparture}`
                  : null,
                known(flight.gateDeparture)
                  ? `Gate ${flight.gateDeparture}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ") || "Gate not reported"}
            </span>
            <span className="flex items-center gap-1.5">
              <Luggage className="size-3.5 text-subtle" />
              {known(flight.baggageCarousel)
                ? `Belt ${flight.baggageCarousel}`
                : "Belt not reported"}
            </span>
          </div>
          <span className="flex items-center gap-1 text-xs font-medium text-accent">
            Details
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>

        {flight.customNotes && (
          <p className="mt-2.5 truncate text-xs text-subtle">
            Note: {flight.customNotes}
          </p>
        )}
      </div>
    </div>
  );
}
