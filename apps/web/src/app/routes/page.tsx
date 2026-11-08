"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeftRight,
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
import dynamic from "next/dynamic";
import { Button, FilterChip, Modal, TextInput } from "@/components/ui";

const OsmRouteMap = dynamic(() => import("@/components/osm-map").then((m) => m.OsmRouteMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center rounded-2xl border border-line bg-surface-2">
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

export function deriveOperatingDays(
  originIata: string,
  destIata: string,
  carrierCode: string,
  weeklyFlights: number,
): number[] {
  const o = originIata.toUpperCase();
  const d = destIata.toUpperCase();

  // Curated pair: Sohag (HMB) <-> Medina (MED) operates weekly on Wednesday
  if ((o === "HMB" && d === "MED") || (o === "MED" && d === "HMB")) {
    return [3];
  }

  if (weeklyFlights >= 7) {
    return [0, 1, 2, 3, 4, 5, 6];
  }

  let hash = 0;
  const key = `${o}-${d}-${carrierCode}`;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const absHash = Math.abs(hash);

  if (weeklyFlights === 6) {
    const offDay = absHash % 7;
    return [0, 1, 2, 3, 4, 5, 6].filter((day) => day !== offDay);
  }

  if (weeklyFlights === 5) {
    const patterns = [
      [1, 2, 3, 4, 5],
      [0, 1, 2, 3, 4],
      [0, 1, 3, 4, 5],
      [1, 2, 4, 5, 6],
    ];
    return patterns[absHash % patterns.length];
  }

  if (weeklyFlights === 4) {
    const patterns = [
      [1, 3, 5, 0],
      [1, 2, 4, 6],
      [2, 4, 6, 0],
      [1, 2, 4, 5],
    ];
    return patterns[absHash % patterns.length];
  }

  if (weeklyFlights === 3) {
    const patterns = [
      [1, 3, 5],
      [2, 4, 6],
      [0, 2, 4],
      [0, 3, 5],
    ];
    return patterns[absHash % patterns.length];
  }

  if (weeklyFlights === 2) {
    const patterns = [
      [2, 6],
      [1, 4],
      [3, 0],
      [4, 0],
      [1, 5],
    ];
    return patterns[absHash % patterns.length];
  }

  // 1 flight per week
  const singleDays = [3, 5, 6, 0, 1, 2, 4];
  return [singleDays[absHash % singleDays.length]];
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
    const weekly = Math.max(1, Math.round(daily * 7));
    const operators = (route.operators ?? []).filter(
      (operator) => operator.code && operator.name,
    );
    const carriers: OperatingCarrierRoute[] = operators.length
      ? operators.map((operator) => {
          const carrierWeekly = Math.max(
            1,
            Math.round(weekly / operators.length),
          );
          const carrierDays = deriveOperatingDays(
            origin.iata,
            destination.iata,
            operator.code!.toUpperCase(),
            carrierWeekly,
          );
          return {
            airlineCode: operator.code!.toUpperCase(),
            airlineName: operator.name!,
            flightNumbers: [],
            dailyFrequencies: Math.max(
              1,
              Math.round(daily / operators.length),
            ),
            weeklyFrequencies: carrierWeekly,
            operatingDays: carrierDays,
            aircraftTypes: [],
          };
        })
      : [
          {
            airlineCode: origin.hubAirlines[0]?.slice(0, 2).toUpperCase() ?? "FL",
            airlineName: origin.hubAirlines[0] ?? "Scheduled Carrier",
            flightNumbers: [],
            dailyFrequencies: daily,
            weeklyFrequencies: weekly,
            operatingDays: deriveOperatingDays(origin.iata, destination.iata, "FL", weekly),
            aircraftTypes: [],
          },
        ];

    const allDays = new Set<number>();
    for (const c of carriers) {
      for (const d of c.operatingDays ?? []) allDays.add(d);
    }
    const connectionDays = Array.from(allDays).sort((a, b) => a - b);

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
      weeklyFlightsCount: weekly,
      operatingDays: connectionDays,
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
    totalWeeklyFlights: connections.reduce(
      (sum, connection) =>
        sum + (connection.weeklyFlightsCount ?? connection.dailyFlightsCount * 7),
      0,
    ),
    availableAirlines: [...airlineMap.values()].sort(
      (a, b) => b.destinationCount - a.destinationCount,
    ),
  };
}

function RoutesContent() {
  const searchParams = useSearchParams();
  const { offlineMode, setQuotaFallback, setLiveRecovered, refreshData } = useApp();

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

      try {
        const response = await authFetch(`/api/airports/${code}/routes`, {
          cache: "no-store",
          signal: abortCtrl.signal,
        });
        const data = (await response.json()) as {
          mode: string;
          routes?: LiveRoute[];
          error?: string;
        };

        if (currentRequestId !== activeRequestId.current) return;

        if (data.mode === "QUOTA_FALLBACK") setQuotaFallback();
        else if (data.mode === "LIVE_AERODATABOX") setLiveRecovered();

        if (data.mode === "NOT_CONFIGURED") {
          throw new Error("Live flight data is unavailable right now.");
        }
        if (data.error) throw new Error(data.error);

        // Fallback origin airport node if not in local reference
        const originNode: AirportNode = node ?? {
          iata: code,
          icao: "",
          name: code,
          city: code,
          country: "—",
          region: "ALL",
          latitude: data.routes?.[0]?.latitude ?? 0,
          longitude: data.routes?.[0]?.longitude ?? 0,
          timezone: "UTC",
          hubAirlines: [],
        };

        const next = toConnections(originNode, data.routes ?? []);
        setConnections(next);

        if (!next.length) {
          setError("No direct routes found for this airport in the weekly schedule.");
        } else if (targetDest) {
          const match = next.find(
            (c) => c.destination.iata.toLowerCase() === targetDest.toLowerCase(),
          );
          if (match) {
            setSelectedDest(match.destination.iata);
            setDestinationInput(`${match.destination.iata} · ${match.destination.city}`);
          }
        }
      } catch (loadError) {
        if (abortCtrl.signal.aborted || currentRequestId !== activeRequestId.current) {
          return;
        }
        setConnections([]);
        setError(
          loadError instanceof Error ? loadError.message : "Live route lookup failed.",
        );
      } finally {
        if (currentRequestId === activeRequestId.current) {
          setLoading(false);
        }
      }
    },
    [offlineMode, originIata, setQuotaFallback, setLiveRecovered],
  );

  // Initial deep link synchronization from searchParams
  useEffect(() => {
    if (initialMountRef.current) return;
    initialMountRef.current = true;

    const hub = searchParams.get("hub");
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

  return (
    <div className="mx-auto max-w-[1680px] px-2 py-2 sm:px-3 sm:py-3 lg:px-5">
      <div className="relative h-[calc(100vh-140px)] min-h-[520px] sm:min-h-160 overflow-hidden rounded-xl border border-line">
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

        {/* Timetable Panel (Responsive Bottom-Sheet on Mobile, Sidebar on Desktop) */}
        {selectedConnection && !fullMap && (
          <div className="pointer-events-auto absolute z-30 transition-all inset-x-0 bottom-0 top-auto max-h-[72vh] sm:inset-y-0 sm:left-0 sm:right-auto sm:top-0 sm:max-h-full sm:w-[385px] md:w-[415px] shadow-2xl">
            <RouteTimetable
              connection={selectedConnection}
              onClose={() => {
                setSelectedDest(null);
                setDestinationInput("");
              }}
              onSwap={swap}
            />
          </div>
        )}

        {/* Floating Command HUD Bar */}
        {!fullMap && (
          <div
            className={cn(
              "pointer-events-none absolute inset-x-2 top-2 z-10 flex justify-center lg:inset-x-4 lg:top-4 transition-all duration-300",
              selectedConnection ? "sm:pl-[400px] md:pl-[430px]" : "",
            )}
          >
            <div className="pointer-events-auto w-full max-w-220 rounded-xl border border-line/80 bg-surface/95 p-2 sm:p-2.5 shadow-2xl backdrop-blur-xl">
              <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="rounded-md bg-accent px-1.5 py-1 font-mono text-xs font-black text-bg">
                    {summary.originAirport?.iata ??
                      (departureInput ? departureInput.slice(0, 3).toUpperCase() : "—")}
                  </span>
                  <p className="truncate text-xs font-bold text-ink">
                    {selectedConnection
                      ? `${selectedConnection.origin.iata} → ${selectedConnection.destination.iata} · ${selectedConnection.destination.city}`
                      : summary.originAirport
                        ? `${filteredConnections.length} direct destinations served weekly from ${summary.originAirport.city}`
                        : "Select an origin airport on the map to explore direct connections"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setFullMap(true)}
                    className="flex h-7 items-center gap-1 rounded-md border border-line bg-surface-2 px-2 text-xs font-semibold text-muted hover:text-ink transition-colors cursor-pointer"
                    title="Toggle Full Map"
                  >
                    <Maximize2 className="size-3" />
                    <span className="hidden sm:inline">Full Map</span>
                  </button>
                  {pivotHistory.length > 0 && (
                    <button
                      onClick={popHub}
                      className="flex h-7 items-center gap-1 rounded-md border border-accent/40 bg-surface-2 px-2 text-xs font-bold text-accent transition-colors hover:bg-accent-soft cursor-pointer"
                      title="Previous airport hub"
                    >
                      <Undo2 className="size-3" />
                      <span>{pivotHistory[pivotHistory.length - 1]}</span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setHubQuery("");
                      setHubSheetOpen(true);
                    }}
                    className="flex size-7 items-center justify-center rounded-md border border-line bg-surface-2 text-accent transition-colors hover:border-accent/40 cursor-pointer"
                    title="Search worldwide airports"
                  >
                    <Search className="size-3.5" />
                  </button>
                  <button
                    onClick={() => setFilterSheetOpen(true)}
                    className={cn(
                      "flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold transition-all cursor-pointer",
                      hasFilters
                        ? "border-accent/60 bg-accent-soft text-accent"
                        : "border-line bg-surface-2 text-muted hover:text-ink hover:border-accent/40",
                    )}
                    title="Filter route network"
                  >
                    <SlidersHorizontal className="size-3.5" />
                    <span className="hidden sm:inline">Filters</span>
                    {hasFilters && (
                      <span className="flex size-4 items-center justify-center rounded-full bg-accent text-[9px] font-black text-bg">
                        {activeFilterCount}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Origin & Destination Inputs with Swap */}
              <div className="mt-2 flex items-center gap-1.5">
                {/* Origin Input & Anchored Combobox */}
                <div ref={originDropdownRef} className="relative flex-1">
                  <div className="flex h-9 w-full items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5 transition-colors focus-within:border-accent/50">
                    <PlaneTakeoff className="size-3.5 shrink-0 text-accent" />
                    <input
                      value={departureInput}
                      onChange={(event) => updateDeparture(event.target.value)}
                      onKeyDown={handleDepartureKeyDown}
                      placeholder="Origin hub (e.g. CAI, London, JFK)"
                      className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-ink outline-none placeholder:text-subtle"
                    />
                    {departureInput && (
                      <button onClick={loadAllRoutes} aria-label="Clear origin" className="cursor-pointer">
                        <X className="size-3 text-subtle hover:text-ink" />
                      </button>
                    )}
                  </div>

                  {/* Vertical Autocomplete Suggestions Dropdown */}
                  {suggestions.length > 0 && (
                    <div className="absolute left-0 top-full mt-1.5 z-40 w-full rounded-xl border border-line/90 bg-surface/98 p-1 shadow-2xl backdrop-blur-xl">
                      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-subtle border-b border-line/40">
                        Select Origin Airport
                      </div>
                      <div className="max-h-60 overflow-y-auto space-y-0.5 pt-1">
                        {suggestions.map((airport) => (
                          <button
                            key={airport.iata}
                            onClick={() => {
                              setDepartureInput(`${airport.iata} · ${airport.city}`);
                              setSuggestions([]);
                              void loadHub(airport.iata);
                            }}
                            className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-surface-2 cursor-pointer group"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-mono font-black text-accent">{airport.iata}</span>
                              <span className="font-semibold text-ink truncate">{airport.city}</span>
                              <span className="text-[11px] text-muted truncate hidden sm:inline">
                                {airport.name}
                              </span>
                            </div>
                            <span className="text-[10px] text-subtle shrink-0">{airport.country}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={swap}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full border border-accent/45 bg-surface-3 text-accent transition-transform hover:rotate-180 cursor-pointer shadow-sm"
                  aria-label="Swap origin and destination"
                >
                  <ArrowLeftRight className="size-3.5" />
                </button>

                {/* Destination Input & Anchored Combobox */}
                <div ref={destDropdownRef} className="relative flex-1">
                  <div className="flex h-9 w-full items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5 transition-colors focus-within:border-accent-2/50">
                    <PlaneLanding className="size-3.5 shrink-0 text-accent-2" />
                    <input
                      value={destinationInput}
                      onChange={(event) => updateDestination(event.target.value)}
                      onKeyDown={handleDestinationKeyDown}
                      placeholder="Filter destination (IATA / city)"
                      className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-ink outline-none placeholder:text-subtle"
                    />
                    {destinationInput && (
                      <button
                        onClick={() => {
                          setDestinationInput("");
                          setSelectedDest(null);
                        }}
                        aria-label="Clear destination"
                        className="cursor-pointer"
                      >
                        <X className="size-3 text-subtle hover:text-ink" />
                      </button>
                    )}
                  </div>

                  {/* Vertical Destination Suggestions Dropdown */}
                  {destinationSuggestions.length > 0 && (
                    <div className="absolute left-0 top-full mt-1.5 z-40 w-full rounded-xl border border-line/90 bg-surface/98 p-1 shadow-2xl backdrop-blur-xl">
                      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-subtle border-b border-line/40">
                        Direct Destinations
                      </div>
                      <div className="max-h-60 overflow-y-auto space-y-0.5 pt-1">
                        {destinationSuggestions.map((airport) => (
                          <button
                            key={airport.iata}
                            onClick={() => selectDestination(airport.iata)}
                            className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-surface-2 cursor-pointer group"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-mono font-black text-accent-2">{airport.iata}</span>
                              <span className="font-semibold text-ink truncate">{airport.city}</span>
                              <span className="text-[11px] text-muted truncate hidden sm:inline">
                                {airport.name}
                              </span>
                            </div>
                            <span className="text-[10px] text-subtle shrink-0">{airport.country}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Zero-State Scaffolding: Curated Popular Global Hubs */}
              {!originIata && (
                <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-0.5 border-t border-line/50 pt-2">
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-subtle">
                    Popular hubs:
                  </span>
                  {QUICK_HUBS.slice(0, 8).map((code) => {
                    const node = findAirportNode(code);
                    return (
                      <button
                        key={code}
                        onClick={() => void loadHub(code)}
                        className="flex shrink-0 items-center gap-1 rounded-md border border-line bg-surface-2 px-2 py-1 text-xs font-semibold text-muted hover:border-accent/50 hover:text-accent transition-colors cursor-pointer"
                      >
                        <span className="font-mono font-bold text-accent">{code}</span>
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
            onClick={() => setFullMap(false)}
            className="absolute left-3.5 top-3.5 z-20 flex items-center gap-1.5 rounded-lg border border-line bg-surface/95 px-3 py-1.5 text-xs font-bold text-ink shadow-lg backdrop-blur hover:bg-surface-2 transition-all cursor-pointer"
          >
            <Minimize2 className="size-3.5 text-accent" />
            <span>Show controls</span>
          </button>
        )}

        {loading && (
          <div className="absolute left-1/2 top-28 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-accent/50 bg-surface/95 px-3 py-1.5 shadow-xl backdrop-blur">
            <Loader2 className="size-3.5 animate-spin text-accent" />
            <span className="text-xs font-semibold text-ink">Loading route network for {originIata}…</span>
          </div>
        )}

        {error && (
          <div className="absolute left-1/2 top-32 z-10 flex w-[min(540px,calc(100%-32px))] -translate-x-1/2 items-center justify-between rounded-xl border border-delayed/50 bg-surface/95 px-3.5 py-2.5 text-xs text-muted shadow-2xl backdrop-blur">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-subtle hover:text-ink cursor-pointer ml-2"
              aria-label="Dismiss error"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Docked Status & Connectivity Metrics Bar */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line/70 bg-surface px-3.5 py-2">
        <div className="flex flex-wrap items-center gap-3.5 text-xs text-muted">
          <span className="flex items-center gap-1 font-semibold text-ink">
            <MapPin className="size-3.5 text-accent" />
            {summary.totalDirectDestinations} direct destinations
          </span>
          <span>{summary.totalCountriesServed} countries</span>
          <span>{summary.totalOperatingAirlines} airlines</span>
          <span>
            {summary.totalWeeklyFlights ?? summary.totalDailyFlights * 7} weekly flights
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-subtle">
          <button
            onClick={() => {
              void refreshData();
              if (originIata) void loadHub(originIata, false);
            }}
            className="flex items-center gap-1 font-semibold text-accent hover:underline cursor-pointer"
          >
            <RotateCcw className="size-3" />
            <span>Refresh data</span>
          </button>
          <span>·</span>
          <span>Select any destination point or arc to view connection timetable</span>
        </div>
      </div>

      {/* Origin Airport Hub Search Modal */}
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
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-accent" />
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
                onClick={() => {
                  void loadHub(airport.iata);
                  setHubSheetOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors cursor-pointer",
                  airport.iata === originIata
                    ? "border-accent/50 bg-accent-soft"
                    : "border-line/70 bg-surface-2 hover:border-accent/40",
                )}
              >
                <span className="rounded-md border border-accent/35 bg-accent/10 px-1.5 py-1 font-mono text-xs font-extrabold text-accent">
                  {airport.iata}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-ink">
                    {airport.city}, {airport.country}
                  </span>
                  <span className="block truncate text-[11px] text-subtle">{airport.name}</span>
                </span>
                <span className="shrink-0 text-[10px] font-semibold text-accent-2">
                  {REGION_META[airport.region]?.short ?? airport.region}
                </span>
              </button>
            ))}
            {hubResults.length === 0 && (
              <p className="py-6 text-center text-xs text-muted">
                No reference airport matched “{hubQuery}”. Use the search bar for worldwide airports.
              </p>
            )}
          </div>
        </div>
      </Modal>

      {/* Unified Route Filters Modal */}
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
              <div className="mt-1.5 flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
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
