"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  ArrowRight,
  Clock,
  History,
  Plane,
  PlaneLanding,
  PlaneTakeoff,
  Radio,
  Route,
  Search,
  Sparkles,
  Tag,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { POPULAR_ROUTES, QUICK_FLIGHTS } from "@/lib/data";
import type { Flight, FlightStatus } from "@/lib/types";
import {
  STATUS_META,
  cn,
  normalizeFlightNumber,
  statusLabel,
} from "@/lib/utils";
import { FlightCard } from "@/components/flight-card";
import { SourceBanner } from "@/components/source-banner";
import {
  Button,
  EmptyState,
  FilterChip,
  MetricTile,
  Panel,
  TextInput,
} from "@/components/ui";

type SearchMode = "FLIGHT_NUMBER" | "ROUTE";
const STATUSES = Object.keys(STATUS_META) as FlightStatus[];

export default function SearchPage() {
  const router = useRouter();
  const {
    flights,
    favorites,
    tracked,
    recents,
    addRecent,
    deleteRecent,
    clearRecents,
    setQuotaFallback,
    aeroConfigured,
    offlineMode,
    unreadAlertCount,
    alerts,
  } = useApp();

  const [mode, setMode] = useState<SearchMode>("FLIGHT_NUMBER");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<FlightStatus | null>(null);
  const [onlyTracked, setOnlyTracked] = useState(false);
  const [routeOrigin, setRouteOrigin] = useState("JFK");
  const [routeDestination, setRouteDestination] = useState("LHR");
  const [liveFlights, setLiveFlights] = useState<Flight[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);

  // Deep links from the route inspector: /search?mode=ROUTE&origin=JFK&dest=LHR
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedMode = params.get("mode");
    if (requestedMode?.toUpperCase() === "ROUTE") setMode("ROUTE");
    const origin = params.get("origin");
    const dest = params.get("dest");
    if (origin) setRouteOrigin(origin.toUpperCase());
    if (dest) setRouteDestination(dest.toUpperCase());
  }, []);

  const filtered = useMemo(() => {
    return flights.filter((flight) => {
      let matchesMode = true;
      if (mode === "FLIGHT_NUMBER") {
        const q = query.trim().toLowerCase();
        const compact = q.replace(/\s+/g, "");
        if (q) {
          matchesMode =
            flight.flightNumber.toLowerCase().includes(q) ||
            normalizeFlightNumber(flight.flightNumber).toLowerCase().includes(compact) ||
            flight.airline.toLowerCase().includes(q) ||
            flight.airlineCode.toLowerCase().includes(q) ||
            flight.origin.code.toLowerCase().includes(q) ||
            flight.origin.city.toLowerCase().includes(q) ||
            flight.destination.code.toLowerCase().includes(q) ||
            flight.destination.city.toLowerCase().includes(q) ||
            flight.aircraft.model.toLowerCase().includes(q);
        }
      } else {
        const origin = routeOrigin.trim().toLowerCase();
        const destination = routeDestination.trim().toLowerCase();
        const originMatch =
          !origin ||
          origin === "all" ||
          flight.origin.code.toLowerCase().includes(origin) ||
          flight.origin.city.toLowerCase().includes(origin) ||
          flight.origin.name.toLowerCase().includes(origin);
        const destinationMatch =
          !destination ||
          destination === "all" ||
          flight.destination.code.toLowerCase().includes(destination) ||
          flight.destination.city.toLowerCase().includes(destination) ||
          flight.destination.name.toLowerCase().includes(destination);
        matchesMode = originMatch && destinationMatch;
      }
      const matchesStatus = !statusFilter || flight.status === statusFilter;
      const matchesTracked = !onlyTracked || flight.isTracked;
      return matchesMode && matchesStatus && matchesTracked;
    });
  }, [flights, mode, query, statusFilter, onlyTracked, routeOrigin, routeDestination]);

  const displayFlights = useMemo(() => {
    if (!liveFlights.length) return filtered;
    const liveIds = new Set(liveFlights.map((flight) => flight.id));
    return [...liveFlights, ...filtered.filter((flight) => !liveIds.has(flight.id))];
  }, [filtered, liveFlights]);

  // Debounced live AeroDataBox lookup, mirroring the Android 450ms trigger.
  useEffect(() => {
    setLiveFlights([]);
    if (mode !== "FLIGHT_NUMBER" || offlineMode || !aeroConfigured) return;
    const cleaned = query.trim().replace(/\s+/g, "").replace(/-/g, "");
    if (cleaned.length < 3) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLiveLoading(true);
      try {
        const response = await fetch(
          `/api/flights/search?flight=${encodeURIComponent(cleaned)}`,
          { signal: controller.signal },
        );
        const data = (await response.json()) as {
          mode: string;
          flights?: Flight[];
        };
        if (data.mode === "QUOTA_FALLBACK") setQuotaFallback();
        if (Array.isArray(data.flights) && data.flights.length) {
          setLiveFlights((prev) => {
            const merged = new Map(prev.map((flight) => [flight.id, flight]));
            data.flights!.forEach((flight) => merged.set(flight.id, flight));
            return [...merged.values()];
          });
        }
      } catch {
        // Local results remain available when the live edge is unreachable.
      } finally {
        setLiveLoading(false);
      }
    }, 450);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, mode, aeroConfigured, offlineMode, setQuotaFallback]);

  const applyQuickFlight = (flightNumber: string) => {
    setMode("FLIGHT_NUMBER");
    setStatusFilter(null);
    setOnlyTracked(false);
    setQuery(flightNumber);
  };

  const applyRoute = (origin: string, destination: string) => {
    setMode("ROUTE");
    setStatusFilter(null);
    setOnlyTracked(false);
    setRouteOrigin(origin);
    setRouteDestination(destination);
  };

  const openRecent = (flightNumber: string) => {
    setMode("FLIGHT_NUMBER");
    setStatusFilter(null);
    setOnlyTracked(false);
    const matched = flights.find(
      (flight) =>
        normalizeFlightNumber(flight.flightNumber) ===
        normalizeFlightNumber(flightNumber),
    );
    if (matched) {
      addRecent(matched);
      router.push(`/flight/${encodeURIComponent(matched.id)}`);
    } else {
      setQuery(flightNumber);
    }
  };

  const airborne = flights.filter((flight) => flight.status === "DEPARTED");
  const upcoming = flights
    .filter((flight) => ["SCHEDULED", "BOARDING", "DELAYED"].includes(flight.status))
    .slice(0, 4);
  const latestAlerts = alerts.slice(0, 3);

  return (
    <div className="mx-auto max-w-[1680px] px-4 py-4 lg:px-6 lg:py-5">
      <div className="grid gap-4 xl:grid-cols-[268px_minmax(0,1fr)_300px]">
        {/* Left rail */}
        <aside className="space-y-3 xl:sticky xl:top-[88px] xl:self-start">
          <SourceBanner />
          <Panel className="p-3">
            <div className="flex items-center justify-between pb-2">
              <p className="label-caps text-subtle">Search mode</p>
              <Sparkles className="size-3.5 text-accent" />
            </div>
            <div className="grid grid-cols-2 gap-1 rounded-xl border border-line/70 bg-surface-2 p-1">
              <button
                onClick={() => setMode("FLIGHT_NUMBER")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-bold transition-colors",
                  mode === "FLIGHT_NUMBER"
                    ? "bg-accent text-[color:var(--bg)]"
                    : "text-muted hover:text-ink",
                )}
              >
                <Tag className="size-3.5" /> Flight #
              </button>
              <button
                onClick={() => setMode("ROUTE")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-bold transition-colors",
                  mode === "ROUTE"
                    ? "bg-accent text-[color:var(--bg)]"
                    : "text-muted hover:text-ink",
                )}
              >
                <Route className="size-3.5" /> Route
              </button>
            </div>

            {mode === "FLIGHT_NUMBER" ? (
              <div className="mt-3 space-y-2.5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-accent" />
                  <TextInput
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Flight # or airline…"
                    className="pl-9 pr-8"
                  />
                  {query && (
                    <button
                      onClick={() => setQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-subtle hover:text-ink"
                      aria-label="Clear search"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
                {liveLoading && (
                  <p className="flex items-center gap-1.5 text-[10px] font-semibold text-accent">
                    <Radio className="size-3 animate-pulse" /> Querying
                    AeroDataBox live…
                  </p>
                )}
                <div>
                  <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-subtle">
                    Popular flights
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_FLIGHTS.map((flightNumber) => (
                      <button
                        key={flightNumber}
                        onClick={() => applyQuickFlight(flightNumber)}
                        className="rounded-md border border-line bg-surface-2 px-1.5 py-1 font-mono text-[10px] font-bold text-accent transition-colors hover:border-accent/50 hover:bg-accent-soft"
                      >
                        {flightNumber}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                <div className="flex items-end gap-1.5">
                  <label className="min-w-0 flex-1">
                    <span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-subtle">
                      Departure
                    </span>
                    <div className="relative">
                      <PlaneTakeoff className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-accent" />
                      <TextInput
                        value={routeOrigin === "ALL" ? "" : routeOrigin}
                        onChange={(event) => setRouteOrigin(event.target.value)}
                        placeholder="JFK / city"
                        className="h-9 pl-8 text-xs"
                      />
                    </div>
                  </label>
                  <button
                    onClick={() => {
                      const previousOrigin = routeOrigin;
                      setRouteOrigin(routeDestination);
                      setRouteDestination(previousOrigin);
                    }}
                    className="mb-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-surface-3 text-accent transition-transform hover:rotate-180"
                    aria-label="Swap origin and destination"
                  >
                    <ArrowLeftRight className="size-3.5" />
                  </button>
                  <label className="min-w-0 flex-1">
                    <span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-subtle">
                      Destination
                    </span>
                    <div className="relative">
                      <PlaneLanding className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-accent-2" />
                      <TextInput
                        value={routeDestination === "ALL" ? "" : routeDestination}
                        onChange={(event) => setRouteDestination(event.target.value)}
                        placeholder="LHR / city"
                        className="h-9 pl-8 text-xs"
                      />
                    </div>
                  </label>
                </div>
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => {
                      setRouteOrigin("ALL");
                      setRouteDestination("ALL");
                    }}
                    className="text-[10px] font-semibold text-muted hover:text-accent"
                  >
                    Reset / all airports
                  </button>
                  <span className="text-[9px] text-subtle">Code or city</span>
                </div>
                <div>
                  <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-subtle">
                    Popular routes
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {POPULAR_ROUTES.map(([origin, destination]) => {
                      const active =
                        routeOrigin.toUpperCase() === origin &&
                        routeDestination.toUpperCase() === destination;
                      return (
                        <button
                          key={`${origin}-${destination}`}
                          onClick={() => applyRoute(origin, destination)}
                          className={cn(
                            "flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] font-bold transition-colors",
                            active
                              ? "border-accent bg-accent-soft text-accent"
                              : "border-line bg-surface-2 text-muted hover:border-accent/40",
                          )}
                        >
                          <span className="text-accent">{origin}</span>
                          <ArrowRight className="size-2.5 text-subtle" />
                          <span className="text-accent-2">{destination}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </Panel>

          <Panel className="p-3">
            <div className="flex items-center justify-between pb-2">
              <p className="label-caps text-subtle">Filters</p>
              {(statusFilter || onlyTracked) && (
                <button
                  onClick={() => {
                    setStatusFilter(null);
                    setOnlyTracked(false);
                  }}
                  className="text-[9px] font-semibold text-accent"
                >
                  Reset
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <FilterChip
                active={!statusFilter && !onlyTracked}
                onClick={() => {
                  setStatusFilter(null);
                  setOnlyTracked(false);
                }}
              >
                All flights
              </FilterChip>
              <FilterChip
                active={onlyTracked}
                onClick={() => {
                  setOnlyTracked((value) => !value);
                  setStatusFilter(null);
                }}
                color="var(--accent)"
              >
                <History className="size-3" /> Tracked ({tracked.length})
              </FilterChip>
              {STATUSES.map((status) => (
                <FilterChip
                  key={status}
                  active={statusFilter === status && !onlyTracked}
                  color={STATUS_META[status].color}
                  onClick={() => {
                    setOnlyTracked(false);
                    setStatusFilter((current) =>
                      current === status ? null : status,
                    );
                  }}
                >
                  {statusLabel(status)}
                </FilterChip>
              ))}
            </div>
          </Panel>

          <Panel className="p-3">
            <div className="flex items-center justify-between pb-2">
              <p className="flex items-center gap-1.5 label-caps text-subtle">
                <History className="size-3 text-accent" /> Recent searches
              </p>
              {recents.length > 0 && (
                <button
                  onClick={clearRecents}
                  className="text-[9px] font-semibold text-muted hover:text-cancelled"
                >
                  Clear all
                </button>
              )}
            </div>
            {recents.length === 0 ? (
              <p className="py-2 text-[10px] leading-relaxed text-subtle">
                Searched flights are cached locally (last 5) for one-tap recall.
              </p>
            ) : (
              <div className="space-y-1.5">
                {recents.map((recent) => (
                  <div
                    key={recent.flightNumber}
                    className="group flex items-center gap-2 rounded-lg border border-line/60 bg-surface-2/70 p-2"
                  >
                    <button
                      onClick={() => openRecent(recent.flightNumber)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="flex items-center gap-1.5 text-[11px] font-bold text-ink">
                        {recent.flightNumber}
                        <span
                          className="size-1 rounded-full"
                          style={{ backgroundColor: STATUS_META[recent.status].color }}
                        />
                      </p>
                      <p className="mt-0.5 truncate text-[9px] text-subtle">
                        {recent.originCode} → {recent.destCode} · {recent.airline}
                      </p>
                    </button>
                    <button
                      onClick={() => deleteRecent(recent.flightNumber)}
                      aria-label={`Remove ${recent.flightNumber} from recent searches`}
                      className="text-subtle opacity-0 transition-opacity hover:text-cancelled group-hover:opacity-100"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </aside>

        {/* Main results */}
        <section className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="label-caps text-accent">
                {mode === "ROUTE"
                  ? `Route results · ${routeOrigin || "ALL"} → ${routeDestination || "ALL"}`
                  : "Flight results"}
              </p>
              <h2 className="mt-1 text-xl font-black tracking-tight text-ink">
                {mode === "ROUTE" ? "Direct route lookup" : "Global flight lookup"}
                <span className="ml-2 text-sm font-semibold text-muted">
                  ({displayFlights.length})
                </span>
              </h2>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-line/60 bg-surface-2 px-2.5 py-1.5">
              <span className="size-1.5 animate-pulse-dot rounded-full bg-landed" />
              <span className="text-[10px] font-semibold text-muted">
                Real-time updates active
              </span>
            </div>
          </div>

          {liveFlights.length > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-landed/35 bg-landed/10 px-3 py-2">
              <Radio className="size-3.5 text-landed" />
              <p className="text-[10px] font-semibold text-landed">
                {liveFlights.length} live AeroDataBox result
                {liveFlights.length === 1 ? "" : "s"} merged into the local cache
              </p>
            </div>
          )}

          {displayFlights.length === 0 ? (
            <Panel>
              <EmptyState
                icon={
                  onlyTracked ? (
                    <Plane className="size-6" />
                  ) : (
                    <PlaneLanding className="size-6" />
                  )
                }
                title={onlyTracked ? "No tracked flights" : "No flights found"}
                description={
                  onlyTracked
                    ? "Search for any flight and tap Track to save it to the local cache for offline monitoring."
                    : mode === "ROUTE"
                      ? `No direct flights found for ${routeOrigin || "ALL"} → ${routeDestination || "ALL"}. Try JFK → LHR or SFO → HND.`
                      : "Try a flight number such as AA 100, or search by airline name like Delta, British Airways, or Emirates."
                }
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setStatusFilter(null);
                      setOnlyTracked(false);
                      if (mode === "ROUTE") {
                        setRouteOrigin("ALL");
                        setRouteDestination("ALL");
                      } else {
                        setQuery("");
                      }
                    }}
                  >
                    Reset filters
                  </Button>
                }
              />
            </Panel>
          ) : (
            <div className="space-y-2.5">
              {displayFlights.map((flight) => (
                <FlightCard key={flight.id} flight={flight} />
              ))}
            </div>
          )}
        </section>

        {/* Right rail */}
        <aside className="space-y-3 xl:sticky xl:top-[88px] xl:self-start">
          <Panel className="p-3">
            <div className="flex items-center justify-between">
              <p className="label-caps text-subtle">Live operations</p>
              <span className="flex items-center gap-1 text-[9px] font-bold text-landed">
                <span className="size-1.5 animate-pulse-dot rounded-full bg-landed" />
                FEED
              </span>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <MetricTile
                label="Airborne"
                value={airborne.length}
                sub="En route now"
                accent
              />
              <MetricTile
                label="Watchlist"
                value={favorites.length}
                sub="Saved flights"
              />
              <MetricTile
                label="Tracked"
                value={tracked.length}
                sub="Local cache"
              />
              <MetricTile
                label="Unread"
                value={unreadAlertCount}
                sub="Push alerts"
              />
            </div>
          </Panel>

          <Panel className="p-3">
            <div className="flex items-center justify-between pb-2">
              <p className="label-caps text-subtle">Airborne now</p>
              <Link
                href="/radar"
                className="flex items-center gap-1 text-[9px] font-bold text-accent hover:underline"
              >
                Radar <ArrowRight className="size-2.5" />
              </Link>
            </div>
            <div className="space-y-1.5">
              {airborne.slice(0, 4).map((flight) => (
                <Link
                  key={flight.id}
                  href={`/flight/${encodeURIComponent(flight.id)}`}
                  className="flex items-center gap-2 rounded-lg border border-line/60 bg-surface-2/60 px-2 py-1.5 transition-colors hover:border-accent/40"
                >
                  <span className="flex size-6 items-center justify-center rounded-md bg-surface-3 text-[9px] font-bold text-accent">
                    {flight.airlineCode}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[10px] font-bold text-ink">
                      {flight.flightNumber} · {flight.origin.code}→{flight.destination.code}
                    </span>
                    <span className="block text-[9px] text-subtle tabular">
                      {flight.telemetry.altitudeFeet.toLocaleString()} ft ·{" "}
                      {flight.telemetry.groundSpeedKnots} kt
                    </span>
                  </span>
                  <span className="text-[9px] font-bold text-accent tabular">
                    {Math.round(flight.telemetry.progressPercent * 100)}%
                  </span>
                </Link>
              ))}
            </div>
          </Panel>

          <Panel className="p-3">
            <p className="label-caps text-subtle">Upcoming departures</p>
            <div className="mt-2 space-y-1.5">
              {upcoming.map((flight) => (
                <Link
                  key={flight.id}
                  href={`/flight/${encodeURIComponent(flight.id)}`}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2"
                >
                  <Clock className="size-3 text-subtle" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[10px] font-semibold text-ink">
                      {flight.flightNumber} · {flight.destination.code}
                    </span>
                    <span className="block text-[9px] text-subtle">
                      {flight.departureTimeEstimated} · {flight.gateDeparture}
                    </span>
                  </span>
                  <span
                    className="text-[9px] font-bold"
                    style={{ color: STATUS_META[flight.status].color }}
                  >
                    {statusLabel(flight.status, flight.delayMinutes)}
                  </span>
                </Link>
              ))}
            </div>
          </Panel>

          <Panel className="p-3">
            <div className="flex items-center justify-between pb-2">
              <p className="label-caps text-subtle">Latest alerts</p>
              <span className="text-[9px] font-bold text-delayed">
                {unreadAlertCount} unread
              </span>
            </div>
            <div className="space-y-1.5">
              {latestAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="rounded-lg border border-line/60 bg-surface-2/60 px-2 py-1.5"
                >
                  <p className="truncate text-[10px] font-semibold text-ink">
                    {alert.title}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-[9px] text-subtle">
                    <span className="font-mono text-accent">
                      {alert.flightNumber}
                    </span>
                    · {alert.timestamp}
                  </p>
                </div>
              ))}
            </div>
          </Panel>

          <div className="rounded-xl border border-dashed border-line bg-surface-2/40 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[10px] font-bold text-muted">
              <TrendingUp className="size-3 text-accent" /> Desktop console
            </p>
            <p className="mt-1 text-[9px] leading-relaxed text-subtle">
              Multi-pane layout tuned for large screens: search, filters, live
              telemetry, and watchlist are visible at once.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
