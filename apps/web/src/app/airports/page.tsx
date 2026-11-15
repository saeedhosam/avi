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
import { DelayLoungeCard } from "@/components/monetization-cards";
import {
  Button,
  Callout,
  MetricTile,
  Modal,
  PageHeader,
  Panel,
  StatusBadge,
  TextInput,
} from "@/components/ui";

const AirportGroundsMap = dynamic(
  () => import("@/components/airport-grounds-map").then((m) => m.AirportGroundsMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[520px] w-full items-center justify-center rounded-xl border border-line/70 bg-surface">
        <p className="text-sm text-muted">Loading airfield map…</p>
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

  // Reset the view only when the airport itself changes. Level changes must not
  // bounce the user back to the grounds map mid-exploration.
  useEffect(() => {
    setViewMode("GROUNDS");
    setSelected(null);
    setQuery("");
  }, [airportCode]);

  // Keep the selected level valid for the current terminal layout.
  useEffect(() => {
    if (layout && !layout.availableLevels.includes(level)) {
      setLevel(
        layout.availableLevels.includes(1)
          ? 1
          : (layout.availableLevels[0] ?? 0),
      );
    }
  }, [layout, level]);

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
          <p className="text-sm font-semibold text-ink">Airport not found</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {airportCode} is not in AeroQuest&apos;s reference catalog. No airport data
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
    <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow={`Airport wayfinding · ${airportNode.region}`}
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            <span>{airportNode.name}</span>
            <span className="rounded-md bg-accent-soft px-2 py-0.5 font-mono text-sm font-semibold text-accent">
              {airportNode.iata}
              {airportNode.icao && (
                <span className="ml-1 text-xs font-normal text-accent/70">
                  / {airportNode.icao}
                </span>
              )}
            </span>
            {layout && (
              <span className="rounded-md border border-line/70 px-2 py-0.5 font-mono text-sm font-medium text-muted">
                {layout.terminalId}
              </span>
            )}
            {airportNode.historical && (
              <span className="rounded-md border border-delayed/40 bg-delayed/10 px-2 py-0.5 text-xs font-semibold text-delayed">
                Historical · closed
              </span>
            )}
          </span>
        }
        description={
          <>
            {airportNode.city}, {airportNode.country}
            {airportNode.timezone ? ` · ${airportNode.timezone}` : ""}
            {" · "}
            Grounds and indoor diagrams are a reference guide, not live
            operational data.
          </>
        }
        actions={
          <>
            <div className="flex rounded-lg border border-line/70 bg-surface-2/50 p-1">
              <button
                type="button"
                onClick={() => setViewMode("GROUNDS")}
                aria-pressed={viewMode === "GROUNDS"}
                className={cn(
                  "flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors",
                  viewMode === "GROUNDS"
                    ? "bg-surface-4 text-ink"
                    : "text-muted hover:text-ink",
                )}
              >
                <Compass className="size-3.5" />
                Grounds
              </button>
              <button
                type="button"
                onClick={() => {
                  if (layout) setViewMode("INDOOR");
                }}
                disabled={!layout}
                aria-pressed={viewMode === "INDOOR"}
                className={cn(
                  "flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors",
                  viewMode === "INDOOR"
                    ? "bg-surface-4 text-ink"
                    : layout
                      ? "text-muted hover:text-ink"
                      : "cursor-not-allowed text-subtle opacity-40",
                )}
              >
                <Layers className="size-3.5" />
                Terminal
              </button>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setPickerSearch("");
                setAirportPickerOpen(true);
              }}
            >
              <Building2 className="size-4" />
              Switch airport
            </Button>

            <Link href="/airplanes">
              <Button size="sm" variant="ghost">
                <Plane className="size-4" /> Seatmaps
              </Button>
            </Link>
          </>
        }
      />

      {/* Quick hubs */}
      <div className="mt-5 flex items-center gap-1.5 overflow-x-auto pb-1">
        <span className="mr-1 flex shrink-0 items-center gap-1 text-xs text-subtle">
          <Sparkles className="size-3.5" /> Featured hubs
        </span>
        {terminalLayouts.map((t) => (
          <button
            key={t.airportCode}
            type="button"
            onClick={() => {
              setAirportCode(t.airportCode);
              setLevel(t.availableLevels[0] ?? 1);
              setSelected(null);
            }}
            aria-pressed={t.airportCode === airportCode}
            className={cn(
              "flex min-h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors",
              t.airportCode === airportCode
                ? "border-accent/40 bg-accent-soft font-medium text-accent"
                : "border-line/60 text-muted hover:border-line-strong hover:text-ink",
            )}
          >
            <span className="font-mono font-semibold">{t.airportCode}</span>
            <span className="text-subtle">{t.city}</span>
          </button>
        ))}
      </div>

      <div className="mt-4">
        <DelayLoungeCard
          compact
          delayMinutes={Math.max(
            0,
            ...flights.map((flight) =>
              flight.delayReported ? flight.delayMinutes : 0,
            ),
          )}
        />
      </div>

      {/* Static terminal data is a guide, not live operational data. */}
      <Callout tone="info" className="mt-3">
        Terminal diagrams, amenity locations, walking distances, and wait times
        are an illustrative reference guide — not live gate, security, or
        facility data. Live flight status is shown separately.
      </Callout>

      {/* Non-CAD notice for airports without a modelled indoor schematic. */}
      {!layout && (
        <div className="mt-3 flex flex-col gap-3 rounded-lg border border-line/70 bg-surface-2/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] leading-relaxed text-muted">
            <strong className="font-medium text-ink">{airportNode.name}</strong>{" "}
            airfield and terminal grounds are rendered from OpenStreetMap
            vector tiles. Multi-level indoor schematics are available for CAI,
            DXB, LHR, JFK and SFO.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={() => {
              setAirportCode("CAI");
              setViewMode("INDOOR");
            }}
          >
            Open CAI T3
          </Button>
        </div>
      )}

      {/* Main 3-Column Layout */}
      <div className="mt-5 grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)_340px] xl:gap-6">
        {/* Left Sidebar: Controls & Concourse Levels */}
        <aside className="space-y-4">
          {/* Level Switcher (When in Indoor CAD mode) */}
          {layout && floor ? (
            <Panel className="p-4">
              <p className="label-caps text-subtle">Terminal levels</p>
              <div className="mt-2.5 space-y-1.5">
                {layout.availableLevels.map((lvl) => {
                  const levelFloor = layout.floors[String(lvl)];
                  if (!levelFloor) return null;
                  const active = lvl === floor.level;
                  const count = layout.amenities.filter((a) => a.level === lvl).length;
                  return (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => {
                        setLevel(lvl);
                        setSelected(null);
                        setViewMode("INDOOR");
                      }}
                      aria-pressed={active}
                      className={cn(
                        "flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border px-3 text-left text-[13px] transition-colors",
                        active
                          ? "border-accent/40 bg-accent-soft font-medium text-accent"
                          : "border-line/70 bg-surface-2/40 text-ink hover:border-line-strong",
                      )}
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-mono font-semibold">L{lvl}</span>{" "}
                        <span className="text-muted">{levelFloor.levelName}</span>
                      </span>
                      <span className="shrink-0 font-mono text-xs text-subtle">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Quick Gate Finder */}
              <form
                onSubmit={handleGateJump}
                className="mt-4 border-t border-line/60 pt-3"
              >
                <label
                  htmlFor="gate-quick-jump"
                  className="label-caps block text-subtle"
                >
                  Find a gate
                </label>
                <div className="mt-2 flex items-center gap-2">
                  <TextInput
                    id="gate-quick-jump"
                    value={gateQuickJump}
                    onChange={(e) => setGateQuickJump(e.target.value)}
                    placeholder="B14"
                    maxLength={6}
                    className="h-10 font-mono uppercase"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                  >
                    Find
                  </Button>
                </div>
              </form>
            </Panel>
          ) : (
            <Panel className="p-4">
              <p className="label-caps text-subtle">Airfield</p>
              <dl className="mt-2.5 space-y-2.5 text-[13px]">
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted">IATA / ICAO</dt>
                  <dd className="text-right font-mono font-medium text-ink">
                    {airportNode.iata} / {airportNode.icao || "—"}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted">Timezone</dt>
                  <dd className="text-right font-mono text-ink">
                    {airportNode.timezone || "Not reported"}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted">Hub carriers</dt>
                  <dd className="max-w-[150px] text-right text-ink">
                    {airportNode.hubAirlines?.length
                      ? airportNode.hubAirlines.join(", ")
                      : "Not reported"}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted">Direct routes</dt>
                  <dd className="text-right font-medium text-ink">
                    {airportNode.destCount != null
                      ? `${airportNode.destCount} in catalog`
                      : "Not reported"}
                  </dd>
                </div>
              </dl>
            </Panel>
          )}

          {/* Amenity Category Filter (Indoor Mode) */}
          {layout && floor && (
            <Panel className="p-4">
              <p className="label-caps text-subtle">Indoor categories</p>
              <div className="mt-2.5 space-y-1">
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
                      type="button"
                      onClick={() => setCategory(cat)}
                      aria-pressed={active}
                      className={cn(
                        "flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-2.5 text-left text-[13px] transition-colors",
                        active
                          ? "bg-accent-soft font-medium text-accent"
                          : "text-muted hover:bg-surface-2 hover:text-ink",
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Icon
                          className="size-3.5 shrink-0"
                          style={{ color: active ? undefined : meta.color }}
                        />
                        <span className="truncate">{meta.label}</span>
                      </span>
                      <span className="shrink-0 font-mono text-xs text-subtle">
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
            <Panel className="p-4">
              <p className="label-caps text-subtle">Wayfinding</p>
              <div className="mt-2.5 space-y-2.5 text-[13px]">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-muted">
                    <Shield className="size-3.5 shrink-0" /> Origin
                  </span>
                  <span className="text-right font-medium text-ink">
                    Security (reference)
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-muted">
                    <MapPin className="size-3.5 shrink-0" /> Destination
                  </span>
                  <span className="max-w-[150px] truncate text-right font-medium text-ink">
                    {selected ? selected.name : "None selected"}
                  </span>
                </div>

                {selected && (
                  <div className="rounded-lg border border-line/60 bg-surface-2/40 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-muted">
                        <Footprints className="size-3.5" /> Walk time
                      </span>
                      <span className="font-medium text-ink">Illustrative</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs text-subtle">
                      <span>Distance</span>
                      <span className="font-mono">Not reported</span>
                    </div>
                  </div>
                )}
              </div>
            </Panel>
          )}
        </aside>

        {/* Center Main Viewport */}
        <div className="min-w-0 space-y-4">
          {viewMode === "INDOOR" && layout && floor ? (
            <TerminalMap
              layout={layout}
              floor={floor}
              amenities={amenities}
              selectedAmenity={selected}
              showWalkingRoute={walkingRoute}
              onSelectAmenity={selectAmenity}
              className="h-[520px] w-full lg:h-[600px]"
            />
          ) : (
            <AirportGroundsMap
              airport={airportNode}
              className="h-[520px] w-full lg:h-[600px]"
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
        </div>

        {/* Right Sidebar: Item Details, Boarding Flights, and Amenity Directory */}
        <aside className="space-y-4">
          {/* Selected Item Details */}
          {selected && (
            <Panel className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span
                    className="inline-block rounded-md px-2 py-1 text-xs font-medium text-[color:var(--bg)]"
                    style={{ backgroundColor: AMENITY_META[selected.category].color }}
                  >
                    {AMENITY_META[selected.category].label}
                  </span>
                  <h2 className="mt-2 text-[15px] font-semibold text-ink">
                    {selected.name}
                  </h2>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
                    {selected.locationDescription}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-subtle transition-colors hover:bg-surface-2 hover:text-ink"
                  aria-label="Close details"
                >
                  <X className="size-4" />
                </button>
              </div>

              <dl className="mt-3 space-y-2.5 border-t border-line/60 pt-3 text-[13px]">
                <div className="flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-1.5 text-muted">
                    <Clock className="size-3.5" /> Walk from security
                  </dt>
                  <dd className="font-medium text-ink">Illustrative</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-1.5 text-muted">
                    <Footprints className="size-3.5" /> Distance
                  </dt>
                  <dd className="font-mono text-ink">Not reported</dd>
                </div>
                {selected.openingHours && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted">Opening hours</dt>
                    <dd className="text-right font-medium text-ink">
                      {selected.openingHours}
                    </dd>
                  </div>
                )}
                {selected.accessInfo && (
                  <div className="rounded-lg bg-surface-2/50 p-3">
                    <p className="label-caps text-subtle">Access</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted">
                      {selected.accessInfo}
                    </p>
                  </div>
                )}
                {selected.features && selected.features.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {selected.features.map((feature, i) => (
                      <span
                        key={i}
                        className="rounded-md bg-surface-2 px-2 py-1 text-xs text-muted"
                      >
                        {feature}
                      </span>
                    ))}
                  </div>
                )}
              </dl>

              <div className="mt-4 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setWalkingRoute((val) => !val)}
                >
                  <Navigation className="size-4" />
                  {walkingRoute ? "Hide route" : "Show route"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Share wayfinding info"
                  title="Share wayfinding info"
                  onClick={() => {
                    const text = `${airportNode.iata} Terminal ${layout?.terminalId ?? ""} — ${selected.name} (${selected.locationDescription})`;
                    if (navigator.share) {
                      navigator.share({ title: selected.name, text }).catch(() => {});
                    } else {
                      void navigator.clipboard.writeText(text);
                    }
                  }}
                >
                  <Share2 className="size-4" />
                </Button>
              </div>
            </Panel>
          )}

          {/* Gate Departures / Live Flights */}
          {(gateDepartures.length > 0 ||
            flightsLoading ||
            Boolean(selected?.gateNumber) ||
            Boolean(flightsError)) && (
            <Panel className="p-4">
              <div className="mb-2.5 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="label-caps flex items-center gap-1.5 text-subtle">
                    <PlaneTakeoff className="size-3.5" />
                    {selected?.gateNumber
                      ? `Gate ${selected.gateNumber}`
                      : `${airportNode.iata} departures`}
                  </p>
                </div>
                {flightsLoading ? (
                  <span className="shrink-0 text-xs text-accent">Syncing…</span>
                ) : (
                  <span className="shrink-0 font-mono text-xs text-subtle">
                    {gateDepartures.length}
                    {flightsFetchedAt
                      ? ` · ${new Date(flightsFetchedAt).toLocaleTimeString()}`
                      : ""}
                  </span>
                )}
              </div>
              {flightsLoading && gateDepartures.length === 0 ? (
                <p className="py-4 text-center text-[13px] text-subtle">
                  Loading airport departures…
                </p>
              ) : flightsError ? (
                <p className="py-4 text-center text-[13px] leading-relaxed text-delayed">
                  {flightsError} No substitute board is shown.
                </p>
              ) : gateDepartures.length === 0 ? (
                <p className="py-4 text-center text-[13px] leading-relaxed text-muted">
                  No departures from {airportCode}
                  {selected?.gateNumber
                    ? ` at gate ${selected.gateNumber}`
                    : ""}{" "}
                  were returned by the provider&apos;s current board. This is not
                  proof that no flight operates.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {gateDepartures.map((flight) => (
                    <Link
                      key={`${flight.id}-${flight.flightDate ?? "any"}`}
                      href={
                        flight.flightDate
                          ? `/flight/${encodeURIComponent(flight.id)}?date=${encodeURIComponent(flight.flightDate)}`
                          : `/flight/${encodeURIComponent(flight.id)}`
                      }
                      className="flex min-h-14 items-center justify-between gap-2 rounded-lg border border-line/60 bg-surface-2/40 px-3 py-2 transition-colors hover:border-line-strong"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[13px] font-semibold text-ink">
                            {flight.flightNumber}
                          </span>
                          <span className="truncate text-xs text-subtle">
                            {flight.airline}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                          <span>{flight.origin.code}</span>
                          <ArrowRight className="size-3 text-subtle" />
                          <span className="font-medium text-ink">
                            {flight.destination.code}
                          </span>
                          {normalizeGate(flight.gateDeparture) && (
                            <span className="ml-1 font-mono text-accent">
                              {flight.gateDeparture}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <StatusBadge
                          status={flight.status}
                          statusReported={flight.statusReported}
                        />
                        <p className="mt-1 font-mono text-xs text-subtle">
                          {flight.departureTimeScheduled}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </Panel>
          )}

          {/* Directory Search & List (When CAD layout is available) */}
          {layout && floor && (
            <Panel className="flex max-h-[480px] flex-col p-4">
              <div>
                <p className="label-caps text-subtle">Terminal directory</p>
                <div className="relative mt-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
                  <TextInput
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Gate, lounge, coffee…"
                    className="h-10 pl-9 pr-9"
                    aria-label="Search terminal directory"
                    autoComplete="off"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-subtle hover:text-ink"
                      aria-label="Clear search"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-2 flex-1 divide-y divide-line/40 overflow-y-auto pr-1">
                {amenities.map((item) => {
                  const isSelected = selected?.id === item.id;
                  const meta = AMENITY_META[item.category];
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectAmenity(item)}
                      className={cn(
                        "flex min-h-14 w-full items-center justify-between gap-2 py-2.5 text-left transition-colors",
                        isSelected
                          ? "rounded-md bg-accent-soft px-2 font-medium text-accent"
                          : "px-2 text-muted hover:bg-surface-2",
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="size-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: meta.color }}
                          />
                          <span className="truncate text-[13px] font-medium text-ink">
                            {item.name}
                          </span>
                        </div>
                        <span className="mt-0.5 block truncate text-xs text-subtle">
                          {item.locationDescription}
                        </span>
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-subtle" />
                    </button>
                  );
                })}
                {amenities.length === 0 && (
                  <p className="py-6 text-center text-[13px] leading-relaxed text-subtle">
                    No indoor points match this filter on this level.
                  </p>
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
        title="Select airport"
        subtitle="Search the worldwide reference catalog, or pick a modelled terminal."
        size="md"
      >
        <div className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <TextInput
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              placeholder="City, airport name or IATA code"
              className="pl-9 pr-9"
              aria-label="Search airports"
              autoComplete="off"
              spellCheck={false}
            />
            {pickerSearch && (
              <button
                type="button"
                onClick={() => setPickerSearch("")}
                className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-subtle hover:text-ink"
                aria-label="Clear search"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {pickerSearch.trim() ? (
            <div className="max-h-[400px] divide-y divide-line/50 overflow-y-auto pr-1">
              {filteredAirports.map((airport) => {
                const hasCAD = terminalLayouts.some(
                  (t) => t.airportCode === airport.iata,
                );
                return (
                  <button
                    key={airport.iata}
                    type="button"
                    onClick={() => {
                      setAirportCode(airport.iata);
                      setAirportPickerOpen(false);
                    }}
                    className="flex min-h-14 w-full items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-surface-2"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[13px] font-semibold text-accent">
                          {airport.iata}
                        </span>
                        <span className="truncate text-[13px] font-medium text-ink">
                          {airport.name}
                        </span>
                        {hasCAD && (
                          <span className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-xs text-accent">
                            Indoor
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {airport.city}, {airport.country}
                        {airport.timezone ? ` · ${airport.timezone}` : ""}
                        {airport.historical ? " · historical" : ""}
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-subtle" />
                  </button>
                );
              })}
              {filteredAirports.length === 0 && (
                <p className="py-8 text-center text-[13px] text-subtle">
                  No airports match &ldquo;{pickerSearch}&rdquo;.
                </p>
              )}
            </div>
          ) : (
            <div>
              <p className="label-caps mb-2 text-subtle">
                Modelled terminals
              </p>
              <div className="grid max-h-[380px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {terminalLayouts.map((t) => (
                  <button
                    key={t.airportCode}
                    type="button"
                    onClick={() => {
                      setAirportCode(t.airportCode);
                      setLevel(t.availableLevels[0] ?? 1);
                      setSelected(null);
                      setAirportPickerOpen(false);
                    }}
                    aria-pressed={t.airportCode === airportCode}
                    className={cn(
                      "flex min-h-16 items-center justify-between gap-2 rounded-lg border p-3 text-left transition-colors",
                      t.airportCode === airportCode
                        ? "border-accent/40 bg-accent-soft"
                        : "border-line/60 bg-surface-2/40 hover:border-line-strong",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-accent">
                          {t.airportCode}
                        </span>
                        <span className="truncate text-[13px] font-medium text-ink">
                          {t.airportName}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {t.terminalName} · {t.city}
                      </p>
                      <p className="mt-1 flex items-center gap-1 font-mono text-xs text-subtle">
                        <Layers className="size-3" />
                        {t.availableLevels.length} levels · {t.amenities.length} points
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-subtle" />
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
