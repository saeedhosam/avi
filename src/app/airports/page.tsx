"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Building2,
  Compass,
  Eye,
  Gauge,
  Layers,
  MapPin,
  PlaneLanding,
  PlaneTakeoff,
  Search,
  ShieldAlert,
  Thermometer,
  Wind,
  X,
} from "lucide-react";
import { useApp } from "@/lib/store";
import {
  getAirportNode,
  getRealtimeAirport,
  mockAirports,
  realtimeAirports,
} from "@/lib/data";
import type { Flight, RealtimeAirportInfo, RealtimeAirportWeather } from "@/lib/types";
import { cn } from "@/lib/utils";
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
];

export default function AirportsPage() {
  const router = useRouter();
  const { flights } = useApp();
  const [tab, setTab] = useState<BoardTab>("BOARD");
  const [airportCode, setAirportCode] = useState("JFK");
  const [direction, setDirection] = useState<Direction>("DEPARTURES");
  const [airline, setAirline] = useState("All");

  // Explorer
  const [explorerQuery, setExplorerQuery] = useState("");
  const [explorerRegion, setExplorerRegion] = useState("All");
  const [explorerStatus, setExplorerStatus] = useState("All");
  const [selectedRealtime, setSelectedRealtime] =
    useState<RealtimeAirportInfo | null>(null);
  const [liveWeather, setLiveWeather] = useState<
    Record<string, RealtimeAirportWeather>
  >({});

  // Read deep links such as /airports?code=CAI from route inspector or terminal maps.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code && code.length === 3) setAirportCode(code.toUpperCase());
    const view = params.get("view");
    if (view === "explorer") setTab("EXPLORER");
  }, []);

  // Open-Meteo live current conditions for every airport in the explorer.
  useEffect(() => {
    const controller = new AbortController();
    const codes = realtimeAirports.map((item) => item.code).join(",");
    fetch(`/api/weather/airports?codes=${codes}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((response) => response.json())
      .then((data: { live?: boolean; weather?: Record<string, RealtimeAirportWeather> }) => {
        if (data.live && data.weather) setLiveWeather(data.weather);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const mergedRealtimeAirports = useMemo(
    () =>
      realtimeAirports.map((item) =>
        liveWeather[item.code]
          ? { ...item, weather: liveWeather[item.code] }
          : item,
      ),
    [liveWeather],
  );

  const airport = useMemo(() => {
    const known = mockAirports.find((item) => item.code === airportCode);
    if (known) return known;
    const live =
      mergedRealtimeAirports.find(
        (item) => item.code === airportCode.toUpperCase(),
      ) ?? getRealtimeAirport(airportCode);
    if (live) {
      return {
        code: live.code,
        name: live.name,
        city: live.city,
        country: live.country,
        timezone: live.timezone,
        latitude: live.latitude,
        longitude: live.longitude,
        weather: {
          tempC: live.weather.tempC,
          tempF: live.weather.tempF,
          condition: live.weather.condition,
          wind: live.weather.wind,
          visibility: live.weather.visibility,
          humidity: live.weather.humidity,
        },
      };
    }
    return mockAirports[0];
  }, [airportCode, mergedRealtimeAirports]);

  const realtime = mergedRealtimeAirports.find((item) => item.code === airportCode);

  const boardFlights = useMemo(() => {
    return flights.filter((flight) => {
      const matchesAirport =
        direction === "DEPARTURES"
          ? flight.origin.code === airportCode
          : flight.destination.code === airportCode;
      const matchesAirline = airline === "All" || flight.airline === airline;
      return matchesAirport && matchesAirline;
    });
  }, [flights, airportCode, direction, airline]);

  const airlines = useMemo(() => {
    const all = new Set(
      flights
        .filter((flight) =>
          direction === "DEPARTURES"
            ? flight.origin.code === airportCode
            : flight.destination.code === airportCode,
        )
        .map((flight) => flight.airline),
    );
    return ["All", ...all];
  }, [flights, airportCode, direction]);

  const explorerResults = useMemo(() => {
    const q = explorerQuery.trim().toLowerCase();
    return mergedRealtimeAirports.filter((item) => {
      const matchesQuery =
        !q ||
        item.code.toLowerCase().includes(q) ||
        item.icao.toLowerCase().includes(q) ||
        item.city.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.country.toLowerCase().includes(q) ||
        item.hubAirlines.some((airlineName) => airlineName.toLowerCase().includes(q));
      const matchesRegion =
        explorerRegion === "All" || item.region === explorerRegion;
      const matchesStatus =
        explorerStatus === "All" ||
        (explorerStatus === "On-Time" && !item.isDelayed) ||
        (explorerStatus === "Delayed" && item.isDelayed) ||
        (explorerStatus === "Weather Alerts" &&
          ["IFR", "MVFR"].includes(item.weather.flightCategory));
      return matchesQuery && matchesRegion && matchesStatus;
    });
  }, [explorerQuery, explorerRegion, explorerStatus, mergedRealtimeAirports]);

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4 lg:px-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="label-caps text-accent">Airport operations</p>
          <h2 className="mt-1 flex items-center gap-2 text-xl font-black tracking-tight text-ink">
            {tab === "BOARD" ? "Live airport flight boards" : "Real-time airport explorer"}
            <span className="rounded-md border border-accent/35 bg-accent-soft px-1.5 py-0.5 text-[9px] font-bold text-accent">
              {tab === "BOARD" ? airportCode : "GLOBAL METAR"}
            </span>
          </h2>
          <p className="mt-1 text-[11px] text-muted">
            {tab === "BOARD"
              ? `${airport.code} · ${airport.name}`
              : "Live ATC telemetry · Runway status · Global airport weather"}
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
          <Link href={`/routes?hub=${airportCode}`}>
            <Button size="sm" variant="outline">
              <Compass className="size-3.5" /> Connections
            </Button>
          </Link>
        </div>
      </div>

      {tab === "BOARD" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5 pb-1">
            <button
              onClick={() => {
                setTab("EXPLORER");
                setExplorerQuery("");
              }}
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-accent/50 bg-accent-soft px-2.5 py-2 text-[10px] font-bold text-accent"
            >
              <Search className="size-3.5" /> Search worldwide
            </button>
            {BOARD_AIRPORT_CODES.map((code) => {
              const node = getAirportNode(code);
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
                  {airlines.slice(0, 6).map((airlineName) => (
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
                {boardFlights.length === 0 ? (
                  <EmptyState
                    icon={<PlaneTakeoff className="size-6" />}
                    title={`No ${direction === "DEPARTURES" ? "departures" : "arrivals"} found`}
                    description={`No cached flights match ${airportCode}${airline !== "All" ? ` · ${airline}` : ""}. Try another airport or airline filter.`}
                    action={
                      <Button size="sm" variant="outline" onClick={() => setAirline("All")}>
                        Clear airline filter
                      </Button>
                    }
                  />
                ) : (
                  <div className="divide-y divide-line/50">
                    {boardFlights.map((flight) => (
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
                  {boardFlights.length} {direction.toLowerCase()} · cached FIDS feed
                </span>
                <span className="flex items-center gap-1 text-landed">
                  <span className="size-1.5 animate-pulse-dot rounded-full bg-landed" />
                  Live refresh
                </span>
              </div>
            </div>

            <aside className="space-y-3">
              <Panel className="p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-2xl font-black text-ink">{airport.code}</p>
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
                    value={`${airport.weather.tempC}°C`}
                    sub={airport.weather.condition}
                    accent
                  />
                  <MetricTile
                    label="Wind"
                    value={airport.weather.wind}
                    sub={`Vis ${airport.weather.visibility}`}
                  />
                  <MetricTile
                    label="Departures"
                    value={boardFlights.filter((f) => f.origin.code === airportCode).length}
                    sub="Cached"
                  />
                  <MetricTile
                    label="Arrivals"
                    value={boardFlights.filter((f) => f.destination.code === airportCode).length}
                    sub="Cached"
                  />
                </div>
                <div className="mt-2 space-y-1 text-[10px] text-muted">
                  <p className="flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Wind className="size-3 text-subtle" /> Wind
                    </span>
                    <span className="font-semibold text-ink">
                      {airport.weather.wind}
                    </span>
                  </p>
                  <p className="flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Eye className="size-3 text-subtle" /> Visibility
                    </span>
                    <span className="font-semibold text-ink">
                      {airport.weather.visibility}
                    </span>
                  </p>
                  <p className="flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Thermometer className="size-3 text-subtle" /> Humidity
                    </span>
                    <span className="font-semibold text-ink">
                      {airport.weather.humidity}%
                    </span>
                  </p>
                </div>
                {realtime && (
                  <div className="mt-2 rounded-lg border border-line/60 bg-surface-2 px-2.5 py-2">
                    <p className="label-caps text-subtle">METAR live</p>
                    <p className="mt-1 break-words font-mono text-[8px] leading-relaxed text-muted">
                      {realtime.weather.metarRaw}
                    </p>
                    <p className="mt-1 flex items-center justify-between text-[9px]">
                      <span className="text-subtle">Flight rules</span>
                      <span className="font-bold text-ink">
                        {realtime.weather.flightCategory}
                      </span>
                    </p>
                  </div>
                )}
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <Link href="/routes">
                    <Button size="sm" variant="outline" className="w-full">
                      <Compass className="size-3" /> Route map
                    </Button>
                  </Link>
                  <Link href={`/terminals?airport=${airport.code}`}>
                    <Button size="sm" variant="outline" className="w-full">
                      <Layers className="size-3" /> Terminal
                    </Button>
                  </Link>
                </div>
              </Panel>

              <Panel className="p-3">
                <p className="label-caps text-subtle">Popular cached routes</p>
                <div className="mt-2 space-y-1">
                  {flights
                    .filter(
                      (flight) =>
                        flight.origin.code === airportCode ||
                        flight.destination.code === airportCode,
                    )
                    .slice(0, 4)
                    .map((flight) => (
                      <Link
                        key={flight.id}
                        href={`/flight/${encodeURIComponent(flight.id)}`}
                        className="flex items-center gap-2 rounded-lg border border-line/60 bg-surface-2 px-2 py-1.5 transition-colors hover:border-accent/40"
                      >
                        <span className="font-mono text-[10px] font-bold text-accent">
                          {flight.flightNumber}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[9px] text-muted">
                          {flight.origin.code} → {flight.destination.code}
                        </span>
                        <StatusBadge status={flight.status} />
                      </Link>
                    ))}
                </div>
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
                  placeholder="Search airport (e.g. JFK, London, Tokyo, DXB, Cairo)…"
                  className="h-10 w-full rounded-xl border border-line bg-surface-2 pl-9 pr-9 text-xs text-ink outline-none placeholder:text-subtle focus:border-accent"
                />
                {explorerQuery && (
                  <button
                    onClick={() => setExplorerQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle hover:text-ink"
                    aria-label="Clear search"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="flex items-center gap-1.5 rounded-lg border border-landed/35 bg-landed/10 px-2 py-1.5 text-[9px] font-bold text-landed">
                  <span className="size-1.5 animate-pulse-dot rounded-full bg-landed" />
                  LIVE OPEN-METEO
                </span>
                <span className="text-[9px] text-subtle">
                  {explorerResults.length} airports
                </span>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {["All", "Americas", "Europe", "Asia-Pacific", "Middle East"].map((regionName) => (
                <FilterChip
                  key={regionName}
                  active={explorerRegion === regionName}
                  onClick={() => setExplorerRegion(regionName)}
                >
                  {regionName}
                </FilterChip>
              ))}
              <span className="mx-1 h-4 w-px bg-line" />
              {["All", "On-Time", "Delayed", "Weather Alerts"].map((statusName) => (
                <FilterChip
                  key={statusName}
                  active={explorerStatus === statusName}
                  color={statusName === "Delayed" ? "#EF4444" : undefined}
                  onClick={() => setExplorerStatus(statusName)}
                >
                  {statusName}
                </FilterChip>
              ))}
            </div>
          </div>

          {explorerResults.length === 0 ? (
            <Panel>
              <EmptyState
                icon={<Search className="size-6" />}
                title="No airports matched"
                description={`No real-time airport telemetry found for “${explorerQuery}”. Try a hub code like JFK, LHR, HND, DXB, SFO, SIN, CDG, or CAI.`}
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setExplorerQuery("");
                      setExplorerRegion("All");
                      setExplorerStatus("All");
                    }}
                  >
                    Reset explorer
                  </Button>
                }
              />
            </Panel>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {explorerResults.map((item) => (
                <RealtimeAirportCard
                  key={item.code}
                  airport={item}
                  onOpen={() => setSelectedRealtime(item)}
                  onBoard={() => {
                    setAirportCode(item.code);
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
        airport={selectedRealtime}
        onClose={() => setSelectedRealtime(null)}
        onBoard={(code) => {
          setAirportCode(code);
          setTab("BOARD");
          setDirection("DEPARTURES");
          setAirline("All");
          setSelectedRealtime(null);
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
        <p className="truncate text-[9px] text-muted">{other.city}</p>
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

function RealtimeAirportCard({
  airport,
  onOpen,
  onBoard,
}: {
  airport: RealtimeAirportInfo;
  onOpen: () => void;
  onBoard: () => void;
}) {
  const category = airport.weather.flightCategory;
  const color = airport.isDelayed ? "#F59E0B" : "#10B981";

  return (
    <div className="group overflow-hidden rounded-xl border border-line bg-surface transition-colors hover:border-accent/35">
      <button onClick={onOpen} className="w-full p-3 text-left">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-accent/35 bg-accent-soft px-1.5 py-1 font-mono text-[11px] font-extrabold text-accent">
              {airport.code}
            </span>
            <div>
              <p className="text-[11px] font-bold text-ink">{airport.city}</p>
              <p className="text-[8px] text-subtle">{airport.country}</p>
            </div>
          </div>
          <span
            className="rounded-md border px-1.5 py-0.5 text-[8px] font-bold"
            style={{
              color,
              borderColor: `${color}55`,
              backgroundColor: `${color}14`,
            }}
          >
            {airport.isDelayed ? `+${airport.delayMinutes}m` : "ON TIME"}
          </span>
        </div>
        <p className="mt-1.5 truncate text-[9px] text-muted">{airport.name}</p>
        <div className="mt-2 flex items-center justify-between rounded-lg border border-line/60 bg-surface-2 px-2 py-1.5">
          <span>
            <span className="block text-[11px] font-bold text-ink">
              {airport.weather.tempC}°C
            </span>
            <span className="block text-[8px] text-subtle">
              {airport.weather.condition}
            </span>
          </span>
          <span className="text-right">
            <span
              className="block text-[9px] font-bold"
              style={{
                color:
                  category === "VFR"
                    ? "#10B981"
                    : category === "MVFR"
                      ? "#F59E0B"
                      : "#EF4444",
              }}
            >
              {category}
            </span>
            <span className="block text-[8px] text-subtle">
              {airport.weather.wind}
            </span>
          </span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1 text-center">
          <div className="rounded-md bg-surface-2 py-1">
            <p className="text-[8px] text-subtle">On time</p>
            <p className="text-[10px] font-bold text-ink">{airport.onTimePercentage}%</p>
          </div>
          <div className="rounded-md bg-surface-2 py-1">
            <p className="text-[8px] text-subtle">Dep</p>
            <p className="text-[10px] font-bold text-ink">{airport.activeDeparturesCount}</p>
          </div>
          <div className="rounded-md bg-surface-2 py-1">
            <p className="text-[8px] text-subtle">Arr</p>
            <p className="text-[10px] font-bold text-ink">{airport.activeArrivalsCount}</p>
          </div>
        </div>
      </button>
      <div className="border-t border-line/60 bg-surface-2/50 px-3 py-1.5">
        <button
          onClick={onBoard}
          className="flex w-full items-center justify-between text-[9px] font-bold text-accent"
        >
          Open flight board <ArrowRight className="size-3" />
        </button>
      </div>
    </div>
  );
}

function AirportDetailModal({
  airport,
  onClose,
  onBoard,
}: {
  airport: RealtimeAirportInfo | null;
  onClose: () => void;
  onBoard: (code: string) => void;
}) {
  return (
    <Modal
      open={Boolean(airport)}
      onClose={onClose}
      title={airport ? `${airport.code} · ${airport.city}` : "Airport"}
      subtitle={airport?.name}
      icon={<Building2 className="size-4" />}
      size="lg"
      footer={
        airport ? (
          <>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
            <Button size="sm" onClick={() => onBoard(airport.code)}>
              <PlaneLanding className="size-3.5" /> Open flight board
            </Button>
          </>
        ) : null
      }
    >
      {airport && (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-line bg-surface-2 p-3">
              <p className="label-caps text-subtle">Operational status</p>
              <p
                className={cn(
                  "mt-1 text-xs font-bold",
                  airport.isDelayed ? "text-delayed" : "text-landed",
                )}
              >
                {airport.operationalStatus}
              </p>
              <p className="mt-1 text-[9px] text-subtle">
                On-time performance: {airport.onTimePercentage}%
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface-2 p-3">
              <p className="label-caps text-subtle">Weather / METAR</p>
              <p className="mt-1 text-xs font-bold text-ink">
                {airport.weather.tempC}°C · {airport.weather.condition}
              </p>
              <p className="mt-1 font-mono text-[8px] leading-relaxed text-muted">
                {airport.weather.metarRaw}
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface-2 p-3">
              <p className="label-caps text-subtle">Traffic snapshot</p>
              <p className="mt-1 text-xs font-bold text-ink">
                {airport.activeDeparturesCount} dep · {airport.activeArrivalsCount} arr
              </p>
              <p className="mt-1 text-[9px] text-subtle">
                {airport.terminalCount} terminals · {airport.activeRunways.length} active runways
              </p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-surface-2 p-3">
              <p className="label-caps text-subtle">Active runways</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {airport.activeRunways.map((runway) => (
                  <span
                    key={runway}
                    className="rounded-md border border-line bg-surface px-2 py-1 font-mono text-[9px] font-semibold text-ink"
                  >
                    {runway}
                  </span>
                ))}
              </div>
              <p className="mt-2 label-caps text-subtle">Elevation</p>
              <p className="mt-0.5 text-[10px] text-ink">
                {airport.elevationFeet.toLocaleString()} ft · {airport.timezone}
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface-2 p-3">
              <p className="label-caps text-subtle">Hub airlines</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {airport.hubAirlines.map((airlineName) => (
                  <span
                    key={airlineName}
                    className="rounded-md border border-accent/25 bg-accent-soft px-2 py-1 text-[9px] font-semibold text-accent"
                  >
                    {airlineName}
                  </span>
                ))}
              </div>
              <p className="mt-2 label-caps text-subtle">Region</p>
              <p className="mt-0.5 text-[10px] text-ink">{airport.region}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <DetailMetric icon={<Wind className="size-3.5" />} label="Wind" value={airport.weather.wind} />
            <DetailMetric icon={<Eye className="size-3.5" />} label="Visibility" value={airport.weather.visibility} />
            <DetailMetric icon={<Gauge className="size-3.5" />} label="Pressure" value={`${airport.weather.pressureInHg} inHg`} />
            <DetailMetric icon={<PlaneLanding className="size-3.5" />} label="Flight rules" value={airport.weather.flightCategory} />
          </div>

          {airport.isDelayed && airport.delayReason && (
            <p className="flex items-start gap-2 rounded-lg border border-delayed/35 bg-delayed/10 px-3 py-2 text-[10px] leading-relaxed text-muted">
              <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-delayed" />
              {airport.delayReason} · average delay {airport.delayMinutes} minutes.
            </p>
          )}
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
