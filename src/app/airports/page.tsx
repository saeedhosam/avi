"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Building2,
  Compass,
  Eye,
  Gauge,
  Layers,
  Loader2,
  MapPin,
  PlaneLanding,
  PlaneTakeoff,
  RefreshCw,
  Search,
  Wind,
  X,
} from "lucide-react";
import { useApp } from "@/lib/store";
import {
  findAirportNode,
  routeAirports,
} from "@/lib/data";
import type {
  AirportNode,
  Flight,
  RealtimeAirportWeather,
} from "@/lib/types";
import { REGION_META, cn } from "@/lib/utils";
import { SourceBanner } from "@/components/source-banner";
import {
  Button,
  EmptyState,
  FilterChip,
  MetricTile,
  Modal,
  Panel,
  StatusBadge,
} from "@/components/ui";

type BoardTab = "BOARD" | "EXPLORER";
type Direction = "DEPARTURES" | "ARRIVALS";

const BOARD_AIRPORT_CODES = [
  "JFK",
  "LHR",
  "SFO",
  "HND",
  "DXB",
  "CDG",
  "SIN",
  "FRA",
  "CAI",
  "IST",
  "ATL",
  "AMS",
  "LAX",
  "SYD",
  "ORD",
];

export default function AirportsPage() {
  const router = useRouter();
  const {
    aeroConfigured,
    offlineMode,
    upsertFlights,
    setQuotaFallback,
    refreshData,
    syncing,
  } = useApp();

  const [tab, setTab] = useState<BoardTab>("BOARD");
  const [airportCode, setAirportCode] = useState("JFK");
  const [direction, setDirection] = useState<Direction>("DEPARTURES");
  const [airline, setAirline] = useState("All");
  const [boardFlights, setBoardFlights] = useState<Flight[]>([]);
  const [boardLoading, setBoardLoading] = useState(true);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [boardMode, setBoardMode] = useState("");
  const boardRequestRef = useRef(0);

  const [explorerQuery, setExplorerQuery] = useState("");
  const [explorerRegion, setExplorerRegion] = useState("All");
  const [explorerCategory, setExplorerCategory] = useState("All");
  const [searchAirports, setSearchAirports] = useState<AirportNode[] | null>(
    null,
  );
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [liveWeather, setLiveWeather] = useState<
    Record<string, RealtimeAirportWeather>
  >({});
  const [selectedAirport, setSelectedAirport] = useState<AirportNode | null>(
    null,
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code && code.length === 3) setAirportCode(code.toUpperCase());
    if (params.get("view") === "explorer") setTab("EXPLORER");
  }, []);

  const airport = useMemo(
    () =>
      findAirportNode(airportCode) ??
      routeAirports.find((item) => item.iata === airportCode) ??
      routeAirports[0],
    [airportCode],
  );

  // Live weather for every reference airport (single Open-Meteo multi-location request).
  const loadWeather = useCallback(async () => {
    try {
      const codes = routeAirports.map((item) => item.iata).join(",");
      const response = await fetch(`/api/weather/airports?codes=${codes}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        live?: boolean;
        weather?: Record<string, RealtimeAirportWeather>;
      };
      if (data.live && data.weather) setLiveWeather(data.weather);
    } catch {
      // Weather stays unavailable rather than showing stale values.
    }
  }, []);

  useEffect(() => {
    void loadWeather();
  }, [loadWeather]);

  const loadBoard = useCallback(async () => {
    if (offlineMode) {
      setBoardLoading(false);
      setBoardError("Offline mode is active. Live airport boards are paused.");
      return;
    }
    const requestId = ++boardRequestRef.current;
    setBoardLoading(true);
    setBoardError(null);
    setBoardFlights([]);
    try {
      const response = await fetch(`/api/airports/${airportCode}/flights`, {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        mode: string;
        status?: number;
        flights?: Flight[];
        error?: string;
      };
      if (requestId !== boardRequestRef.current) return;
      setBoardMode(data.mode);
      if (data.mode === "QUOTA_FALLBACK") setQuotaFallback();
      if (data.mode === "NOT_CONFIGURED") {
        throw new Error(
          "AeroDataBox is not configured. Add AERODATABOX_API_KEY to .env and restart.",
        );
      }
      if (data.error) throw new Error(data.error);
      const flights = data.flights ?? [];
      setBoardFlights(flights);
      if (flights.length) upsertFlights(flights);
      if (!flights.length) {
        setBoardError("No live flights were returned for this airport.");
      }
    } catch (error) {
      if (requestId === boardRequestRef.current) {
        setBoardError(
          error instanceof Error ? error.message : "Live airport board request failed.",
        );
      }
    } finally {
      if (requestId === boardRequestRef.current) setBoardLoading(false);
    }
  }, [
    airportCode,
    offlineMode,
    setQuotaFallback,
    upsertFlights,
  ]);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  // Live airport search via AeroDataBox; falls back to the reference list when empty.
  useEffect(() => {
    const query = explorerQuery.trim();
    if (query.length < 2) {
      setSearchAirports(null);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }
    if (offlineMode) {
      setSearchError("Offline mode is active.");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchLoading(true);
      setSearchError(null);
      try {
        const response = await fetch(
          `/api/airports/search?q=${encodeURIComponent(query)}`,
          { signal: controller.signal, cache: "no-store" },
        );
        const data = (await response.json()) as {
          mode: string;
          airports?: AirportNode[];
        };
        if (data.mode === "QUOTA_FALLBACK") setQuotaFallback();
        if (data.mode === "NOT_CONFIGURED") {
          throw new Error(
            "AeroDataBox is not configured. Add AERODATABOX_API_KEY to .env and restart.",
          );
        }
        setSearchAirports(data.airports ?? []);
        if (!(data.airports ?? []).length) {
          setSearchError("No live airports matched this search.");
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setSearchError(
            error instanceof Error ? error.message : "Airport search failed.",
          );
        }
      } finally {
        setSearchLoading(false);
      }
    }, 350);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [explorerQuery, offlineMode, setQuotaFallback]);

  const boardAirlines = useMemo(() => {
    const names = new Set(
      boardFlights.map((flight) => flight.airline).filter(Boolean),
    );
    return ["All", ...names];
  }, [boardFlights]);

  const visibleBoardFlights = useMemo(
    () =>
      boardFlights.filter((flight) => {
        const matchesDirection =
          direction === "DEPARTURES"
            ? flight.origin.code === airportCode
            : flight.destination.code === airportCode;
        const matchesAirline =
          airline === "All" || flight.airline === airline;
        return matchesDirection && matchesAirline;
      }),
    [boardFlights, direction, airline, airportCode],
  );

  const explorerBase = searchAirports ?? routeAirports;
  const explorerResults = useMemo(() => {
    const regionFiltered =
      explorerRegion === "All"
        ? explorerBase
        : explorerBase.filter(
            (item) =>
              (REGION_META[item.region]?.label ?? item.region) ===
                explorerRegion ||
              item.region === explorerRegion,
          );

    if (explorerCategory === "All") return regionFiltered;
    return regionFiltered.filter(
      (item) => liveWeather[item.iata]?.flightCategory === explorerCategory,
    );
  }, [explorerBase, explorerRegion, explorerCategory, liveWeather]);

  const weather = liveWeather[airport.iata];
  const lastSync = boardLoading ? "Loading…" : `${visibleBoardFlights.length} live flights`;

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4 lg:px-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="label-caps text-accent">Airport operations</p>
          <h2 className="mt-1 flex items-center gap-2 text-xl font-black tracking-tight text-ink">
            {tab === "BOARD" ? "Live airport flight boards" : "Live airport explorer"}
            <span className="rounded-md border border-accent/35 bg-accent-soft px-1.5 py-0.5 text-[9px] font-bold text-accent">
              {tab === "BOARD" ? airportCode : "AERODATABOX + METEO"}
            </span>
          </h2>
          <p className="mt-1 text-[11px] text-muted">
            {tab === "BOARD"
              ? `${airport.iata} · ${airport.name}`
              : "Search any worldwide airport with live METAR conditions"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-line bg-surface-2 p-1">
            <button
              onClick={() => setTab("BOARD")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-colors",
                tab === "BOARD"
                  ? "bg-accent text-[color:var(--bg)]"
                  : "text-muted hover:text-ink",
              )}
            >
              <PlaneLanding className="size-3.5" /> Flight board
            </button>
            <button
              onClick={() => setTab("EXPLORER")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-colors",
                tab === "EXPLORER"
                  ? "bg-accent text-[color:var(--bg)]"
                  : "text-muted hover:text-ink",
              )}
            >
              <Search className="size-3.5" /> Airport explorer
            </button>
          </div>
          <Button size="sm" variant="outline" onClick={refreshData} disabled={syncing}>
            <RefreshCw className={cn("size-3.5", syncing && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {!aeroConfigured && !offlineMode && (
        <div className="mb-3 rounded-xl border border-delayed/40 bg-delayed/10 px-3 py-2 text-[10px] leading-relaxed text-muted">
          <strong className="text-delayed">AeroDataBox is not configured.</strong>{" "}
          Add <code className="font-mono text-accent">AERODATABOX_API_KEY</code> and{" "}
          <code className="font-mono text-accent">AERODATABOX_API_HOST</code> to{" "}
          <code className="font-mono text-accent">.env</code>, then restart the dev
          server. Weather remains live from Open-Meteo; no demo flights are shown.
        </div>
      )}

      {tab === "BOARD" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5 pb-1">
            <button
              onClick={() => setTab("EXPLORER")}
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-accent/50 bg-accent-soft px-2.5 py-2 text-[10px] font-bold text-accent"
            >
              <Search className="size-3.5" /> Search worldwide
            </button>
            {BOARD_AIRPORT_CODES.map((code) => {
              const node = findAirportNode(code);
              if (!node) return null;
              const active = code === airportCode;
              return (
                <button
                  key={code}
                  onClick={() => {
                    setAirportCode(code);
                    setAirline("All");
                  }}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-2 text-[10px] font-bold transition-colors",
                    active
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-line bg-surface-2 text-muted hover:text-ink",
                  )}
                >
                  <MapPin className="size-3" />
                  <span className="font-mono">{code}</span>
                  <span className="font-normal text-subtle">{node.city}</span>
                </button>
              );
            })}
          </div>

          <SourceBanner />

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 p-1">
                  <button
                    onClick={() => {
                      setDirection("DEPARTURES");
                      setAirline("All");
                    }}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[10px] font-bold transition-colors",
                      direction === "DEPARTURES"
                        ? "bg-accent text-[color:var(--bg)]"
                        : "text-muted hover:text-ink",
                    )}
                  >
                    <PlaneTakeoff className="size-3.5" /> Departures
                  </button>
                  <button
                    onClick={() => {
                      setDirection("ARRIVALS");
                      setAirline("All");
                    }}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[10px] font-bold transition-colors",
                      direction === "ARRIVALS"
                        ? "bg-accent text-[color:var(--bg)]"
                        : "text-muted hover:text-ink",
                    )}
                  >
                    <PlaneLanding className="size-3.5" /> Arrivals
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {boardAirlines.slice(0, 6).map((airlineName) => (
                    <FilterChip
                      key={airlineName}
                      active={airline === airlineName}
                      onClick={() => setAirline(airlineName)}
                    >
                      {airlineName === "All" ? "All airlines" : airlineName}
                    </FilterChip>
                  ))}
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-line bg-surface">
                <div className="grid grid-cols-[1.1fr_1.2fr_0.8fr_1.1fr] gap-2 border-b border-line/70 bg-surface-2 px-4 py-2">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-subtle">
                    Time / flight
                  </p>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-subtle">
                    {direction === "DEPARTURES" ? "Destination" : "Origin"}
                  </p>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-subtle">
                    Gate
                  </p>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-subtle">
                    Status
                  </p>
                </div>

                {boardLoading ? (
                  <div className="flex items-center justify-center gap-2 py-14 text-xs text-muted">
                    <Loader2 className="size-4 animate-spin text-accent" />
                    Fetching live {direction.toLowerCase()} for {airportCode}…
                  </div>
                ) : boardError ? (
                  <EmptyState
                    icon={<PlaneTakeoff className="size-6" />}
                    title="No live board data"
                    description={boardError}
                    action={
                      <Button size="sm" variant="outline" onClick={loadBoard}>
                        <RefreshCw className="size-3.5" /> Retry
                      </Button>
                    }
                  />
                ) : visibleBoardFlights.length === 0 ? (
                  <EmptyState
                    icon={<PlaneTakeoff className="size-6" />}
                    title={`No live ${direction.toLowerCase()} found`}
                    description={`AeroDataBox returned no ${direction.toLowerCase()} for ${airportCode}${airline !== "All" ? ` operated by ${airline}` : ""}.`}
                  />
                ) : (
                  <div className="divide-y divide-line/50">
                    {visibleBoardFlights.map((flight) => (
                      <BoardRow
                        key={`${flight.id}-${direction}`}
                        flight={flight}
                        direction={direction}
                        onClick={() => router.push(`/flight/${encodeURIComponent(flight.id)}`)}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between rounded-xl border border-line/60 bg-surface px-3 py-2 text-[9px] text-subtle">
                <span>
                  {lastSync} · AeroDataBox {boardMode || "live FIDS"}
                </span>
                <span className={cn("flex items-center gap-1", boardError ? "text-delayed" : "text-landed")}>
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      boardError ? "bg-delayed" : "animate-pulse-dot bg-landed",
                    )}
                  />
                  {boardError ? "Unavailable" : "Live"}
                </span>
              </div>
            </div>

            <aside className="space-y-3">
              <Panel className="p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-2xl font-black text-ink">{airport.iata}</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-accent-2">
                      {airport.name}
                    </p>
                    <p className="text-[10px] text-subtle">
                      {airport.city}, {airport.country}
                    </p>
                  </div>
                  <span className="rounded-md border border-line bg-surface-2 px-1.5 py-1 text-[8px] font-bold text-muted">
                    {airport.timezone}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <MetricTile
                    label="Weather"
                    value={weather ? `${weather.tempC}°C` : "—"}
                    sub={weather?.condition ?? "Live weather unavailable"}
                    accent={Boolean(weather)}
                  />
                  <MetricTile
                    label="Wind"
                    value={weather?.wind ?? "—"}
                    sub={weather ? `Vis ${weather.visibility}` : "Live weather unavailable"}
                  />
                  <MetricTile
                    label="Departures"
                    value={boardFlights.filter((f) => f.origin.code === airportCode).length}
                    sub="Live feed"
                  />
                  <MetricTile
                    label="Arrivals"
                    value={boardFlights.filter((f) => f.destination.code === airportCode).length}
                    sub="Live feed"
                  />
                </div>

                {weather ? (
                  <div className="mt-2 rounded-lg border border-line/60 bg-surface-2 px-2.5 py-2">
                    <p className="label-caps text-subtle">METAR · live</p>
                    <p className="mt-1 break-words font-mono text-[8px] leading-relaxed text-muted">
                      {weather.metarRaw}
                    </p>
                    <p className="mt-1 flex items-center justify-between text-[9px]">
                      <span className="text-subtle">Flight rules</span>
                      <span className="font-bold text-ink">{weather.flightCategory}</span>
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 rounded-lg border border-dashed border-line px-2.5 py-2 text-[9px] text-subtle">
                    Live weather is unavailable for this airport. No cached weather
                    is displayed.
                  </p>
                )}

                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <Link href={`/routes?hub=${airport.iata}`}>
                    <Button size="sm" variant="outline" className="w-full">
                      <Compass className="size-3" /> Route map
                    </Button>
                  </Link>
                  <Link href={`/terminals?airport=${airport.iata}`}>
                    <Button size="sm" variant="outline" className="w-full">
                      <Layers className="size-3" /> Terminal
                    </Button>
                  </Link>
                </div>
              </Panel>

              <Panel className="p-3">
                <p className="label-caps text-subtle">Airport reference</p>
                <div className="mt-2 space-y-1.5 text-[10px]">
                  <p className="flex items-center justify-between gap-2">
                    <span className="text-subtle">IATA / ICAO</span>
                    <span className="font-mono font-semibold text-ink">
                      {airport.iata} / {airport.icao}
                    </span>
                  </p>
                  <p className="flex items-center justify-between gap-2">
                    <span className="text-subtle">Region</span>
                    <span className="font-semibold text-ink">
                      {REGION_META[airport.region]?.label ?? airport.region}
                    </span>
                  </p>
                  <p className="flex items-center justify-between gap-2">
                    <span className="text-subtle">Coordinates</span>
                    <span className="font-mono text-[9px] font-semibold text-ink">
                      {airport.latitude.toFixed(3)}, {airport.longitude.toFixed(3)}
                    </span>
                  </p>
                </div>
                <p className="mt-2 border-t border-line/60 pt-2 text-[8px] leading-relaxed text-subtle">
                  Coordinates and timezone are geographic reference data. Weather,
                  flights, and operational status are live feeds.
                </p>
              </Panel>
            </aside>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-2xl border border-line bg-surface p-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-accent" />
                <input
                  value={explorerQuery}
                  onChange={(event) => setExplorerQuery(event.target.value)}
                  placeholder="Search any airport (code, city, name, country)…"
                  className="h-10 w-full rounded-xl border border-line bg-surface-2 pl-9 pr-9 text-xs text-ink outline-none placeholder:text-subtle focus:border-accent"
                />
                {explorerQuery ? (
                  <button
                    onClick={() => setExplorerQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle hover:text-ink"
                    aria-label="Clear search"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="flex items-center gap-1.5 rounded-lg border border-landed/35 bg-landed/10 px-2 py-1.5 text-[9px] font-bold text-landed">
                  <span className="size-1.5 animate-pulse-dot rounded-full bg-landed" />
                  LIVE OPEN-METEO
                </span>
                <span className="text-[9px] text-subtle">
                  {searchLoading ? "Searching…" : `${explorerResults.length} airports`}
                </span>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {["All", "Americas", "Europe", "Asia-Pacific", "MENA", "Africa"].map(
                (regionName) => (
                  <FilterChip
                    key={regionName}
                    active={explorerRegion === regionName}
                    onClick={() => setExplorerRegion(regionName)}
                  >
                    {regionName === "MENA" ? "Middle East & N. Africa" : regionName}
                  </FilterChip>
                ),
              )}
              <span className="mx-1 h-4 w-px bg-line" />
              {["All", "VFR", "MVFR", "IFR"].map((category) => (
                <FilterChip
                  key={category}
                  active={explorerCategory === category}
                  onClick={() => setExplorerCategory(category)}
                >
                  {category === "All" ? "All conditions" : category}
                </FilterChip>
              ))}
            </div>
          </div>

          {searchError && (
            <div className="rounded-xl border border-delayed/35 bg-delayed/10 px-3 py-2 text-[10px] text-muted">
              {searchError}
            </div>
          )}

          {explorerResults.length === 0 ? (
            <Panel>
              <EmptyState
                icon={<Search className="size-6" />}
                title={searchLoading ? "Searching live airports…" : "No airports found"}
                description={
                  searchLoading
                    ? "Querying AeroDataBox for matching airports."
                    : "Try a different IATA code, city, or country. Live airport search requires AeroDataBox."
                }
              />
            </Panel>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {explorerResults.map((item) => (
                <AirportCard
                  key={item.iata}
                  airport={item}
                  weather={liveWeather[item.iata]}
                  onOpen={() => setSelectedAirport(item)}
                  onBoard={() => {
                    setAirportCode(item.iata);
                    setTab("BOARD");
                    setDirection("DEPARTURES");
                    setAirline("All");
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <AirportDetailModal
        airport={selectedAirport}
        weather={
          selectedAirport ? liveWeather[selectedAirport.iata] : undefined
        }
        onClose={() => setSelectedAirport(null)}
        onBoard={(code) => {
          setAirportCode(code);
          setTab("BOARD");
          setDirection("DEPARTURES");
          setAirline("All");
          setSelectedAirport(null);
        }}
      />
    </div>
  );
}

function BoardRow({
  flight,
  direction,
  onClick,
}: {
  flight: Flight;
  direction: Direction;
  onClick: () => void;
}) {
  const other = direction === "DEPARTURES" ? flight.destination : flight.origin;
  const time =
    direction === "DEPARTURES"
      ? flight.departureTimeEstimated
      : flight.arrivalTimeEstimated;
  const gate =
    direction === "DEPARTURES" ? flight.gateDeparture : flight.gateArrival;
  const terminal =
    direction === "DEPARTURES" ? flight.terminalDeparture : flight.terminalArrival;

  return (
    <button
      onClick={onClick}
      className="grid w-full grid-cols-[1.1fr_1.2fr_0.8fr_1.1fr] items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-surface-2/70"
    >
      <div className="min-w-0">
        <p className="text-[13px] font-bold text-accent tabular">{time}</p>
        <p className="mt-0.5 truncate font-mono text-[10px] font-semibold text-ink">
          {flight.flightNumber}
        </p>
        <p className="truncate text-[8px] text-subtle">{flight.airline}</p>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-black text-ink">{other.code}</p>
        <p className="truncate text-[9px] text-muted">
          {other.city && other.city !== other.code ? other.city : other.name}
        </p>
      </div>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-bold text-ink">{gate}</p>
        <p className="text-[8px] text-subtle">T{terminal}</p>
      </div>
      <div className="min-w-0">
        <StatusBadge status={flight.status} delayMinutes={flight.delayMinutes} />
      </div>
    </button>
  );
}

function AirportCard({
  airport,
  weather,
  onOpen,
  onBoard,
}: {
  airport: AirportNode;
  weather?: RealtimeAirportWeather;
  onOpen: () => void;
  onBoard: () => void;
}) {
  const category = weather?.flightCategory;
  const color =
    category === "IFR"
      ? "#EF4444"
      : category === "MVFR"
        ? "#F59E0B"
        : "#10B981";

  return (
    <div className="group overflow-hidden rounded-xl border border-line bg-surface transition-colors hover:border-accent/35">
      <button onClick={onOpen} className="w-full p-3 text-left">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-accent/35 bg-accent-soft px-1.5 py-1 font-mono text-[11px] font-extrabold text-accent">
              {airport.iata}
            </span>
            <div>
              <p className="text-[11px] font-bold text-ink">{airport.city}</p>
              <p className="text-[8px] text-subtle">{airport.country}</p>
            </div>
          </div>
          <span
            className="rounded-md border px-1.5 py-0.5 text-[8px] font-bold"
            style={{
              color: weather ? color : "var(--subtle)",
              borderColor: weather ? `${color}55` : "var(--border)",
              backgroundColor: weather ? `${color}14` : "transparent",
            }}
          >
            {weather ? weather.flightCategory : "NO WX"}
          </span>
        </div>
        <p className="mt-1.5 truncate text-[9px] text-muted">{airport.name}</p>
        <div className="mt-2 flex items-center justify-between rounded-lg border border-line/60 bg-surface-2 px-2 py-1.5">
          <span>
            <span className="block text-[11px] font-bold text-ink">
              {weather ? `${weather.tempC}°C` : "—"}
            </span>
            <span className="block text-[8px] text-subtle">
              {weather?.condition ?? "Weather unavailable"}
            </span>
          </span>
          <span className="text-right">
            <span className="block text-[9px] font-bold text-ink">
              {weather?.wind ?? "—"}
            </span>
            <span className="block text-[8px] text-subtle">
              {weather ? `Vis ${weather.visibility}` : "No stale weather"}
            </span>
          </span>
        </div>
      </button>
      <div className="border-t border-line/60 bg-surface-2/50 px-3 py-1.5">
        <button
          onClick={onBoard}
          className="flex w-full items-center justify-between text-[9px] font-bold text-accent"
        >
          Open live flight board <ArrowRight className="size-3" />
        </button>
      </div>
    </div>
  );
}

function AirportDetailModal({
  airport,
  weather,
  onClose,
  onBoard,
}: {
  airport: AirportNode | null;
  weather?: RealtimeAirportWeather;
  onClose: () => void;
  onBoard: (code: string) => void;
}) {
  return (
    <Modal
      open={Boolean(airport)}
      onClose={onClose}
      title={airport ? `${airport.iata} · ${airport.city}` : "Airport"}
      subtitle={airport?.name}
      icon={<Building2 className="size-4" />}
      size="lg"
      footer={
        airport ? (
          <>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
            <Button size="sm" onClick={() => onBoard(airport.iata)}>
              <PlaneLanding className="size-3.5" /> Open live flight board
            </Button>
          </>
        ) : null
      }
    >
      {airport && (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-line bg-surface-2 p-3">
              <p className="label-caps text-subtle">Location</p>
              <p className="mt-1 text-xs font-bold text-ink">
                {airport.city}, {airport.country}
              </p>
              <p className="mt-1 font-mono text-[9px] text-muted">
                {airport.latitude.toFixed(4)}, {airport.longitude.toFixed(4)}
              </p>
              <p className="mt-1 text-[9px] text-subtle">{airport.timezone}</p>
            </div>
            <div className="rounded-xl border border-line bg-surface-2 p-3">
              <p className="label-caps text-subtle">Live weather</p>
              {weather ? (
                <>
                  <p className="mt-1 text-xs font-bold text-ink">
                    {weather.tempC}°C · {weather.condition}
                  </p>
                  <p className="mt-1 text-[9px] text-muted">
                    {weather.wind} · {weather.visibility}
                  </p>
                  <p className="mt-1 font-mono text-[8px] leading-relaxed text-subtle">
                    {weather.metarRaw}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-[10px] text-subtle">
                  Live weather is unavailable.
                </p>
              )}
            </div>
            <div className="rounded-xl border border-line bg-surface-2 p-3">
              <p className="label-caps text-subtle">Reference</p>
              <p className="mt-1 text-xs font-bold text-ink">
                {REGION_META[airport.region]?.label ?? airport.region}
              </p>
              <p className="mt-1 text-[9px] text-muted">
                IATA {airport.iata} · ICAO {airport.icao}
              </p>
              <p className="mt-1 text-[9px] text-subtle">
                Coordinates are static reference data; operational values are live.
              </p>
            </div>
          </div>

          {weather && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <DetailMetric icon={<Wind className="size-3.5" />} label="Wind" value={weather.wind} />
              <DetailMetric icon={<Eye className="size-3.5" />} label="Visibility" value={weather.visibility} />
              <DetailMetric icon={<Gauge className="size-3.5" />} label="Pressure" value={`${weather.pressureInHg} inHg`} />
              <DetailMetric icon={<PlaneLanding className="size-3.5" />} label="Flight rules" value={weather.flightCategory} />
            </div>
          )}

          <div className="flex gap-2">
            <Link href={`/routes?hub=${airport.iata}`} className="flex-1">
              <Button size="sm" variant="outline" className="w-full">
                <Compass className="size-3.5" /> Live route network
              </Button>
            </Link>
            <Link href={`/terminals?airport=${airport.iata}`} className="flex-1">
              <Button size="sm" variant="outline" className="w-full">
                <Layers className="size-3.5" /> Terminal map
              </Button>
            </Link>
          </div>

          <p className="rounded-lg border border-dashed border-line px-3 py-2 text-[9px] leading-relaxed text-subtle">
            Weather is fetched live from Open-Meteo. Flight boards, routes, gates,
            and statuses are fetched live from AeroDataBox. Nothing on this screen
            is simulated.
          </p>
        </div>
      )}
    </Modal>
  );
}

function DetailMetric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-line/70 bg-surface-2 px-2 py-1.5">
      <p className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider text-subtle">
        <span className="text-accent">{icon}</span>
        {label}
      </p>
      <p className="mt-0.5 truncate text-[10px] font-semibold text-ink">{value}</p>
    </div>
  );
}
