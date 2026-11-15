"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeftRight,
  ArrowUpRight,
  Globe2,
  Loader2,
  MapPin,
  Maximize2,
  Minimize2,
  PlaneLanding,
  PlaneTakeoff,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Undo2,
  X,
} from "lucide-react";
import { RouteTimetable } from "@/components/route-timetable";
import { authFetch } from "@/lib/authed-fetch";
import {
  QUICK_HUBS,
  findAirportNode,
  inferRegionFromCoords,
  searchAirportNodes,
} from "@/lib/data";
import type {
  AirlineFilterChipItem,
  AirportNode,
  AirportRouteNetworkSummary,
  DirectFlightConnection,
  Flight,
  HaulCategory,
  OperatingCarrierRoute,
  RouteDataProvenance,
  RouteRegion,
  TodayBoardMeta,
} from "@/lib/types";
import {
  HAUL_META,
  REGION_META,
  classifyHaul,
  cn,
  geodesicDistanceKm,
  kmToNm,
} from "@/lib/utils";
import { useApp } from "@/lib/store";
import dynamic from "next/dynamic";
import { Button, FilterChip, Modal, TextInput } from "@/components/ui";

const OsmRouteMap = dynamic(() => import("@/components/osm-map").then((m) => m.OsmRouteMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center rounded-xl border border-line/70 bg-surface">
      <p className="text-xs font-medium text-muted">Loading route network…</p>
    </div>
  ),
});

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
  dailyFlights?: number | null;
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
  // Provider metadata wins over the bundled reference catalog; the catalog is
  // only a fallback for fields the provider omitted.
  return {
    iata: route.destination.toUpperCase(),
    icao: route.icao ?? known?.icao ?? "",
    name: route.destinationName ?? known?.name ?? route.destination,
    city: route.city ?? known?.city ?? route.destination,
    country: route.country ?? known?.country ?? "—",
    region: inferRegionFromCoords(route.latitude, route.longitude),
    latitude: route.latitude,
    longitude: route.longitude,
    timezone: route.timezone ?? known?.timezone ?? "",
    hubAirlines: known?.hubAirlines ?? [],
  };
}

function formatProvenanceTime(iso: string): string {
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : iso;
}

function toConnections(origin: AirportNode, routes: LiveRoute[]) {
  const connections: DirectFlightConnection[] = [];
  const seen = new Set<string>();
  for (const route of routes) {
    const destination = toNode(route);
    if (!destination || destination.iata === origin.iata) continue;
    if (seen.has(destination.iata)) continue;
    seen.add(destination.iata);

    // Distance is a geometric fact derived from two verified coordinates.
    // Duration is not reported by the route-statistics endpoint, so it stays
    // null rather than being estimated from cruise speed.
    const distanceKm = geodesicDistanceKm(
      origin.latitude,
      origin.longitude,
      destination.latitude,
      destination.longitude,
    );
    const reportedDaily = route.dailyFlights;
    const daily =
      typeof reportedDaily === "number" &&
      Number.isFinite(reportedDaily) &&
      reportedDaily > 0
        ? Math.round(reportedDaily * 10) / 10
        : null;

    // AeroDataBox reports operators, not per-carrier frequencies or days.
    // Those fields stay unknown until a real schedule source is available.
    const carriers: OperatingCarrierRoute[] = (route.operators ?? [])
      .filter((operator) => operator.code || operator.name)
      .map((operator) => ({
        airlineCode: operator.code?.toUpperCase() ?? "",
        airlineName: operator.name ?? operator.code ?? "Not reported",
        flightNumbers: [],
        dailyFrequencies: null,
        weeklyFrequencies: null,
        operatingDays: undefined,
        aircraftTypes: [],
      }));

    connections.push({
      id: `${origin.iata}-${destination.iata}`,
      origin,
      destination,
      distanceKm,
      distanceNm: kmToNm(distanceKm),
      haulCategory: classifyHaul(distanceKm),
      dailyFlightsCount: daily,
      // A 7-day average extrapolated to a week is not a forward schedule;
      // keep it null rather than presenting a derived weekly claim.
      weeklyFlightsCount: null,
      operatingDays: undefined,
      operatingCarriers: carriers,
      dataSource: "AERODATABOX",
      isForwardSchedule: false,
    });
  }
  return connections.sort(
    (a, b) => (b.dailyFlightsCount ?? -1) - (a.dailyFlightsCount ?? -1),
  );
}

function buildSummary(
  origin: AirportNode | null,
  connections: DirectFlightConnection[],
): AirportRouteNetworkSummary {
  const airlineMap = new Map<string, AirlineFilterChipItem>();
  for (const connection of connections) {
    for (const carrier of connection.operatingCarriers) {
      const key = carrier.airlineCode || carrier.airlineName;
      const current = airlineMap.get(key);
      if (current) current.destinationCount += 1;
      else
        airlineMap.set(key, {
          code: carrier.airlineCode,
          name: carrier.airlineName,
          destinationCount: 1,
        });
    }
  }
  const reportedDaily = connections
    .map((connection) => connection.dailyFlightsCount)
    .filter((value): value is number => value != null);
  const totalDaily = reportedDaily.length
    ? Math.round(reportedDaily.reduce((sum, value) => sum + value, 0) * 10) / 10
    : null;

  return {
    originAirport: origin,
    connections,
    totalDirectDestinations: connections.length,
    totalCountriesServed: new Set(
      connections
        .map((connection) => connection.destination.country)
        .filter(Boolean),
    ).size,
    totalOperatingAirlines: airlineMap.size,
    totalDailyFlights: totalDaily,
    // Not a forward weekly schedule; do not derive one from the trailing
    // daily average.
    totalWeeklyFlights: null,
    availableAirlines: [...airlineMap.values()].sort(
      (a, b) => b.destinationCount - a.destinationCount,
    ),
  };
}

function RoutesContent() {
  const searchParams = useSearchParams();
  const { offlineMode, setQuotaFallback, setLiveRecovered } = useApp();

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
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [hubSheetOpen, setHubSheetOpen] = useState(false);
  const [hubQuery, setHubQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullMap, setFullMap] = useState(false);
  const [routeProvenance, setRouteProvenance] =
    useState<RouteDataProvenance | null>(null);
  const [todayFlights, setTodayFlights] = useState<Flight[]>([]);
  const [todayMeta, setTodayMeta] = useState<TodayBoardMeta | null>(null);
  const [todayLoading, setTodayLoading] = useState(false);
  const [todayError, setTodayError] = useState<string | null>(null);

  const activeRequestId = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const initialMountRef = useRef(false);
  const originDropdownRef = useRef<HTMLDivElement>(null);
  const destDropdownRef = useRef<HTMLDivElement>(null);

  const originAirport = originIata ? findAirportNode(originIata) ?? null : null;
  const summary = useMemo(
    () => buildSummary(originAirport, connections),
    [originAirport, connections],
  );

  const filteredConnections = useMemo(() => {
    const depQ = departureInput.trim().toLowerCase();
    const destQ = destinationInput.trim().toLowerCase();

    // If destinationInput holds the formatted selected destination (e.g. "JED · Jeddah"),
    // do not filter out the route network; the user selected it to inspect it.
    const isSelectedDestFormatted =
      Boolean(selectedDest) &&
      (destQ === selectedDest?.toLowerCase() ||
        destQ.startsWith(selectedDest?.toLowerCase() ?? "") ||
        destQ.startsWith(`${selectedDest?.toLowerCase()} `) ||
        destQ.startsWith(`${selectedDest?.toLowerCase()} ·`) ||
        destQ.startsWith(`${selectedDest?.toLowerCase()} -`));

    return connections.filter((connection) => {
      const matchesAirline =
        !airlineCode ||
        connection.operatingCarriers.some(
          (carrier) => carrier.airlineCode.toLowerCase() === airlineCode.toLowerCase(),
        );
      const matchesHaul = haul === "ALL" || connection.haulCategory === haul;
      const matchesRegion = region === "ALL" || connection.destination.region === region;

      const originIataLower = connection.origin.iata.toLowerCase();
      const originCityLower = connection.origin.city.toLowerCase();
      const matchesDeparture =
        !depQ ||
        depQ.includes(originIataLower) ||
        depQ.includes(originCityLower) ||
        originIataLower.includes(depQ) ||
        originCityLower.includes(depQ);

      let matchesDestination = true;
      if (destQ && !isSelectedDestFormatted) {
        const destIataLower = connection.destination.iata.toLowerCase();
        const destCityLower = connection.destination.city.toLowerCase();
        const destNameLower = connection.destination.name.toLowerCase();
        const destCountryLower = connection.destination.country.toLowerCase();

        matchesDestination =
          destIataLower.includes(destQ) ||
          destCityLower.includes(destQ) ||
          destNameLower.includes(destQ) ||
          destCountryLower.includes(destQ) ||
          destQ.includes(destIataLower);
      }

      return matchesAirline && matchesHaul && matchesRegion && matchesDeparture && matchesDestination;
    });
  }, [connections, airlineCode, haul, region, departureInput, destinationInput, selectedDest]);

  const selectedConnection = useMemo(
    () =>
      selectedDest
        ? connections.find(
            (connection) =>
              connection.destination.iata.toLowerCase() === selectedDest.toLowerCase(),
          ) ?? null
        : null,
    [connections, selectedDest],
  );

  // Sync state to URL query parameters smoothly without triggering Next navigation lag
  const syncToUrl = useCallback(
    (
      hub: string | null,
      dest: string | null,
      airline: string | null,
      h: HaulCategory,
      reg: RouteRegion,
    ) => {
      const nextParams = new URLSearchParams();
      if (hub) nextParams.set("hub", hub);
      if (dest) nextParams.set("dest", dest);
      if (airline) nextParams.set("airline", airline);
      if (h && h !== "ALL") nextParams.set("haul", h);
      if (reg && reg !== "ALL") nextParams.set("region", reg);

      const qs = nextParams.toString();
      const nextUrl = qs ? `/routes?${qs}` : "/routes";
      if (typeof window !== "undefined") {
        const currentUrl = window.location.pathname + window.location.search;
        if (currentUrl !== nextUrl) {
          window.history.replaceState(null, "", nextUrl);
        }
      }
    },
    [],
  );

  const loadTodayBoard = useCallback(
    async (
      code: string,
      requestId: number,
      signal: AbortSignal,
    ): Promise<void> => {
      setTodayLoading(true);
      setTodayError(null);
      setTodayFlights([]);
      setTodayMeta(null);
      try {
        const response = await authFetch(`/api/airports/${code}/flights`, {
          cache: "no-store",
          signal,
        });
        const data = (await response.json()) as {
          mode?: string;
          flights?: Flight[];
          error?: string;
          source?: string;
          fetchedAt?: string;
          attribution?: string;
          window?: { from: string; to: string } | null;
        };
        if (requestId !== activeRequestId.current || signal.aborted) return;
        if (!response.ok || data.error) {
          throw new Error(
            data.error ?? "Live airport board data is temporarily unavailable.",
          );
        }
        if (!Array.isArray(data.flights)) {
          throw new Error("The provider returned an unexpected airport board.");
        }
        setTodayFlights(data.flights);
        setTodayMeta({
          source: "AERODATABOX",
          fetchedAt: data.fetchedAt ?? new Date().toISOString(),
          attribution: data.attribution ?? "AeroDataBox",
          mode: data.mode ?? "LIVE_AERODATABOX",
          window: data.window ?? null,
        });
      } catch (boardError) {
        if (signal.aborted || requestId !== activeRequestId.current) return;
        setTodayError(
          boardError instanceof Error
            ? boardError.message
            : "Live airport board data is temporarily unavailable.",
        );
      } finally {
        if (requestId === activeRequestId.current) setTodayLoading(false);
      }
    },
    [],
  );

  const loadHub = useCallback(
    async (iata: string, recordHistory = true, targetDest?: string) => {
      const code = iata.trim().toUpperCase();
      if (code.length !== 3) return;
      if (offlineMode) {
        setError("Offline mode is active. Live route data is paused.");
        return;
      }

      // Abort previous in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const abortCtrl = new AbortController();
      abortControllerRef.current = abortCtrl;
      const currentRequestId = ++activeRequestId.current;

      if (recordHistory && originIata && originIata !== code) {
        setPivotHistory((prev) => [...prev, originIata].slice(-6));
      }
      const node = findAirportNode(code);
      setLoading(true);
      setError(null);
      setOriginIata(code);
      setDepartureInput(node ? `${node.iata} · ${node.city}` : code);
      setSuggestions([]);
      if (!targetDest) {
        setDestinationInput("");
        setDestinationSuggestions([]);
        setSelectedDest(null);
      } else {
        const destCode = targetDest.trim().toUpperCase();
        setSelectedDest(destCode);
        const destNode = findAirportNode(destCode);
        setDestinationInput(destNode ? `${destNode.iata} · ${destNode.city}` : destCode);
        setDestinationSuggestions([]);
      }
      setAirlineCode(null);
      setRouteProvenance(null);
      setTodayFlights([]);
      setTodayMeta(null);
      setTodayError(null);
      setTodayLoading(false);

      try {
        const response = await authFetch(`/api/airports/${code}/routes`, {
          cache: "no-store",
          signal: abortCtrl.signal,
        });
        const data = (await response.json()) as {
          mode: string;
          routes?: unknown;
          error?: string;
          source?: string;
          fetchedAt?: string;
          attribution?: string;
          statisticsWindowDays?: number;
          note?: string;
        };

        if (currentRequestId !== activeRequestId.current) return;

        if (data.mode === "QUOTA_FALLBACK") setQuotaFallback();

        if (!response.ok || data.error) {
          throw new Error(data.error ?? "Live route data is unavailable right now.");
        }
        if (!Array.isArray(data.routes)) {
          throw new Error("The provider returned an unexpected route network.");
        }

        // The bundled catalog is incomplete. Resolve a missing origin from
        // the provider's airport search instead of inventing coordinates.
        let originNode = node ?? null;
        if (!originNode) {
          const searchResponse = await authFetch(
            `/api/airports/search?q=${encodeURIComponent(code)}`,
            { cache: "no-store", signal: abortCtrl.signal },
          );
          const searchData = (await searchResponse.json()) as {
            airports?: AirportNode[];
            error?: string;
          };
          if (!searchResponse.ok || searchData.error) {
            throw new Error(
              searchData.error ??
                "Origin airport coordinates are unavailable, so this route network cannot be plotted reliably.",
            );
          }
          originNode =
            searchData.airports?.find(
              (airport) => airport.iata.toUpperCase() === code,
            ) ?? null;
          if (!originNode) {
            throw new Error(
              "Origin airport coordinates are unavailable, so this route network cannot be plotted reliably.",
            );
          }
        }

        const next = toConnections(originNode, data.routes as LiveRoute[]);
        setConnections(next);
        setRouteProvenance({
          source: "AERODATABOX",
          fetchedAt: data.fetchedAt ?? new Date().toISOString(),
          attribution: data.attribution ?? "AeroDataBox",
          mode: data.mode,
          statisticsWindowDays: 7,
          note:
            data.note ??
            "AeroDataBox daily route statistics cover the previous 7 days. They are not a forward schedule.",
        });

        if (!next.length) {
          setError(
            "AeroDataBox returned no direct routes in its 7-day statistics for this airport.",
          );
        } else {
          if (data.mode === "LIVE_AERODATABOX") setLiveRecovered();
          void loadTodayBoard(code, currentRequestId, abortCtrl.signal);
          if (targetDest) {
            const match = next.find(
              (c) => c.destination.iata.toLowerCase() === targetDest.toLowerCase(),
            );
            if (match) {
              setSelectedDest(match.destination.iata);
              setDestinationInput(
                `${match.destination.iata} · ${match.destination.city}`,
              );
            }
          }
        }
      } catch (loadError) {
        if (abortCtrl.signal.aborted || currentRequestId !== activeRequestId.current) {
          return;
        }
        setConnections([]);
        setRouteProvenance(null);
        setError(
          loadError instanceof Error ? loadError.message : "Live route lookup failed.",
        );
      } finally {
        if (currentRequestId === activeRequestId.current) {
          setLoading(false);
        }
      }
    },
    [offlineMode, originIata, setQuotaFallback, setLiveRecovered, loadTodayBoard],
  );

  // Initial deep link synchronization from searchParams
  useEffect(() => {
    if (initialMountRef.current) return;
    initialMountRef.current = true;

    // `origin` is accepted as a legacy alias: the explorer used to link here
    // with `origin=<IATA>` before the shared hub parameter was standardised.
    const hub = searchParams.get("hub") ?? searchParams.get("origin");
    const dest = searchParams.get("dest");
    const initialAirline = searchParams.get("airline");
    const initialHaul = searchParams.get("haul") as HaulCategory | null;
    const initialRegion = searchParams.get("region") as RouteRegion | null;

    if (initialAirline) setAirlineCode(initialAirline.toUpperCase());
    if (initialHaul && HAULS.includes(initialHaul)) setHaul(initialHaul);
    if (initialRegion && REGIONS.includes(initialRegion)) setRegion(initialRegion);

    if (hub && hub.length === 3) {
      void loadHub(hub.toUpperCase(), false, dest ? dest.toUpperCase() : undefined);
    }
  }, [searchParams, loadHub]);

  // Keep URL updated with state changes
  useEffect(() => {
    if (!initialMountRef.current) return;
    syncToUrl(originIata, selectedDest, airlineCode, haul, region);
  }, [originIata, selectedDest, airlineCode, haul, region, syncToUrl]);

  // Close combobox dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (originDropdownRef.current && !originDropdownRef.current.contains(target)) {
        setSuggestions([]);
      }
      if (destDropdownRef.current && !destDropdownRef.current.contains(target)) {
        setDestinationSuggestions([]);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadAllRoutes = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    activeRequestId.current += 1;
    setOriginIata(null);
    setRouteProvenance(null);
    setTodayFlights([]);
    setTodayMeta(null);
    setTodayError(null);
    setTodayLoading(false);
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
    setSuggestions(trimmed.length >= 2 ? searchAirportNodes(trimmed).slice(0, 6) : []);
  };

  const handleDepartureKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const trimmed = departureInput.trim().toUpperCase();
      if (trimmed.length === 3) {
        setSuggestions([]);
        void loadHub(trimmed);
      } else if (suggestions.length > 0) {
        const top = suggestions[0];
        setDepartureInput(`${top.iata} · ${top.city}`);
        setSuggestions([]);
        void loadHub(top.iata);
      }
    } else if (e.key === "Escape") {
      setSuggestions([]);
    }
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
    if (selectedDest && !q.startsWith(selectedDest.toLowerCase())) {
      setSelectedDest(null);
    }
    const matched = connections.filter(
      (connection) =>
        connection.destination.iata.toLowerCase().includes(q) ||
        connection.destination.city.toLowerCase().includes(q) ||
        connection.destination.name.toLowerCase().includes(q),
    );
    if (matched.length) {
      setDestinationSuggestions(matched.map((connection) => connection.destination).slice(0, 6));
      if (trimmed.length === 3) {
        const exact = matched.find((c) => c.destination.iata.toLowerCase() === q);
        if (exact) {
          setSelectedDest(exact.destination.iata);
        }
      }
    } else {
      setDestinationSuggestions(searchAirportNodes(trimmed).slice(0, 6));
    }
  };

  const handleDestinationKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && destinationSuggestions.length > 0) {
      selectDestination(destinationSuggestions[0].iata);
    } else if (e.key === "Escape") {
      setDestinationSuggestions([]);
    }
  };

  const selectDestination = (iata: string) => {
    const node = findAirportNode(iata);
    setSelectedDest(iata.toUpperCase());
    setDestinationInput(node ? `${node.iata} · ${node.city}` : iata.toUpperCase());
    setDestinationSuggestions([]);
  };

  const swap = () => {
    const currentOrigin = originIata;
    const currentDest =
      selectedDest ??
      (destinationInput.trim().length >= 3
        ? destinationInput.trim().slice(0, 3).toUpperCase()
        : null);

    // Case 1: Destination is selected or has 3-letter IATA code
    if (currentDest && currentDest.length === 3) {
      if (currentOrigin && currentOrigin === currentDest) return;
      void loadHub(currentDest, true, currentOrigin ?? undefined);
      return;
    }

    // Case 2: Destination was typed but no origin hub loaded yet
    if (destinationInput.trim().length >= 3 && !originIata) {
      void loadHub(destinationInput.trim().slice(0, 3).toUpperCase(), true);
      return;
    }

    // Case 3: Simple string swap when airport codes are not resolved
    const tempDep = departureInput;
    setDepartureInput(destinationInput);
    setDestinationInput(tempDep);
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

  const activeFilterCount =
    (airlineCode ? 1 : 0) + (haul !== "ALL" ? 1 : 0) + (region !== "ALL" ? 1 : 0);
  const hasFilters = activeFilterCount > 0;
  const hubResults = useMemo(() => searchAirportNodes(hubQuery), [hubQuery]);
  const explorerHref = originIata ? `/explore/${originIata}` : "/explore/CAI";

  return (
    <div className="mx-auto max-w-[1600px] px-3 py-4 sm:px-4 lg:px-6 lg:py-6">
      {/*
        Deliberate consolidation: the shared explorer owns the globe, airline
        filters, and arrival weather. This page keeps the working airport board,
        live timetable, and pivot history that /explore does not replace yet.
      */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="label-caps text-accent">Route planner</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            Direct connections
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
            Pick an origin on the map to see the provider&rsquo;s direct
            destinations, then open a route for its live timetable.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="hidden items-center gap-1.5 text-xs text-subtle sm:flex">
            <Globe2 className="size-3.5" />
            Airline filters and arrival weather live in the explorer
          </span>
          <Link
            href={explorerHref}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-accent/40 bg-accent-soft px-3.5 text-[13px] font-medium text-accent transition-colors hover:bg-accent hover:text-[color:var(--bg)]"
          >
            Open route explorer
            <ArrowUpRight className="size-4" />
          </Link>
        </div>
      </div>

      <div className="relative h-[calc(100vh-240px)] min-h-[520px] overflow-hidden rounded-xl border border-line/70 sm:min-h-160">
        <OsmRouteMap
          connections={filteredConnections}
          origin={summary.originAirport}
          selected={selectedConnection?.destination ?? null}
          selectedRoute={selectedConnection}
          onSelectAirport={(iata) => {
            const upper = iata.toUpperCase();
            if (!originIata) {
              void loadHub(upper);
            } else if (originIata === upper) {
              loadAllRoutes();
            } else if (connections.some((c) => c.destination.iata.toUpperCase() === upper)) {
              selectDestination(upper);
            } else {
              void loadHub(upper);
            }
          }}
          onClearOrigin={loadAllRoutes}
          onClearDestination={() => {
            setSelectedDest(null);
            setDestinationInput("");
          }}
          onReset={loadAllRoutes}
          className="h-full rounded-none border-0"
        />

        {/* Timetable panel: bottom sheet on mobile, sidebar on desktop. */}
        {selectedConnection && !fullMap && (
          <div className="pointer-events-auto absolute inset-x-0 bottom-0 top-auto z-30 max-h-[72vh] shadow-2xl transition-all sm:inset-y-0 sm:left-0 sm:right-auto sm:top-0 sm:max-h-full sm:w-[385px] md:w-[415px]">
            <RouteTimetable
              connection={selectedConnection}
              provenance={routeProvenance}
              todayFlights={todayFlights}
              todayMeta={todayMeta}
              todayLoading={todayLoading}
              todayError={todayError}
              onClose={() => {
                setSelectedDest(null);
                setDestinationInput("");
              }}
              onSwap={swap}
            />
          </div>
        )}

        {/* Floating command HUD */}
        {!fullMap && (
          <div
            className={cn(
              "pointer-events-none absolute inset-x-2 top-2 z-10 flex justify-center transition-all duration-300 lg:inset-x-4 lg:top-4",
              selectedConnection ? "sm:pl-[400px] md:pl-[430px]" : "",
            )}
          >
            <div className="pointer-events-auto w-full max-w-[860px] rounded-xl border border-line/80 bg-surface/95 p-3 shadow-2xl backdrop-blur-xl">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="rounded-md bg-accent px-2 py-1 font-mono text-xs font-semibold text-[color:var(--bg)]">
                    {summary.originAirport?.iata ??
                      (departureInput ? departureInput.slice(0, 3).toUpperCase() : "—")}
                  </span>
                  <p className="truncate text-[13px] font-medium text-ink">
                    {selectedConnection
                      ? `${selectedConnection.origin.iata} → ${selectedConnection.destination.iata} · ${selectedConnection.destination.city}`
                      : summary.originAirport
                        ? `${filteredConnections.length} direct destinations in AeroDataBox's last-7-days statistics from ${summary.originAirport.city}`
                        : "Select an origin airport on the map to explore direct connections"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFullMap(true)}
                    className="flex h-9 items-center gap-1.5 rounded-lg border border-line/70 bg-surface-2/60 px-2.5 text-xs font-medium text-muted transition-colors hover:text-ink"
                    title="Toggle full map"
                  >
                    <Maximize2 className="size-3.5" />
                    <span className="hidden sm:inline">Full map</span>
                  </button>
                  {pivotHistory.length > 0 && (
                    <button
                      type="button"
                      onClick={popHub}
                      className="flex h-9 items-center gap-1.5 rounded-lg border border-accent/35 bg-accent-soft px-2.5 text-xs font-medium text-accent transition-colors hover:bg-accent/15"
                      title="Previous airport hub"
                    >
                      <Undo2 className="size-3.5" />
                      <span>{pivotHistory[pivotHistory.length - 1]}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setHubQuery("");
                      setHubSheetOpen(true);
                    }}
                    className="flex size-9 items-center justify-center rounded-lg border border-line/70 bg-surface-2/60 text-accent transition-colors hover:border-accent/40"
                    title="Search worldwide airports"
                    aria-label="Search worldwide airports"
                  >
                    <Search className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterSheetOpen(true)}
                    className={cn(
                      "flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors",
                      hasFilters
                        ? "border-accent/60 bg-accent-soft text-accent"
                        : "border-line/70 bg-surface-2/60 text-muted hover:border-accent/40 hover:text-ink",
                    )}
                    title="Filter route network"
                  >
                    <SlidersHorizontal className="size-3.5" />
                    <span className="hidden sm:inline">Filters</span>
                    {hasFilters && (
                      <span className="flex size-4 items-center justify-center rounded-full bg-accent text-xs font-semibold text-[color:var(--bg)]">
                        {activeFilterCount}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Origin & destination inputs with swap */}
              <div className="mt-2.5 flex items-center gap-2">
                <div ref={originDropdownRef} className="relative flex-1">
                  <div className="flex h-10 w-full items-center gap-2 rounded-lg border border-line bg-surface-2/70 px-3 transition-colors focus-within:border-accent/50">
                    <PlaneTakeoff className="size-4 shrink-0 text-accent" />
                    <input
                      value={departureInput}
                      onChange={(event) => updateDeparture(event.target.value)}
                      onKeyDown={handleDepartureKeyDown}
                      placeholder="Origin hub (e.g. CAI, London, JFK)"
                      className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-ink outline-none placeholder:text-subtle"
                    />
                    {departureInput && (
                      <button
                        type="button"
                        onClick={loadAllRoutes}
                        aria-label="Clear origin"
                        className="flex size-6 items-center justify-center rounded text-subtle hover:text-ink"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>

                  {suggestions.length > 0 && (
                    <div className="absolute left-0 top-full z-40 mt-1.5 w-full rounded-lg border border-line/80 bg-surface p-1 shadow-2xl">
                      <p className="label-caps border-b border-line/40 px-2 py-1.5 text-subtle">
                        Origin airport
                      </p>
                      <div className="max-h-64 space-y-0.5 overflow-y-auto pt-1">
                        {suggestions.map((airport) => (
                          <button
                            key={airport.iata}
                            type="button"
                            onClick={() => {
                              setDepartureInput(`${airport.iata} · ${airport.city}`);
                              setSuggestions([]);
                              void loadHub(airport.iata);
                            }}
                            className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2.5 text-left text-[13px] transition-colors hover:bg-surface-2"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="font-mono font-semibold text-accent">
                                {airport.iata}
                              </span>
                              <span className="truncate font-medium text-ink">
                                {airport.city}
                              </span>
                              <span className="hidden truncate text-xs text-muted sm:inline">
                                {airport.name}
                              </span>
                            </span>
                            <span className="shrink-0 text-xs text-subtle">
                              {airport.country}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={swap}
                  className="flex size-10 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-surface-3 text-accent shadow-sm transition-transform hover:rotate-180"
                  aria-label="Swap origin and destination"
                >
                  <ArrowLeftRight className="size-4" />
                </button>

                <div ref={destDropdownRef} className="relative flex-1">
                  <div className="flex h-10 w-full items-center gap-2 rounded-lg border border-line bg-surface-2/70 px-3 transition-colors focus-within:border-accent-2/50">
                    <PlaneLanding className="size-4 shrink-0 text-accent-2" />
                    <input
                      value={destinationInput}
                      onChange={(event) => updateDestination(event.target.value)}
                      onKeyDown={handleDestinationKeyDown}
                      placeholder="Filter destination (IATA / city)"
                      className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-ink outline-none placeholder:text-subtle"
                    />
                    {destinationInput && (
                      <button
                        type="button"
                        onClick={() => {
                          setDestinationInput("");
                          setSelectedDest(null);
                        }}
                        aria-label="Clear destination"
                        className="flex size-6 items-center justify-center rounded text-subtle hover:text-ink"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>

                  {destinationSuggestions.length > 0 && (
                    <div className="absolute left-0 top-full z-40 mt-1.5 w-full rounded-lg border border-line/80 bg-surface p-1 shadow-2xl">
                      <p className="label-caps border-b border-line/40 px-2 py-1.5 text-subtle">
                        Direct destinations
                      </p>
                      <div className="max-h-64 space-y-0.5 overflow-y-auto pt-1">
                        {destinationSuggestions.map((airport) => (
                          <button
                            key={airport.iata}
                            type="button"
                            onClick={() => selectDestination(airport.iata)}
                            className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2.5 text-left text-[13px] transition-colors hover:bg-surface-2"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="font-mono font-semibold text-accent-2">
                                {airport.iata}
                              </span>
                              <span className="truncate font-medium text-ink">
                                {airport.city}
                              </span>
                              <span className="hidden truncate text-xs text-muted sm:inline">
                                {airport.name}
                              </span>
                            </span>
                            <span className="shrink-0 text-xs text-subtle">
                              {airport.country}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Zero-state quick hubs */}
              {!originIata && (
                <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto border-t border-line/50 pt-2.5">
                  <span className="label-caps shrink-0 text-subtle">
                    Popular hubs
                  </span>
                  {QUICK_HUBS.slice(0, 8).map((code) => {
                    const node = findAirportNode(code);
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => void loadHub(code)}
                        className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-line/70 bg-surface-2/50 px-2.5 text-xs text-muted transition-colors hover:border-accent/50 hover:text-accent"
                      >
                        <span className="font-mono font-semibold text-accent">
                          {code}
                        </span>
                        <span className="text-ink">{node?.city ?? code}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {fullMap && (
          <button
            type="button"
            onClick={() => setFullMap(false)}
            className="absolute left-3.5 top-3.5 z-20 flex h-10 items-center gap-1.5 rounded-lg border border-line/70 bg-surface/95 px-3 text-[13px] font-medium text-ink shadow-lg backdrop-blur transition-colors hover:bg-surface-2"
          >
            <Minimize2 className="size-4 text-accent" />
            <span>Show controls</span>
          </button>
        )}

        {loading && (
          <div className="absolute left-1/2 top-32 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-accent/40 bg-surface/95 px-3.5 py-2 shadow-xl backdrop-blur">
            <Loader2 className="size-4 animate-spin text-accent" />
            <span className="text-xs font-medium text-ink">
              Loading AeroDataBox route statistics for {originIata}…
            </span>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="absolute left-1/2 top-36 z-10 flex w-[min(540px,calc(100%-32px))] -translate-x-1/2 items-start justify-between gap-3 rounded-lg border border-delayed/40 bg-surface/95 px-3.5 py-3 text-[13px] leading-relaxed text-muted shadow-2xl backdrop-blur"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="flex size-7 shrink-0 items-center justify-center rounded text-subtle hover:text-ink"
              aria-label="Dismiss error"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
      </div>

      {/* Docked status and connectivity metrics */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-line/70 bg-surface/80 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
          <span className="flex items-center gap-1.5 font-medium text-ink">
            <MapPin className="size-3.5 text-accent" />
            {summary.totalDirectDestinations} direct destinations
          </span>
          <span>{summary.totalCountriesServed} countries</span>
          <span>{summary.totalOperatingAirlines} airlines</span>
          <span>
            {summary.totalDailyFlights != null
              ? `${summary.totalDailyFlights} avg departures/day`
              : "Daily average not reported"}
          </span>
          {routeProvenance && (
            <span title={routeProvenance.note}>
              AeroDataBox · retrieved{" "}
              {formatProvenanceTime(routeProvenance.fetchedAt)} · last 7 days,
              not a forward schedule
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-subtle">
          <button
            type="button"
            onClick={() => {
              if (originIata) void loadHub(originIata, false);
            }}
            className="flex items-center gap-1.5 font-medium text-accent transition-colors hover:text-ink"
          >
            <RotateCcw className="size-3.5" />
            <span>Refresh data</span>
          </button>
          <span aria-hidden="true">·</span>
          <span>
            Select a destination to view AeroDataBox&apos;s current departures
            board
          </span>
        </div>
      </div>

      {/* Origin airport hub search */}
      <Modal
        open={hubSheetOpen}
        onClose={() => setHubSheetOpen(false)}
        title="Select origin airport hub"
        subtitle="Enter an IATA code or city name to explore its direct route network."
        icon={<Search className="size-4" />}
        size="md"
      >
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <TextInput
              autoFocus
              value={hubQuery}
              onChange={(event) => setHubQuery(event.target.value)}
              placeholder="Type airport code or city (e.g. CAI, Cairo, LHR, Tokyo)…"
              className="pl-9"
            />
          </div>
          <div className="max-h-105 space-y-1.5 overflow-y-auto">
            {hubResults.slice(0, 24).map((airport) => (
              <button
                key={airport.iata}
                type="button"
                onClick={() => {
                  void loadHub(airport.iata);
                  setHubSheetOpen(false);
                }}
                className={cn(
                  "flex min-h-14 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                  airport.iata === originIata
                    ? "border-accent/45 bg-accent-soft"
                    : "border-line/70 bg-surface-2/40 hover:border-line-strong",
                )}
              >
                <span className="rounded-md border border-accent/35 bg-accent/10 px-2 py-1 font-mono text-xs font-semibold text-accent">
                  {airport.iata}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink">
                    {airport.city}, {airport.country}
                  </span>
                  <span className="block truncate text-xs text-subtle">
                    {airport.name}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-medium text-accent-2">
                  {REGION_META[airport.region]?.short ?? airport.region}
                </span>
              </button>
            ))}
            {hubResults.length === 0 && (
              <p className="py-8 text-center text-[13px] text-muted">
                No reference airport matched “{hubQuery}”. Use the search bar for
                worldwide airports.
              </p>
            )}
          </div>
        </div>
      </Modal>

      {/* Unified route filters */}
      <Modal
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        title="Filter route network"
        subtitle="Refine direct connections by haul distance, destination region, or operating airline."
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
        <div className="space-y-5">
          <div>
            <p className="label-caps text-subtle">Distance / haul range</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
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
            <div className="mt-2 flex flex-wrap gap-1.5">
              {REGIONS.map((item) => (
                <FilterChip
                  key={item}
                  active={region === item}
                  onClick={() => setRegion(item)}
                >
                  {REGION_META[item].label}
                </FilterChip>
              ))}
            </div>
          </div>
          {summary.availableAirlines.length > 0 && (
            <div>
              <p className="label-caps text-subtle">Operating airline</p>
              <div className="mt-2 flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
                <FilterChip active={!airlineCode} onClick={() => setAirlineCode(null)}>
                  All airlines ({summary.availableAirlines.length})
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

export default function RoutesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-160 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-accent" />
        </div>
      }
    >
      <RoutesContent />
    </Suspense>
  );
}
