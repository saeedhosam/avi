"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Armchair,
  Building2,
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
import {
  Button,
  Callout,
  MetricTile,
  Modal,
  PageHeader,
  Panel,
  TextInput,
} from "@/components/ui";

const CABIN_META: Record<
  CabinClass,
  { label: string; dot: string; badge: string }
> = {
  FIRST: {
    label: "First",
    dot: "bg-delayed",
    badge: "border-delayed/35 bg-delayed/10 text-delayed",
  },
  BUSINESS: {
    label: "Business",
    dot: "bg-accent-2",
    badge: "border-accent-2/35 bg-accent-2/10 text-accent-2",
  },
  PREMIUM_ECONOMY: {
    label: "Premium economy",
    dot: "bg-landed",
    badge: "border-landed/35 bg-landed/10 text-landed",
  },
  ECONOMY: {
    label: "Economy",
    dot: "bg-subtle",
    badge: "border-line bg-surface-2 text-muted",
  },
};

export default function AirplanesPage() {
  const [selectedAircraftId, setSelectedAircraftId] = useState(
    AIRCRAFT_PRESETS[0]?.id ?? "MS-A320NEO",
  );
  const [activeCabinFilter, setActiveCabinFilter] = useState<
    CabinClass | "ALL"
  >("ALL");
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
      const match = AIRCRAFT_PRESETS.find(
        (a) => a.id.toLowerCase() === plane.toLowerCase(),
      );
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
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Panel className="p-6 text-center">
          <p className="text-sm font-semibold text-ink">Seatmap unavailable</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            AeroQuest does not have an illustrative configuration for this
            aircraft. No substitute aircraft is shown.
          </p>
          <Link href="/airports" className="mt-4 inline-block">
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
        eyebrow="Aircraft & seat reference"
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            {aircraft.airlineName} {aircraft.aircraftModel}
            <span
              className="rounded-md bg-accent-soft px-2 py-1 font-mono text-xs font-semibold text-accent"
              title="Sample registration, not this flight's aircraft"
            >
              Sample · {aircraft.tailNumberSample}
            </span>
            <span className="rounded-md border border-line/70 px-2 py-1 text-xs font-medium text-muted">
              {aircraft.totalSeats} seats
            </span>
          </span>
        }
        description={`${aircraft.manufacturer} · standard commercial passenger configuration. This is an illustrative reference, not live seat availability.`}
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAircraftPickerOpen(true)}
            >
              <Plane className="size-4" />
              Switch aircraft
            </Button>
            <Link href="/airports">
              <Button size="sm" variant="ghost">
                <Building2 className="size-4" />
                Airport maps
              </Button>
            </Link>
          </>
        }
      />

      <Callout tone="attention" className="mt-5">
        Seat availability, Wi-Fi availability, and passenger reviews are not
        live data. Pitch, width, and recline come from the aircraft type{" "}
        {aircraft.aircraftModel}, not from your booking.
      </Callout>

      <div className="mt-5 grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)_320px] xl:gap-6">
        {/* Left column: cabin selection & filters */}
        <aside className="space-y-4">
          <Panel className="p-4">
            <p className="label-caps text-subtle">Aircraft</p>
            <button
              type="button"
              onClick={() => setAircraftPickerOpen(true)}
              className="mt-2.5 flex min-h-14 w-full items-center gap-3 rounded-lg border border-line/70 bg-surface-2/50 px-3 text-left transition-colors hover:border-line-strong"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent-soft font-mono text-xs font-semibold text-accent">
                {aircraft.airlineCode}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-ink">
                  {aircraft.airlineName}
                </span>
                <span className="block truncate text-xs text-subtle">
                  {aircraft.aircraftModel} · {aircraft.totalSeats} pax
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-subtle" />
            </button>

            <form onSubmit={handleSeatSearch} className="mt-4">
              <label
                htmlFor="seat-search"
                className="label-caps block text-subtle"
              >
                Find a seat
              </label>
              <div className="mt-2 flex items-center gap-2">
                <TextInput
                  id="seat-search"
                  value={seatSearch}
                  onChange={(e) => setSeatSearch(e.target.value)}
                  placeholder="12F"
                  maxLength={4}
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

          <Panel className="p-4">
            <p className="label-caps text-subtle">Cabin classes</p>
            <div className="mt-2.5 space-y-1">
              <button
                type="button"
                onClick={() => setActiveCabinFilter("ALL")}
                aria-pressed={activeCabinFilter === "ALL"}
                className={cn(
                  "flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-2.5 text-left text-[13px] transition-colors",
                  activeCabinFilter === "ALL"
                    ? "bg-accent-soft font-medium text-accent"
                    : "text-muted hover:bg-surface-2 hover:text-ink",
                )}
              >
                <span>Full cabin</span>
                <span className="font-mono text-xs text-subtle">
                  {aircraft.totalSeats}
                </span>
              </button>
              {aircraft.cabins.map((cabin) => {
                const active = activeCabinFilter === cabin.classType;
                const meta = CABIN_META[cabin.classType];
                const count = aircraft.rows
                  .filter((r) => r.cabin === cabin.classType)
                  .reduce((acc, r) => acc + r.seats.length, 0);
                return (
                  <button
                    key={cabin.name}
                    type="button"
                    onClick={() => setActiveCabinFilter(cabin.classType)}
                    aria-pressed={active}
                    className={cn(
                      "flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-2.5 text-left text-[13px] transition-colors",
                      active
                        ? "bg-accent-soft font-medium text-accent"
                        : "text-muted hover:bg-surface-2 hover:text-ink",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className={cn("size-1.5 shrink-0 rounded-full", meta.dot)}
                      />
                      <span className="truncate">{meta.label}</span>
                    </span>
                    <span className="shrink-0 font-mono text-xs text-subtle">
                      {cabin.layout} · {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel className="p-4">
            <p className="label-caps text-subtle">Onboard amenities</p>
            <div className="mt-3 space-y-3">
              <AmenityRow icon={Wifi} title="Satellite Wi-Fi" body={aircraft.amenities.wifi} />
              <AmenityRow icon={Zap} title="Seat power & USB" body={aircraft.amenities.power} />
              <AmenityRow icon={Tv} title="Entertainment" body={aircraft.amenities.ife} />
              <AmenityRow icon={Wind} title="Overhead storage" body={aircraft.amenities.overheadBins} />
            </div>
          </Panel>

          <Panel className="p-4">
            <p className="label-caps text-subtle">Seat legend</p>
            <div className="mt-2.5 space-y-2.5 text-xs text-muted">
              <div className="flex items-center gap-2">
                <span className="size-3.5 rounded-sm border border-delayed/60 bg-delayed/25" />
                Exit row · extra space
              </div>
              <div className="flex items-center gap-2">
                <span className="size-3.5 rounded-sm border-2 border-accent bg-accent/40" />
                Inspected seat
              </div>
              <div className="flex items-center gap-2">
                <span className="size-3.5 rounded-sm border-2 border-landed bg-landed/30" />
                Your selected seat
              </div>
            </div>
          </Panel>
        </aside>

        {/* Centre: fuselage & seat map */}
        <div className="min-w-0 space-y-4">
          <Panel className="overflow-hidden p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-ink">Cabin seatmap</p>
                <p className="text-xs text-subtle">
                  Illustrative reference configuration · not live availability
                </p>
              </div>
              {mySeatId && (
                <span className="flex items-center gap-1.5 rounded-md bg-accent-soft px-2 py-1 text-xs font-medium text-accent">
                  <Check className="size-3.5" />
                  Selected: {mySeatId}
                </span>
              )}
            </div>

            <div className="mx-auto max-w-xl">
              <div className="relative mx-auto mb-3 flex h-12 w-40 flex-col items-center justify-center rounded-t-[36px] border border-b-0 border-line/70 bg-surface-2/60">
                <div className="flex gap-2">
                  <div className="h-3.5 w-6 rounded-t-lg border border-accent/30 bg-accent-soft" />
                  <div className="h-3.5 w-6 rounded-t-lg border border-accent/30 bg-accent-soft" />
                </div>
                <span className="mt-1 font-mono text-xs tracking-[0.2em] text-subtle">
                  COCKPIT
                </span>
              </div>

              <div className="relative overflow-hidden rounded-xl border border-line/70 bg-surface/60 p-3 sm:p-5">
                <div className="space-y-1.5">
                  {visibleRows.map((row) => {
                    const cabinSpec = aircraft.cabins.find(
                      (c) => c.classType === row.cabin,
                    );
                    const aisles = cabinSpec?.aislesAfterLetters ?? ["C"];
                    const isWingRow =
                      row.rowNumber >= aircraft.wingsRowRange[0] &&
                      row.rowNumber <= aircraft.wingsRowRange[1];

                    return (
                      <div
                        key={row.rowNumber}
                        className={cn(
                          "rounded-md px-1 py-0.5 transition-colors",
                          isWingRow && "bg-surface-2/45",
                        )}
                      >
                        {row.isExitRow && (
                          <div className="my-2 flex items-center gap-2 text-xs font-medium text-delayed">
                            <span className="flex items-center gap-1 rounded bg-delayed/10 px-1.5 py-0.5">
                              <AlertTriangle className="size-3" /> Exit door
                            </span>
                            <span className="h-px flex-1 bg-delayed/25" />
                          </div>
                        )}

                        {row.hasGalleyAhead && (
                          <div className="mb-1.5 rounded border border-line/60 bg-surface-2/60 py-1 text-center font-mono text-xs text-subtle">
                            FORWARD GALLEY · LAVATORIES
                          </div>
                        )}

                        <div className="flex items-center justify-center gap-1 sm:gap-1.5">
                          <span className="w-5 text-right font-mono text-xs tabular text-subtle">
                            {row.rowNumber}
                          </span>

                          <div className="flex items-center gap-1">
                            {row.seats.map((seat) => {
                              const isSelected = selectedSeat?.id === seat.id;
                              const isMySeat = mySeatId === seat.id;
                              const isExit = seat.isExitRow;
                              const needsAisle = aisles.includes(seat.letter);

                              return (
                                <div key={seat.id} className="flex items-center">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedSeat(seat)}
                                    aria-pressed={isSelected}
                                    aria-label={`Seat ${seat.id}, ${CABIN_META[seat.cabin].label}, ${seat.pitchInches} inch pitch`}
                                    title={`Seat ${seat.id} · ${seat.pitchInches}" pitch`}
                                    className={cn(
                                      "relative flex size-7 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 sm:size-8",
                                      isSelected
                                        ? "border-2 border-accent bg-accent/30 font-semibold text-ink"
                                        : isMySeat
                                          ? "border-2 border-landed bg-landed/25 font-semibold text-ink"
                                          : isExit
                                            ? "border border-delayed/50 bg-delayed/15 text-delayed hover:border-delayed"
                                            : "border border-line/70 bg-surface-3 text-ink hover:border-accent/50 hover:bg-surface-2",
                                    )}
                                  >
                                    <span className="font-mono text-xs">
                                      {seat.letter}
                                    </span>
                                    {isMySeat && (
                                      <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-landed" />
                                    )}
                                  </button>

                                  {needsAisle && (
                                    <span className="w-3 select-none text-center font-mono text-[11px] text-subtle sm:w-4">
                                      ·
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          <span className="w-5 text-left font-mono text-xs tabular text-subtle">
                            {row.rowNumber}
                          </span>
                        </div>

                        {row.hasLavatoryBehind && (
                          <div className="mt-1.5 rounded border border-line/60 bg-surface-2/60 py-1 text-center font-mono text-xs text-subtle">
                            AFT LAVATORIES · REAR GALLEY
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mx-auto mt-2 flex h-8 w-24 items-center justify-center rounded-b-[18px] border border-t-0 border-line/70 bg-surface-2/60">
                <span className="font-mono text-xs text-subtle">AFT</span>
              </div>
            </div>
          </Panel>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricTile
              label="Aircraft"
              value={aircraft.aircraftModel}
              sub={aircraft.airlineName}
            />
            <MetricTile
              label="Capacity"
              value={`${aircraft.totalSeats}`}
              sub="Multi-cabin layout"
            />
            <MetricTile
              label="Pitch range"
              value={`${aircraft.cabins[aircraft.cabins.length - 1]?.pitchInches}″ – ${aircraft.cabins[0]?.pitchInches}″`}
              sub="Economy to premium"
            />
            <MetricTile
              label="Connectivity"
              value="Reference"
              sub="Not verified for this flight"
            />
          </div>
        </div>

        {/* Right column: seat inspector & spec */}
        <aside className="space-y-4">
          {selectedSeat ? (
            <Panel className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span
                    className={cn(
                      "inline-block rounded-md border px-2 py-1 text-xs font-medium",
                      CABIN_META[selectedSeat.cabin].badge,
                    )}
                  >
                    {CABIN_META[selectedSeat.cabin].label}
                  </span>
                  <h2 className="mt-2 flex items-center gap-2 font-mono text-xl font-semibold text-ink">
                    {selectedSeat.id}
                    {mySeatId === selectedSeat.id && (
                      <span className="rounded bg-landed/15 px-1.5 py-0.5 text-xs font-medium text-landed">
                        Yours
                      </span>
                    )}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted">
                    {selectedSeat.isWindow
                      ? "Window seat"
                      : selectedSeat.isAisle
                        ? "Aisle seat"
                        : "Middle seat"}
                    {selectedSeat.isExitRow ? " · Exit row" : ""}
                    {selectedSeat.isBulkhead ? " · Bulkhead" : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedSeat(null)}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-subtle transition-colors hover:bg-surface-2 hover:text-ink"
                  aria-label="Close seat details"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <SeatMetric label="Pitch" value={`${selectedSeat.pitchInches}″`} />
                <SeatMetric label="Width" value={`${selectedSeat.widthInches}″`} />
                <SeatMetric label="Recline" value={`${selectedSeat.reclineInches}″`} />
              </div>

              {selectedSeat.review && (
                <div className="mt-3 rounded-lg border border-line/60 bg-surface-2/40 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    {selectedSeat.review.rating === "GOOD" ? (
                      <Sparkles className="size-3.5 text-landed" />
                    ) : selectedSeat.review.rating === "CAUTION" ? (
                      <AlertTriangle className="size-3.5 text-delayed" />
                    ) : (
                      <Info className="size-3.5 text-accent-2" />
                    )}
                    <span
                      className={
                        selectedSeat.review.rating === "GOOD"
                          ? "text-landed"
                          : selectedSeat.review.rating === "CAUTION"
                            ? "text-delayed"
                            : "text-muted"
                      }
                    >
                      {selectedSeat.review.rating === "GOOD"
                        ? "Illustrative note"
                        : selectedSeat.review.rating === "CAUTION"
                          ? "Configuration note"
                          : "Standard configuration"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    {selectedSeat.review.notes}
                  </p>
                </div>
              )}

              <div className="mt-3">
                <p className="label-caps text-subtle">Features</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selectedSeat.features.map((feature) => (
                    <span
                      key={feature}
                      className="rounded-md bg-surface-2 px-2 py-1 text-xs text-muted"
                    >
                      {feature.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              </div>

              <Button
                className="mt-4 w-full"
                size="sm"
                variant={mySeatId === selectedSeat.id ? "ghost" : "primary"}
                onClick={() => {
                  setMySeatId((curr) =>
                    curr === selectedSeat.id ? null : selectedSeat.id,
                  );
                }}
              >
                <Armchair className="size-4" />
                {mySeatId === selectedSeat.id ? "Deselect seat" : "Select seat"}
              </Button>
            </Panel>
          ) : (
            <Panel>
              <div className="flex flex-col items-center px-5 py-10 text-center">
                <span className="flex size-11 items-center justify-center rounded-xl border border-line/70 bg-surface-2/60 text-muted">
                  <Armchair className="size-5" />
                </span>
                <p className="mt-3 text-sm font-medium text-ink">
                  No seat selected
                </p>
                <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted">
                  Choose any seat to inspect illustrative pitch, width, and
                  recline. Availability is not connected.
                </p>
              </div>
            </Panel>
          )}

          <Panel className="p-4">
            <p className="label-caps text-subtle">Specification</p>
            <dl className="mt-2.5 space-y-2.5 text-[13px]">
              <SpecRow
                label="Operator"
                value={`${aircraft.airlineName} (${aircraft.airlineCode})`}
              />
              <SpecRow label="Type" value={aircraft.aircraftModel} mono />
              <SpecRow label="Manufacturer" value={aircraft.manufacturer} />
              <SpecRow
                label="Sample registration"
                value={aircraft.tailNumberSample}
                mono
                accent
              />
              <SpecRow
                label="Overwing rows"
                value={`${aircraft.wingsRowRange[0]}–${aircraft.wingsRowRange[1]}`}
                mono
              />
            </dl>
          </Panel>
        </aside>
      </div>

      <Modal
        open={aircraftPickerOpen}
        onClose={() => setAircraftPickerOpen(false)}
        title="Select aircraft"
        subtitle="Illustrative configurations from the AeroQuest reference catalog."
        size="md"
      >
        <div className="space-y-2">
          {AIRCRAFT_PRESETS.map((spec) => (
            <button
              key={spec.id}
              type="button"
              onClick={() => {
                setSelectedAircraftId(spec.id);
                setSelectedSeat(null);
                setAircraftPickerOpen(false);
              }}
              aria-pressed={spec.id === selectedAircraftId}
              className={cn(
                "flex min-h-14 w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                spec.id === selectedAircraftId
                  ? "border-accent/40 bg-accent-soft"
                  : "border-line/70 bg-surface-2/40 hover:border-line-strong",
              )}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-accent">
                    {spec.airlineCode}
                  </span>
                  <span className="truncate text-[13px] font-medium text-ink">
                    {spec.airlineName}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-subtle">
                  {spec.aircraftModel} · {spec.totalSeats} seats ·{" "}
                  {spec.manufacturer}
                </p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-subtle" />
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function AmenityRow({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted" />
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-subtle">{body}</p>
      </div>
    </div>
  );
}

function SeatMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2/50 px-2 py-2 text-center">
      <p className="text-xs text-subtle">{label}</p>
      <p className="mt-0.5 font-mono text-[13px] font-medium text-ink">
        {value}
      </p>
    </div>
  );
}

function SpecRow({
  label,
  value,
  mono,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd
        className={cn(
          "text-right font-medium",
          mono && "font-mono",
          accent ? "text-accent" : "text-ink",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
