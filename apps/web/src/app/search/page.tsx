"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  Bookmark,
  CalendarDays,
  History,
  Plane,
  PlaneLanding,
  PlaneTakeoff,
  Radio,
  RotateCcw,
  Route,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useApp } from "@/lib/store";
import type { Flight, FlightStatus } from "@/lib/types";
import {
  STATUS_META,
  cn,
  flightDateLabel,
  isoDateToday,
  normalizeFlightNumber,
  parseFlexibleDate,
  statusLabel,
} from "@/lib/utils";
import { FlightCard } from "@/components/flight-card";
import {
  Button,
  EmptyState,
  FilterChip,
  Panel,
  TextInput,
} from "@/components/ui";

type SearchMode = "FLIGHT_NUMBER" | "ROUTE";
type ActiveSearch =
  | { mode: "FLIGHT_NUMBER"; number: string; date: string }
  | { mode: "ROUTE"; origin: string; destination: string };
const STATUSES = Object.keys(STATUS_META) as FlightStatus[];

export default function SearchPage() {
  const router = useRouter();
  const {
    flights,
    recents,
    addRecent,
    deleteRecent,
    clearRecents,
    setQuotaFallback,
    setLiveRecovered,
    aeroConfigured,
    offlineMode,
    upsertFlights,
    refreshData,
    syncing,
  } = useApp();

  const [mode, setMode] = useState<SearchMode>("FLIGHT_NUMBER");
  const [flightNumber, setFlightNumber] = useState("");
  const [departureDateInput, setDepartureDateInput] = useState("");
  const [routeOrigin, setRouteOrigin] = useState("");
  const [routeDestination, setRouteDestination] = useState("");
  const [activeSearch, setActiveSearch] = useState<ActiveSearch | null>(null);
  const [statusFilter, setStatusFilter] = useState<FlightStatus | null>(null);
  const [onlyWatchlisted, setOnlyWatchlisted] = useState(false);
  const [results, setResults] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultMode, setResultMode] = useState("");
  // Bumping the nonce re-runs the current lookup so "Refresh" refreshes the
  // page's own results, not just the background watchlist sync.
  const [searchNonce, setSearchNonce] = useState(0);
  const departureDate = parseFlexibleDate(departureDateInput);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedMode = params.get("mode");
    const origin = params.get("origin");
    const dest = params.get("dest");
    if (requestedMode?.toUpperCase() === "ROUTE") {
      setMode("ROUTE");
      setRouteOrigin(origin?.toUpperCase() ?? "");
      setRouteDestination(dest?.toUpperCase() ?? "");
      if (origin) {
        setActiveSearch({
          mode: "ROUTE",
          origin: origin.toUpperCase(),
          destination: dest?.toUpperCase() ?? "",
        });
      }
    } else {
      if (origin) setRouteOrigin(origin.toUpperCase());
      if (dest) setRouteDestination(dest.toUpperCase());
    }
  }, []);

  const chooseMode = (next: SearchMode) => {
    if (next === mode) return;
    setMode(next);
    setActiveSearch(null);
    setResults([]);
    setError(null);
    setResultMode("");
    setLoading(false);
  };

  const runSearch = () => {
    if (loading) return;
    if (mode === "FLIGHT_NUMBER") {
      const number = normalizeFlightNumber(flightNumber);
      // Both fields are mandatory: a valid number and a recognised day.
      if (number.length < 3 || departureDate === null) return;
      setActiveSearch({
        mode: "FLIGHT_NUMBER",
        number,
        date: departureDate,
      });
      return;
    }
    const origin = routeOrigin.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(origin)) return;
    setActiveSearch({
      mode: "ROUTE",
      origin,
      destination: routeDestination.trim().toUpperCase(),
    });
  };

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    runSearch();
  };

  // Enter inside any search field runs the lookup, even when the submit
  // button is disabled so the browser would swallow implicit submission.
  const submitOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runSearch();
    }
  };

  // Live lookups run only when the user submits the search form.
  useEffect(() => {
    if (!activeSearch) return;
    if (offlineMode) {
      setLoading(false);
      setError("Offline mode is active. Live lookups are paused.");
      return;
    }

    const controller = new AbortController();

    const run = async () => {
      setLoading(true);
      setError(null);
      setResultMode("");
      setResults([]);
      try {
        if (activeSearch.mode === "FLIGHT_NUMBER") {
          const response = await fetch(
            `/api/flights/search?flight=${encodeURIComponent(activeSearch.number)}&date=${encodeURIComponent(activeSearch.date)}`,
            { signal: controller.signal, cache: "no-store" },
          );
          const data = (await response.json()) as {
            mode: string;
            flights?: Flight[];
            error?: string;
          };
          if (controller.signal.aborted) return;
          setResultMode(data.mode);
          if (data.mode === "QUOTA_FALLBACK") setQuotaFallback();
          else if (data.mode === "LIVE_AERODATABOX") setLiveRecovered();
          if (data.mode === "NOT_CONFIGURED") {
            throw new Error("Live flight data is unavailable right now.");
          }
          if (data.error) throw new Error(data.error);
          const incoming = data.flights ?? [];
          setResults(incoming);
          if (incoming.length) upsertFlights(incoming);
          else setError("No live flights found for this number and date.");
        } else {
          const response = await fetch(
            `/api/airports/${activeSearch.origin}/flights`,
            { signal: controller.signal, cache: "no-store" },
          );
          const data = (await response.json()) as {
            mode: string;
            flights?: Flight[];
            error?: string;
          };
          if (controller.signal.aborted) return;
          setResultMode(data.mode);
          if (data.mode === "QUOTA_FALLBACK") setQuotaFallback();
          else if (data.mode === "LIVE_AERODATABOX") setLiveRecovered();
          if (data.mode === "NOT_CONFIGURED") {
            throw new Error("Live flight data is unavailable right now.");
          }
          if (data.error) throw new Error(data.error);
          const destination = activeSearch.destination.toLowerCase();
          const departures = (data.flights ?? []).filter((flight) => {
            if (flight.origin.code !== activeSearch.origin) return false;
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
        }
      } catch (searchError) {
        if (!controller.signal.aborted) {
          setError(
            searchError instanceof Error
              ? searchError.message
              : activeSearch.mode === "FLIGHT_NUMBER"
                ? "Live flight lookup failed."
                : "Live route lookup failed.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void run();
    return () => controller.abort();
  }, [activeSearch, searchNonce, offlineMode, setQuotaFallback, setLiveRecovered, upsertFlights]);

  const displayFlights = useMemo(
    () =>
      results.filter((flight) => {
        const matchesStatus = !statusFilter || flight.status === statusFilter;
        const matchesWatchlist = !onlyWatchlisted || flight.isWatchlisted;
        return matchesStatus && matchesWatchlist;
      }),
    [results, statusFilter, onlyWatchlisted],
  );

  const statusCounts = useMemo(() => {
    const counts = Object.fromEntries(
      STATUSES.map((status) => [status, 0]),
    ) as Record<FlightStatus, number>;
    for (const flight of results) counts[flight.status] += 1;
    return counts;
  }, [results]);

  const openRecent = (recentFlightNumber: string, flightDate?: string) => {
    setMode("FLIGHT_NUMBER");
    setStatusFilter(null);
    setOnlyWatchlisted(false);
    setFlightNumber(recentFlightNumber);
    setDepartureDateInput(flightDateLabel(flightDate ?? isoDateToday()));
    const matched = flights.find(
      (flight) =>
        normalizeFlightNumber(flight.flightNumber) ===
          normalizeFlightNumber(recentFlightNumber) &&
        flight.flightDate === flightDate,
    );
    if (matched) {
      addRecent(matched);
      const query = new URLSearchParams();
      if (matched.flightDate) query.set("date", matched.flightDate);
      router.push(
        `/flight/${encodeURIComponent(matched.id)}?${query.toString()}`,
      );
    } else {
      setActiveSearch({
        mode: "FLIGHT_NUMBER",
        number: normalizeFlightNumber(recentFlightNumber),
        date: flightDate ?? isoDateToday(),
      });
    }
  };

  const hasLookup = activeSearch !== null;
  const canSearch =
    mode === "FLIGHT_NUMBER"
      ? normalizeFlightNumber(flightNumber).length >= 3 &&
        departureDate !== null
      : /^[A-Z]{3}$/.test(routeOrigin.trim().toUpperCase());

  const todayIso = isoDateToday();
  let departureHint = "";
  let departureHintWarn = false;
  if (departureDateInput.trim()) {
    if (departureDate === null) {
      departureHint =
        "Date not recognised — try 17-Mar, 17/03, March 17 or 2026-03-17.";
      departureHintWarn = true;
    } else {
      const yearLabel =
        departureDate.slice(0, 4) === todayIso.slice(0, 4)
          ? ""
          : ` ${departureDate.slice(0, 4)}`;
      departureHint = `Departs ${flightDateLabel(departureDate)}${yearLabel}${
        departureDate === todayIso ? " (today)" : ""
      }`;
    }
  }

  return (
    <div className="mx-auto max-w-[1680px] px-4 py-4 lg:px-6 lg:py-5">
      <div className="grid gap-4 xl:grid-cols-[268px_minmax(0,1fr)]">
        <aside className="space-y-3 xl:sticky xl:top-22 xl:self-start">
          <Panel className="p-3">
            <div className="flex items-center justify-between pb-2">
              <p className="label-caps text-subtle">Search mode</p>
            </div>
            <div className="grid grid-cols-2 gap-1 rounded-xl border border-line/70 bg-surface-2 p-1">
              <button
                type="button"
                onClick={() => chooseMode("FLIGHT_NUMBER")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-bold transition-colors",
                  mode === "FLIGHT_NUMBER"
                    ? "bg-accent text-bg"
                    : "text-muted hover:text-ink",
                )}
              >
                <Tag className="size-3.5" /> Flight #
              </button>
              <button
                type="button"
                onClick={() => chooseMode("ROUTE")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-bold transition-colors",
                  mode === "ROUTE"
                    ? "bg-accent text-bg"
                    : "text-muted hover:text-ink",
                )}
              >
                <Route className="size-3.5" /> Route
              </button>
            </div>

            <form onSubmit={handleSearch} className="mt-3">
              {mode === "FLIGHT_NUMBER" ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-1.5">
                    <label className="block min-w-0">
                      <span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-subtle">
                        Flight number
                      </span>
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-accent" />
                        <TextInput
                          value={flightNumber}
                          onChange={(event) =>
                            setFlightNumber(event.target.value.toUpperCase())
                          }
                          placeholder="AA123"
                          className="h-9 pl-8 pr-8 font-mono text-xs uppercase"
                          autoComplete="off"
                          spellCheck={false}
                          onKeyDown={submitOnEnter}
                        />
                        {flightNumber && (
                          <button
                            type="button"
                            tabIndex={-1}
                            onClick={() => setFlightNumber("")}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-subtle hover:text-ink"
                            aria-label="Clear flight number"
                          >
                            <X className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </label>
                    <label className="block min-w-0">
                      <span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-subtle">
                        Departure day
                      </span>
                      <div className="relative">
                        <CalendarDays className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-accent-2" />
                        <TextInput
                          value={departureDateInput}
                          onChange={(event) =>
                            setDepartureDateInput(event.target.value)
                          }
                          placeholder="01-Jan"
                          maxLength={24}
                          className="h-9 pl-8 pr-2 font-mono text-xs uppercase"
                          autoComplete="off"
                          spellCheck={false}
                          aria-label="Departure day"
                          onKeyDown={submitOnEnter}
                        />
                      </div>
                    </label>
                  </div>
                  {departureHint && (
                    <p
                      className={cn(
                        "text-[9px] leading-relaxed",
                        departureHintWarn ? "text-delayed" : "text-subtle",
                      )}
                    >
                      {departureHint}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-end gap-1.5">
                    <label className="min-w-0 flex-1">
                      <span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-subtle">
                        Origin
                      </span>
                      <div className="relative">
                        <PlaneTakeoff className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-accent" />
                        <TextInput
                          value={routeOrigin}
                          onChange={(event) =>
                            setRouteOrigin(event.target.value.toUpperCase())
                          }
                          placeholder="CAI"
                          maxLength={3}
                          className="h-9 pl-8 font-mono text-xs uppercase"
                          onKeyDown={submitOnEnter}
                        />
                      </div>
                    </label>
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => {
                        const previous = routeOrigin;
                        setRouteOrigin(
                          routeDestination.toUpperCase().slice(0, 3),
                        );
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
                          onChange={(event) =>
                            setRouteDestination(event.target.value)
                          }
                          placeholder="JED"
                          maxLength={3}
                          className="h-9 pl-8 font-mono text-xs uppercase"
                          onKeyDown={submitOnEnter}
                        />
                      </div>
                    </label>
                  </div>
                </div>
              )}
              <Button
                type="submit"
                size="sm"
                className="mt-2.5 w-full"
                disabled={!canSearch || loading}
              >
                <Search className="size-3.5" />
                {loading ? "Searching…" : "Search"}
              </Button>
            </form>
          </Panel>

          <Panel className="p-3">
            <div className="flex items-center justify-between pb-2">
              <p className="label-caps text-subtle">Filters</p>
              {statusFilter || onlyWatchlisted ? (
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter(null);
                    setOnlyWatchlisted(false);
                  }}
                  className="flex items-center gap-1 text-[9px] font-semibold text-accent transition-colors hover:text-ink"
                >
                  <RotateCcw className="size-2.5" /> Reset
                </button>
              ) : (
                <span className="text-[9px] text-subtle">Showing all</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1 rounded-xl border border-line/70 bg-surface-2 p-1">
              <button
                type="button"
                onClick={() => setOnlyWatchlisted(false)}
                className={cn(
                  "flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-bold transition-colors",
                  !onlyWatchlisted
                    ? "bg-accent text-bg"
                    : "text-muted hover:text-ink",
                )}
              >
                All results
              </button>
              <button
                type="button"
                onClick={() => setOnlyWatchlisted((value) => !value)}
                className={cn(
                  "flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-bold transition-colors",
                  onlyWatchlisted
                    ? "bg-accent text-bg"
                    : "text-muted hover:text-ink",
                )}
              >
                <Bookmark className="size-3" /> Watchlisted
              </button>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {STATUSES.map((status) => (
                <FilterChip
                  key={status}
                  active={statusFilter === status}
                  color={STATUS_META[status].color}
                  onClick={() => {
                    setStatusFilter((current) =>
                      current === status ? null : status,
                    );
                  }}
                >
                  {statusLabel(status)}
                  {statusCounts[status] > 0 && (
                    <span
                      className={cn(
                        "rounded-full px-1 tabular",
                        statusFilter === status
                          ? "bg-[color:var(--bg)]/20"
                          : "bg-surface-3",
                      )}
                    >
                      {statusCounts[status]}
                    </span>
                  )}
                </FilterChip>
              ))}
            </div>

            {Boolean(results.length) && (
              <p className="mt-2 text-[9px] leading-relaxed text-subtle">
                Showing {displayFlights.length} of {results.length} live
                flights.
              </p>
            )}
          </Panel>

          <Panel className="p-3">
            <div className="flex items-center justify-between pb-2">
              <p className="flex items-center gap-1.5 label-caps text-subtle">
                <History className="size-3 text-accent" /> Recent searches
              </p>
              {recents.length > 0 && (
                <button
                  onClick={clearRecents}
                  className="text-[9px] cursor-pointer font-semibold text-muted hover:text-cancelled"
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
                    key={`${recent.flightNumber}|${recent.flightDate ?? "any"}`}
                    className="group flex items-center gap-2 rounded-lg border border-line/60 bg-surface-2/70 p-2"
                  >
                    <button
                      onClick={() =>
                        openRecent(recent.flightNumber, recent.flightDate)
                      }
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="flex items-center gap-1.5 text-[11px] font-bold text-ink">
                        {recent.flightNumber}
                        <span
                          className="size-1 rounded-full"
                          style={{
                            backgroundColor: STATUS_META[recent.status].color,
                          }}
                        />
                      </p>
                      <p className="mt-0.5 truncate text-[9px] text-subtle">
                        {recent.originCode} → {recent.destCode}
                        {recent.flightDate
                          ? ` · ${flightDateLabel(recent.flightDate)}`
                          : ""}
                        {" · "}
                        {recent.airline}
                      </p>
                    </button>
                    <button
                      onClick={() =>
                        deleteRecent(recent.flightNumber, recent.flightDate)
                      }
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
            <h2 className="flex flex-wrap items-center gap-2 text-xl font-black tracking-tight text-ink">
              {mode === "ROUTE" ? "Live route departures" : "Live flight lookup"}
              {mode === "ROUTE" && routeOrigin && (
                <span className="rounded-lg border border-line bg-surface-2 px-2 py-0.5 font-mono text-[11px] font-bold text-accent">
                  {routeOrigin}
                  {routeDestination ? ` → ${routeDestination}` : ""}
                </span>
              )}
              {mode === "FLIGHT_NUMBER" &&
                activeSearch?.mode === "FLIGHT_NUMBER" && (
                  <span className="rounded-lg border border-line bg-surface-2 px-2 py-0.5 font-mono text-[11px] font-bold text-accent">
                    {activeSearch.number} · {flightDateLabel(activeSearch.date)}
                  </span>
                )}
              {hasLookup && (
                <span className="text-sm font-semibold text-muted">
                  ({displayFlights.length})
                </span>
              )}
            </h2>
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
                  {loading
                    ? "Querying live data…"
                    : error
                      ? "Live lookup unavailable"
                      : "Live data"}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void refreshData();
                  setSearchNonce((value) => value + 1);
                }}
                disabled={syncing}
              >
                {syncing ? "Refreshing…" : "Refresh"}
              </Button>
            </div>
          </div>

          {!aeroConfigured && !offlineMode && (
            <div className="rounded-xl border border-delayed/40 bg-delayed/10 px-3 py-2.5 text-[10px] leading-relaxed text-muted">
              <strong className="text-delayed">
                Live flight data is unavailable.
              </strong>{" "}
              Saved flights and airport weather keep working. Sign out and back
              in, or check the system status panel, if this persists.
            </div>
          )}

          {offlineMode && (
            <div className="rounded-xl border border-accent/35 bg-accent-soft px-3 py-2.5 text-[10px] leading-relaxed text-muted">
              You’re offline — showing previously viewed flights from your last
              sync.
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
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void refreshData();
                      setSearchNonce((value) => value + 1);
                    }}
                  >
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
                    ? "Enter a flight number and departure day, then press Search for live results. No simulated data is ever shown."
                    : "Enter a 3-letter origin airport code, then press Search. Live departures will be filtered by the optional destination."
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
            <div className="grid gap-3 lg:grid-cols-2">
              {displayFlights.map((flight) => (
                <FlightCard key={`${flight.id}-${flight.flightDate ?? "any"}`} flight={flight} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
