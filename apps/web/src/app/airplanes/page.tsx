"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Armchair,
  Check,
  ChevronRight,
  Info,
  Plane,
  Sparkles,
  Tv,
  Wifi,
  Wind,
  X,
  Zap,
} from "lucide-react";
import {
  AIRCRAFT_PRESETS,
  findAircraft,
  getAircraftById,
} from "@/lib/airplane-data";
import type { AircraftCabinSpec, CabinClass, SeatInfo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button, MetricTile, Modal, Panel } from "@/components/ui";

const CABIN_COLORS: Record<CabinClass, { label: string; badgeBg: string; text: string }> = {
  FIRST: { label: "First Class", badgeBg: "bg-amber-500/15 border-amber-500/40", text: "text-amber-400" },
  BUSINESS: { label: "Business Class", badgeBg: "bg-purple-500/15 border-purple-500/40", text: "text-purple-400" },
  PREMIUM_ECONOMY: { label: "Premium Economy", badgeBg: "bg-blue-500/15 border-blue-500/40", text: "text-blue-400" },
  ECONOMY: { label: "Economy Class", badgeBg: "bg-cyan-500/15 border-cyan-500/40", text: "text-cyan-400" },
};

export default function AirplanesPage() {
  const [selectedAircraftId, setSelectedAircraftId] = useState(
    AIRCRAFT_PRESETS[0]?.id ?? "MS-A320NEO",
  );
  const [activeCabinFilter, setActiveCabinFilter] = useState<CabinClass | "ALL">("ALL");
  const [selectedSeat, setSelectedSeat] = useState<SeatInfo | null>(null);
  const [mySeatId, setMySeatId] = useState<string | null>(null);
  const [aircraftPickerOpen, setAircraftPickerOpen] = useState(false);
  const [seatSearch, setSeatSearch] = useState("");

  const aircraft = useMemo<AircraftCabinSpec | null>(
    () => getAircraftById(selectedAircraftId),
    [selectedAircraftId],
  );

  // Deep-link support (?airline=MS&model=A320 or ?plane=MS-B789)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const plane = params.get("plane") || params.get("id");
    const airline = params.get("airline");
    const model = params.get("model");
    if (plane) {
      const match = AIRCRAFT_PRESETS.find((a) => a.id.toLowerCase() === plane.toLowerCase());
      if (match) setSelectedAircraftId(match.id);
    } else if (airline || model) {
      const matched = findAircraft(airline ?? undefined, model ?? undefined);
      if (matched) setSelectedAircraftId(matched.id);
    }
  }, []);

  const visibleRows = useMemo(() => {
    if (!aircraft) return [];
    if (activeCabinFilter === "ALL") return aircraft.rows;
    return aircraft.rows.filter((r) => r.cabin === activeCabinFilter);
  }, [aircraft, activeCabinFilter]);

  const handleSeatSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!seatSearch.trim() || !aircraft) return;
    const clean = seatSearch.trim().toUpperCase();
    for (const r of aircraft.rows) {
      const match = r.seats.find((s) => s.id === clean);
      if (match) {
        setSelectedSeat(match);
        setActiveCabinFilter("ALL");
        setSeatSearch("");
        return;
      }
    }
  };

  if (!aircraft) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Panel className="p-6 text-center">
          <p className="text-sm font-bold text-ink">Seatmap unavailable</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            AeroQuest does not have an illustrative configuration for this aircraft.
            No substitute aircraft is shown.
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
    <div className="mx-auto max-w-[1680px] px-4 py-4 lg:px-6">
      <div className="mb-3 flex items-start gap-2 rounded-xl border border-delayed/30 bg-delayed/10 px-3 py-2 text-[10px] leading-relaxed text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0 text-delayed" />
        <span>
          This page is an illustrative aircraft and seat configuration reference.
          It is not tied to your flight, and seat availability, Wi-Fi, and
          passenger reviews are not live data.
        </span>
      </div>

      {/* Top Header */}
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="label-caps text-accent">Aircraft Cabin Radar & Seat Configuration</p>
          <h2 className="mt-1 flex items-center gap-2 text-xl font-black tracking-tight text-ink">
            {aircraft.airlineName} {aircraft.aircraftModel}
            <span
              className="rounded-md border border-accent/35 bg-accent-soft px-1.5 py-0.5 font-mono text-[10px] font-bold text-accent"
              title="Sample registration, not this flight's aircraft"
            >
              SAMPLE · {aircraft.tailNumberSample}
            </span>
            <span className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[8px] font-bold text-subtle">
              {aircraft.totalSeats} SEATS
            </span>
          </h2>
          <p className="mt-1 max-w-xl text-[11px] text-muted">
            Manufacturer: {aircraft.manufacturer} · Standard commercial airline passenger configuration
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAircraftPickerOpen(true)}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-accent/35 bg-surface-2 px-2.5 text-[10px] font-bold text-accent transition-colors hover:bg-accent-soft"
          >
            <Plane className="size-3.5" />
            Switch aircraft ({aircraft.airlineCode} {aircraft.aircraftModel})
            <ChevronRight className="size-3" />
          </button>
          <Link href="/airports">
            <Button size="sm" variant="outline">
              <Building2 className="size-3.5 text-accent" /> Airport indoor maps
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[280px_minmax(0,1fr)_340px]">
        {/* Left column: Cabin specifications & filters */}
        <aside className="space-y-2.5">
          {/* Quick Aircraft Switcher Card */}
          <Panel className="p-3">
            <p className="label-caps text-subtle">Illustrative aircraft configuration</p>
            <button
              onClick={() => setAircraftPickerOpen(true)}
              className="mt-1.5 flex w-full items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-2 text-left transition-colors hover:border-accent/40"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-soft font-mono text-[11px] font-bold text-accent">
                {aircraft.airlineCode}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-bold text-ink">
                  {aircraft.airlineName}
                </p>
                <p className="truncate text-[9px] text-muted">
                  {aircraft.aircraftModel} · {aircraft.totalSeats} pax
                </p>
              </div>
            </button>

            {/* Quick seat jump */}
            <form onSubmit={handleSeatSearch} className="mt-2.5">
              <label className="label-caps block text-[8px] text-subtle">Find Specific Seat</label>
              <div className="mt-1 flex items-center gap-1">
                <input
                  type="text"
                  placeholder="e.g. 1A, 12F, 24C..."
                  value={seatSearch}
                  onChange={(e) => setSeatSearch(e.target.value)}
                  className="h-7 w-full rounded-md border border-line bg-surface px-2 text-[10px] text-ink placeholder:text-subtle focus:border-accent focus:outline-none uppercase"
                />
                <Button type="submit" size="sm" variant="outline" className="h-7 px-2 text-[9px]">
                  Find
                </Button>
              </div>
            </form>
          </Panel>

          {/* Cabin Class Filter */}
          <Panel className="p-3">
            <p className="label-caps text-subtle">Cabin Classes</p>
            <div className="mt-1.5 space-y-1">
              <button
                onClick={() => setActiveCabinFilter("ALL")}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[10px] transition-colors",
                  activeCabinFilter === "ALL"
                    ? "bg-accent-soft font-bold text-accent"
                    : "text-muted hover:bg-surface-2 hover:text-ink",
                )}
              >
                <span>Full Aircraft Cabin</span>
                <span className="font-mono text-[8px] text-subtle">{aircraft.totalSeats} seats</span>
              </button>
              {aircraft.cabins.map((cabin) => {
                const active = activeCabinFilter === cabin.classType;
                const meta = CABIN_COLORS[cabin.classType];
                const count = aircraft.rows
                  .filter((r) => r.cabin === cabin.classType)
                  .reduce((acc, r) => acc + r.seats.length, 0);
                return (
                  <button
                    key={cabin.name}
                    onClick={() => setActiveCabinFilter(cabin.classType)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[10px] transition-colors",
                      active
                        ? "bg-accent-soft font-bold text-accent"
                        : "text-muted hover:bg-surface-2 hover:text-ink",
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className={cn("size-2 rounded-full", meta.text.replace("text-", "bg-"))} />
                      <span className="font-semibold">{cabin.name}</span>
                    </span>
                    <span className="font-mono text-[8px] text-subtle">
                      {cabin.layout} · {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </Panel>

          {/* Onboard Amenities */}
          <Panel className="p-3">
            <p className="label-caps text-subtle">Onboard Amenities & Tech</p>
            <div className="mt-2 space-y-2.5 text-[10px]">
              <div className="flex items-start gap-2 text-muted">
                <Wifi className="mt-0.5 size-3.5 shrink-0 text-cyan-400" />
                <div>
                  <p className="font-semibold text-ink">Satellite Wi-Fi</p>
                  <p className="text-[8px] text-subtle">{aircraft.amenities.wifi}</p>
                </div>
              </div>
              <div className="flex items-start gap-2 text-muted">
                <Zap className="mt-0.5 size-3.5 shrink-0 text-amber-400" />
                <div>
                  <p className="font-semibold text-ink">Seat Power & USB</p>
                  <p className="text-[8px] text-subtle">{aircraft.amenities.power}</p>
                </div>
              </div>
              <div className="flex items-start gap-2 text-muted">
                <Tv className="mt-0.5 size-3.5 shrink-0 text-purple-400" />
                <div>
                  <p className="font-semibold text-ink">In-Flight Entertainment</p>
                  <p className="text-[8px] text-subtle">{aircraft.amenities.ife}</p>
                </div>
              </div>
              <div className="flex items-start gap-2 text-muted">
                <Wind className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
                <div>
                  <p className="font-semibold text-ink">Overhead Storage</p>
                  <p className="text-[8px] text-subtle">{aircraft.amenities.overheadBins}</p>
                </div>
              </div>
            </div>
          </Panel>

          {/* Seat Map Legend */}
          <Panel className="p-3">
            <p className="label-caps text-subtle">Seat Legend</p>
            <div className="mt-2 space-y-2 text-[9px] text-muted">
              <div className="rounded-lg border border-delayed/30 bg-delayed/10 px-2 py-1.5 text-[9px] leading-relaxed text-muted">
                Seat availability is <strong>not connected</strong>. This is an
                illustrative cabin configuration, not live inventory.
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-1.5">
                  <div className="size-3.5 rounded-sm border border-amber-500/60 bg-amber-500/25" />
                  <span>Exit / Extra Space</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="size-3.5 rounded-sm border-2 border-accent bg-accent/40 shadow-[0_0_8px_rgba(0,229,255,0.4)]" />
                  <span>Selected</span>
                </div>
              </div>
            </div>
          </Panel>
        </aside>

        {/* Center: Fuselage & Interactive Seat Map */}
        <main className="space-y-3">
          <Panel className="relative overflow-hidden p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-accent">CABIN SEATMAP</span>
                <span className="text-[10px] text-muted">
                  Illustrative reference configuration — not live seat availability
                </span>
              </div>
              {mySeatId && (
                <div className="flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent-soft px-2 py-0.5 text-[9px] font-bold text-accent">
                  <Check className="size-3" />
                  Selected: {mySeatId}
                </div>
              )}
            </div>

            {/* Fuselage Container */}
            <div className="mx-auto max-w-xl">
              {/* Cockpit / Nose */}
              <div className="relative mx-auto mb-4 flex h-14 w-44 flex-col items-center justify-center rounded-t-[40px] border-2 border-b-0 border-line bg-surface-2 shadow-inner">
                <div className="flex gap-2">
                  <div className="h-4 w-7 rounded-t-lg border border-accent/40 bg-accent/15" />
                  <div className="h-4 w-7 rounded-t-lg border border-accent/40 bg-accent/15" />
                </div>
                <span className="mt-1 font-mono text-[8px] font-bold tracking-widest text-subtle">
                  COCKPIT / NOSE
                </span>
              </div>

              {/* Fuselage Body */}
              <div className="relative rounded-2xl border-x-2 border-line bg-surface/80 p-3 sm:p-5 shadow-2xl backdrop-blur-sm">
                {/* Left & Right Wings (rendered as visual indicators) */}
                <div className="pointer-events-none absolute -left-12 top-[35%] h-[280px] w-12 border-l border-line/40 bg-gradient-to-r from-accent/5 to-transparent opacity-50" />
                <div className="pointer-events-none absolute -right-12 top-[35%] h-[280px] w-12 border-r border-line/40 bg-gradient-to-l from-accent/5 to-transparent opacity-50" />

                {/* Rows listing */}
                <div className="space-y-2">
                  {visibleRows.map((row) => {
                    const cabinSpec = aircraft.cabins.find((c) => c.classType === row.cabin);
                    const aisles = cabinSpec?.aislesAfterLetters ?? ["C"];
                    const isWingRow =
                      row.rowNumber >= aircraft.wingsRowRange[0] &&
                      row.rowNumber <= aircraft.wingsRowRange[1];

                    return (
                      <div
                        key={row.rowNumber}
                        className={cn(
                          "relative rounded px-1 transition-colors",
                          isWingRow && "bg-accent/[0.02]",
                        )}
                      >
                        {/* Emergency exit row indicator */}
                        {row.isExitRow && (
                          <div className="my-1.5 flex items-center justify-between text-[8px] font-bold uppercase tracking-wider text-amber-400">
                            <span className="flex items-center gap-1 rounded bg-amber-500/10 px-1 py-0.5">
                              <AlertTriangle className="size-2.5" /> EXIT DOOR
                            </span>
                            <span className="h-px flex-1 bg-amber-500/30 mx-2" />
                            <span className="flex items-center gap-1 rounded bg-amber-500/10 px-1 py-0.5">
                              EXIT DOOR <AlertTriangle className="size-2.5" />
                            </span>
                          </div>
                        )}

                        {/* Galley ahead notice */}
                        {row.hasGalleyAhead && (
                          <div className="mb-2 rounded border border-line bg-surface-2 p-1 text-center font-mono text-[8px] text-subtle">
                            FORWARD GALLEY & LAVATORIES
                          </div>
                        )}

                        {/* Row Item with Seats */}
                        <div className="flex items-center justify-center gap-1 sm:gap-2">
                          {/* Row Number Left */}
                          <span className="w-5 text-right font-mono text-[9px] font-bold text-subtle">
                            {row.rowNumber}
                          </span>

                          {/* Seats layout */}
                          <div className="flex items-center gap-1">
                            {row.seats.map((seat) => {
                              const isSelected = selectedSeat?.id === seat.id;
                              const isMySeat = mySeatId === seat.id;
                              const isExit = seat.isExitRow;

                              // Aisle spacer if this letter is after an aisle letter
                              const needsAisle = aisles.includes(seat.letter);

                              return (
                                <div key={seat.id} className="flex items-center">
                                  <button
                                    onClick={() => setSelectedSeat(seat)}
                                    title={`Seat ${seat.id} (${seat.cabin}) - ${seat.pitchInches}" pitch`}
                                    className={cn(
                                      "relative flex size-7 sm:size-8 items-center justify-center rounded transition-all duration-150 focus:outline-none",
                                      isSelected
                                        ? "scale-110 border-2 border-accent bg-accent/40 text-ink shadow-[0_0_12px_rgba(0,229,255,0.6)] font-bold z-10"
                                        : isMySeat
                                          ? "border-2 border-emerald-400 bg-emerald-500/30 text-ink font-bold"
                                          : isExit
                                            ? "border border-amber-500/50 bg-amber-500/20 text-amber-200 hover:border-amber-400"
                                            : "border border-line bg-surface-3 text-ink hover:border-accent/60 hover:bg-surface-2",
                                    )}
                                  >
                                    <span className="font-mono text-[9px] font-bold">
                                      {seat.letter}
                                    </span>
                                    {isMySeat && (
                                      <span className="absolute -top-1 -right-1 size-2 rounded-full bg-emerald-400" />
                                    )}
                                  </button>

                                  {/* Aisle gap */}
                                  {needsAisle && (
                                    <div className="w-3 sm:w-5 text-center font-mono text-[7px] text-subtle select-none">
                                      ·
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* Row Number Right */}
                          <span className="w-5 text-left font-mono text-[9px] font-bold text-subtle">
                            {row.rowNumber}
                          </span>
                        </div>

                        {/* Lavatory behind notice */}
                        {row.hasLavatoryBehind && (
                          <div className="mt-2 rounded border border-line bg-surface-2 p-1 text-center font-mono text-[8px] text-subtle">
                            AFT LAVATORIES & REAR GALLEY
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tail / APU Section */}
              <div className="relative mx-auto mt-2 flex h-8 w-28 items-center justify-center rounded-b-[20px] border-2 border-t-0 border-line bg-surface-2 text-center">
                <span className="font-mono text-[8px] text-subtle">AFT TAIL / APU</span>
              </div>
            </div>
          </Panel>

          {/* Quick Stats Grid */}
          <div className="grid gap-2 sm:grid-cols-4">
            <MetricTile
              label="Fleet Aircraft"
              value={aircraft.aircraftModel}
              sub={aircraft.airlineName}
            />
            <MetricTile
              label="Total Capacity"
              value={`${aircraft.totalSeats} seats`}
              sub="Multi-cabin layout"
            />
            <MetricTile
              label="Standard Pitch"
              value={`${aircraft.cabins[aircraft.cabins.length - 1]?.pitchInches}" - ${aircraft.cabins[0]?.pitchInches}"`}
              sub="Economy to Premium"
            />
            <MetricTile
              label="Connectivity"
              value="Reference only"
              sub="Not verified for this flight"
            />
          </div>
        </main>

        {/* Right column: Selected seat inspector & illustrative notes */}
        <aside className="space-y-2.5">
          {selectedSeat ? (
            <Panel className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span
                    className={cn(
                      "inline-block rounded border px-1.5 py-0.5 text-[8px] font-bold",
                      CABIN_COLORS[selectedSeat.cabin].badgeBg,
                      CABIN_COLORS[selectedSeat.cabin].text,
                    )}
                  >
                    {CABIN_COLORS[selectedSeat.cabin].label}
                  </span>
                  <h3 className="mt-1 flex items-center gap-2 text-lg font-black text-ink">
                    Seat {selectedSeat.id}
                    {mySeatId === selectedSeat.id && (
                      <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[8px] font-bold text-emerald-400">
                        SELECTED
                      </span>
                    )}
                  </h3>
                  <p className="text-[10px] text-muted">
                    {selectedSeat.isWindow
                      ? "Window Seat"
                      : selectedSeat.isAisle
                        ? "Aisle Seat"
                        : "Middle Seat"}
                    {selectedSeat.isExitRow ? " · Exit Row" : ""}
                    {selectedSeat.isBulkhead ? " · Bulkhead" : ""}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedSeat(null)}
                  className="rounded p-1 text-subtle hover:bg-surface-2 hover:text-ink"
                >
                  <X className="size-3.5" />
                </button>
              </div>

              {/* Dimensions */}
              <div className="mt-3 grid grid-cols-3 gap-2 border-y border-line py-2.5 text-center">
                <div className="rounded-md bg-surface-2 p-1.5">
                  <span className="text-[8px] uppercase text-subtle">Pitch</span>
                  <p className="font-mono text-xs font-bold text-ink">
                    {selectedSeat.pitchInches}&quot;
                  </p>
                </div>
                <div className="rounded-md bg-surface-2 p-1.5">
                  <span className="text-[8px] uppercase text-subtle">Width</span>
                  <p className="font-mono text-xs font-bold text-ink">
                    {selectedSeat.widthInches}&quot;
                  </p>
                </div>
                <div className="rounded-md bg-surface-2 p-1.5">
                  <span className="text-[8px] uppercase text-subtle">Recline</span>
                  <p className="font-mono text-xs font-bold text-ink">
                    {selectedSeat.reclineInches}&quot;
                  </p>
                </div>
              </div>

              {/* Illustrative seat note — not a passenger review */}
              {selectedSeat.review && (
                <div className="mt-3 rounded-lg border border-line bg-surface-2 p-2.5">
                  <div className="flex items-center gap-1 text-[9px] font-bold">
                    {selectedSeat.review.rating === "GOOD" ? (
                      <Sparkles className="size-3 text-emerald-400" />
                    ) : selectedSeat.review.rating === "CAUTION" ? (
                      <AlertTriangle className="size-3 text-amber-400" />
                    ) : (
                      <Info className="size-3 text-cyan-400" />
                    )}
                    <span
                      className={
                        selectedSeat.review.rating === "GOOD"
                          ? "text-emerald-400"
                          : selectedSeat.review.rating === "CAUTION"
                            ? "text-amber-400"
                            : "text-ink"
                      }
                    >
                      {selectedSeat.review.rating === "GOOD"
                        ? "Illustrative note"
                        : selectedSeat.review.rating === "CAUTION"
                          ? "Configuration note"
                          : "Standard configuration"}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-muted leading-relaxed">
                    {selectedSeat.review.notes}
                  </p>
                </div>
              )}

              {/* Features checklist */}
              <div className="mt-3 space-y-1.5 text-[10px]">
                <p className="label-caps text-subtle">Seat Features</p>
                <div className="flex flex-wrap gap-1">
                  {selectedSeat.features.map((feature) => (
                    <span
                      key={feature}
                      className="rounded border border-line bg-surface px-1.5 py-0.5 text-[8px] font-medium text-ink"
                    >
                      {feature.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="mt-4 flex gap-2">
                <Button
                  size="sm"
                  variant={mySeatId === selectedSeat.id ? "ghost" : "primary"}
                  className="flex-1"
                  onClick={() => {
                    setMySeatId((curr) => (curr === selectedSeat.id ? null : selectedSeat.id));
                  }}
                >
                  <Armchair className="size-3.5" />
                  {mySeatId === selectedSeat.id ? "Deselect seat" : "Select seat"}
                </Button>
              </div>
            </Panel>
          ) : (
            <Panel className="p-4 text-center">
              <Armchair className="mx-auto size-7 text-subtle" />
              <h4 className="mt-2 text-xs font-bold text-ink">No Seat Selected</h4>
              <p className="mt-1 text-[10px] text-muted">
                Click any seat to inspect the illustrative pitch, width, and recline. Seat availability is not connected.
              </p>
            </Panel>
          )}

          {/* Aircraft Information Card */}
          <Panel className="p-3">
            <p className="label-caps text-subtle">Aircraft Specification</p>
            <div className="mt-2 space-y-1.5 text-[10px]">
              <div className="flex items-center justify-between text-muted">
                <span>Airline Operator:</span>
                <span className="font-bold text-ink">{aircraft.airlineName} ({aircraft.airlineCode})</span>
              </div>
              <div className="flex items-center justify-between text-muted">
                <span>Aircraft Type:</span>
                <span className="font-mono text-ink">{aircraft.aircraftModel}</span>
              </div>
              <div className="flex items-center justify-between text-muted">
                <span>Manufacturer:</span>
                <span className="text-ink">{aircraft.manufacturer}</span>
              </div>
              <div className="flex items-center justify-between text-muted">
                <span>Sample Registration:</span>
                <span className="font-mono text-accent">{aircraft.tailNumberSample}</span>
              </div>
              <div className="flex items-center justify-between text-muted">
                <span>Overwing Rows:</span>
                <span className="font-mono text-ink">
                  Rows {aircraft.wingsRowRange[0]}–{aircraft.wingsRowRange[1]}
                </span>
              </div>
            </div>
          </Panel>
        </aside>
      </div>

      {/* Aircraft Picker Modal */}
      <Modal
        open={aircraftPickerOpen}
        onClose={() => setAircraftPickerOpen(false)}
        title="Select Airline & Aircraft Model"
      >
        <div className="space-y-2 py-1">
          {AIRCRAFT_PRESETS.map((spec) => (
            <button
              key={spec.id}
              onClick={() => {
                setSelectedAircraftId(spec.id);
                setSelectedSeat(null);
                setAircraftPickerOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors",
                spec.id === selectedAircraftId
                  ? "border-accent bg-accent-soft"
                  : "border-line bg-surface-2 hover:bg-surface-3",
              )}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-black text-accent">
                    {spec.airlineCode}
                  </span>
                  <span className="text-xs font-bold text-ink">{spec.airlineName}</span>
                </div>
                <p className="mt-0.5 text-[10px] text-muted">
                  {spec.aircraftModel} · {spec.totalSeats} seats · {spec.manufacturer}
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

function Building2(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect width="16" height="20" x="4" y="2" rx="2" ry="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01" />
      <path d="M16 6h.01" />
      <path d="M12 6h.01" />
      <path d="M12 10h.01" />
      <path d="M12 14h.01" />
      <path d="M16 10h.01" />
      <path d="M16 14h.01" />
      <path d="M8 10h.01" />
      <path d="M8 14h.01" />
    </svg>
  );
}
