"use client";

import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
import { terminalLayouts } from "@/lib/data";
import type { AmenityCategory, TerminalAmenity } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AMENITY_META, TerminalMap } from "@/components/terminal-map";
import {
  Button,
  EmptyState,
  MetricTile,
  Modal,
  Panel,
} from "@/components/ui";

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

export default function AirportsPage() {
  const [airportCode, setAirportCode] = useState(
    terminalLayouts[0]?.airportCode ?? "JFK",
  );
  const layout = useMemo(
    () =>
      terminalLayouts.find((item) => item.airportCode === airportCode) ??
      terminalLayouts[0],
    [airportCode],
  );
  const [level, setLevel] = useState(
    layout?.availableLevels.includes(1) ? 1 : layout?.availableLevels[0] ?? 1,
  );
  const [category, setCategory] = useState<AmenityCategory>("ALL");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<TerminalAmenity | null>(null);
  const [walkingRoute, setWalkingRoute] = useState(true);
  const [airportPickerOpen, setAirportPickerOpen] = useState(false);
  const [gateQuickJump, setGateQuickJump] = useState("");

  const floor =
    layout?.floors[String(level)] ??
    layout?.floors[String(layout.availableLevels[0])] ??
    Object.values(layout?.floors ?? {})[0];

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

  // Deep-link support from flight detail or external parameters
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const code = (params.get("airport") || params.get("code"))?.toUpperCase();
    const gate = params.get("gate");
    if (code) {
      const next = terminalLayouts.find((item) => item.airportCode === code);
      if (next) setAirportCode(code);
    }
    if (gate && layout) {
      const clean = gate.replace(/^Gate\s*/i, "").trim();
      const matched = layout.amenities.find(
        (amenity) =>
          amenity.gateNumber?.toLowerCase() === clean.toLowerCase() ||
          amenity.name.toLowerCase().includes(clean.toLowerCase()),
      );
      if (matched) {
        setLevel(matched.level);
        setSelected(matched);
        setWalkingRoute(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout?.airportCode]);

  useEffect(() => {
    if (!layout) return;
    if (!layout.availableLevels.includes(level)) {
      setLevel(layout.availableLevels[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout?.airportCode]);

  if (!layout || !floor) {
    return (
      <div className="p-6">
        <Panel>
          <EmptyState
            icon={<Layers className="size-6" />}
            title="Airport indoor map unavailable"
            description="This airport does not have an indoor layout configured yet. Try JFK, LHR, SFO, or DXB."
          />
        </Panel>
      </div>
    );
  }

  const categoryCounts = new Map<AmenityCategory, number>();
  for (const item of layout.amenities) {
    if (item.level !== floor.level) continue;
    categoryCounts.set(item.category, (categoryCounts.get(item.category) ?? 0) + 1);
  }

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
      setGateQuickJump("");
    }
  };

  return (
    <div className="mx-auto max-w-[1680px] px-4 py-4 lg:px-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="label-caps text-accent">Indoor Airport Navigation & Wayfinding</p>
          <h2 className="mt-1 flex items-center gap-2 text-xl font-black tracking-tight text-ink">
            {layout.airportCode} Indoor Airport Map
            <span className="rounded-md border border-accent/35 bg-accent-soft px-1.5 py-0.5 font-mono text-[10px] font-bold text-accent">
              {layout.terminalId}
            </span>
            <span className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[8px] font-bold text-subtle">
              LIVE INDOOR RADAR
            </span>
          </h2>
          <p className="mt-1 max-w-xl text-[11px] text-muted">
            {layout.airportName} · {layout.terminalName} · {layout.city}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAirportPickerOpen(true)}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-accent/35 bg-surface-2 px-2.5 text-[10px] font-bold text-accent transition-colors hover:bg-accent-soft"
          >
            <Building2 className="size-3.5" />
            Switch airport ({layout.airportCode})
            <ChevronRight className="size-3" />
          </button>
          <Link href="/airplanes">
            <Button size="sm" variant="outline">
              <Plane className="size-3.5 text-accent" /> Airplane seatmaps
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[240px_minmax(0,1fr)_330px]">
        {/* Left controls */}
        <aside className="space-y-2.5">
          <Panel className="p-3">
            <p className="label-caps text-subtle">Airport & Terminal</p>
            <button
              onClick={() => setAirportPickerOpen(true)}
              className="mt-1.5 flex w-full items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-2 text-left transition-colors hover:border-accent/40"
            >
              <span className="flex size-7 items-center justify-center rounded-md bg-accent-soft font-mono text-[10px] font-bold text-accent">
                {layout.airportCode}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[10px] font-bold text-ink">
                  {layout.terminalId} · {layout.city}
                </span>
                <span className="block truncate text-[8px] text-subtle">
                  {layout.terminalName}
                </span>
              </span>
            </button>

            {/* Quick Gate Finder */}
            <form onSubmit={handleGateJump} className="mt-2.5">
              <label className="label-caps block text-[8px] text-subtle">Quick Gate Finder</label>
              <div className="mt-1 flex items-center gap-1">
                <input
                  type="text"
                  placeholder="e.g. A3, B22..."
                  value={gateQuickJump}
                  onChange={(e) => setGateQuickJump(e.target.value)}
                  className="h-7 w-full rounded-md border border-line bg-surface px-2 text-[10px] text-ink placeholder:text-subtle focus:border-accent focus:outline-none"
                />
                <Button type="submit" size="sm" variant="outline" className="h-7 px-2 text-[9px]">
                  Go
                </Button>
              </div>
            </form>

            <div className="mt-3 space-y-1">
              <p className="label-caps mb-1 text-[8px] text-subtle">Concourse Levels</p>
              {layout.availableLevels.map((levelValue) => {
                const levelFloor = layout.floors[String(levelValue)];
                if (!levelFloor) return null;
                const active = levelValue === floor.level;
                return (
                  <button
                    key={levelValue}
                    onClick={() => {
                      setLevel(levelValue);
                      setSelected(null);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-left text-[10px] transition-colors",
                      active
                        ? "border-accent/50 bg-accent-soft font-bold text-accent"
                        : "border-line bg-surface-2 text-ink hover:bg-surface-3",
                    )}
                  >
                    <span>
                      <span className="font-mono font-bold">L{levelValue}</span>{" "}
                      {levelFloor.levelName}
                    </span>
                    <span className="text-[8px] text-subtle">
                      {layout.amenities.filter((a) => a.level === levelValue).length} pts
                    </span>
                  </button>
                );
              })}
            </div>
          </Panel>

          {/* Amenity category filters */}
          <Panel className="p-3">
            <p className="label-caps text-subtle">Indoor Categories</p>
            <div className="mt-1.5 space-y-1">
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
                      "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[10px] transition-colors",
                      active
                        ? "bg-accent-soft font-bold text-accent"
                        : "text-muted hover:bg-surface-2 hover:text-ink",
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      <Icon
                        className="size-3"
                        style={{ color: active ? undefined : meta.color }}
                      />
                      <span>{meta.label}</span>
                    </span>
                    <span
                      className={cn(
                        "rounded px-1 font-mono text-[8px]",
                        active ? "bg-accent/20 text-accent" : "text-subtle",
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </Panel>

          {/* Quick Route summary */}
          <Panel className="p-3">
            <p className="label-caps text-subtle">Wayfinding Engine</p>
            <div className="mt-2 space-y-2 text-[10px]">
              <div className="flex items-center justify-between text-muted">
                <span className="flex items-center gap-1">
                  <Shield className="size-3 text-red-400" /> Origin:
                </span>
                <span className="font-semibold text-ink">Main Security TSA</span>
              </div>
              <div className="flex items-center justify-between text-muted">
                <span className="flex items-center gap-1">
                  <MapPin className="size-3 text-accent" /> Destination:
                </span>
                <span className="font-semibold text-ink">
                  {selected ? selected.name : "Select point on map"}
                </span>
              </div>
              {selected && (
                <div className="rounded-md border border-accent/20 bg-accent-soft p-2 text-accent">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 font-bold">
                      <Footprints className="size-3" /> Walk time:
                    </span>
                    <span className="font-mono font-bold text-ink">
                      {selected.walkTimeFromSecurityMinutes} min
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[8px] text-subtle">
                    <span>Direct distance:</span>
                    <span className="font-mono">
                      {selected.walkDistanceMeters} m / ~{Math.round(selected.walkDistanceMeters * 3.28)} ft
                    </span>
                  </div>
                </div>
              )}
            </div>
          </Panel>
        </aside>

        {/* Center: The Indoor Map */}
        <main className="space-y-3">
          <TerminalMap
            layout={layout}
            floor={floor}
            amenities={amenities}
            selectedAmenity={selected}
            showWalkingRoute={walkingRoute}
            onSelectAmenity={selectAmenity}
          />

          {/* Level description & metrics */}
          <div className="grid gap-2 sm:grid-cols-4">
            <MetricTile
              label="Concourse Level"
              value={`L${floor.level} · ${floor.levelName}`}
              sub={floor.description}
            />
            <MetricTile
              label="Active Gates"
              value={String(layout.amenities.filter((a) => a.category === "GATE" && a.level === floor.level).length)}
              sub="Departures & arrivals"
            />
            <MetricTile
              label="Lounges & Dining"
              value={String(
                layout.amenities.filter(
                  (a) => (a.category === "LOUNGE" || a.category === "DINING") && a.level === floor.level,
                ).length,
              )}
              sub="Retail & food court"
            />
            <MetricTile
              label="Security Throughput"
              value="~8-12 min"
              sub="Standard & PreCheck"
            />
          </div>
        </main>

        {/* Right: Directory list and selected details */}
        <aside className="space-y-2.5">
          {selected ? (
            <Panel className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span
                    className="inline-block rounded px-1.5 py-0.5 text-[8px] font-bold text-white"
                    style={{ backgroundColor: AMENITY_META[selected.category].color }}
                  >
                    {AMENITY_META[selected.category].label}
                  </span>
                  <h3 className="mt-1 text-sm font-black text-ink">{selected.name}</h3>
                  <p className="text-[10px] text-muted">{selected.locationDescription}</p>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="rounded p-1 text-subtle hover:bg-surface-2 hover:text-ink"
                >
                  <X className="size-3.5" />
                </button>
              </div>

              <div className="mt-3 space-y-2 border-t border-line pt-3 text-[10px]">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-muted">
                    <Clock className="size-3 text-accent" /> Walk from security
                  </span>
                  <span className="font-mono font-bold text-accent">
                    ~{selected.walkTimeFromSecurityMinutes} min
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-muted">
                    <Footprints className="size-3" /> Concourse distance
                  </span>
                  <span className="font-mono text-ink">
                    {selected.walkDistanceMeters} m
                  </span>
                </div>
                {selected.openingHours && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Opening hours</span>
                    <span className="text-ink">{selected.openingHours}</span>
                  </div>
                )}
                {selected.accessInfo && (
                  <div>
                    <span className="text-[8px] uppercase tracking-wider text-subtle">
                      Access & Eligibility
                    </span>
                    <p className="mt-0.5 text-[10px] text-muted">{selected.accessInfo}</p>
                  </div>
                )}
              </div>

              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setWalkingRoute((val) => !val)}
                >
                  <Navigation className="size-3" />
                  {walkingRoute ? "Hide route" : "Show route"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const text = `${layout.airportCode} Terminal ${layout.terminalId} - ${selected.name} (${selected.locationDescription})`;
                    if (navigator.share) {
                      navigator.share({ title: selected.name, text }).catch(() => {});
                    } else {
                      navigator.clipboard.writeText(text);
                    }
                  }}
                >
                  <Share2 className="size-3" />
                </Button>
              </div>
            </Panel>
          ) : null}

          {/* Directory Search & List */}
          <Panel className="flex max-h-[520px] flex-col p-3">
            <div className="mb-2">
              <p className="label-caps text-subtle">Terminal Directory</p>
              <div className="relative mt-1.5">
                <Search className="absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-subtle" />
                <input
                  type="text"
                  placeholder="Search gate, lounge, coffee..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="h-7 w-full rounded-md border border-line bg-surface-2 pl-7 pr-7 text-[10px] text-ink placeholder:text-subtle focus:border-accent focus:outline-none"
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-subtle hover:text-ink"
                  >
                    <X className="size-3" />
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
                          className="size-1.5 rounded-full"
                          style={{ backgroundColor: meta.color }}
                        />
                        <span className="truncate text-[10px] font-semibold text-ink">
                          {item.name}
                        </span>
                      </div>
                      <span className="block truncate text-[8px] text-subtle">
                        {item.locationDescription}
                      </span>
                    </div>
                    <span className="shrink-0 font-mono text-[9px] text-muted">
                      {item.walkTimeFromSecurityMinutes}m
                    </span>
                  </button>
                );
              })}
              {amenities.length === 0 && (
                <div className="py-6 text-center text-[10px] text-subtle">
                  No indoor points match your filter on this level.
                </div>
              )}
            </div>
          </Panel>
        </aside>
      </div>

      {/* Airport Switcher Modal */}
      <Modal
        open={airportPickerOpen}
        onClose={() => setAirportPickerOpen(false)}
        title="Select Airport Indoor Layout"
      >
        <div className="space-y-2 py-1">
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
                "flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors",
                t.airportCode === airportCode
                  ? "border-accent bg-accent-soft"
                  : "border-line bg-surface-2 hover:bg-surface-3",
              )}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-black text-accent">
                    {t.airportCode}
                  </span>
                  <span className="text-xs font-bold text-ink">{t.airportName}</span>
                </div>
                <p className="mt-0.5 text-[10px] text-muted">
                  {t.terminalName} · {t.city}
                </p>
              </div>
              <ChevronRight className="size-4 text-subtle" />
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
