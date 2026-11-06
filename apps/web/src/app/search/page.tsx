"use client";

import { useEffect, useMemo, useState } from "react";
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
  X,
} from "lucide-react";
import { useApp } from "@/lib/store";
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
    watchlist,
    flights,
    recents,
    addRecent,
    deleteRecent,
    clearRecents,
    setQuotaFallback,
    aeroConfigured,
    offlineMode,
    unreadAlertCount,
    alerts,
    upsertFlights,
    refreshData,
    syncing,
  } = useApp();

  const [mode, setMode] = useState<SearchMode>("FLIGHT_NUMBER");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<FlightStatus | null>(null);
  const [onlyWatchlisted, setOnlyWatchlisted] = useState(false);
  const [routeOrigin, setRouteOrigin] = useState("JFK");
  const [routeDestination, setRouteDestination] = useState("");
  const [results, setResults] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultMode, setResultMode] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedMode = params.get("mode");
    if (requestedMode?.toUpperCase() === "ROUTE") setMode("ROUTE");
    const origin = params.get("origin");
    const dest = params.get("dest");
    if (origin) setRouteOrigin(origin.toUpperCase());
    if (dest) setRouteDestination(dest.toUpperCase());
  }, []);

  // Flight-number search: AeroDataBox live lookup, 450 ms debounce.
  useEffect(() => {
    if (mode !== "FLIGHT_NUMBER") return;
    setResults([]);
    setError(null);
    setResultMode("");
    const cleaned = query.trim().replace(/\s+/g, "").replace(/-/g, "");
    if (cleaned.length < 3) {
      setLoading(false);
      return;
    }
    if (offlineMode) {
      setError("Offline mode is active. Live lookups are paused.");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/flights/search?flight=${encodeURIComponent(cleaned)}`,
          { signal: controller.signal, cache: "no-store" },
        );
        const data = (await response.json()) as {
          mode: string;
          flights?: Flight[];
          error?: string;
        };
        setResultMode(data.mode);
        if (data.mode === "QUOTA_FALLBACK") setQuotaFallback();
        if (data.mode === "NOT_CONFIGURED") {
          throw new Error(
            "Live flight data is unavailable right now.",
          );
        }
        if (data.error) throw new Error(data.error);
        const incoming = data.flights ?? [];
        setResults(incoming);
        if (incoming.length) upsertFlights(incoming);
        else setError("No live flights found for this number.");
      } catch (searchError) {
        if (!controller.signal.aborted) {
          setError(
            searchError instanceof Error
              ? searchError.message
              : "Live flight lookup failed.",
          );
        }
      } finally {
        setLoading(false);
      }
    }, 450);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, mode, offlineMode, setQuotaFallback, upsertFlights]);

  // Route lookup: live airport departures from AeroDataBox, filtered by destination.
  useEffect(() => {
    if (mode !== "ROUTE") return;
    setResults([]);
    setError(null);
    setResultMode("");
    const origin = routeOrigin.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(origin)) {
      setError("Enter a 3-letter origin IATA code (e.g. JFK).");
      setLoading(false);
      return;
    }
    if (offlineMode) {
      setError("Offline mode is active. Live lookups are paused.");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/airports/${origin}/flights`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const data = (await response.json()) as {
          mode: string;
          flights?: Flight[];
          error?: string;
        };
        setResultMode(data.mode);
        if (data.mode === "QUOTA_FALLBACK") setQuotaFallback();
        if (data.mode === "NOT_CONFIGURED") {
          throw new Error(
            "Live flight data is unavailable right now.",
          );
        }
        if (data.error) throw new Error(data.error);
        const destination = routeDestination.trim().toLowerCase();
        const departures = (data.flights ?? []).filter((flight) => {
          if (flight.origin.code !== origin) return false;
          if (!destination) return true;
          return (
            flight.destination.code.toLowerCase().includes(destination) ||
            flight.destination.city.toLowerCase().includes(destination) ||
            flight.destination.name.toLowerCase().includes(destination)
          );
        });
        setResults(departures);
        if (departures.length) upsertFlights(departures);
        else setError("No live direct departures matched this route.");
      } catch (routeError) {
        if (!controller.signal.aborted) {
          setError(
            routeError instanceof Error
              ? routeError.message
              : "Live route lookup failed.",
          );
        }
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [
    mode,
    routeOrigin,
    routeDestination,
    offlineMode,
    setQuotaFallback,
    upsertFlights,
  ]);

  const displayFlights = useMemo(
    () =>
      results.filter((flight) => {
        const matchesStatus = !statusFilter || flight.status === statusFilter;
        const matchesWatchlist = !onlyWatchlisted || flight.isWatchlisted;
        return matchesStatus && matchesWatchlist;
      }),
    [results, statusFilter, onlyWatchlisted],
  );

  const openRecent = (flightNumber: string) => {
    setMode("FLIGHT_NUMBER");
    setStatusFilter(null);
    setOnlyWatchlisted(false);
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

  const savedFlights = useMemo(
    () => flights.filter((flight) => flight.isWatchlisted),
    [flights],
  );
  const airborne = savedFlights.filter((flight) => flight.status === "DEPARTED");
  const upcoming = savedFlights
    .filter((flight) => ["SCHEDULED", "BOARDING", "DELAYED"].includes(flight.status))
    .slice(0, 4);
  const latestAlerts = alerts.slice(0, 3);
  const hasLookup = mode === "FLIGHT_NUMBER" ? query.trim().length >= 3 : /^[A-Za-z]{3}$/.test(routeOrigin.trim());

  return (
    <div className="mx-auto max-w-[1680px] px-4 py-4 lg:px-6 lg:py-5">
      <div className="grid gap-4 xl:grid-cols-[268px_minmax(0,1fr)_300px]">
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
                    placeholder="e.g. AA 123"
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
                <p className="text-[9px] leading-relaxed text-subtle">
                  Needs a live flight match. Try a number such as{" "}
                  <span className="font-mono text-accent">MS985</span>,{" "}
                  <span className="font-mono text-accent">BA286</span>, or{" "}
                  <span className="font-mono text-accent">EK202</span>.
                </p>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                <div className="flex items-end gap-1.5">
                  <label className="min-w-0 flex-1">
                    <span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-subtle">
                      Origin
                    </span>
                    <div className="relative">
                      <PlaneTakeoff className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-accent" />
                      <TextInput
                        value={routeOrigin}
                        onChange={(event) => setRouteOrigin(event.target.value.toUpperCase())}
                        placeholder="JFK"
                        maxLength={3}
                        className="h-9 pl-8 font-mono text-xs uppercase"
                      />
                    </div>
                  </label>
                  <button
                    onClick={() => {
                      const previous = routeOrigin;
                      setRouteOrigin(routeDestination.toUpperCase().slice(0, 3));
                      setRouteDestination(previous.toUpperCase());
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
                        value={routeDestination}
                        onChange={(event) => setRouteDestination(event.target.value)}
                        placeholder="Any / LHR"
                        maxLength={3}
                        className="h-9 pl-8 font-mono text-xs uppercase"
                      />
                    </div>
                  </label>
                </div>
                <p className="text-[9px] leading-relaxed text-subtle">
                  Loads live departures from the origin airport and filters by the
                  optional destination.
                </p>
              </div>
            )}
          </Panel>

          <Panel className="p-3">
            <div className="flex items-center justify-between pb-2">
              <p className="label-caps text-subtle">Filters</p>
              {(statusFilter || onlyWatchlisted) && (
                <button
                  onClick={() => {
                    setStatusFilter(null);
                    setOnlyWatchlisted(false);
                  }}
                  className="text-[9px] font-semibold text-accent"
                >
                  Reset
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <FilterChip
                active={!statusFilter && !onlyWatchlisted}
                onClick={() => {
                  setStatusFilter(null);
                  setOnlyWatchlisted(false);
                }}
              >
                All results
              </FilterChip>
              <FilterChip
                active={onlyWatchlisted}
                onClick={() => {
                  setOnlyWatchlisted((value) => !value);
                  setStatusFilter(null);
                }}
                color="var(--accent)"
              >
                <History className="size-3" /> Watchlisted ({watchlist.length})
              </FilterChip>
              {STATUSES.map((status) => (
                <FilterChip
                  key={status}
                  active={statusFilter === status && !onlyWatchlisted}
                  color={STATUS_META[status].color}
                  onClick={() => {
                    setOnlyWatchlisted(false);
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
                Flights you open are saved here for one-tap recall.
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

        <section className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="label-caps text-accent">
                {mode === "ROUTE"
                  ? `Live departures · ${routeOrigin || "—"}${routeDestination ? ` → ${routeDestination}` : " → any"}`
                  : "Live flight lookup"}
              </p>
              <h2 className="mt-1 text-xl font-black tracking-tight text-ink">
                {mode === "ROUTE" ? "Live route departures" : "Live flight lookup"}
                <span className="ml-2 text-sm font-semibold text-muted">
                  ({displayFlights.length})
                </span>
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {resultMode && (
                <span className="rounded-lg border border-line/60 bg-surface-2 px-2 py-1 text-[9px] font-semibold text-muted">
                  {resultMode}
                </span>
              )}
              <div className="flex items-center gap-2 rounded-lg border border-line/60 bg-surface-2 px-2.5 py-1.5">
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    error ? "bg-delayed" : "animate-pulse-dot bg-landed",
                  )}
                />
                <span className="text-[10px] font-semibold text-muted">
                  {loading ? "Querying live data…" : error ? "Live lookup unavailable" : "Live data"}
                </span>
              </div>
              <Button size="sm" variant="outline" onClick={refreshData} disabled={syncing}>
                {syncing ? "Refreshing…" : "Refresh"}
              </Button>
            </div>
          </div>

          {!aeroConfigured && !offlineMode && (
            <div className="rounded-xl border border-delayed/40 bg-delayed/10 px-3 py-2.5 text-[10px] leading-relaxed text-muted">
              <strong className="text-delayed">Live flight data is unavailable.</strong>{" "}
              Saved flights and airport weather keep working. Sign out and back
              in, or check the system status panel, if this persists.
            </div>
          )}

          {offlineMode && (
            <div className="rounded-xl border border-accent/35 bg-accent-soft px-3 py-2.5 text-[10px] leading-relaxed text-muted">
              You’re offline — showing previously viewed flights from your last sync.
            </div>
          )}

          {loading ? (
            <Panel>
              <div className="flex items-center justify-center gap-2 py-16 text-xs text-muted">
                <Radio className="size-4 animate-pulse text-accent" />
                Fetching live flight data…
              </div>
            </Panel>
          ) : error ? (
            <Panel>
              <EmptyState
                icon={<Plane className="size-6" />}
                title="No live results"
                description={error}
                action={
                  <Button size="sm" variant="outline" onClick={refreshData}>
                    Retry live refresh
                  </Button>
                }
              />
            </Panel>
          ) : !hasLookup ? (
            <Panel>
              <EmptyState
                icon={<Search className="size-6" />}
                title="Search live flights"
                description={
                  mode === "FLIGHT_NUMBER"
                    ? "Enter a full flight number for live results. No simulated data is ever shown."
                    : "Enter a 3-letter origin airport code. Live departures will be filtered by the optional destination."
                }
              />
            </Panel>
          ) : displayFlights.length === 0 ? (
            <Panel>
              <EmptyState
                icon={<PlaneLanding className="size-6" />}
                title="No flights match"
                description={
                  onlyWatchlisted
                    ? "No watchlisted flights in the live results. Clear the watchlist filter or search another flight."
                    : "The live feed returned flights, but none match the selected status filter."
                }
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setStatusFilter(null);
                      setOnlyWatchlisted(false);
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

        <aside className="space-y-3 xl:sticky xl:top-[88px] xl:self-start">
          <Panel className="p-3">
            <div className="flex items-center justify-between">
              <p className="label-caps text-subtle">Live operations</p>
              <span className="flex items-center gap-1 text-[9px] font-bold text-landed">
                <span className="size-1.5 animate-pulse-dot rounded-full bg-landed" />
                LIVE
              </span>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <MetricTile
                label="Airborne"
                value={airborne.length}
                sub="Saved live flights"
                accent
              />
              <MetricTile
                label="Watchlist"
                value={watchlist.length}
                sub="Saved flights"
              />
              <MetricTile
                label="Unread"
                value={unreadAlertCount}
                sub="Real alerts"
              />
              <MetricTile
                label="Alerts"
                value={alerts.length}
                sub="Alert inbox"
              />
            </div>
          </Panel>

          <Panel className="p-3">
            <div className="flex items-center justify-between pb-2">
              <p className="label-caps text-subtle">Airborne now</p>
              <span className="text-[9px] text-subtle">{airborne.length} live</span>
            </div>
            {airborne.length === 0 ? (
              <p className="py-2 text-[10px] leading-relaxed text-subtle">
                Track a live flight to see its airborne position here.
              </p>
            ) : (
              <div className="space-y-1.5">
                {airborne.slice(0, 4).map((flight) => (
                  <button
                    key={flight.id}
                    onClick={() => router.push(`/flight/${encodeURIComponent(flight.id)}`)}
                    className="flex w-full items-center gap-2 rounded-lg border border-line/60 bg-surface-2/60 px-2 py-1.5 text-left transition-colors hover:border-accent/40"
                  >
                    <span className="flex size-6 items-center justify-center rounded-md bg-surface-3 text-[9px] font-bold text-accent">
                      {flight.airlineCode}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[10px] font-bold text-ink">
                        {flight.flightNumber} · {flight.origin.code}→{flight.destination.code}
                      </span>
                      <span className="block text-[9px] text-subtle tabular">
                        {flight.telemetry.hasLiveLocation
                          ? `${flight.telemetry.altitudeFeet.toLocaleString()} ft · ${flight.telemetry.groundSpeedKnots} kt`
                          : "Live position not reported"}
                      </span>
                    </span>
                    <span className="text-[9px] font-bold text-accent tabular">
                      {Math.round(flight.telemetry.progressPercent * 100)}%
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Panel>

          <Panel className="p-3">
            <p className="label-caps text-subtle">Latest alerts</p>
            {latestAlerts.length === 0 ? (
              <p className="mt-2 text-[10px] leading-relaxed text-subtle">
                Real alerts appear when a watchlisted flight changes status, gate,
                delay, boarding, or baggage.
              </p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {latestAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="rounded-lg border border-line/60 bg-surface-2/60 px-2 py-1.5"
                  >
                    <p className="truncate text-[10px] font-semibold text-ink">
                      {alert.title}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-[9px] text-subtle">
                      <span className="font-mono text-accent">{alert.flightNumber}</span>
                      · {alert.timestamp}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel className="p-3">
            <p className="label-caps text-subtle">Upcoming saved flights</p>
            {upcoming.length === 0 ? (
              <p className="mt-2 text-[10px] leading-relaxed text-subtle">
                Track a flight to keep it in this panel.
              </p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {upcoming.map((flight) => (
                  <button
                    key={flight.id}
                    onClick={() => router.push(`/flight/${encodeURIComponent(flight.id)}`)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-2"
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
                  </button>
                ))}
              </div>
            )}
          </Panel>

          <div className="rounded-xl border border-dashed border-line bg-surface-2/40 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[10px] font-bold text-muted">
              <ArrowRight className="size-3 text-accent" /> Real data only
            </p>
            <p className="mt-1 text-[9px] leading-relaxed text-subtle">
              Every flight, gate, delay, status, route, and airport board on this
              screen comes from the live feed — no demo data, ever.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}


