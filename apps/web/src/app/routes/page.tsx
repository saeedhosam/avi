"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  Building2,
  ChevronRight,
  ChevronUp,
  Compass,
  Expand,
  Filter,
  Globe2,
  Layers,
  Loader2,
  MapPin,
  PlaneLanding,
  PlaneTakeoff,
  Search,
  Shrink,
  SlidersHorizontal,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import {
  findAirportNode,
  inferRegionFromCoords,
  QUICK_HUBS,
  searchAirportNodes,
} from "@/lib/data";
import type {
  AirlineFilterChipItem,
  AirportNode,
  AirportRouteNetworkSummary,
  DirectFlightConnection,
  HaulCategory,
  OperatingCarrierRoute,
  RouteRegion,
} from "@/lib/types";
import {
  HAUL_META,
  REGION_META,
  classifyHaul,
  cn,
  estimateDurationMinutes,
  formatDuration,
  geodesicDistanceKm,
  kmToNm,
} from "@/lib/utils";
import { useApp } from "@/lib/store";
import { OsmRouteMap } from "@/components/osm-map";
import { Button, FilterChip, Modal, TextInput } from "@/components/ui";

const HAULS = Object.keys(HAUL_META) as HaulCategory[];
const REGIONS = Object.keys(REGION_META) as RouteRegion[];

interface LiveRoute {
  destination?: string;
  destinationName?: string;
  city?: string;
  country?: string;
  icao?: string;
  timezone?: string;
  latitude?: number;
  longitude?: number;
  dailyFlights?: number;
  operators?: Array<{ code?: string; name?: string }>;
}

function toNode(route: LiveRoute): AirportNode | null {
  if (
    !route.destination ||
    route.latitude == null ||
    route.longitude == null
  ) {
    return null;
  }
  const known = findAirportNode(route.destination);
  if (known) return known;
  return {
    iata: route.destination.toUpperCase(),
    icao: route.icao ?? "",
    name: route.destinationName ?? route.destination,
    city: route.city ?? route.destination,
    country: route.country ?? "—",
    region: inferRegionFromCoords(route.latitude, route.longitude),
    latitude: route.latitude,
    longitude: route.longitude,
    timezone: route.timezone ?? "UTC",
    hubAirlines: [],
  };
}

function toConnections(origin: AirportNode, routes: LiveRoute[]) {
  const connections: DirectFlightConnection[] = [];
  const seen = new Set<string>();
  for (const route of routes) {
    const destination = toNode(route);
    if (!destination || destination.iata === origin.iata) continue;
    if (seen.has(destination.iata)) continue;
    seen.add(destination.iata);
    const distanceKm = geodesicDistanceKm(
      origin.latitude,
      origin.longitude,
      destination.latitude,
      destination.longitude,
    );
    const duration = estimateDurationMinutes(distanceKm);
    const daily = Math.max(1, Math.round(route.dailyFlights ?? 1));
    const operators = (route.operators ?? []).filter(
      (operator) => operator.code && operator.name,
    );
    const carriers: OperatingCarrierRoute[] = operators.length
      ? operators.map((operator) => ({
          airlineCode: operator.code!.toUpperCase(),
          airlineName: operator.name!,
          flightNumbers: [],
          dailyFrequencies: Math.max(
            1,
            Math.round(daily / operators.length),
          ),
          aircraftTypes: [],
        }))
      : [];
    connections.push({
      id: `${origin.iata}-${destination.iata}`,
      origin,
      destination,
      distanceKm,
      distanceNm: kmToNm(distanceKm),
      estimatedDurationMinutes: duration,
      durationFormatted: formatDuration(duration),
      haulCategory: classifyHaul(distanceKm),
      dailyFlightsCount: daily,
      hasDepartures: true,
      hasArrivals: true,
      operatingCarriers: carriers,
      isLiveVerified: true,
    });
  }
  return connections.sort((a, b) => b.dailyFlightsCount - a.dailyFlightsCount);
}

function buildSummary(
  origin: AirportNode | null,
  connections: DirectFlightConnection[],
): AirportRouteNetworkSummary {
  const airlineMap = new Map<string, AirlineFilterChipItem>();
  for (const connection of connections) {
    for (const carrier of connection.operatingCarriers) {
      const current = airlineMap.get(carrier.airlineCode);
      if (current) current.destinationCount += 1;
      else
        airlineMap.set(carrier.airlineCode, {
          code: carrier.airlineCode,
          name: carrier.airlineName,
          destinationCount: 1,
        });
    }
  }
  return {
    originAirport: origin,
    connections,
    totalDirectDestinations: connections.length,
    totalCountriesServed: new Set(
      connections.map((connection) => connection.destination.country),
    ).size,
    totalOperatingAirlines: airlineMap.size,
    totalDailyFlights: connections.reduce(
      (sum, connection) => sum + connection.dailyFlightsCount,
      0,
    ),
    availableAirlines: [...airlineMap.values()].sort(
      (a, b) => b.destinationCount - a.destinationCount,
    ),
  };
}

export default function RoutesPage() {
  const router = useRouter();
  const { offlineMode, setQuotaFallback, refreshData } = useApp();

  const [originIata, setOriginIata] = useState<string | null>(null);
  const [departureInput, setDepartureInput] = useState("");
  const [destinationInput, setDestinationInput] = useState("");
  const [suggestions, setSuggestions] = useState<AirportNode[]>([]);
  const [destinationSuggestions, setDestinationSuggestions] = useState<AirportNode[]>([]);
  const [pivotHistory, setPivotHistory] = useState<string[]>([]);
  const [connections, setConnections] = useState<DirectFlightConnection[]>([]);
  const [selectedDest, setSelectedDest] = useState<string | null>(null);
  const [airlineCode, setAirlineCode] = useState<string | null>(null);
  const [haul, setHaul] = useState<HaulCategory>("ALL");
  const [region, setRegion] = useState<RouteRegion>("ALL");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [hubSheetOpen, setHubSheetOpen] = useState(false);
  const [hubQuery, setHubQuery] = useState("");
  const [inspectorExpanded, setInspectorExpanded] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const originAirport = originIata ? findAirportNode(originIata) ?? null : null;
  const summary = useMemo(
    () => buildSummary(originAirport, connections),
    [originAirport, connections],
  );

  const filteredConnections = useMemo(() => {
    const depQ = departureInput.trim().toLowerCase();
    const destQ = destinationInput.trim().toLowerCase();
    return connections.filter((connection) => {
      const matchesAirline =
        !airlineCode ||
        connection.operatingCarriers.some(
          (carrier) => carrier.airlineCode.toLowerCase() === airlineCode.toLowerCase(),
        );
      const matchesHaul = haul === "ALL" || connection.haulCategory === haul;
      const matchesRegion = region === "ALL" || connection.destination.region === region;
      const matchesDeparture =
        !depQ ||
        connection.origin.iata.toLowerCase().includes(depQ) ||
        connection.origin.city.toLowerCase().includes(depQ) ||
        connection.origin.name.toLowerCase().includes(depQ) ||
        depQ.includes(connection.origin.iata.toLowerCase());
      const matchesDestination =
        !destQ ||
        connection.destination.iata.toLowerCase().includes(destQ) ||
        connection.destination.city.toLowerCase().includes(destQ) ||
        connection.destination.country.toLowerCase().includes(destQ) ||
        connection.operatingCarriers.some(
          (carrier) =>
            carrier.airlineName.toLowerCase().includes(destQ) ||
            carrier.airlineCode.toLowerCase().includes(destQ),
        );
      return matchesAirline && matchesHaul && matchesRegion && matchesDeparture && matchesDestination;
    });
  }, [connections, airlineCode, haul, region, departureInput, destinationInput]);

  const selectedConnection = useMemo(
    () =>
      selectedDest
        ? filteredConnections.find(
            (connection) =>
              connection.destination.iata.toLowerCase() === selectedDest.toLowerCase(),
          ) ?? null
        : null,
    [filteredConnections, selectedDest],
  );

  const loadHub = useCallback(
    async (iata: string, recordHistory = true) => {
      const code = iata.trim().toUpperCase();
      if (code.length !== 3) return;
      if (offlineMode) {
        setError("Offline mode is active. Live route data is paused.");
        return;
      }
      if (recordHistory && originIata && originIata !== code) {
        setPivotHistory((prev) => [...prev, originIata].slice(-6));
      }
      const node = findAirportNode(code);
      setLoading(true);
      setError(null);
      setOriginIata(code);
      setDepartureInput(node ? `${node.iata} · ${node.city}` : code);
      setSuggestions([]);
      setDestinationInput("");
      setDestinationSuggestions([]);
      setSelectedDest(null);
      setAirlineCode(null);
      try {
        const response = await fetch(`/api/airports/${code}/routes`, {
          cache: "no-store",
        });
        const data = (await response.json()) as {
          mode: string;
          routes?: LiveRoute[];
          error?: string;
        };
        if (data.mode === "QUOTA_FALLBACK") setQuotaFallback();
        if (data.mode === "NOT_CONFIGURED") {
          throw new Error(
            "AeroDataBox is not configured. Add AERODATABOX_API_KEY to .env and restart.",
          );
        }
        if (data.error) throw new Error(data.error);
        const originNode = findAirportNode(code);
        if (!originNode) throw new Error(`Unknown origin airport ${code}.`);
        const next = toConnections(originNode, data.routes ?? []);
        setConnections(next);
        if (!next.length) {
          setError("AeroDataBox returned no daily direct routes for this airport.");
        }
      } catch (loadError) {
        setConnections([]);
        setError(
          loadError instanceof Error ? loadError.message : "Live route lookup failed.",
        );
      } finally {
        setLoading(false);
      }
    },
    [offlineMode, originIata, setQuotaFallback],
  );

  // Deep links from airport boards: /routes?hub=CAI
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hub = params.get("hub");
    if (hub && hub.length === 3) void loadHub(hub.toUpperCase(), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAllRoutes = () => {
    setOriginIata(null);
    setDepartureInput("");
    setSuggestions([]);
    setDestinationInput("");
    setDestinationSuggestions([]);
    setSelectedDest(null);
    setPivotHistory([]);
    setAirlineCode(null);
    setConnections([]);
    setError(null);
  };

  const updateDeparture = (value: string) => {
    setDepartureInput(value);
    const trimmed = value.trim();
    if (!trimmed) {
      loadAllRoutes();
      return;
    }
    if (trimmed.length === 3) {
      const exact = findAirportNode(trimmed);
      if (exact) {
        setSuggestions([]);
        void loadHub(exact.iata);
        return;
      }
    }
    setSuggestions(trimmed.length >= 2 ? searchAirportNodes(trimmed).slice(0, 6) : []);
  };

  const updateDestination = (value: string) => {
    setDestinationInput(value);
    const trimmed = value.trim();
    if (!trimmed) {
      setDestinationSuggestions([]);
      setSelectedDest(null);
      return;
    }
    const q = trimmed.toLowerCase();
    const matched = filteredConnections.filter(
      (connection) =>
        connection.destination.iata.toLowerCase().includes(q) ||
        connection.destination.city.toLowerCase().includes(q) ||
        connection.destination.name.toLowerCase().includes(q),
    );
    if (matched.length) {
      setDestinationSuggestions(matched.map((connection) => connection.destination).slice(0, 6));
      setSelectedDest(matched[0].destination.iata);
    } else {
      setDestinationSuggestions(searchAirportNodes(trimmed).slice(0, 6));
    }
  };

  const selectDestination = (iata: string) => {
    const node = findAirportNode(iata);
    setSelectedDest(iata.toUpperCase());
    setDestinationInput(node ? `${node.iata} · ${node.city}` : iata.toUpperCase());
    setDestinationSuggestions([]);
    setInspectorExpanded(true);
  };

  const pivotToDestination = (iata: string) => {
    if (iata.toUpperCase() === originIata) return;
    const previous = originIata;
    void loadHub(iata, true);
    if (previous) {
      const node = findAirportNode(previous);
      setDestinationInput(node ? `${node.iata} · ${node.city}` : previous);
    }
  };

  const swap = () => {
    if (selectedDest) {
      const oldOrigin = originIata;
      pivotToDestination(selectedDest);
      if (oldOrigin) {
        const node = findAirportNode(oldOrigin);
        setDestinationInput(node ? `${node.iata} · ${node.city}` : oldOrigin);
      }
    } else {
      const temp = departureInput;
      setDepartureInput(destinationInput);
      setDestinationInput(temp);
    }
  };

  const popHub = () => {
    const history = [...pivotHistory];
    const previous = history.pop();
    setPivotHistory(history);
    if (previous) void loadHub(previous, false);
    else loadAllRoutes();
  };

  const clearFilters = () => {
    setAirlineCode(null);
    setHaul("ALL");
    setRegion("ALL");
  };

  const hasFilters = Boolean(airlineCode) || haul !== "ALL" || region !== "ALL";
  const hubResults = useMemo(() => searchAirportNodes(hubQuery), [hubQuery]);

  const openRouteFlights = (connection: DirectFlightConnection) => {
    router.push(
      `/search?mode=ROUTE&origin=${encodeURIComponent(connection.origin.iata)}&dest=${encodeURIComponent(connection.destination.iata)}`,
    );
  };

  return (
    <div className="mx-auto max-w-[1680px] px-3 py-3 lg:px-5">
      <div className="relative h-[calc(100vh-150px)] min-h-[640px] overflow-hidden rounded-2xl border border-line">
        <OsmRouteMap
          connections={filteredConnections}
          origin={summary.originAirport}
          selected={selectedConnection?.destination ?? null}
          selectedRoute={selectedConnection}
          onSelectAirport={(iata) => {
            if (!originIata) void loadHub(iata);
            else if (filteredConnections.some((c) => c.destination.iata === iata))
              selectDestination(iata);
            else void loadHub(iata);
          }}
          className="h-full rounded-none border-0"
        />

        <div className="pointer-events-none absolute inset-x-2 top-2 z-10 flex justify-center lg:inset-x-4 lg:top-4">
          <div className="pointer-events-auto w-full max-w-[880px] rounded-2xl border border-line/80 bg-surface/95 p-2.5 shadow-2xl backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="rounded-md bg-accent px-1.5 py-1 font-mono text-[11px] font-extrabold text-[color:var(--bg)]">
                  {summary.originAirport?.iata ??
                    (departureInput ? departureInput.slice(0, 3).toUpperCase() : "—")}
                </span>
                <p className="truncate text-[11px] font-bold text-ink">
                  {selectedConnection
                    ? `${selectedConnection.origin.iata} → ${selectedConnection.destination.iata} · ${selectedConnection.destination.city}`
                    : summary.originAirport
                      ? `${filteredConnections.length} live direct routes from ${summary.originAirport.city}`
                      : "Select an origin hub to load live direct routes"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {pivotHistory.length > 0 && (
                  <button
                    onClick={popHub}
                    className="flex h-7 items-center gap-1 rounded-md border border-accent/40 bg-surface-2 px-1.5 text-[9px] font-bold text-accent transition-colors hover:bg-accent-soft"
                    title="Previous airport hub"
                  >
                    <Undo2 className="size-3" />
                    {pivotHistory[pivotHistory.length - 1]}
                  </button>
                )}
                <button
                  onClick={() => {
                    setHubQuery("");
                    setHubSheetOpen(true);
                  }}
                  className="flex size-7 items-center justify-center rounded-md border border-line bg-surface-2 text-accent transition-colors hover:border-accent/40"
                  title="Search worldwide airports"
                >
                  <Search className="size-3.5" />
                </button>
                <button
                  onClick={() => setFiltersOpen((value) => !value)}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-md border transition-colors",
                    filtersOpen || hasFilters
                      ? "border-accent/50 bg-accent-soft text-accent"
                      : "border-line bg-surface-2 text-muted hover:text-ink",
                  )}
                  title="Toggle filter strip"
                >
                  {filtersOpen ? <ChevronUp className="size-3.5" /> : <Filter className="size-3.5" />}
                </button>
                <button
                  onClick={() => setFilterSheetOpen(true)}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-md border transition-colors",
                    hasFilters
                      ? "border-accent/50 bg-accent-soft text-accent"
                      : "border-line bg-surface-2 text-muted hover:text-ink",
                  )}
                  title="Open route filters"
                >
                  <SlidersHorizontal className="size-3.5" />
                </button>
              </div>
            </div>

            <div className="mt-2 flex items-center gap-1.5">
              <div className="flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2">
                <PlaneTakeoff className="size-3.5 shrink-0 text-accent" />
                <input
                  value={departureInput}
                  onChange={(event) => updateDeparture(event.target.value)}
                  placeholder="Origin hub (IATA/city)"
                  className="min-w-0 flex-1 bg-transparent text-[11px] font-semibold text-ink outline-none placeholder:text-subtle"
                />
                {departureInput && (
                  <button onClick={loadAllRoutes} aria-label="Clear origin">
                    <X className="size-3 text-subtle hover:text-ink" />
                  </button>
                )}
              </div>
              <button
                onClick={swap}
                className="flex size-8 shrink-0 items-center justify-center rounded-full border border-accent/45 bg-surface-3 text-accent transition-transform hover:rotate-180"
                aria-label="Swap origin and destination"
              >
                <ArrowLeftRight className="size-3.5" />
              </button>
              <div className="flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2">
                <PlaneLanding className="size-3.5 shrink-0 text-accent-2" />
                <input
                  value={destinationInput}
                  onChange={(event) => updateDestination(event.target.value)}
                  placeholder="Filter destination (IATA/city)"
                  className="min-w-0 flex-1 bg-transparent text-[11px] font-semibold text-ink outline-none placeholder:text-subtle"
                />
                {destinationInput && (
                  <button
                    onClick={() => {
                      setDestinationInput("");
                      setSelectedDest(null);
                    }}
                    aria-label="Clear destination"
                  >
                    <X className="size-3 text-subtle hover:text-ink" />
                  </button>
                )}
              </div>
            </div>

            {suggestions.length > 0 && (
              <div className="mt-1.5 flex items-center gap-1.5 overflow-x-auto pb-1">
                <span className="shrink-0 text-[8px] font-bold uppercase tracking-wider text-subtle">
                  Origin:
                </span>
                {suggestions.map((airport) => (
                  <button
                    key={airport.iata}
                    onClick={() => {
                      setDepartureInput(`${airport.iata} · ${airport.city}`);
                      void loadHub(airport.iata);
                    }}
                    className="flex shrink-0 items-center gap-1 rounded-md border border-accent/40 bg-surface-2 px-1.5 py-1 text-[9px] transition-colors hover:bg-accent-soft"
                  >
                    <span className="font-mono font-bold text-accent">{airport.iata}</span>
                    <span className="text-ink">{airport.city}</span>
                  </button>
                ))}
              </div>
            )}
            {destinationSuggestions.length > 0 && (
              <div className="mt-1.5 flex items-center gap-1.5 overflow-x-auto pb-1">
                <span className="shrink-0 text-[8px] font-bold uppercase tracking-wider text-subtle">
                  Destination:
                </span>
                {destinationSuggestions.map((airport) => (
                  <button
                    key={airport.iata}
                    onClick={() => selectDestination(airport.iata)}
                    className="flex shrink-0 items-center gap-1 rounded-md border border-accent-2/40 bg-surface-2 px-1.5 py-1 text-[9px] transition-colors hover:bg-accent-soft"
                  >
                    <span className="font-mono font-bold text-accent-2">{airport.iata}</span>
                    <span className="text-ink">{airport.city}</span>
                  </button>
                ))}
              </div>
            )}

            {filtersOpen && (
              <div className="mt-2 space-y-1.5 border-t border-line/60 pt-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {HAULS.filter((item) => item !== "ALL").map((item) => (
                    <FilterChip
                      key={item}
                      active={haul === item}
                      color={HAUL_META[item].color}
                      onClick={() => setHaul((current) => (current === item ? "ALL" : item))}
                    >
                      {HAUL_META[item].label}
                    </FilterChip>
                  ))}
                </div>
                {summary.availableAirlines.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                    <FilterChip active={!airlineCode} onClick={() => setAirlineCode(null)}>
                      All airlines ({summary.availableAirlines.length})
                    </FilterChip>
                    {summary.availableAirlines.slice(0, 12).map((airline) => (
                      <FilterChip
                        key={airline.code}
                        active={airlineCode === airline.code}
                        onClick={() => setAirlineCode(airline.code)}
                      >
                        {airline.code}
                      </FilterChip>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {loading && (
          <div className="absolute left-1/2 top-28 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-accent/50 bg-surface/90 px-2.5 py-1 backdrop-blur">
            <Loader2 className="size-3 animate-spin text-accent" />
            <span className="text-[9px] font-semibold text-ink">Loading live routes for {originIata}…</span>
          </div>
        )}

        {error && (
          <div className="absolute left-1/2 top-32 z-10 w-[min(600px,calc(100%-32px))] -translate-x-1/2 rounded-xl border border-delayed/40 bg-surface/95 px-3 py-2 text-[10px] text-muted shadow-xl backdrop-blur">
            {error}
          </div>
        )}

        <div className="pointer-events-none absolute bottom-3 left-3 z-10 hidden rounded-xl border border-line/80 bg-surface/92 p-2.5 shadow-lg backdrop-blur md:block">
          <div className="flex items-center gap-1.5">
            <Globe2 className="size-3 text-accent" />
            <p className="text-[9px] font-bold uppercase tracking-wider text-ink">
              Live direct route network
            </p>
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[8px] text-muted">
            <span className="flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-[#0077FF]" /> Origin hub
            </span>
            <span className="flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-[#0A335C]" /> Destination
            </span>
            <span className="flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-[#FFB800]" /> Selected
            </span>
            <span className="flex items-center gap-1">
              <span className="h-px w-3 bg-[#D94A6A]" /> Live route
            </span>
          </div>
          <p className="mt-1.5 text-[8px] text-subtle">
            {summary.totalDirectDestinations} destinations · {summary.totalCountriesServed} countries ·{" "}
            {summary.totalDailyFlights} daily flights
          </p>
        </div>

        <div className="absolute bottom-3 right-3 z-10 w-[320px] max-w-[calc(100%-24px)]">
          <div className="overflow-hidden rounded-xl border border-line/80 bg-surface/95 shadow-2xl backdrop-blur-xl">
            <button
              onClick={() => setInspectorExpanded((value) => !value)}
              className="flex w-full items-center justify-between gap-2 border-b border-line/60 px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-md bg-accent-soft text-accent">
                  {selectedConnection ? <Building2 className="size-3.5" /> : <Compass className="size-3.5" />}
                </span>
                <div className="min-w-0 text-left">
                  <p className="truncate text-[10px] font-bold text-ink">
                    {selectedConnection
                      ? `${selectedConnection.origin.iata} → ${selectedConnection.destination.iata}`
                      : summary.originAirport
                        ? `Live routes from ${summary.originAirport.iata}`
                        : "Live route network"}
                  </p>
                  <p className="text-[8px] text-subtle">
                    {selectedConnection
                      ? `${selectedConnection.destination.city}, ${selectedConnection.destination.country}`
                      : summary.originAirport
                        ? `${filteredConnections.length} direct connections`
                        : "Select a hub"}
                  </p>
                </div>
              </div>
              {inspectorExpanded ? <Shrink className="size-3.5 text-subtle" /> : <Expand className="size-3.5 text-subtle" />}
            </button>

            {inspectorExpanded && (
              <div className="max-h-[330px] overflow-y-auto p-3">
                {selectedConnection ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-1.5">
                      <InspectorMetric label="Distance" value={`${selectedConnection.distanceKm.toLocaleString()} km`} />
                      <InspectorMetric label="Duration" value={selectedConnection.durationFormatted} />
                      <InspectorMetric label="Daily flights" value={`${selectedConnection.dailyFlightsCount}`} />
                      <InspectorMetric label="Haul" value={HAUL_META[selectedConnection.haulCategory].label} />
                    </div>
                    <div className="rounded-lg border border-line/60 bg-surface-2 px-2 py-1.5">
                      <p className="flex items-center justify-between text-[9px]">
                        <span className="text-subtle">Nonstop distance</span>
                        <span className="font-semibold text-ink">
                          {selectedConnection.distanceNm.toLocaleString()} nm
                        </span>
                      </p>
                      <p className="mt-0.5 flex items-center justify-between text-[9px]">
                        <span className="text-subtle">Region</span>
                        <span className="font-semibold text-ink">
                          {REGION_META[selectedConnection.destination.region]?.label ??
                            selectedConnection.destination.region}
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="label-caps text-subtle">Live operating carriers</p>
                      <div className="mt-1 space-y-1">
                        {selectedConnection.operatingCarriers.length ? (
                          selectedConnection.operatingCarriers.map((carrier) => (
                            <div
                              key={carrier.airlineCode}
                              className="flex items-center gap-1.5 rounded-md border border-line/60 bg-surface-2 px-1.5 py-1"
                            >
                              <span className="font-mono text-[9px] font-bold text-accent">
                                {carrier.airlineCode}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-[9px] text-ink">
                                {carrier.airlineName}
                              </span>
                              <span className="text-[8px] text-subtle">
                                {carrier.dailyFrequencies}/day
                              </span>
                            </div>
                          ))
                        ) : (
                          <p className="text-[9px] text-subtle">
                            Carrier data was not included in the live route feed.
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        onClick={() => openRouteFlights(selectedConnection)}
                        className="flex items-center justify-center gap-1 rounded-lg bg-accent px-2 py-1.5 text-[9px] font-bold text-[color:var(--bg)] transition-colors hover:brightness-110"
                      >
                        <Search className="size-3" /> Find flights
                      </button>
                      <button
                        onClick={() => router.push(`/airports?code=${selectedConnection.origin.iata}`)}
                        className="flex items-center justify-center gap-1 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-[9px] font-bold text-ink transition-colors hover:border-accent/40"
                      >
                        <Layers className="size-3" /> Airport board
                      </button>
                    </div>
                    <button
                      onClick={() => pivotToDestination(selectedConnection.destination.iata)}
                      className="flex w-full items-center justify-center gap-1 rounded-lg border border-accent/35 bg-accent-soft px-2 py-1.5 text-[9px] font-bold text-accent transition-colors hover:bg-accent/15"
                    >
                      <Sparkles className="size-3" /> Pivot map to {selectedConnection.destination.iata}
                    </button>
                  </div>
                ) : summary.originAirport ? (
                  <div>
                    <p className="mb-1.5 text-[9px] leading-relaxed text-muted">
                      Select a destination pin or one of the live direct routes from{" "}
                      {summary.originAirport.city}.
                    </p>
                    <div className="space-y-1">
                      {filteredConnections.slice(0, 7).map((connection) => (
                        <button
                          key={connection.id}
                          onClick={() => selectDestination(connection.destination.iata)}
                          className="flex w-full items-center gap-2 rounded-md border border-line/60 bg-surface-2 px-1.5 py-1.5 text-left transition-colors hover:border-accent/40"
                        >
                          <span className="font-mono text-[10px] font-bold text-accent">
                            {connection.destination.iata}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[9px] text-ink">
                            {connection.destination.city}
                          </span>
                          <span className="text-[8px] text-subtle">
                            {connection.dailyFlightsCount}/day
                          </span>
                          <ChevronRight className="size-2.5 text-subtle" />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="mb-1.5 text-[9px] leading-relaxed text-muted">
                      Pick an origin hub to load live direct routes from AeroDataBox.
                    </p>
                    <div className="grid grid-cols-3 gap-1">
                      {QUICK_HUBS.map((code) => (
                        <button
                          key={code}
                          onClick={() => void loadHub(code)}
                          className="rounded-md border border-line/60 bg-surface-2 px-1.5 py-1.5 text-center font-mono text-[9px] font-bold text-accent transition-colors hover:border-accent/40"
                        >
                          {code}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line/70 bg-surface px-3 py-2">
        <div className="flex flex-wrap items-center gap-3 text-[9px] text-muted">
          <span className="flex items-center gap-1">
            <MapPin className="size-3 text-accent" />
            {summary.totalDirectDestinations} live destinations
          </span>
          <span>{summary.totalCountriesServed} countries</span>
          <span>{summary.totalOperatingAirlines} airlines</span>
          <span>{summary.totalDailyFlights} daily flights</span>
        </div>
        <div className="flex items-center gap-2 text-[9px] text-subtle">
          <button onClick={() => void refreshData()} className="font-semibold text-accent hover:underline">
            Refresh live data
          </button>
          <span>·</span>
          <span>Click destination to inspect</span>
        </div>
      </div>

      <Modal
        open={hubSheetOpen}
        onClose={() => setHubSheetOpen(false)}
        title="Select origin airport hub"
        subtitle="Enter an IATA code or city to load live direct routes from AeroDataBox."
        icon={<Search className="size-4" />}
        size="md"
      >
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-accent" />
            <TextInput
              autoFocus
              value={hubQuery}
              onChange={(event) => setHubQuery(event.target.value)}
              placeholder="Type airport code or city (e.g. CAI, Cairo, LHR)…"
              className="pl-9"
            />
          </div>
          <div className="max-h-[420px] space-y-1.5 overflow-y-auto">
            {hubResults.slice(0, 24).map((airport) => (
              <button
                key={airport.iata}
                onClick={() => {
                  void loadHub(airport.iata);
                  setHubSheetOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors",
                  airport.iata === originIata
                    ? "border-accent/50 bg-accent-soft"
                    : "border-line/70 bg-surface-2 hover:border-accent/40",
                )}
              >
                <span className="rounded-md border border-accent/35 bg-accent/10 px-1.5 py-1 font-mono text-[10px] font-extrabold text-accent">
                  {airport.iata}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-bold text-ink">
                    {airport.city}, {airport.country}
                  </span>
                  <span className="block truncate text-[9px] text-subtle">{airport.name}</span>
                </span>
                <span className="shrink-0 text-[8px] font-semibold text-accent-2">
                  {REGION_META[airport.region]?.short ?? airport.region}
                </span>
              </button>
            ))}
            {hubResults.length === 0 && (
              <p className="py-6 text-center text-xs text-muted">
                No reference airport matched “{hubQuery}”. Use the airport explorer for a live worldwide search.
              </p>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        title="Filter live route network"
        subtitle="Refine by distance, destination region, or operating airline."
        icon={<SlidersHorizontal className="size-4" />}
        size="md"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Reset all
            </Button>
            <Button size="sm" onClick={() => setFilterSheetOpen(false)}>
              Show {filteredConnections.length} connections
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="label-caps text-subtle">Distance / haul range</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {HAULS.map((item) => (
                <FilterChip
                  key={item}
                  active={haul === item}
                  color={HAUL_META[item].color}
                  onClick={() => setHaul(item)}
                >
                  {HAUL_META[item].label} ({HAUL_META[item].range})
                </FilterChip>
              ))}
            </div>
          </div>
          <div>
            <p className="label-caps text-subtle">Destination region</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {REGIONS.map((item) => (
                <FilterChip key={item} active={region === item} onClick={() => setRegion(item)}>
                  {REGION_META[item].label}
                </FilterChip>
              ))}
            </div>
          </div>
          {summary.availableAirlines.length > 0 && (
            <div>
              <p className="label-caps text-subtle">Operating airline</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <FilterChip active={!airlineCode} onClick={() => setAirlineCode(null)}>
                  All airlines
                </FilterChip>
                {summary.availableAirlines.map((airline) => (
                  <FilterChip
                    key={airline.code}
                    active={airlineCode === airline.code}
                    onClick={() => setAirlineCode(airline.code)}
                  >
                    {airline.code} · {airline.name}
                  </FilterChip>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

function InspectorMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line/60 bg-surface-2 px-2 py-1.5">
      <p className="text-[8px] font-bold uppercase tracking-wider text-subtle">{label}</p>
      <p className="mt-0.5 text-[10px] font-bold text-ink">{value}</p>
    </div>
  );
}
