"use client";

import Link from "next/link";
import {
  ArrowRightLeft,
  CalendarClock,
  CheckCircle2,
  Clock,
  Compass,
  ExternalLink,
  Info,
  Plane,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import type {
  DirectFlightConnection,
  Flight,
  RouteDataProvenance,
  TodayBoardMeta,
} from "@/lib/types";
import { HAUL_META, STATUS_META, cn } from "@/lib/utils";

interface RouteTimetableProps {
  connection: DirectFlightConnection;
  provenance: RouteDataProvenance | null;
  todayFlights: Flight[];
  todayMeta: TodayBoardMeta | null;
  todayLoading: boolean;
  todayError: string | null;
  onClose?: () => void;
  onSwap?: () => void;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : iso;
}

function formatWindow(window: { from: string; to: string } | null): string {
  if (!window) return "";
  return `${formatTimestamp(window.from)} → ${formatTimestamp(window.to)}`;
}

export function RouteTimetable({
  connection,
  provenance,
  todayFlights,
  todayMeta,
  todayLoading,
  todayError,
  onClose,
  onSwap,
}: RouteTimetableProps) {
  const distanceMiles = Math.round(connection.distanceKm * 0.621371);
  const haulMeta = HAUL_META[connection.haulCategory];

  const todaysDepartures = todayFlights
    .filter(
      (flight) =>
        flight.origin.code === connection.origin.iata &&
        flight.destination.code === connection.destination.iata,
    )
    .sort((a, b) =>
      (a.departureTimeEstimated || a.departureTimeScheduled || "").localeCompare(
        b.departureTimeEstimated || b.departureTimeScheduled || "",
      ),
    );

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-surface rounded-t-2xl sm:rounded-none border-t sm:border-t-0 sm:border-r border-line/80 text-ink shadow-2xl backdrop-blur-xl">
      <div className="flex items-center justify-center pt-2 pb-1 sm:hidden">
        <div className="h-1.5 w-12 rounded-full bg-line" />
      </div>

      {/* Source banner — the first thing a user sees. */}
      <div className="flex items-center justify-between gap-2 border-b border-line/60 bg-surface-2/60 px-4 py-2.5">
        <div
          className="flex min-w-0 items-center gap-1.5 rounded-full border border-accent/25 bg-accent-soft px-2.5 py-1 text-[10px] font-bold text-accent"
          title={provenance?.note}
        >
          <CalendarClock className="size-3.5 shrink-0" />
          <span className="truncate">
            {todayLoading
              ? "AeroDataBox · loading current board"
              : todayError
                ? "AeroDataBox · current board unavailable"
                : `AeroDataBox · ${todaysDepartures.length} departure${
                    todaysDepartures.length === 1 ? "" : "s"
                  } in current board`}
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-muted transition-colors hover:bg-surface-2 hover:text-ink cursor-pointer"
            aria-label="Close route panel"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* Route header */}
      <div className="p-4 border-b border-line/60 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-extrabold tracking-tight text-ink">
            {connection.origin.city || connection.origin.iata} →{" "}
            {connection.destination.city || connection.destination.iata}
          </h2>
          {onSwap && (
            <button
              onClick={onSwap}
              className="flex size-7 items-center justify-center rounded-full border border-line/80 bg-surface-2 text-muted hover:text-ink hover:border-accent/40 transition-colors cursor-pointer"
              title="Swap origin and destination"
              aria-label="Swap route direction"
            >
              <ArrowRightLeft className="size-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted">
          <span className="font-mono text-ink font-bold">
            {connection.origin.iata} → {connection.destination.iata}
          </span>
          <span>·</span>
          <span>{distanceMiles.toLocaleString()} mi</span>
          <span>·</span>
          <span>{Math.round(connection.distanceKm).toLocaleString()} km</span>
          <span>·</span>
          <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-muted border border-line/60">
            {haulMeta.label}
          </span>
        </div>

        <p className="text-[10px] leading-relaxed text-subtle">
          Distance is calculated from the verified airport coordinates.
          AeroDataBox does not report a route duration here, so none is shown.
        </p>
      </div>

      {/* Operators reported by AeroDataBox */}
      <div className="p-4 border-b border-line/60 space-y-2">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-subtle">
          <Plane className="size-3 text-accent" />
          <span>Operators reported for this route ({connection.operatingCarriers.length})</span>
        </p>
        {connection.operatingCarriers.length ? (
          <div className="flex flex-wrap gap-1.5">
            {connection.operatingCarriers.map((carrier) => (
              <span
                key={`${carrier.airlineCode}-${carrier.airlineName}`}
                className="flex items-center gap-1.5 rounded-lg border border-line/70 bg-surface-2/60 px-2 py-1 text-[11px]"
              >
                {carrier.airlineCode && (
                  <span className="font-mono text-[10px] font-black text-accent">
                    {carrier.airlineCode}
                  </span>
                )}
                <span className="font-semibold text-ink">{carrier.airlineName}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-muted">
            AeroDataBox did not report operators for this route.
          </p>
        )}
        <p className="text-[10px] leading-relaxed text-subtle">
          Per-airline weekly frequencies and operating weekdays are not part of
          this provider response. They are intentionally left blank.
        </p>
      </div>

      {/* Current board departures */}
      <div className="p-4 border-b border-line/60 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-subtle">
            <Clock className="size-3 text-accent" />
            <span>Current board departures</span>
          </p>
          {todayMeta?.window && (
            <span className="text-[9px] text-subtle" title={formatWindow(todayMeta.window)}>
              {formatWindow(todayMeta.window)}
            </span>
          )}
        </div>

        {todayLoading ? (
          <div className="rounded-xl border border-line/70 bg-surface-2/40 px-3 py-6 text-center text-[11px] text-muted">
            Loading AeroDataBox&apos;s current departures board…
          </div>
        ) : todayError ? (
          <div className="flex items-start gap-2 rounded-xl border border-delayed/40 bg-delayed/10 px-3 py-2.5 text-[11px] leading-relaxed text-muted">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-delayed" />
            <span>
              Current departures are unavailable: {todayError} No substitute or
              saved schedule is shown.
            </span>
          </div>
        ) : todaysDepartures.length ? (
          <div className="space-y-1.5">
            {todaysDepartures.map((flight) => {
              const status = STATUS_META[flight.status];
              const time =
                flight.departureTimeEstimated || flight.departureTimeScheduled;
              const gate =
                flight.gateDeparture &&
                flight.gateDeparture !== "Gate TBD"
                  ? flight.gateDeparture
                  : null;
              const terminal =
                flight.terminalDeparture && flight.terminalDeparture !== "—"
                  ? flight.terminalDeparture
                  : null;

              return (
                <div
                  key={`${flight.id}-${flight.flightDate ?? "any"}-${time}`}
                  className="rounded-xl border border-line/70 bg-surface-2/50 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="font-mono text-xs font-black tabular text-ink">
                        {time || "—"}
                      </span>
                      <span className="font-mono text-[10px] font-bold text-accent">
                        {flight.flightNumber}
                      </span>
                      <span className="truncate text-[11px] text-muted">
                        {flight.airline}
                      </span>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-extrabold",
                        flight.statusReported
                          ? "border"
                          : "border border-line bg-surface-3 text-subtle",
                      )}
                      style={
                        flight.statusReported
                          ? {
                              color: status.color,
                              backgroundColor: status.soft,
                              borderColor: `${status.color}55`,
                            }
                          : undefined
                      }
                    >
                      {flight.statusReported ? status.label : "Status not reported"}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[9px] text-subtle">
                    <span>
                      Scheduled {flight.departureTimeScheduled || "—"}
                      {flight.departureTimeEstimated &&
                        flight.departureTimeEstimated !==
                          flight.departureTimeScheduled && (
                          <> · Estimated {flight.departureTimeEstimated}</>
                        )}
                    </span>
                    {terminal && <span>Terminal {terminal}</span>}
                    {gate && <span>{gate}</span>}
                    {flight.aircraft?.model &&
                      flight.aircraft.model !== "Not reported" && (
                        <span>{flight.aircraft.model}</span>
                      )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-line/70 bg-surface-2/40 px-3 py-3 text-[11px] leading-relaxed text-muted">
            AeroDataBox&apos;s current board returned no departures to{" "}
            {connection.destination.iata} in its window. This is not proof that
            the route does not operate; the provider may not cover it or the
            flight may fall outside the board window.
          </div>
        )}
      </div>

      {/* Explicit statement about what is not shown */}
      <div className="p-4 border-b border-line/60">
        <div className="flex items-start gap-2 rounded-xl border border-line/70 bg-surface-2/40 px-3 py-2.5">
          <Info className="mt-0.5 size-3.5 shrink-0 text-accent" />
          <p className="text-[10px] leading-relaxed text-muted">
            A weekly operating-day calendar is not shown because AeroDataBox
            route statistics do not contain per-day schedules. Avi does not
            guess or synthesize those days. A verified forward schedule will be
            added only when a schedule source is available.
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 space-y-3">
        <Link
          href={`/search?mode=ROUTE&origin=${encodeURIComponent(connection.origin.iata)}&dest=${encodeURIComponent(connection.destination.iata)}`}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent text-bg hover:opacity-90 font-extrabold text-xs py-3 shadow-lg transition-all hover:scale-[1.01]"
        >
          <Search className="size-3.5" />
          <span>Search live flights on Avi</span>
        </Link>

        <a
          href={`https://www.google.com/travel/flights?q=flights%20from%20${connection.origin.iata}%20to%20${connection.destination.iata}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 hover:bg-surface-3 text-ink font-bold text-xs py-2.5 transition-all"
        >
          <span>Check prices on Google Flights</span>
          <ExternalLink className="size-3.5 text-muted" />
        </a>

        <div className="pt-2 space-y-1.5 text-[11px]">
          <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted">
            <Compass className="size-3 text-accent" />
            <span>More aviation resources</span>
          </p>
          <a
            href={`https://www.google.com/travel/flights?q=Flights%20from%20${connection.origin.city}%20to%20${connection.destination.city}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-accent hover:underline text-[10.5px]"
          >
            <ExternalLink className="size-2.5" />
            <span>
              All flights from {connection.origin.city || connection.origin.iata} to{" "}
              {connection.destination.city || connection.destination.iata}
            </span>
          </a>
        </div>
      </div>

      {/* Provenance footer */}
      <div className="mt-auto border-t border-line/60 px-4 py-3 text-[9px] leading-relaxed text-subtle">
        <div className="flex items-start gap-1.5">
          <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-accent" />
          <span>
            Route statistics: AeroDataBox, previous 7 days
            {provenance ? ` · retrieved ${formatTimestamp(provenance.fetchedAt)}` : ""}.
            {todayMeta ? (
              <>
                {" "}Current board: AeroDataBox, retrieved{" "}
                {formatTimestamp(todayMeta.fetchedAt)}
                {todayMeta.window ? ` · window ${formatWindow(todayMeta.window)}` : ""}.
              </>
            ) : null}{" "}
            Not a forward schedule. Verify with the airline before travel.
          </span>
        </div>
      </div>
    </div>
  );
}
