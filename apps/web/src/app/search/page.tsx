"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  ArrowLeftRight,
  CalendarDays,
  Glasses,
  Plane,
  PlaneLanding,
  PlaneTakeoff,
  Radio,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { authFetch } from "@/lib/authed-fetch";
import { flightKey, useApp } from "@/lib/store";
import type { Flight, FlightStatus } from "@/lib/types";
import {
  STATUS_META,
  cn,
  flightDateLabel,
  isFreshTimestamp,
  isoDateToday,
  normalizeFlightNumber,
  parseFlexibleDate,
  statusLabel,
} from "@/lib/utils";
import { FlightCard } from "@/components/flight-card";
import {
  Button,
  Callout,
  EmptyState,
  Field,
  FilterChip,
  PageHeader,
  Panel,
  Skeleton,
  Tabs,
  TextInput,
} from "@/components/ui";

type SearchMode = "FLIGHT_NUMBER" | "ROUTE";
type ActiveSearch =
  | { mode: "FLIGHT_NUMBER"; number: string; date: string }
  | { mode: "ROUTE"; origin: string; destination: string };
const STATUSES = Object.keys(STATUS_META) as FlightStatus[];

export default function SearchPage() {
  const {
    flights,
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
  const [emptyMessage, setEmptyMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResultMeta, setLastResultMeta] = useState<{
    mode: string;
    fetchedAt: string | null;
  } | null>(null);
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
    setEmptyMessage(null);
    setLoading(false);
  };

  const runSearch = () => {
    if (loading) return;
    if (mode === "FLIGHT_NUMBER") {
      const number = normalizeFlightNumber(flightNumber);
      // Valid flight number required. Departure date is optional (defaults to current active flight).
      if (number.length < 3) return;
      if (departureDateInput.trim() && departureDate === null) return;
      setActiveSearch({
        mode: "FLIGHT_NUMBER",
        number,
        date: departureDate ?? "",
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
      setEmptyMessage(null);
      setResults([]);
      setLastResultMeta(null);
      try {
        if (activeSearch.mode === "FLIGHT_NUMBER") {
          const dateParam = activeSearch.date
            ? `&date=${encodeURIComponent(activeSearch.date)}`
            : "";
          const response = await authFetch(
            `/api/flights/search?flight=${encodeURIComponent(activeSearch.number)}${dateParam}`,
            { signal: controller.signal, cache: "no-store" },
          );
          const data = (await response.json()) as {
            mode: string;
            flights?: Flight[];
            error?: string;
            fetchedAt?: string;
          };
          if (controller.signal.aborted) return;
          if (data.mode === "QUOTA_FALLBACK") setQuotaFallback();
          else if (data.mode === "LIVE_AERODATABOX") setLiveRecovered();
          if (data.mode === "NOT_CONFIGURED") {
            throw new Error("Live flight data is unavailable right now.");
          }
          if (data.error) throw new Error(data.error);
          const incoming = data.flights ?? [];
          setLastResultMeta({
            mode: data.mode,
            fetchedAt: data.fetchedAt ?? incoming[0]?.fetchedAt ?? null,
          });
          setResults(incoming);
          if (incoming.length) {
            upsertFlights(incoming);
            setEmptyMessage(null);
          } else {
            setEmptyMessage(
              "The live feed returned no flight for this number and date. This is not evidence the flight does not operate; no simulated record is substituted.",
            );
          }
        } else {
          const response = await authFetch(
            `/api/airports/${activeSearch.origin}/flights`,
            { signal: controller.signal, cache: "no-store" },
          );
          const data = (await response.json()) as {
            mode: string;
            flights?: Flight[];
            error?: string;
            fetchedAt?: string;
          };
          if (controller.signal.aborted) return;
          if (data.mode === "QUOTA_FALLBACK") setQuotaFallback();
          else if (data.mode === "LIVE_AERODATABOX") setLiveRecovered();
          if (data.mode === "NOT_CONFIGURED") {
            throw new Error("Live flight data is unavailable right now.");
          }
          if (data.error) throw new Error(data.error);
          setLastResultMeta({
            mode: data.mode,
            fetchedAt: data.fetchedAt ?? data.flights?.[0]?.fetchedAt ?? null,
          });
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
          if (departures.length) {
            upsertFlights(departures);
            setEmptyMessage(null);
          } else {
            setEmptyMessage(
              "The live board returned no direct departures for this route in its current window. This is not proof the route does not operate.",
            );
          }
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
  }, [
    activeSearch,
    searchNonce,
    offlineMode,
    setQuotaFallback,
    setLiveRecovered,
    upsertFlights,
  ]);

  const resolvedResults = useMemo(() => {
    if (!results.length) return [];
    const flightMap = new Map(flights.map((f) => [flightKey(f), f]));
    return results.map((flight) => {
      // Only merge the exact flight number + operating date. A number-only
      // fallback could display another day's status or gate.
      const stored = flightMap.get(flightKey(flight));
      return stored
        ? {
            ...flight,
            ...stored,
            isWatchlisted: Boolean(stored.isWatchlisted),
          }
        : flight;
    });
  }, [results, flights]);

  const displayFlights = useMemo(
    () =>
      resolvedResults.filter((flight) => {
        const matchesStatus =
          !statusFilter ||
          (flight.statusReported && flight.status === statusFilter);
        const matchesWatchlist = !onlyWatchlisted || flight.isWatchlisted;
        return matchesStatus && matchesWatchlist;
      }),
    [resolvedResults, statusFilter, onlyWatchlisted],
  );

  const statusCounts = useMemo(() => {
    const counts = Object.fromEntries(
      STATUSES.map((status) => [status, 0]),
    ) as Record<FlightStatus, number>;
    for (const flight of resolvedResults) {
      if (flight.statusReported) counts[flight.status] += 1;
    }
    return counts;
  }, [resolvedResults]);

  const watchlistedResultsCount = useMemo(
    () => resolvedResults.filter((flight) => flight.isWatchlisted).length,
    [resolvedResults],
  );

  const hasLookup = activeSearch !== null;
  const hasFreshResult =
    Boolean(lastResultMeta) && isFreshTimestamp(lastResultMeta?.fetchedAt);
  const canSearch =
    mode === "FLIGHT_NUMBER"
      ? normalizeFlightNumber(flightNumber).length >= 3 &&
        (!departureDateInput.trim() || departureDate !== null)
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

  const filtersActive = statusFilter !== null || onlyWatchlisted;
  const resetFilters = () => {
    setStatusFilter(null);
    setOnlyWatchlisted(false);
  };
  const refreshResults = () => {
    void refreshData();
    setSearchNonce((value) => value + 1);
  };

  const statusText = loading
    ? "Querying live data…"
    : error
      ? "Live lookup unavailable"
      : hasFreshResult
        ? "Live data received"
        : hasLookup
          ? "No fresh result"
          : "Idle";

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Live flight data"
        title="Flight search"
        description="Look up a flight by number and operating date, or scan an airport’s live departure board. Results come straight from the provider gateway — never simulated."
        actions={
          <>
            <span className="inline-flex h-10 items-center gap-2 rounded-lg border border-line/70 bg-surface-2/50 px-3 text-[13px] font-medium text-muted">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  error
                    ? "bg-delayed"
                    : hasFreshResult
                      ? "animate-pulse-dot bg-landed"
                      : "bg-subtle",
                )}
              />
              {statusText}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={refreshResults}
              disabled={syncing}
            >
              {syncing ? "Refreshing…" : "Refresh"}
            </Button>
          </>
        }
      />

      <div className="mt-6 grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-6">
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Panel className="p-4">
            <Tabs
              tabs={[
                { value: "FLIGHT_NUMBER", label: "Flight number" },
                { value: "ROUTE", label: "Airport board" },
              ]}
              value={mode}
              onChange={chooseMode}
              label="Search mode"
            />

            <form onSubmit={handleSearch} className="mt-4 space-y-3">
              {mode === "FLIGHT_NUMBER" ? (
                <>
                  <Field label="Flight number" hint={departureHint || undefined}>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
                      <TextInput
                        value={flightNumber}
                        onChange={(event) =>
                          setFlightNumber(event.target.value.toUpperCase())
                        }
                        placeholder="AA123"
                        className="pl-9 pr-10 font-mono uppercase tracking-wide"
                        autoComplete="off"
                        spellCheck={false}
                        aria-label="Flight number"
                        onKeyDown={submitOnEnter}
                      />
                      {flightNumber && (
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => setFlightNumber("")}
                          className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-subtle hover:text-ink"
                          aria-label="Clear flight number"
                        >
                          <X className="size-4" />
                        </button>
                      )}
                    </div>
                  </Field>
                  <Field label="Departure day (optional)">
                    <div className="relative">
                      <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
                      <TextInput
                        value={departureDateInput}
                        onChange={(event) =>
                          setDepartureDateInput(event.target.value)
                        }
                        placeholder="Today"
                        maxLength={24}
                        className="pl-9 font-mono uppercase"
                        autoComplete="off"
                        spellCheck={false}
                        aria-label="Departure day"
                        onKeyDown={submitOnEnter}
                      />
                    </div>
                  </Field>
                  {departureHint && (
                    <p
                      className={cn(
                        "text-xs leading-relaxed",
                        departureHintWarn ? "text-delayed" : "text-subtle",
                      )}
                    >
                      {departureHint}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                    <Field label="From">
                      <div className="relative">
                        <PlaneTakeoff className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
                        <TextInput
                          value={routeOrigin}
                          onChange={(event) =>
                            setRouteOrigin(event.target.value.toUpperCase())
                          }
                          placeholder="CAI"
                          maxLength={3}
                          className="pl-9 font-mono uppercase tracking-wider"
                          aria-label="Origin airport"
                          onKeyDown={submitOnEnter}
                        />
                      </div>
                    </Field>
                    <button
                      type="button"
                      onClick={() => {
                        const previous = routeOrigin;
                        setRouteOrigin(
                          routeDestination.toUpperCase().slice(0, 3),
                        );
                        setRouteDestination(previous.toUpperCase());
                      }}
                      className="mb-1 flex size-9 shrink-0 items-center justify-center rounded-lg border border-line/70 bg-surface-2 text-muted transition-colors hover:border-accent/40 hover:text-accent"
                      aria-label="Swap origin and destination"
                    >
                      <ArrowLeftRight className="size-4" />
                    </button>
                    <Field label="To">
                      <div className="relative">
                        <PlaneLanding className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
                        <TextInput
                          value={routeDestination}
                          onChange={(event) =>
                            setRouteDestination(event.target.value)
                          }
                          placeholder="Any"
                          maxLength={3}
                          className="pl-9 font-mono uppercase tracking-wider"
                          aria-label="Destination airport (optional)"
                          onKeyDown={submitOnEnter}
                        />
                      </div>
                    </Field>
                  </div>
                  <p className="text-xs leading-relaxed text-subtle">
                    Leave the destination blank to see every live departure
                    from the origin.
                  </p>
                </>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={!canSearch || loading}
              >
                <Search className="size-4" />
                {loading ? "Searching…" : "Search live flights"}
              </Button>
            </form>
          </Panel>

          <Panel className="p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="label-caps text-muted">Filters</p>
              {filtersActive ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-accent transition-colors hover:text-ink"
                >
                  <RotateCcw className="size-3" /> Reset
                </button>
              ) : (
                <span className="text-xs text-subtle">Showing all</span>
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg border border-line/70 bg-surface-2/50 p-1">
              <button
                type="button"
                onClick={() => setOnlyWatchlisted(false)}
                aria-pressed={!onlyWatchlisted}
                className={cn(
                  "min-h-9 rounded-md px-2 text-xs font-medium transition-colors",
                  !onlyWatchlisted
                    ? "bg-surface-4 text-ink"
                    : "text-muted hover:text-ink",
                )}
              >
                All results
              </button>
              <button
                type="button"
                onClick={() => setOnlyWatchlisted((value) => !value)}
                aria-pressed={onlyWatchlisted}
                className={cn(
                  "flex min-h-9 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors",
                  onlyWatchlisted
                    ? "bg-surface-4 text-ink"
                    : "text-muted hover:text-ink",
                )}
              >
                <Glasses
                  className={cn("size-3.5", onlyWatchlisted && "text-accent")}
                  fill={onlyWatchlisted ? "currentColor" : "none"}
                />
                Watchlisted
                {watchlistedResultsCount > 0 && (
                  <span className="tabular text-subtle">
                    {watchlistedResultsCount}
                  </span>
                )}
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
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
                    <span className="tabular opacity-70">
                      {statusCounts[status]}
                    </span>
                  )}
                </FilterChip>
              ))}
            </div>

            {Boolean(results.length) && (
              <p className="mt-3 text-xs leading-relaxed text-subtle">
                Showing {displayFlights.length} of {results.length} live
                flights.
              </p>
            )}
          </Panel>

          <p className="px-1 text-xs leading-relaxed text-subtle">
            Live lookups are cached on the API gateway. Missing status, gates
            and belts stay marked as unavailable.
          </p>
        </aside>

        <section className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-ink">
                {mode === "ROUTE" ? "Live departures" : "Search results"}
                {hasLookup && (
                  <span className="ml-2 text-sm font-normal text-subtle">
                    {displayFlights.length}
                  </span>
                )}
              </h2>
              <p className="mt-0.5 text-sm text-muted">
                {hasLookup && activeSearch?.mode === "FLIGHT_NUMBER"
                  ? `${activeSearch.number} · ${flightDateLabel(activeSearch.date)}`
                  : mode === "ROUTE" && routeOrigin
                    ? `${routeOrigin}${routeDestination ? ` → ${routeDestination}` : " · all destinations"}`
                    : "Submit a search to query the live feed."}
              </p>
            </div>
          </div>

          {!aeroConfigured && !offlineMode && (
            <Callout tone="attention" title="Live flight data is unavailable">
              Saved flights and airport weather keep working. Sign out and back
              in, or open Data &amp; API status, if this persists.
            </Callout>
          )}

          {offlineMode && (
            <Callout tone="info">
              You’re offline — showing previously viewed flights from your last
              sync.
            </Callout>
          )}

          {loading ? (
            <div className="space-y-3" aria-busy="true">
              <div className="flex items-center gap-2 pb-1 text-sm text-muted">
                <Radio className="size-4 animate-pulse text-accent" />
                Fetching live flight data…
              </div>
              {[0, 1, 2].map((index) => (
                <Panel key={index} className="space-y-4 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <Skeleton className="h-9 w-40" />
                    <Skeleton className="size-10" />
                  </div>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-4">
                    <Skeleton className="h-20" />
                    <Skeleton className="h-2 w-24" />
                    <Skeleton className="h-20" />
                  </div>
                  <Skeleton className="h-4 w-2/3" />
                </Panel>
              ))}
            </div>
          ) : error ? (
            <Panel>
              <EmptyState
                icon={<Plane className="size-6" />}
                title="No live results"
                description={error}
                action={
                  <Button size="sm" variant="outline" onClick={refreshResults}>
                    Retry live refresh
                  </Button>
                }
              />
            </Panel>
          ) : emptyMessage ? (
            <Panel>
              <EmptyState
                icon={<PlaneLanding className="size-6" />}
                title="No flights returned"
                description={emptyMessage}
              />
            </Panel>
          ) : !hasLookup ? (
            <Panel>
              <EmptyState
                icon={<Search className="size-6" />}
                title="Search live flights"
                description={
                  mode === "FLIGHT_NUMBER"
                    ? "Enter a flight number and departure day, then press Search for live results. No simulated flight records are shown."
                    : "Enter a 3-letter origin airport code, then press Search. Live departures are filtered by the optional destination."
                }
              />
            </Panel>
          ) : displayFlights.length === 0 ? (
            <Panel>
              <EmptyState
                icon={<PlaneLanding className="size-6" />}
                title={
                  results.length === 0
                    ? "No flights returned"
                    : "No flights match"
                }
                description={
                  results.length === 0
                    ? "The live feed returned no flights for this search. This is not evidence the flight does not operate; no simulated record is substituted."
                    : onlyWatchlisted
                      ? "No watchlisted flights in the live results. Clear the watchlist filter or search another flight."
                      : filtersActive
                        ? "The live feed returned flights, but none match the selected status filter."
                        : "The live feed returned no matching flights for this view."
                }
                action={
                  filtersActive && results.length > 0 ? (
                    <Button size="sm" variant="outline" onClick={resetFilters}>
                      Reset filters
                    </Button>
                  ) : undefined
                }
              />
            </Panel>
          ) : (
            <div
              className={cn(
                "grid gap-3",
                mode === "FLIGHT_NUMBER" ? "grid-cols-1" : "xl:grid-cols-2",
              )}
            >
              {displayFlights.map((flight) => (
                <FlightCard
                  key={`${flight.id}-${flight.flightDate ?? "any"}`}
                  flight={flight}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
