"use client";

import Link from "next/link";
import {
  ArrowRightLeft,
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
import { HAUL_META } from "@/lib/utils";
import { StatusBadge } from "./ui";

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
    <div className="flex h-full w-full flex-col overflow-y-auto rounded-t-2xl border-t border-line/70 bg-surface text-ink shadow-2xl sm:rounded-none sm:border-r sm:border-t-0">
      <div className="flex justify-center pb-1 pt-2 sm:hidden">
        <div className="h-1.5 w-12 rounded-full bg-line" />
      </div>

      {/* Header */}
      <div className="border-b border-line/60 px-4 py-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="label-caps text-accent">Direct route</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-ink">
              {connection.origin.iata} → {connection.destination.iata}
            </h2>
            <p className="mt-0.5 truncate text-[13px] text-muted">
              {connection.origin.city || connection.origin.iata} to{" "}
              {connection.destination.city || connection.destination.iata}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {onSwap && (
              <button
                type="button"
                onClick={onSwap}
                className="flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                title="Swap origin and destination"
                aria-label="Swap route direction"
              >
                <ArrowRightLeft className="size-4" />
              </button>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                aria-label="Close route panel"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-subtle">
          <span className="font-mono tabular text-ink">
            {distanceMiles.toLocaleString()} mi ·{" "}
            {Math.round(connection.distanceKm).toLocaleString()} km
          </span>
          <span className="rounded-md bg-surface-2 px-2 py-1 font-medium text-muted">
            {haulMeta.label}
          </span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-subtle">
          Distance is calculated from verified airport coordinates. No route
          duration is reported by the provider, so none is shown.
        </p>
      </div>

      {/* Operators */}
      <section className="border-b border-line/60 px-4 py-4">
        <p className="label-caps flex items-center gap-1.5 text-subtle">
          <Plane className="size-3.5" /> Operators ·{" "}
          {connection.operatingCarriers.length}
        </p>
        {connection.operatingCarriers.length ? (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {connection.operatingCarriers.map((carrier) => (
              <span
                key={`${carrier.airlineCode}-${carrier.airlineName}`}
                className="flex items-center gap-1.5 rounded-md bg-surface-2 px-2.5 py-1.5 text-xs"
              >
                {carrier.airlineCode && (
                  <span className="font-mono font-semibold text-accent">
                    {carrier.airlineCode}
                  </span>
                )}
                <span className="text-ink">{carrier.airlineName}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2.5 text-[13px] text-muted">
            The provider did not report operators for this route.
          </p>
        )}
        <p className="mt-2.5 text-xs leading-relaxed text-subtle">
          Weekly frequencies and operating weekdays are not part of the provider
          response, so they stay blank.
        </p>
      </section>

      {/* Current board */}
      <section className="border-b border-line/60 px-4 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="label-caps text-subtle">Current board</p>
          <span className="text-xs text-subtle">
            {todayLoading
              ? "Loading"
              : todayError
                ? "Unavailable"
                : `${todaysDepartures.length} departure${
                    todaysDepartures.length === 1 ? "" : "s"
                  }`}
          </span>
        </div>

        {todayMeta?.window && (
          <p
            className="mt-1 font-mono text-xs text-subtle"
            title={formatWindow(todayMeta.window)}
          >
            {formatWindow(todayMeta.window)}
          </p>
        )}

        {todayLoading ? (
          <div className="mt-3 space-y-2" aria-busy="true">
            <div className="skeleton h-14 rounded-lg" />
            <div className="skeleton h-14 rounded-lg" />
          </div>
        ) : todayError ? (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-delayed/30 bg-delayed/8 px-3 py-2.5 text-[13px] leading-relaxed text-muted">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-delayed" />
            <span>
              Current departures are unavailable: {todayError} No substitute or
              saved schedule is shown.
            </span>
          </div>
        ) : todaysDepartures.length ? (
          <div className="mt-3 space-y-1.5">
            {todaysDepartures.map((flight) => {
              const time =
                flight.departureTimeEstimated || flight.departureTimeScheduled;
              const gate =
                flight.gateDeparture && flight.gateDeparture !== "Gate TBD"
                  ? flight.gateDeparture
                  : null;
              const terminal =
                flight.terminalDeparture && flight.terminalDeparture !== "—"
                  ? flight.terminalDeparture
                  : null;

              return (
                <Link
                  key={`${flight.id}-${flight.flightDate ?? "any"}-${time}`}
                  href={
                    flight.flightDate
                      ? `/flight/${encodeURIComponent(flight.id)}?date=${encodeURIComponent(flight.flightDate)}`
                      : `/flight/${encodeURIComponent(flight.id)}`
                  }
                  className="flex min-h-14 items-center justify-between gap-2 rounded-lg bg-surface-2/50 px-3 py-2 transition-colors hover:bg-surface-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[13px] tabular text-ink">
                        {time || "—"}
                      </span>
                      <span className="font-mono text-xs font-semibold text-accent">
                        {flight.flightNumber}
                      </span>
                      <span className="truncate text-xs text-subtle">
                        {flight.airline}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-subtle">
                      <span>Scheduled {flight.departureTimeScheduled || "—"}</span>
                      {flight.departureTimeEstimated &&
                        flight.departureTimeEstimated !==
                          flight.departureTimeScheduled && (
                          <span>Est. {flight.departureTimeEstimated}</span>
                        )}
                      {terminal && (
                        <span>
                          {/^\d+$/.test(terminal) ? `T${terminal}` : terminal}
                        </span>
                      )}
                      {gate && <span className="font-mono">{gate}</span>}
                      {flight.aircraft?.model &&
                        flight.aircraft.model !== "Not reported" && (
                          <span className="truncate">{flight.aircraft.model}</span>
                        )}
                    </div>
                  </div>
                  <StatusBadge
                    status={flight.status}
                    statusReported={flight.statusReported}
                    delayMinutes={flight.delayMinutes}
                    delayReported={flight.delayReported}
                    className="shrink-0"
                  />
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 rounded-lg bg-surface-2/50 px-3 py-3 text-[13px] leading-relaxed text-muted">
            The provider&apos;s current board returned no departures to{" "}
            {connection.destination.iata} in its window. This is not proof the
            route does not operate — it may sit outside the board window.
          </p>
        )}
      </section>

      {/* What is not shown */}
      <section className="border-b border-line/60 px-4 py-4">
        <div className="flex items-start gap-2 rounded-lg bg-surface-2/40 px-3 py-2.5">
          <Info className="mt-0.5 size-4 shrink-0 text-accent" />
          <p className="text-xs leading-relaxed text-muted">
            A weekly operating-day calendar is not shown because route
            statistics do not contain per-day schedules. AeroQuest does not
            guess those days; a verified forward schedule will be added only
            when a schedule source is available.
          </p>
        </div>
      </section>

      {/* Actions */}
      <section className="space-y-2 px-4 py-4">
        <Link
          href={`/search?mode=ROUTE&origin=${encodeURIComponent(connection.origin.iata)}&dest=${encodeURIComponent(connection.destination.iata)}`}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent text-[13px] font-semibold text-[color:var(--bg)] transition-opacity hover:opacity-90"
        >
          <Search className="size-4" />
          Search live flights
        </Link>

        <a
          href={`https://www.google.com/travel/flights?q=flights%20from%20${connection.origin.iata}%20to%20${connection.destination.iata}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-line/70 text-[13px] font-medium text-ink transition-colors hover:border-line-strong"
        >
          Check prices on Google Flights
          <ExternalLink className="size-3.5 text-subtle" />
        </a>

        <a
          href={`https://www.google.com/travel/flights?q=Flights%20from%20${connection.origin.city}%20to%20${connection.destination.city}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-1 pt-1 text-xs text-subtle transition-colors hover:text-accent"
        >
          <ExternalLink className="size-3" />
          All flights from {connection.origin.city || connection.origin.iata} to{" "}
          {connection.destination.city || connection.destination.iata}
        </a>
      </section>

      {/* Provenance */}
      <div className="mt-auto border-t border-line/60 px-4 py-3 text-xs leading-relaxed text-subtle">
        Route statistics: AeroDataBox, previous 7 days
        {provenance
          ? ` · retrieved ${formatTimestamp(provenance.fetchedAt)}`
          : ""}
        .{" "}
        {todayMeta ? (
          <>
            Current board: AeroDataBox, retrieved{" "}
            {formatTimestamp(todayMeta.fetchedAt)}
            {todayMeta.window
              ? ` · window ${formatWindow(todayMeta.window)}`
              : ""}
            .{" "}
          </>
        ) : null}
        Not a forward schedule — verify with the airline before travel.
      </div>
    </div>
  );
}
