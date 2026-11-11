"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Building2,
  ChevronRight,
  Clock,
  Coffee,
  DoorOpen,
  Layers,
  MapPin,
  Navigation,
  Search,
  Shield,
  ShoppingBag,
  Ticket,
  Toilet,
  Footprints,
  Plane,
  X,
  Share2,
  Compass,
  ArrowRight,
  Info,
  Sparkles,
  PlaneTakeoff,
} from "lucide-react";
import {
  findAirportNode,
  searchAirportNodes,
  terminalLayouts,
} from "@/lib/data";
import type { AmenityCategory, Flight, TerminalAmenity } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AMENITY_META, TerminalMap } from "@/components/terminal-map";
import {
  Button,
  MetricTile,
  Modal,
  Panel,
  StatusBadge,
} from "@/components/ui";

const AirportGroundsMap = dynamic(
  () => import("@/components/airport-grounds-map").then((m) => m.AirportGroundsMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[580px] w-full items-center justify-center rounded-2xl border border-line bg-[#081320]">
        <p className="text-xs text-muted">Loading airfield map…</p>
      </div>
    ),
  },
);

const CATEGORY_ICONS: Record<AmenityCategory, typeof DoorOpen> = {
  ALL: Layers,
  GATE: DoorOpen,
  LOUNGE: Coffee,
  SECURITY: Shield,
  DINING: Coffee,
  SHOPPING: ShoppingBag,
  RESTROOM: Toilet,
  TRANSIT: Ticket,
};

const CATEGORY_ORDER: AmenityCategory[] = [
  "ALL",
  "GATE",
  "LOUNGE",
  "SECURITY",
  "DINING",
  "SHOPPING",
  "RESTROOM",
  "TRANSIT",
];

function normalizeGate(value: string | null | undefined): string {
  return (value ?? "").toUpperCase().replace(/^GATE\s*/, "").trim();
}

function departureSortKey(flight: Flight): string {
  return (
    flight.departureTimeEstimated ||
    flight.departureTimeScheduled ||
    "99:99"
  );
}

export default function AirportsPage() {
  const [airportCode, setAirportCode] = useState("CAI");
  const [viewMode, setViewMode] = useState<"GROUNDS" | "INDOOR">("GROUNDS");
  const [category, setCategory] = useState<AmenityCategory>("ALL");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<TerminalAmenity | null>(null);
  const [walkingRoute, setWalkingRoute] = useState(true);
  const [airportPickerOpen, setAirportPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [gateQuickJump, setGateQuickJump] = useState("");

  // Live flights for this airport
  const [flights, setFlights] = useState<Flight[]>([]);
  const [flightsLoading, setFlightsLoading] = useState(false);
  const [flightsError, setFlightsError] = useState<string | null>(null);
  const [flightsFetchedAt, setFlightsFetchedAt] = useState<string | null>(null);

  // Airport node from global catalog
  const airportNode = useMemo(
    () => findAirportNode(airportCode) ?? null,
    [airportCode],
  );

  // Indoor CAD layout (if available)
  const layout = useMemo(
    () => terminalLayouts.find((item) => item.airportCode === airportCode) ?? null,
    [airportCode],
  );

  const [level, setLevel] = useState<number>(1);

  // Synchronize level and view mode whenever airport changes
  useEffect(() => {
    if (layout) {
      if (!layout.availableLevels.includes(level)) {
        setLevel(layout.availableLevels.includes(1) ? 1 : layout.availableLevels[0] ?? 0);
      }
    }
    setViewMode("GROUNDS");
    setSelected(null);
    setQuery("");
  }, [airportCode, layout, level]);

  // Deep-link support from query parameters (?airport=... / ?code=... & ?gate=...)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const code = (params.get("airport") || params.get("code"))?.toUpperCase();
    const gate = params.get("gate");
    const mode = params.get("mode")?.toUpperCase();

    if (code) {
      const found = findAirportNode(code);
      if (found) setAirportCode(code);
    }
    if (mode === "GROUNDS") {
      setViewMode("GROUNDS");
    } else if (mode === "INDOOR") {
      setViewMode("INDOOR");
    } else if (mode === "MAPBOX") {
      setViewMode("GROUNDS");
    }

    if (gate && layout) {
      const clean = gate.replace(/^Gate\s*/i, "").trim().toLowerCase();
      const matched = layout.amenities.find(
        (amenity) =>
          amenity.gateNumber?.toLowerCase() === clean ||
          amenity.name.toLowerCase().includes(clean),
      );
      if (matched) {
        setLevel(matched.level);
        setSelected(matched);
        setWalkingRoute(true);
        setViewMode("INDOOR");
      }
    }
  }, [layout]);

  // Fetch live flights for the active airport
  useEffect(() => {
    let cancelled = false;
    setFlightsLoading(true);
    setFlightsError(null);
    setFlightsFetchedAt(null);

    fetch(`/api/airports/${encodeURIComponent(airportCode)}/flights`, {
      cache: "no-store",
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as
          | {
              flights?: unknown;
              error?: string;
              fetchedAt?: string;
            }
          | null;
        if (!res.ok || !data || data.error) {
          throw new Error(
            data?.error ?? "Live airport board is temporarily unavailable.",
          );
        }
        if (!Array.isArray(data.flights)) {
          throw new Error("The provider returned an unexpected airport board.");
        }
        return data as { flights: Flight[]; fetchedAt?: string };
      })
      .then((data) => {
        if (cancelled) return;
        setFlights(data.flights);
        setFlightsFetchedAt(data.fetchedAt ?? null);
        setFlightsLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        setFlights([]);
        setFlightsError(
          error instanceof Error
            ? error.message
            : "Live airport board is temporarily unavailable.",
        );
        setFlightsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [airportCode]);

  const floor = useMemo(() => {
    if (!layout) return null;
    return (
      layout.floors[String(level)] ??
      layout.floors[String(layout.availableLevels[0])] ??
      Object.values(layout.floors)[0] ??
      null
    );
  }, [layout, level]);

  const amenities = useMemo(() => {
    if (!layout || !floor) return [];
    const q = query.trim().toLowerCase();
    return layout.amenities.filter((amenity) => {
      const matchesLevel = amenity.level === floor.level;
      const matchesCategory =
        category === "ALL" || amenity.category === category;
      const matchesQuery =
        !q ||
        amenity.name.toLowerCase().includes(q) ||
        (amenity.gateNumber ?? "").toLowerCase().includes(q) ||
        amenity.locationDescription.toLowerCase().includes(q) ||
        AMENITY_META[amenity.category].label.toLowerCase().includes(q) ||
        (amenity.accessInfo ?? "").toLowerCase().includes(q);
      return matchesLevel && matchesCategory && matchesQuery;
    });
  }, [layout, floor, category, query]);

  const categoryCounts = useMemo(() => {
    const map = new Map<AmenityCategory, number>();
    if (!layout || !floor) return map;
    for (const item of layout.amenities) {
      if (item.level !== floor.level) continue;
      map.set(item.category, (map.get(item.category) ?? 0) + 1);
    }
    return map;
  }, [layout, floor]);

  const selectAmenity = (amenity: TerminalAmenity) => {
    setSelected(amenity);
    setWalkingRoute(true);
  };

  const handleGateJump = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gateQuickJump.trim() || !layout) return;
    const clean = gateQuickJump.replace(/^Gate\s*/i, "").trim().toLowerCase();
    const matched = layout.amenities.find(
      (a) =>
        a.category === "GATE" &&
        (a.gateNumber?.toLowerCase() === clean || a.name.toLowerCase().includes(clean)),
    );
    if (matched) {
      setLevel(matched.level);
      setSelected(matched);
      setWalkingRoute(true);
      setViewMode("INDOOR");
      setGateQuickJump("");
    }
  };

  // Filtered flights for the selected gate or upcoming departures. This is
  // intentionally strict: unrelated flights are never substituted when the
  // selected gate has no match.
  const gateDepartures = useMemo(() => {
    const airportDepartures = flights
      .filter((flight) => flight.origin.code === airportCode)
      .sort((a, b) => departureSortKey(a).localeCompare(departureSortKey(b)));

    if (selected?.gateNumber) {
      const clean = normalizeGate(selected.gateNumber);
      return airportDepartures
        .filter((flight) => normalizeGate(flight.gateDeparture) === clean)
        .slice(0, 5);
    }
    return airportDepartures.slice(0, 6);
  }, [flights, selected, airportCode]);

  // Search filtered airports in modal
  const filteredAirports = useMemo(() => {
    if (!pickerSearch.trim()) return [];
    return searchAirportNodes(pickerSearch);
  }, [pickerSearch]);

  if (!airportNode) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Panel className="p-6 text-center">
          <p className="text-sm font-bold text-ink">Airport not found</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {airportCode} is not in Avi&apos;s reference catalog. No airport data
            is substituted.
          </p>
          <Link href="/airports" className="mt-3 inline-block">
            <Button size="sm" variant="outline">
              Back to airports
            </Button>
          </Link>
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1720px] px-4 py-4 lg:px-6">
      {/* Top Navigation & Airport Status Bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="label-caps text-accent">Airport Terminal & Wayfinding</span>
            <span className="rounded border border-line bg-surface-2 px-1.5 py-0.2 font-mono text-[9px] text-subtle">
              {airportNode.region}
            </span>
          </div>
          <h1 className="mt-1 flex flex-wrap items-center gap-2.5 text-2xl font-black tracking-tight text-ink">
            <span>{airportNode.name}</span>
            <span className="flex items-center rounded-lg border border-accent/40 bg-accent-soft px-2 py-0.5 font-mono text-xs font-bold text-accent">
              {airportNode.iata}
              {airportNode.icao && <span className="ml-1 text-[10px] text-accent/70">/ {airportNode.icao}</span>}
            </span>
            {layout && (
              <span className="rounded-md border border-line bg-surface-2 px-2 py-0.5 font-mono text-[10px] font-bold text-ink">
                {layout.terminalId}
              </span>
            )}
            {airportNode.historical && (
              <span className="rounded-md border border-delayed/40 bg-delayed/10 px-2 py-0.5 text-[10px] font-bold text-delayed">
                Historical · closed
              </span>
            )}
          </h1>
          <p className="mt-0.5 text-xs text-muted">
            {airportNode.city}, {airportNode.country}
            {airportNode.timezone ? ` · ${airportNode.timezone}` : ""}
            {airportNode.historical ? " · Historical · closed" : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Switcher */}
          <div className="flex rounded-lg border border-line bg-surface-2 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("GROUNDS")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold transition-colors",
                viewMode === "GROUNDS"
                  ? "bg-accent text-surface-0 shadow-sm"
                  : "text-muted hover:text-ink",
              )}
            >
              <Compass className="size-3.5" />
              Airfield & Grounds
            </button>
            <button
              type="button"
              onClick={() => {
                if (layout) setViewMode("INDOOR");
              }}
              disabled={!layout}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold transition-colors",
                viewMode === "INDOOR"
                  ? "bg-accent text-surface-0 shadow-sm"
                  : layout
                    ? "text-muted hover:text-ink"
                    : "cursor-not-allowed opacity-40 text-subtle",
              )}
            >
              <Layers className="size-3.5" />
              Terminal Concourse
            </button>
          </div>

          <button
            onClick={() => {
              setPickerSearch("");
              setAirportPickerOpen(true);
            }}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-accent/40 bg-surface-2 px-3 text-xs font-bold text-accent transition-colors hover:bg-accent-soft"
          >
            <Building2 className="size-3.5" />
            Switch Airport
            <ChevronRight className="size-3" />
          </button>

          <Link href="/airplanes">
            <Button size="sm" variant="outline">
              <Plane className="size-3.5 text-accent" /> Aircraft Seatmaps
            </Button>
          </Link>
        </div>
      </div>

      {/* Quick Hubs Strip */}
      <div className="mb-3 flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px]">
        <span className="shrink-0 text-subtle font-medium mr-1 flex items-center gap-1">
          <Sparkles className="size-3 text-accent" /> Featured Hubs:
        </span>
        {terminalLayouts.map((t) => (
          <button
            key={t.airportCode}
            onClick={() => {
              setAirportCode(t.airportCode);
              setLevel(t.availableLevels[0] ?? 1);
              setSelected(null);
            }}
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 transition-colors",
              t.airportCode === airportCode
                ? "border-accent bg-accent-soft font-bold text-accent"
                : "border-line bg-surface-2 text-muted hover:border-accent/40 hover:text-ink",
            )}
          >
            <span className="font-mono font-bold">{t.airportCode}</span>
            <span className="text-[10px] text-subtle">{t.city}</span>
            <span className="size-1.5 rounded-full bg-cyan-400" />
          </button>
        ))}
      </div>

      {/* Static terminal data is a guide, not live operational data. */}
      <div className="mb-3 flex items-start gap-2 rounded-xl border border-accent/25 bg-accent-soft px-3 py-2 text-[10px] leading-relaxed text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0 text-accent" />
        <span>
          Terminal diagrams, amenity locations, walking distances, and wait
          times are an illustrative reference guide. They are not live gate,
          security, or facility data. Live flight status is shown separately
          from AeroDataBox.
        </span>
      </div>

      {/* Non-CAD Notice Banner (if in Grounds view for airports without pre-modeled indoor CAD) */}
      {!layout && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <Info className="size-4 shrink-0 text-accent" />
            <p className="text-xs text-muted">
              <strong className="text-ink">{airportNode.name}</strong> airfield & terminal grounds map rendered from OpenStreetMap/OpenFreeMap vector tiles. Full multi-level indoor CAD schematics are currently active for premier hubs (CAI, DXB, LHR, JFK, SFO).
            </p>
          </div>
          <button
            onClick={() => {
              setAirportCode("CAI");
              setViewMode("INDOOR");
            }}
            className="shrink-0 rounded-lg border border-accent/40 bg-accent-soft px-2.5 py-1 text-[11px] font-bold text-accent hover:bg-accent hover:text-surface-0 transition-colors"
          >
            Explore CAI Terminal 3 CAD
          </button>
        </div>
      )}

      {/* Main 3-Column Layout */}
      <div className="grid gap-3.5 xl:grid-cols-[250px_minmax(0,1fr)_340px]">
        {/* Left Sidebar: Controls & Concourse Levels */}
        <aside className="space-y-3">
          {/* Level Switcher (When in Indoor CAD mode) */}
          {layout && floor ? (
            <Panel className="p-3">
              <p className="label-caps text-subtle">Terminal Levels</p>
              <div className="mt-2 space-y-1.5">
                {layout.availableLevels.map((lvl) => {
                  const levelFloor = layout.floors[String(lvl)];
                  if (!levelFloor) return null;
                  const active = lvl === floor.level;
                  const count = layout.amenities.filter((a) => a.level === lvl).length;
                  return (
                    <button
                      key={lvl}
                      onClick={() => {
                        setLevel(lvl);
                        setSelected(null);
                        setViewMode("INDOOR");
                      }}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left text-xs transition-colors",
                        active
                          ? "border-accent/60 bg-accent-soft font-bold text-accent"
                          : "border-line bg-surface-2 text-ink hover:bg-surface-3",
                      )}
                    >
                      <div>
                        <span className="font-mono font-bold">L{lvl}</span>{" "}
                        <span className="font-medium text-[11px]">{levelFloor.levelName}</span>
                      </div>
                      <span className="rounded px-1.5 py-0.5 font-mono text-[9px] bg-surface text-subtle border border-line">
                        {count} pts
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Quick Gate Finder */}
              <form onSubmit={handleGateJump} className="mt-3.5 border-t border-line/60 pt-3">
                <label className="label-caps block text-[9px] text-subtle">Quick Gate Finder</label>
                <div className="mt-1 flex items-center gap-1.5">
                  <input
                    type="text"
                    placeholder="e.g. G4, B14, A2..."
                    value={gateQuickJump}
                    onChange={(e) => setGateQuickJump(e.target.value)}
                    className="h-8 w-full rounded-md border border-line bg-surface px-2.5 text-xs text-ink placeholder:text-subtle focus:border-accent focus:outline-none"
                  />
                  <Button type="submit" size="sm" variant="outline" className="h-8 px-2.5 text-xs">
                    Find
                  </Button>
                </div>
              </form>
            </Panel>
          ) : (
            <Panel className="p-3">
              <p className="label-caps text-subtle">Airfield Specifications</p>
              <div className="mt-2 space-y-2 text-xs">
                <div className="flex justify-between border-b border-line/60 pb-1.5 text-muted">
                  <span>IATA / ICAO:</span>
                  <span className="font-mono font-bold text-ink">{airportNode.iata} / {airportNode.icao || "—"}</span>
                </div>
                <div className="flex justify-between border-b border-line/60 pb-1.5 text-muted">
                  <span>Timezone:</span>
                  <span className="font-mono text-ink">{airportNode.timezone || "Not reported"}</span>
                </div>
                <div className="flex justify-between border-b border-line/60 pb-1.5 text-muted">
                  <span>Hub Carriers:</span>
                  <span className="font-semibold text-ink text-right truncate max-w-[140px]">
                    {airportNode.hubAirlines?.length
                      ? airportNode.hubAirlines.join(", ")
                      : "Not reported"}
                  </span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>Direct Routes:</span>
                  <span className="font-mono font-bold text-accent">
                    {airportNode.destCount != null
                      ? `${airportNode.destCount} catalog reference destinations`
                      : "Destination count not reported"}
                  </span>
                </div>
              </div>
            </Panel>
          )}

          {/* Amenity Category Filter (Indoor Mode) */}
          {layout && floor && (
            <Panel className="p-3">
              <p className="label-caps text-subtle">Indoor Categories</p>
              <div className="mt-2 space-y-1">
                {CATEGORY_ORDER.map((cat) => {
                  const meta = AMENITY_META[cat];
                  const Icon = CATEGORY_ICONS[cat];
                  const active = category === cat;
                  const count =
                    cat === "ALL"
                      ? layout.amenities.filter((a) => a.level === floor.level).length
                      : (categoryCounts.get(cat) ?? 0);
                  return (
                    <button
                      key={cat}
                      onClick={() => setCategory(cat)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
                        active
                          ? "bg-accent-soft font-bold text-accent"
                          : "text-muted hover:bg-surface-2 hover:text-ink",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <Icon
                          className="size-3.5"
                          style={{ color: active ? undefined : meta.color }}
                        />
                        <span>{meta.label}</span>
                      </span>
                      <span
                        className={cn(
                          "rounded px-1.5 font-mono text-[9px]",
                          active ? "bg-accent/20 text-accent font-bold" : "text-subtle",
                        )}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Panel>
          )}

          {/* Wayfinding Walk Engine Summary */}
          {layout && floor && (
            <Panel className="p-3">
              <p className="label-caps text-subtle">Wayfinding Engine</p>
              <div className="mt-2 space-y-2 text-xs">
                <div className="flex items-center justify-between text-muted">
                  <span className="flex items-center gap-1.5">
                    <Shield className="size-3.5 text-red-400" /> Origin:
                  </span>
                  <span className="font-semibold text-ink">
                    Security checkpoint (reference)
                  </span>
                </div>
                <div className="flex items-center justify-between text-muted">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="size-3.5 text-accent" /> Destination:
                  </span>
                  <span className="font-semibold text-ink truncate max-w-[130px]">
                    {selected ? selected.name : "Select point on map"}
                  </span>
                </div>

                {selected && (
                  <div className="mt-2 rounded-lg border border-accent/30 bg-accent-soft p-2.5 text-accent">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 font-bold">
                        <Footprints className="size-3.5" /> Walk time:
                      </span>
                      <span className="font-mono text-sm font-black text-ink">
                        Illustrative
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[9px] text-subtle">
                      <span>Concourse distance:</span>
                      <span className="font-mono">Not reported</span>
                    </div>
                  </div>
                )}
              </div>
            </Panel>
          )}
        </aside>

        {/* Center Main Viewport */}
        <main className="space-y-3">
          {viewMode === "INDOOR" && layout && floor ? (
            <TerminalMap
              layout={layout}
              floor={floor}
              amenities={amenities}
              selectedAmenity={selected}
              showWalkingRoute={walkingRoute}
              onSelectAmenity={selectAmenity}
              className="h-[580px] w-full"
            />
          ) : (
            <AirportGroundsMap
              airport={airportNode}
              className="h-[580px] w-full"
              hasIndoorSchematic={Boolean(layout)}
              onSelectTerminal={() => {
                if (layout) setViewMode("INDOOR");
              }}
            />
          )}

          {/* Level / Airfield Status Metrics */}
          {layout && floor && viewMode === "INDOOR" ? (
            <div className="grid gap-2 sm:grid-cols-4">
              <MetricTile
                label="Concourse Level"
                value={`L${floor.level} · ${floor.levelName}`}
                sub={floor.description}
              />
              <MetricTile
                label="Mapped Gates"
                value={String(layout.amenities.filter((a) => a.category === "GATE" && a.level === floor.level).length)}
                sub="Reference positions in the illustrative diagram"
              />
              <MetricTile
                label="Dining & Lounges"
                value={String(
                  layout.amenities.filter(
                    (a) => (a.category === "LOUNGE" || a.category === "DINING") && a.level === floor.level,
                  ).length,
                )}
                sub="Reference listings, not live availability"
              />
              <MetricTile
                label="Security Wait"
                value="Not reported"
                sub="No live queue data source is connected"
              />
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-4">
              <MetricTile
                label="Airport Name"
                value={airportNode.iata}
                sub={`${airportNode.city}, ${airportNode.country}`}
              />
              <MetricTile
                label="Coordinates"
                value={`${airportNode.latitude.toFixed(2)}°, ${airportNode.longitude.toFixed(2)}°`}
                sub={airportNode.timezone || "Timezone not reported"}
              />
              <MetricTile
                label="Catalog Reference"
                value={
                  airportNode.destCount != null
                    ? String(airportNode.destCount)
                    : "Not reported"
                }
                sub="Undated reference count, not live route data"
              />
              <MetricTile
                label="Indoor CAD Support"
                value={layout ? "Available" : "In Expansion"}
                sub={layout ? `${layout.terminalId} Multi-Level Floorplan` : "OSM Aeroway View active"}
              />
            </div>
          )}
        </main>

        {/* Right Sidebar: Item Details, Boarding Flights, and Amenity Directory */}
        <aside className="space-y-3">
          {/* Selected Item Details */}
          {selected && (
            <Panel className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span
                    className="inline-block rounded px-2 py-0.5 text-[9px] font-bold text-white shadow-sm"
                    style={{ backgroundColor: AMENITY_META[selected.category].color }}
                  >
                    {AMENITY_META[selected.category].label}
                  </span>
                  <h3 className="mt-1 text-sm font-black text-ink">{selected.name}</h3>
                  <p className="text-[11px] text-muted">{selected.locationDescription}</p>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="rounded p-1 text-subtle hover:bg-surface-2 hover:text-ink"
                  aria-label="Close details"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="mt-3 space-y-2 border-t border-line/60 pt-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-muted">
                    <Clock className="size-3.5 text-accent" /> Walk from security
                  </span>
                  <span className="font-mono font-bold text-accent">
                    Illustrative
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-muted">
                    <Footprints className="size-3.5" /> Distance from security
                  </span>
                  <span className="font-mono text-ink">Not reported</span>
                </div>
                {selected.openingHours && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Opening hours</span>
                    <span className="font-medium text-ink">{selected.openingHours}</span>
                  </div>
                )}
                {selected.accessInfo && (
                  <div className="rounded-md bg-surface-2 p-2">
                    <span className="text-[9px] uppercase tracking-wider text-subtle font-semibold">
                      Access & Eligibility
                    </span>
                    <p className="mt-0.5 text-[11px] text-muted">{selected.accessInfo}</p>
                  </div>
                )}
                {selected.features && selected.features.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {selected.features.map((feature, i) => (
                      <span
                        key={i}
                        className="rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[9px] text-muted"
                      >
                        {feature}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 text-xs"
                  onClick={() => setWalkingRoute((val) => !val)}
                >
                  <Navigation className="size-3.5" />
                  {walkingRoute ? "Hide route" : "Show route"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const text = `${airportNode.iata} Terminal ${layout?.terminalId ?? ""} - ${selected.name} (${selected.locationDescription})`;
                    if (navigator.share) {
                      navigator.share({ title: selected.name, text }).catch(() => {});
                    } else {
                      navigator.clipboard.writeText(text);
                    }
                  }}
                  title="Share wayfinding info"
                >
                  <Share2 className="size-3.5" />
                </Button>
              </div>
            </Panel>
          )}

          {/* Gate Departures / Live Flights */}
          {(gateDepartures.length > 0 ||
            flightsLoading ||
            Boolean(selected?.gateNumber) ||
            Boolean(flightsError)) && (
            <Panel className="p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="label-caps text-subtle flex items-center gap-1">
                  <PlaneTakeoff className="size-3 text-accent" />
                  {selected?.gateNumber ? `Departures at Gate ${selected.gateNumber}` : `Upcoming Departures (${airportNode.iata})`}
                </p>
                {flightsLoading ? (
                  <span className="font-mono text-[9px] text-accent animate-pulse">Syncing...</span>
                ) : (
                  <span className="font-mono text-[9px] text-muted">
                    {gateDepartures.length} flights
                    {flightsFetchedAt
                      ? ` · ${new Date(flightsFetchedAt).toLocaleTimeString()}`
                      : ""}
                  </span>
                )}
              </div>
              {flightsLoading && gateDepartures.length === 0 ? (
                <p className="py-4 text-center text-xs text-subtle">Loading airport departures...</p>
              ) : flightsError ? (
                <p className="py-4 text-center text-xs leading-relaxed text-delayed">
                  {flightsError} No substitute board is shown.
                </p>
              ) : gateDepartures.length === 0 ? (
                <p className="py-4 text-center text-xs leading-relaxed text-muted">
                  No departures from {airportCode}
                  {selected?.gateNumber
                    ? ` at Gate ${selected.gateNumber}`
                    : ""}{" "}
                  were returned by AeroDataBox&apos;s current board. This is not
                  proof that no flight operates.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {gateDepartures.map((flight) => (
                    <Link
                      key={`${flight.id}-${flight.flightDate ?? "any"}`}
                      href={`/flight/${encodeURIComponent(flight.id)}`}
                      className="flex items-center justify-between rounded-lg border border-line bg-surface-2 p-2 transition-colors hover:border-accent/40"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-ink">{flight.flightNumber}</span>
                          <span className="text-[10px] text-subtle truncate max-w-[90px]">{flight.airline}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-muted mt-0.5">
                          <span>{flight.origin.code}</span>
                          <ArrowRight className="size-2.5 text-subtle" />
                          <span className="font-semibold text-ink">{flight.destination.code}</span>
                          {normalizeGate(flight.gateDeparture) && (
                            <span className="font-mono text-[9px] text-accent ml-1">Gate {flight.gateDeparture}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <StatusBadge
                          status={flight.status}
                          statusReported={flight.statusReported}
                        />
                        <p className="mt-0.5 font-mono text-[9px] text-subtle">{flight.departureTimeScheduled}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </Panel>
          )}

          {/* Directory Search & List (When CAD layout is available) */}
          {layout && floor && (
            <Panel className="flex max-h-[460px] flex-col p-3">
              <div className="mb-2">
                <p className="label-caps text-subtle">Terminal Directory</p>
                <div className="relative mt-1.5">
                  <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
                  <input
                    type="text"
                    placeholder="Search gate, lounge, coffee..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="h-8 w-full rounded-md border border-line bg-surface-2 pl-8 pr-7 text-xs text-ink placeholder:text-subtle focus:border-accent focus:outline-none"
                  />
                  {query && (
                    <button
                      onClick={() => setQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-subtle hover:text-ink"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 divide-y divide-line/40 overflow-y-auto pr-1">
                {amenities.map((item) => {
                  const isSelected = selected?.id === item.id;
                  const meta = AMENITY_META[item.category];
                  return (
                    <button
                      key={item.id}
                      onClick={() => selectAmenity(item)}
                      className={cn(
                        "flex w-full items-center justify-between py-2 text-left transition-colors",
                        isSelected
                          ? "bg-accent-soft px-1.5 font-bold text-accent"
                          : "hover:bg-surface-2 hover:px-1.5",
                      )}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="size-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: meta.color }}
                          />
                          <span className="truncate text-xs font-semibold text-ink">
                            {item.name}
                          </span>
                        </div>
                        <span className="block truncate text-[10px] text-subtle">
                          {item.locationDescription}
                        </span>
                      </div>
                      <span className="shrink-0 font-mono text-[10px] text-muted">
                        Ref
                      </span>
                    </button>
                  );
                })}
                {amenities.length === 0 && (
                  <div className="py-6 text-center text-xs text-subtle">
                    No indoor points match your filter on this level.
                  </div>
                )}
              </div>
            </Panel>
          )}
        </aside>
      </div>

      {/* Airport Switcher Modal with Global Search */}
      <Modal
        open={airportPickerOpen}
        onClose={() => setAirportPickerOpen(false)}
        title="Select Airport or Terminal Map"
      >
        <div className="space-y-3 py-1">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <input
              type="text"
              placeholder="Search worldwide by city, name, or IATA code (e.g. CAI, JFK, London, Tokyo)..."
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              className="h-9 w-full rounded-lg border border-line bg-surface-2 pl-9 pr-7 text-xs text-ink placeholder:text-subtle focus:border-accent focus:outline-none"
            />
            {pickerSearch && (
              <button
                onClick={() => setPickerSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-subtle hover:text-ink"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Filtered Search Results */}
          {pickerSearch.trim() ? (
            <div className="max-h-[360px] divide-y divide-line/40 overflow-y-auto pr-1">
              {filteredAirports.map((airport) => {
                const hasCAD = terminalLayouts.some((t) => t.airportCode === airport.iata);
                return (
                  <button
                    key={airport.iata}
                    onClick={() => {
                      setAirportCode(airport.iata);
                      setAirportPickerOpen(false);
                    }}
                    className="flex w-full items-center justify-between py-2 text-left hover:bg-surface-2 px-2 rounded-lg transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-accent">{airport.iata}</span>
                        <span className="text-xs font-bold text-ink">{airport.name}</span>
                        {hasCAD && (
                          <span className="rounded bg-cyan-400/20 px-1.5 py-0.2 font-mono text-[8px] font-bold text-cyan-400">
                            CAD INDOOR
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted">
                        {airport.city}, {airport.country}
                        {airport.timezone ? ` · ${airport.timezone}` : ""}
                        {airport.historical ? " · historical" : ""}
                      </p>
                    </div>
                    <ChevronRight className="size-3.5 text-subtle" />
                  </button>
                );
              })}
              {filteredAirports.length === 0 && (
                <p className="py-6 text-center text-xs text-subtle">No airports found matching &ldquo;{pickerSearch}&rdquo;.</p>
              )}
            </div>
          ) : (
            <div>
              <p className="label-caps mb-2 text-subtle">Premier Hubs with Multi-Level Indoor CAD Maps</p>
              <div className="grid gap-2 sm:grid-cols-2 max-h-[340px] overflow-y-auto pr-1">
                {terminalLayouts.map((t) => (
                  <button
                    key={t.airportCode}
                    onClick={() => {
                      setAirportCode(t.airportCode);
                      setLevel(t.availableLevels[0] ?? 1);
                      setSelected(null);
                      setAirportPickerOpen(false);
                    }}
                    className={cn(
                      "flex items-center justify-between rounded-xl border p-2.5 text-left transition-colors",
                      t.airportCode === airportCode
                        ? "border-accent bg-accent-soft"
                        : "border-line bg-surface-2 hover:bg-surface-3",
                    )}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-sm font-black text-accent">{t.airportCode}</span>
                        <span className="text-xs font-bold text-ink">{t.airportName}</span>
                      </div>
                      <p className="mt-0.5 text-[10px] text-muted">
                        {t.terminalName} · {t.city}
                      </p>
                      <span className="mt-1 inline-flex items-center gap-1 rounded bg-accent/10 px-1.5 py-0.2 font-mono text-[9px] text-accent">
                        <Layers className="size-2.5" />
                        {t.availableLevels.length} levels · {t.amenities.length} indoor points
                      </span>
                    </div>
                    <ChevronRight className="size-4 text-subtle" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
