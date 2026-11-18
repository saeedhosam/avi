import Link from "next/link";
import { Globe2, MapPin, RefreshCw } from "lucide-react";
import type {
  DirectFlightConnection,
  DestinationArrivalForecast,
} from "@avi/shared";
import { AIRPORT_TRAFFIC_BUCKETS } from "@/lib/airport-traffic";
import type { ExploreAirport } from "@/lib/explore-types";
import { cn } from "@/lib/utils";
import { ExploreHistoryButtons } from "./explore-history-buttons";

export function ExploreAirportOverlay({
  airport,
  connections,
  loading,
  error,
  selectedRoute,
  weather,
  weatherLoading,
  trafficByIata,
  visible,
  canBack,
  canForward,
  onBack,
  onForward,
  onRefresh,
}: {
  airport: ExploreAirport | null;
  connections: DirectFlightConnection[];
  loading: boolean;
  error: string | null;
  selectedRoute: DirectFlightConnection | null;
  weather: DestinationArrivalForecast | null;
  weatherLoading: boolean;
  trafficByIata: Record<string, number>;
  visible: boolean;
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onRefresh: () => void;
}) {
  if (!airport) return null;

  const originCity = connections[0]?.origin.city ?? airport.city;

  return (
    <div
      aria-hidden={!visible}
      inert={!visible}
      className={cn(
        "pointer-events-none absolute inset-0 z-10 transition-all duration-300 ease-out",
        visible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
      )}
    >
      <header
        key={airport.iata}
        className="map-overlay-top pointer-events-auto absolute left-3 right-3 animate-float-in rounded-xl border border-line/70 bg-surface/90 p-4 shadow-2xl backdrop-blur-xl sm:left-4 sm:right-4 lg:right-auto lg:w-[min(30rem,calc(100%_-_26rem))]"
      >
        <div className="flex flex-wrap items-center gap-2">
          <ExploreHistoryButtons
            canBack={canBack}
            canForward={canForward}
            onBack={onBack}
            onForward={onForward}
          />
          <Globe2 className="size-3.5 text-accent" />
          <span className="label-caps text-accent">Direct route explorer</span>
          <span className="ml-auto flex items-center gap-1.5 rounded-full border border-line/70 px-2 py-1 text-[11px] font-medium text-muted">
            <span
              className={cn(
                "size-1.5 rounded-full",
                loading
                  ? "animate-pulse-dot bg-accent"
                  : error
                    ? "bg-delayed"
                    : "bg-landed",
              )}
            />
            {loading ? "Syncing" : error ? "Unavailable" : "Live cache"}
          </span>
        </div>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-ink sm:text-2xl">
          Non-stop from {originCity}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {airport.name} · {airport.iata}
        </p>
        <p className="mt-2 hidden text-xs leading-relaxed text-muted sm:block">
          Destinations are coloured by each airport&apos;s active route count
          and paired with cached arrival weather.
        </p>
        <div className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1">
          {AIRPORT_TRAFFIC_BUCKETS.map((bucket) => (
            <span
              key={bucket.id}
              title={bucket.range}
              className="inline-flex items-center gap-1.5 text-[11px] text-muted"
            >
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: bucket.color }}
              />
              {bucket.label}
            </span>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-line/70 px-2.5 text-xs text-muted">
            <MapPin className="size-3.5" /> {originCity}, {airport.country}
          </span>
          <span className="text-xs text-subtle">
            {loading && connections.length === 0
              ? "Loading direct network…"
              : `${connections.length} direct destinations`}
          </span>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh route data"
            title="Refresh route data"
            className="ml-auto inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-line/70 px-2.5 text-xs font-medium text-muted transition-colors hover:border-accent/40 hover:text-ink disabled:opacity-50"
          >
            <RefreshCw className={cn("size-3", loading && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
        {error ? (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-cancelled/30 bg-cancelled/10 px-3 py-2 text-xs leading-relaxed text-ink"
          >
            {error} The explorer never falls back to a static route dataset.
          </p>
        ) : null}
      </header>

      <div className="map-card-top map-card-bottom pointer-events-auto absolute inset-x-3 lg:inset-x-auto lg:bottom-auto lg:right-4 lg:w-[360px]">
        {selectedRoute ? (
          <section
            key={selectedRoute.id}
            className="animate-float-in rounded-xl border border-line/70 bg-surface/90 p-4 shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-mono text-xs font-semibold tracking-[0.14em] text-accent">
                  {selectedRoute.destination.iata}
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">
                  {selectedRoute.destination.city}
                </h2>
                <p className="text-[13px] text-muted">
                  {selectedRoute.destination.name}
                </p>
                <p className="mt-1 text-[11px] text-subtle">
                  {(trafficByIata[selectedRoute.destination.iata] ?? 0) > 0
                    ? `~${trafficByIata[selectedRoute.destination.iata]} active routes`
                    : "No active routes in the reference catalogue"}
                </p>
              </div>
              <span className="rounded-md border border-line/70 px-2 py-1 text-xs font-medium tabular text-muted">
                {Math.round(selectedRoute.distanceKm).toLocaleString()} km
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
              <div>
                <dt className="text-xs text-subtle">Duration</dt>
                <dd className="mt-0.5 font-medium text-ink">
                  {selectedRoute.durationFormatted
                    ? `~${selectedRoute.durationFormatted}`
                    : "Not reported"}
                  {selectedRoute.durationEstimated ? (
                    <span className="ml-1 text-xs font-normal text-subtle">
                      estimate
                    </span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Daily flights</dt>
                <dd className="mt-0.5 font-medium text-ink">
                  {selectedRoute.dailyFlightsCount ?? "Not reported"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Airlines</dt>
                <dd className="mt-0.5 font-medium text-ink">
                  {selectedRoute.operatingCarriers.length}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-subtle">Weather</dt>
                <dd className="mt-0.5 font-medium text-ink">
                  {weatherLoading
                    ? "Loading…"
                    : weather?.dataAvailable
                      ? `${weather.arrivalTempC}°C · ${weather.arrivalCondition}`
                      : "Unavailable"}
                </dd>
              </div>
            </dl>
            {weather?.dataAvailable ? (
              <p className="mt-2.5 text-xs leading-relaxed text-muted">
                {weather.windCondition} · {weather.visibility} ·{" "}
                {weather.advisory.arrivalNotice}
              </p>
            ) : null}
            <div className="mt-4 grid gap-2">
              <Link
                href="/cabin/B77W/14A"
                className="rounded-lg bg-accent px-3 py-2.5 text-center text-[13px] font-semibold text-[color:var(--bg)]"
              >
                Open 3D cabin preview
              </Link>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
