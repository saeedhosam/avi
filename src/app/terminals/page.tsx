"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  ChevronRight,
  Clock,
  Coffee,
  Compass,
  DoorOpen,
  Layers,
  Navigation,
  Search,
  Shield,
  ShoppingBag,
  Star,
  Ticket,
  Toilet,
  Users,
  Footprints,
  X,
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

export default function TerminalsPage() {
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

  // Deep-link support from flight detail / airport boards.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("airport")?.toUpperCase();
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
            title="Terminal layout unavailable"
            description="This airport does not have a terminal layout yet. Try JFK, LHR, SFO, or DXB."
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

  return (
    <div className="mx-auto max-w-[1680px] px-4 py-4 lg:px-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="label-caps text-accent">Gate-level wayfinding</p>
          <h2 className="mt-1 flex items-center gap-2 text-xl font-black tracking-tight text-ink">
            {layout.airportCode} Terminal Map
            <span className="rounded-md border border-accent/35 bg-accent-soft px-1.5 py-0.5 font-mono text-[10px] font-bold text-accent">
              {layout.terminalId}
            </span>
          </h2>
          <p className="mt-1 max-w-xl text-[11px] text-muted">
            {layout.terminalName} · {layout.city}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAirportPickerOpen(true)}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-accent/35 bg-surface-2 px-2.5 text-[10px] font-bold text-accent transition-colors hover:bg-accent-soft"
          >
            <Building2 className="size-3.5" />
            Switch airport
            <ChevronRight className="size-3" />
          </button>
          <Link href={`/airports?code=${layout.airportCode}`}>
            <Button size="sm" variant="outline">
              <PlaneIcon /> Flight board
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[240px_minmax(0,1fr)_330px]">
        {/* Left controls */}
        <aside className="space-y-2.5">
          <Panel className="p-3">
            <p className="label-caps text-subtle">Terminal</p>
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
            <div className="mt-2 space-y-1">
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
                      "flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors",
                      active
                        ? "border-accent/50 bg-accent-soft"
                        : "border-line/60 bg-surface-2 hover:border-accent/35",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-5 items-center justify-center rounded font-mono text-[9px] font-bold",
                        active
                          ? "bg-accent text-[color:var(--bg)]"
                          : "bg-surface-3 text-muted",
                      )}
                    >
                      {levelValue}
                    </span>
                    <span className="min-w-0">
                      <span
                        className={cn(
                          "block truncate text-[9px] font-bold",
                          active ? "text-accent" : "text-ink",
                        )}
                      >
                        {levelFloor.levelName}
                      </span>
                      <span className="block truncate text-[8px] text-subtle">
                        {levelFloor.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel className="p-3">
            <p className="label-caps text-subtle">Find amenities</p>
            <div className="relative mt-1.5">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-accent" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Gate B22, lounge, dining…"
                className="h-8 w-full rounded-lg border border-line bg-surface-2 pl-8 pr-7 text-[10px] text-ink outline-none placeholder:text-subtle focus:border-accent"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-subtle hover:text-ink"
                  aria-label="Clear search"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
            <div className="mt-2 space-y-1">
              {CATEGORY_ORDER.map((item) => {
                const Icon = CATEGORY_ICONS[item];
                const meta = AMENITY_META[item];
                const count =
                  item === "ALL"
                    ? layout.amenities.filter((a) => a.level === floor.level).length
                    : categoryCounts.get(item) ?? 0;
                const active = category === item;
                return (
                  <button
                    key={item}
                    onClick={() => setCategory(item)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-[10px] font-semibold transition-colors",
                      active
                        ? "border-accent/50 bg-accent-soft text-accent"
                        : "border-transparent text-muted hover:bg-surface-2 hover:text-ink",
                    )}
                  >
                    <span
                      className="flex size-5 items-center justify-center rounded-md"
                      style={{
                        color: meta.color,
                        backgroundColor: `${meta.color}18`,
                      }}
                    >
                      <Icon className="size-3" />
                    </span>
                    <span className="min-w-0 flex-1 text-left">{meta.label}</span>
                    <span className="rounded-full bg-surface-3 px-1.5 py-0.5 text-[8px] tabular text-subtle">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </Panel>

          <div className="rounded-xl border border-dashed border-line bg-surface-2/50 px-2.5 py-2">
            <p className="flex items-center gap-1.5 text-[9px] font-bold text-muted">
              <Footprints className="size-3 text-accent" /> Walking guidance
            </p>
            <p className="mt-1 text-[8px] leading-relaxed text-subtle">
              Select any amenity to draw the shortest path from security through
              the central hub, with walk time and distance.
            </p>
          </div>
        </aside>

        {/* Map */}
        <div className="min-w-0">
          <TerminalMap
            layout={layout}
            floor={floor}
            amenities={amenities}
            selectedAmenity={selected}
            showWalkingRoute={walkingRoute}
            onSelectAmenity={selectAmenity}
            className="aspect-[16/10] max-h-[560px] min-h-[380px] w-full"
          />
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MetricTile
              label="Level"
              value={floor.level}
              sub={floor.levelName}
              accent
            />
            <MetricTile
              label="Amenities"
              value={amenities.length}
              sub="On this floor"
            />
            <MetricTile
              label="Security"
              value="Central"
              sub="Main checkpoint"
            />
            <MetricTile
              label="Directory"
              value={layout.amenities.length}
              sub="Total venues"
            />
          </div>
        </div>

        {/* Directory / detail */}
        <aside className="space-y-2.5">
          {selected ? (
            <Panel className="overflow-hidden">
              <div className="flex items-start justify-between gap-2 border-b border-line/60 p-3">
                <div className="flex items-start gap-2">
                  <span
                    className="mt-0.5 flex size-8 items-center justify-center rounded-lg border"
                    style={{
                      color: AMENITY_META[selected.category].color,
                      backgroundColor: `${AMENITY_META[selected.category].color}16`,
                      borderColor: `${AMENITY_META[selected.category].color}55`,
                    }}
                  >
                    {(() => {
                      const Icon = CATEGORY_ICONS[selected.category];
                      return <Icon className="size-4" />;
                    })()}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold leading-tight text-ink">
                      {selected.name}
                    </p>
                    <p className="mt-0.5 text-[9px] text-subtle">
                      {AMENITY_META[selected.category].label} · {selected.terminal} ·{" "}
                      {selected.concourse}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="text-subtle hover:text-ink"
                  aria-label="Clear selected amenity"
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <div className="space-y-2 p-3">
                <p className="text-[10px] leading-relaxed text-muted">
                  {selected.locationDescription}
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  <MiniDetail
                    icon={<Clock className="size-3" />}
                    label="Hours"
                    value={selected.openingHours}
                  />
                  <MiniDetail
                    icon={<Footprints className="size-3" />}
                    label="From security"
                    value={`${selected.walkTimeFromSecurityMinutes} min · ${selected.walkDistanceMeters} m`}
                  />
                  {selected.gateNumber && (
                    <MiniDetail
                      icon={<DoorOpen className="size-3" />}
                      label="Gate"
                      value={selected.gateNumber}
                    />
                  )}
                  {selected.waitTimeMinutes != null && (
                    <MiniDetail
                      icon={<Users className="size-3" />}
                      label="Wait time"
                      value={`${selected.waitTimeMinutes} min`}
                    />
                  )}
                </div>
                {selected.accessInfo && (
                  <p className="rounded-md border border-accent/25 bg-accent-soft px-2 py-1.5 text-[9px] leading-relaxed text-accent">
                    {selected.accessInfo}
                  </p>
                )}
                {selected.rating != null && (
                  <p className="flex items-center gap-1 text-[9px] font-semibold text-delayed">
                    <Star className="size-3 fill-current" /> {selected.rating.toFixed(1)} guest
                    rating
                  </p>
                )}
                {selected.features.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selected.features.map((feature) => (
                      <span
                        key={feature}
                        className="rounded-md border border-line/60 bg-surface-2 px-1.5 py-0.5 text-[8px] text-muted"
                      >
                        {feature}
                      </span>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => setWalkingRoute((value) => !value)}
                  className={cn(
                    "flex w-full items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[9px] font-bold transition-colors",
                    walkingRoute
                      ? "border-accent/50 bg-accent-soft text-accent"
                      : "border-line bg-surface-2 text-muted hover:text-ink",
                  )}
                >
                  <Navigation className="size-3" />
                  {walkingRoute ? "Walking route active" : "Show walking route"}
                </button>
              </div>
            </Panel>
          ) : (
            <Panel className="p-3">
              <p className="label-caps text-subtle">Terminal directory</p>
              <p className="mt-1 text-[9px] leading-relaxed text-muted">
                Select a gate, lounge, restaurant, or service on the map or from
                the list to view its details and walking route.
              </p>
            </Panel>
          )}

          <Panel className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line/60 px-3 py-2">
              <p className="label-caps text-subtle">
                Directory · {amenities.length}
              </p>
              <span className="text-[8px] text-subtle">Level {floor.level}</span>
            </div>
            <div className="max-h-[420px] overflow-y-auto p-2">
              {amenities.length === 0 ? (
                <EmptyState
                  icon={<Search className="size-5" />}
                  title="No amenities found"
                  description="Adjust the category or search query to see more venues on this level."
                  className="py-8"
                />
              ) : (
                <div className="space-y-1">
                  {amenities.map((amenity) => {
                    const meta = AMENITY_META[amenity.category];
                    const Icon = CATEGORY_ICONS[amenity.category];
                    const active = selected?.id === amenity.id;
                    return (
                      <button
                        key={amenity.id}
                        onClick={() => selectAmenity(amenity)}
                        className={cn(
                          "flex w-full items-start gap-2 rounded-lg border p-2 text-left transition-colors",
                          active
                            ? "border-accent/50 bg-accent-soft"
                            : "border-line/50 bg-surface-2/60 hover:border-accent/35",
                        )}
                      >
                        <span
                          className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md"
                          style={{
                            color: meta.color,
                            backgroundColor: `${meta.color}16`,
                          }}
                        >
                          <Icon className="size-3" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[10px] font-semibold text-ink">
                            {amenity.name}
                          </span>
                          <span className="mt-0.5 block truncate text-[8px] text-subtle">
                            {amenity.gateNumber ? `Gate ${amenity.gateNumber} · ` : ""}
                            {amenity.concourse}
                          </span>
                        </span>
                        <ChevronRight className="mt-1 size-3 shrink-0 text-subtle" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </Panel>
        </aside>
      </div>

      <Modal
        open={airportPickerOpen}
        onClose={() => setAirportPickerOpen(false)}
        title="Select terminal"
        subtitle="Choose an airport terminal layout with gate-level wayfinding."
        icon={<Building2 className="size-4" />}
        size="md"
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {terminalLayouts.map((item) => (
            <button
              key={item.airportCode}
              onClick={() => {
                setAirportCode(item.airportCode);
                setCategory("ALL");
                setQuery("");
                setSelected(null);
                setAirportPickerOpen(false);
              }}
              className={cn(
                "rounded-xl border p-3 text-left transition-colors",
                item.airportCode === airportCode
                  ? "border-accent/50 bg-accent-soft"
                  : "border-line bg-surface-2 hover:border-accent/40",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-black text-accent">
                  {item.airportCode}
                </span>
                <span className="rounded-md border border-line bg-surface px-1.5 py-0.5 text-[8px] font-bold text-muted">
                  {item.terminalId}
                </span>
              </div>
              <p className="mt-1 text-[10px] font-semibold text-ink">
                {item.city}
              </p>
              <p className="mt-0.5 text-[8px] text-subtle">{item.terminalName}</p>
              <p className="mt-1 text-[8px] text-muted">
                {item.amenities.length} amenities · {item.availableLevels.length} levels
              </p>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function PlaneIcon() {
  return <Compass className="size-3.5" />;
}

function MiniDetail({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-line/60 bg-surface-2 px-2 py-1.5">
      <p className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider text-subtle">
        <span className="text-accent">{icon}</span>
        {label}
      </p>
      <p className="mt-0.5 truncate text-[9px] font-semibold text-ink">{value}</p>
    </div>
  );
}
