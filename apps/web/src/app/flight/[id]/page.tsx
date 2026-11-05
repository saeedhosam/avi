"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  ChevronRight,
  Edit3,
  Expand,
  Heart,
  Layers,
  Map as MapIcon,
  MapPin,
  NotebookPen,
  Plane,
  PlaneLanding,
  PlaneTakeoff,
  Radio,
  Share2,
  StickyNote,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { fetchDestinationForecast } from "@/lib/weather";
import type { DestinationArrivalForecast, Flight } from "@/lib/types";
import { STATUS_META, cn } from "@/lib/utils";
import { RadarMap } from "@/components/radar-map";
import { ShareFlightDialog } from "@/components/share-dialog";
import { DestinationWeatherCard, AirportWeatherCard } from "@/components/weather-cards";
import {
  AircraftInfoCard,
  FlightTimelineView,
  RouteProgress,
} from "@/components/flight-panels";
import {
  Button,
  EmptyState,
  Modal,
  Panel,
  StatusBadge,
} from "@/components/ui";

export default function FlightDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const {
    flights,
    toggleFavorite,
    toggleTrack,
    updateNotes,
    upsertFlights,
    aeroConfigured,
    offlineMode,
    refreshData,
    syncing,
  } = useApp();

  const flight = useMemo(() => {
    const id = decodeURIComponent(params.id ?? "");
    return flights.find(
      (item) =>
        item.id.toLowerCase() === id.toLowerCase() ||
        item.flightNumber.replace(/\s+/g, "").toLowerCase() === id.replace(/\s+/g, "").toLowerCase(),
    );
  }, [flights, params.id]);

  const [forecast, setForecast] = useState<DestinationArrivalForecast | null>(null);
  const [forecastLoading, setForecastLoading] = useState(true);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [lookupState, setLookupState] = useState<"idle" | "loading" | "notfound">("idle");

  // Direct links to live flights that are not in the local cache yet.
  useEffect(() => {
    if (flight || lookupState !== "idle") return;
    const rawId = decodeURIComponent(params.id ?? "").replace(/\s+/g, "");
    if (!/^[A-Za-z0-9]{5,8}$/.test(rawId)) {
      setLookupState("notfound");
      return;
    }
    if (offlineMode || !aeroConfigured) {
      setLookupState("notfound");
      return;
    }
    let active = true;
    setLookupState("loading");
    fetch(`/api/flights/search?flight=${encodeURIComponent(rawId)}`, {
      cache: "no-store",
    })
      .then((response) => response.json())
      .then((data: { flights?: Flight[] }) => {
        if (!active) return;
        if (data.flights?.length) upsertFlights(data.flights);
        else setLookupState("notfound");
      })
      .catch(() => {
        if (active) setLookupState("notfound");
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, flight?.id, lookupState, offlineMode, aeroConfigured, upsertFlights]);

  useEffect(() => {
    if (!flight) return;
    let active = true;
    setForecast(null);
    setForecastLoading(true);
    fetchDestinationForecast(flight.destination, flight.arrivalTimeEstimated)
      .then((next) => {
        if (active) setForecast(next);
      })
      .finally(() => {
        if (active) setForecastLoading(false);
      });
    return () => {
      active = false;
    };
    // Destination and arrival time drive the forecast; telemetry ticks must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight?.destination.code, flight?.arrivalTimeEstimated]);

  if (!flight) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <Panel>
          {lookupState === "loading" ? (
            <EmptyState
              icon={<Radio className="size-6 animate-pulse" />}
              title="Loading live flight"
              description="Querying AeroDataBox for this flight number. Only live data is shown."
            />
          ) : (
            <EmptyState
              icon={<Plane className="size-6" />}
              title="Flight not available"
              description={
                offlineMode
                  ? "Offline mode is active and this flight is not cached. Reconnect to fetch it live."
                  : !aeroConfigured
                    ? "AeroDataBox is not configured. Add AERODATABOX_API_KEY to .env and restart."
                    : "AeroDataBox returned no live flight for this number. It may not be operating today."
              }
              action={
                <Link href="/search">
                  <Button size="sm">Search live flights</Button>
                </Link>
              }
            />
          )}
        </Panel>
      </div>
    );
  }

  const meta = STATUS_META[flight.status];
  const isLive = flight.status === "DEPARTED";

  const openNotes = () => {
    setNoteDraft(flight.customNotes);
    setNotesOpen(true);
  };

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4 lg:px-6 lg:py-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <button
            onClick={() => router.back()}
            className="flex size-8 items-center justify-center rounded-lg border border-line bg-surface-2 text-muted transition-colors hover:text-ink"
            aria-label="Back"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div className="min-w-0">
            <p className="label-caps text-accent">Flight dossier</p>
            <h2 className="flex flex-wrap items-center gap-2 text-lg font-black tracking-tight text-ink lg:text-xl">
              {flight.flightNumber}
              <span className="text-xs font-medium text-muted">{flight.airline}</span>
              <StatusBadge status={flight.status} delayMinutes={flight.delayMinutes} />
              {isLive && (
                <span className="flex items-center gap-1 rounded-full border border-accent/40 bg-accent-soft px-1.5 py-0.5 text-[9px] font-bold text-accent">
                  <Radio className="size-2.5 animate-pulse" /> LIVE
                </span>
              )}
            </h2>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <ActionButton
            icon={<Share2 className="size-3.5" />}
            label="Share"
            onClick={() => setShareOpen(true)}
          />
          <ActionButton
            icon={<Edit3 className="size-3.5" />}
            label="Note"
            onClick={openNotes}
            active={Boolean(flight.customNotes)}
          />
          <ActionButton
            icon={
              flight.isTracked ? (
                <BookmarkCheck className="size-3.5" />
              ) : (
                <Bookmark className="size-3.5" />
              )
            }
            label={flight.isTracked ? "Tracked" : "Track"}
            active={flight.isTracked}
            onClick={() => toggleTrack(flight)}
          />
          <ActionButton
            icon={<Radio className={cn("size-3.5", syncing && "animate-pulse")} />}
            label={syncing ? "Refreshing" : "Refresh"}
            onClick={() => void refreshData()}
          />
          <Link href={`/map/${encodeURIComponent(flight.id)}`}>
            <Button size="sm" variant="outline">
              <MapIcon className="size-3.5" /> Live map
            </Button>
          </Link>
          <button
            onClick={() => toggleFavorite(flight.flightNumber)}
            className="flex size-8 items-center justify-center rounded-lg border border-line bg-surface-2 transition-colors hover:border-[#FF4081]/50"
            aria-label="Toggle favorite"
          >
            <Heart
              className={cn(
                "size-3.5",
                flight.isFavorite
                  ? "fill-[#FF4081] text-[#FF4081]"
                  : "text-muted",
              )}
            />
          </button>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-3">
          {/* Hero */}
          <Panel className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 px-4 py-3">
              <div className="flex items-center gap-2">
                <span
                  className="flex size-8 items-center justify-center rounded-lg border text-[10px] font-bold"
                  style={{
                    color: meta.color,
                    backgroundColor: meta.soft,
                    borderColor: `${meta.color}55`,
                  }}
                >
                  {flight.airlineCode}
                </span>
                <div>
                  <p className="text-[11px] font-bold text-ink">
                    {flight.origin.city} → {flight.destination.city}
                  </p>
                  <p className="text-[9px] text-subtle">
                    {flight.aircraft.model} · {flight.aircraft.registration}
                  </p>
                </div>
              </div>
              {flight.delayReason && (
                <span className="rounded-full border border-delayed/40 bg-delayed/10 px-2 py-1 text-[9px] font-semibold text-delayed">
                  {flight.delayReason}
                </span>
              )}
            </div>
            <div className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[26px] font-black leading-none text-ink lg:text-3xl">
                    {flight.origin.code}
                    <span className="mx-2 text-lg text-subtle">→</span>
                    {flight.destination.code}
                  </p>
                  <p className="mt-1 text-[11px] text-muted">
                    {flight.origin.name} → {flight.destination.name}
                  </p>
                </div>
                <div className="text-right">
                  <p className="label-caps text-subtle">Estimated arrival</p>
                  <p className="text-lg font-bold text-ink tabular">
                    {flight.arrivalTimeEstimated}
                  </p>
                  <p className="text-[9px] text-subtle">
                    Scheduled {flight.arrivalTimeScheduled}
                  </p>
                </div>
              </div>

              <RouteProgress
                origin={flight.origin.code}
                destination={flight.destination.code}
                progress={flight.telemetry.progressPercent}
                status={flight.status}
                className="mt-4"
              />

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <InlineMetric
                  label="Departure"
                  value={flight.departureTimeEstimated}
                  sub={`Scheduled ${flight.departureTimeScheduled}`}
                  accent
                />
                <InlineMetric
                  label="Arrival"
                  value={flight.arrivalTimeEstimated}
                  sub={`Scheduled ${flight.arrivalTimeScheduled}`}
                />
                <InlineMetric
                  label="Duration"
                  value={
                    flight.telemetry.etaMinutesRemaining > 0
                      ? `${Math.floor(flight.telemetry.etaMinutesRemaining / 60)}h ${flight.telemetry.etaMinutesRemaining % 60}m`
                      : "—"
                  }
                  sub={isLive ? "Remaining" : "Not reported"}
                />
                <InlineMetric
                  label="Progress"
                  value={flight.telemetry.hasLiveLocation ? `${Math.round(flight.telemetry.progressPercent * 100)}%` : "—"}
                  sub={
                    flight.telemetry.hasLiveLocation
                      ? `${flight.telemetry.distanceRemainingNm} nm remaining`
                      : "Live position not reported"
                  }
                  accent
                />
              </div>

              {flight.statusNote && (
                <p className="mt-3 rounded-lg border border-accent/25 bg-accent-soft px-3 py-2 text-[11px] font-medium text-accent">
                  {flight.statusNote}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setMapExpanded((value) => !value)} variant="outline">
                  <Expand className="size-3.5" /> {mapExpanded ? "Compact radar" : "Expand radar"}
                </Button>
                <Link href={`/terminals?airport=${flight.origin.code}&gate=${encodeURIComponent(flight.gateDeparture)}`}>
                  <Button size="sm" variant="outline">
                    <Layers className="size-3.5" /> Terminal map
                  </Button>
                </Link>
                <Button size="sm" variant="ghost" onClick={() => setShareOpen(true)}>
                  <Share2 className="size-3.5" /> Share status
                </Button>
              </div>
            </div>
          </Panel>

          {/* Gates */}
          <div className="grid gap-2 sm:grid-cols-2">
            <GateTile
              label="Departure gate"
              primary={`T${flight.terminalDeparture} · ${flight.gateDeparture}`}
              secondary={flight.checkInCounter}
              icon={<PlaneTakeoff className="size-4" />}
              onMap={() =>
                router.push(
                  `/terminals?airport=${flight.origin.code}&gate=${encodeURIComponent(flight.gateDeparture)}`,
                )
              }
            />
            <GateTile
              label="Arrival gate"
              primary={`T${flight.terminalArrival} · ${flight.gateArrival}`}
              secondary={flight.baggageCarousel}
              icon={<PlaneLanding className="size-4" />}
              onMap={() =>
                router.push(
                  `/terminals?airport=${flight.destination.code}&gate=${encodeURIComponent(flight.gateArrival)}`,
                )
              }
            />
          </div>

          <div
            className={cn(
              "transition-all duration-300",
              mapExpanded ? "h-[420px]" : "h-[300px]",
            )}
          >
            <RadarMap
              flight={flight}
              className="h-full"
              isExpanded={mapExpanded}
              onToggleExpand={() => setMapExpanded((value) => !value)}
            />
          </div>

          <DestinationWeatherCard
            forecast={forecast}
            loading={forecastLoading}
          />

          <AirportWeatherCard
            origin={flight.origin}
            destination={flight.destination}
          />

          {flight.timeline.length > 0 && (
            <FlightTimelineView events={flight.timeline} />
          )}
        </div>

        {/* Right rail */}
        <aside className="space-y-3">
          <Panel className="p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-ink">
                  {flight.isTracked ? "Saved to local tracking" : "Track this flight"}
                </p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-muted">
                  {flight.isTracked
                    ? "Offline-cached with push alerts for gate, delay, boarding, and baggage."
                    : "Persist to the local cache for offline monitoring and alerts."}
                </p>
              </div>
              <button
                onClick={() => toggleTrack(flight)}
                className={cn(
                  "relative h-6 w-11 shrink-0 rounded-full border transition-colors",
                  flight.isTracked
                    ? "border-accent bg-accent/30"
                    : "border-line bg-surface-3",
                )}
                aria-label="Toggle tracking"
              >
                <span
                  className={cn(
                    "absolute top-0.5 size-4.5 rounded-full transition-all",
                    flight.isTracked ? "left-[22px] bg-accent" : "left-0.5 bg-muted",
                  )}
                />
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <MiniAction
                icon={<Share2 className="size-3.5" />}
                label="Share summary"
                onClick={() => setShareOpen(true)}
              />
              <MiniAction
                icon={<NotebookPen className="size-3.5" />}
                label="Edit note"
                onClick={openNotes}
              />
              <MiniAction
                icon={<Radio className={cn("size-3.5", syncing && "animate-pulse")} />}
                label="Refresh live"
                onClick={() => void refreshData()}
              />
              <MiniAction
                icon={<Layers className="size-3.5" />}
                label="Terminal"
                onClick={() =>
                  router.push(
                    `/terminals?airport=${flight.origin.code}&gate=${encodeURIComponent(flight.gateDeparture)}`,
                  )
                }
              />
            </div>
          </Panel>

          <Panel className="p-3.5">
            <div className="flex items-center justify-between">
              <p className="label-caps text-subtle">Live telemetry</p>
              <span className="flex items-center gap-1 text-[9px] font-bold text-landed">
                <span className="size-1.5 animate-pulse-dot rounded-full bg-landed" />
                {flight.telemetry.hasLiveLocation ? "LIVE POSITION" : "AWAITING POSITION"}
              </span>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <Snapshot label="Altitude" value={flight.telemetry.hasLiveLocation ? `${flight.telemetry.altitudeFeet.toLocaleString()} ft` : "—"} accent />
              <Snapshot label="Ground speed" value={flight.telemetry.hasLiveLocation ? `${flight.telemetry.groundSpeedKnots} kt` : "—"} />
              <Snapshot label="Mach" value={flight.telemetry.hasLiveLocation ? flight.telemetry.mach.toFixed(2) : "—"} />
              <Snapshot label="Heading" value={flight.telemetry.hasLiveLocation ? `${Math.round(flight.telemetry.headingDegrees)}°` : "—"} />
              <Snapshot label="Vertical speed" value={flight.telemetry.hasLiveLocation ? `${flight.telemetry.verticalSpeedFpm} fpm` : "—"} />
              <Snapshot label="ETA" value={flight.telemetry.etaMinutesRemaining > 0 ? `${flight.telemetry.etaMinutesRemaining} min` : "—"} accent />
            </div>
            {flight.customNotes && (
              <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-line/60 bg-surface-2 px-2.5 py-2">
                <StickyNote className="mt-0.5 size-3.5 shrink-0 text-accent" />
                <p className="text-[10px] leading-relaxed text-muted">
                  {flight.customNotes}
                </p>
              </div>
            )}
          </Panel>

          <AircraftInfoCard aircraft={flight.aircraft} />

          <Panel className="p-3.5">
            <p className="label-caps text-subtle">Flight data</p>
            <div className="mt-2 space-y-1.5 text-[10px]">
              <DataRow label="Airline" value={flight.airline} />
              <DataRow label="Airline code" value={flight.airlineCode} mono />
              <DataRow label="Flight number" value={flight.flightNumber} mono />
              <DataRow label="Check-in" value={flight.checkInCounter} />
              <DataRow label="Baggage" value={flight.baggageCarousel} />
              <DataRow label="Origin TZ" value={flight.origin.timezone} />
              <DataRow label="Dest. TZ" value={flight.destination.timezone} />
            </div>
          </Panel>

          <div className="rounded-xl border border-dashed border-line bg-surface-2/50 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[10px] font-bold text-muted">
              <MapPin className="size-3 text-accent" /> Cached & cloud synced
            </p>
            <p className="mt-1 text-[9px] leading-relaxed text-subtle">
              Flight state is stored in the local browser cache and mirrored to
              Firestore for signed-in users.
            </p>
          </div>
        </aside>
      </div>

      <ShareFlightDialog
        flight={flight}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
      />
      <NotesModal
        open={notesOpen}
        flight={flight}
        draft={noteDraft}
        onDraft={setNoteDraft}
        onClose={() => setNotesOpen(false)}
        onSave={() => {
          updateNotes(flight.flightNumber, noteDraft);
          setNotesOpen(false);
        }}
      />
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-semibold transition-colors",
        active
          ? "border-accent/50 bg-accent-soft text-accent"
          : "border-line bg-surface-2 text-muted hover:border-accent/40 hover:text-ink",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function InlineMetric({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line/70 bg-surface-2 px-2.5 py-2">
      <p className="label-caps text-subtle">{label}</p>
      <p className={cn("mt-0.5 text-xs font-bold tabular", accent ? "text-accent" : "text-ink")}>
        {value}
      </p>
      {sub && <p className="mt-0.5 truncate text-[8px] text-subtle">{sub}</p>}
    </div>
  );
}

function GateTile({
  label,
  primary,
  secondary,
  icon,
  onMap,
}: {
  label: string;
  primary: string;
  secondary: string;
  icon: React.ReactNode;
  onMap: () => void;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3.5">
      <div className="flex items-center justify-between">
        <p className="label-caps text-subtle">{label}</p>
        <span className="text-accent">{icon}</span>
      </div>
      <p className="mt-1.5 truncate text-sm font-bold text-ink">{primary}</p>
      <p className="mt-0.5 truncate text-[10px] text-accent-2">{secondary}</p>
      <button
        onClick={onMap}
        className="mt-2 flex items-center gap-1 text-[10px] font-bold text-accent hover:underline"
      >
        Open terminal map <ChevronRight className="size-3" />
      </button>
    </div>
  );
}

function MiniAction({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg border border-line/70 bg-surface-2 px-2 py-2 text-[10px] font-semibold text-muted transition-colors hover:border-accent/40 hover:text-accent"
    >
      {icon}
      {label}
    </button>
  );
}

function Snapshot({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line/70 bg-surface-2 px-2 py-1.5">
      <p className="text-[8px] font-bold uppercase tracking-wider text-subtle">
        {label}
      </p>
      <p className={cn("mt-0.5 text-[11px] font-bold tabular", accent ? "text-accent" : "text-ink")}>
        {value}
      </p>
    </div>
  );
}

function DataRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <p className="flex items-center justify-between gap-2">
      <span className="text-subtle">{label}</span>
      <span className={cn("truncate text-right font-semibold text-ink", mono && "font-mono")}>
        {value}
      </span>
    </p>
  );
}

function NotesModal({
  open,
  flight,
  draft,
  onDraft,
  onClose,
  onSave,
}: {
  open: boolean;
  flight: Flight;
  draft: string;
  onDraft: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Flight note · ${flight.flightNumber}`}
      subtitle="Personal notes stay local and sync to Firestore when signed in."
      icon={<NotebookPen className="size-4" />}
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={onSave}>
            Save note
          </Button>
        </>
      }
    >
      <textarea
        value={draft}
        onChange={(event) => onDraft(event.target.value)}
        placeholder="e.g. Mom's flight, pick up at baggage claim, seat 12A…"
        rows={5}
        className="w-full resize-none rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-xs leading-relaxed text-ink outline-none placeholder:text-subtle focus:border-accent"
      />
      <p className="mt-1.5 text-[10px] text-subtle">
        Notes are private to your profile and capped at 500 characters by
        Firestore rules.
      </p>
    </Modal>
  );
}
