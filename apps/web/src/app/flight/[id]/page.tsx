"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Edit3,
  Expand,
  Glasses,
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
import { authFetch } from "@/lib/authed-fetch";
import { fetchDestinationForecast } from "@/lib/weather";
import type { DestinationArrivalForecast, Flight } from "@/lib/types";
import {
  STATUS_META,
  cn,
  flightDateLabel,
  isFreshTimestamp,
  normalizeFlightNumber,
  timeAgo,
} from "@/lib/utils";
import { FlightMapPreview } from "@/components/flight-map-preview";
import { ShareFlightDialog } from "@/components/share-dialog";
import { DestinationWeatherCard, AirportWeatherCard } from "@/components/weather-cards";
import {
  ArrivalEsimCard,
  DelayLoungeCard,
} from "@/components/monetization-cards";
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
  const searchParams = useSearchParams();
  const router = useRouter();
  const {
    flights,
    toggleWatchlist,
    updateNotes,
    upsertFlights,
    aeroConfigured,
    offlineMode,
    notify,
  } = useApp();

  const dateParam = searchParams.get("date") ?? "";
  const flight = useMemo(() => {
    const rawId = decodeURIComponent(params.id ?? "").trim();
    const cleanId = rawId.replace(/\s+/g, "").toLowerCase();
    const numberMatch = (item: Flight) =>
      item.id.replace(/\s+/g, "").toLowerCase() === cleanId ||
      normalizeFlightNumber(item.flightNumber).toLowerCase() === cleanId;
    const dateMatch = (item: Flight) =>
      !dateParam || (item.flightDate ?? "") === dateParam;
    if (dateParam) {
      // A requested operating date must match exactly. Never substitute the
      // same flight number from another day.
      return flights.find((item) => numberMatch(item) && dateMatch(item));
    }
    return flights.find(numberMatch);
  }, [flights, params.id, dateParam]);

  const [forecast, setForecast] = useState<DestinationArrivalForecast | null>(null);
  const [forecastLoading, setForecastLoading] = useState(true);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [lookupState, setLookupState] = useState<
    "idle" | "loading" | "notfound" | "error"
  >("idle");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [refreshingCurrent, setRefreshingCurrent] = useState(false);
  // Tracks the previously seen config state so a lookup that failed just
  // because /api/status had not resolved yet is retried once it does. A
  // genuine miss (provider really returned nothing) stays final.
  const configSeenRef = useRef(false);

  // Direct links to live flights that are not in the local cache yet.
  useEffect(() => {
    if (flight || lookupState !== "idle") return;
    const rawId = decodeURIComponent(params.id ?? "").replace(/\s+/g, "");
    if (!/^[A-Za-z0-9]{2,3}\d{1,4}[A-Za-z]?$/.test(rawId)) {
      setLookupState("notfound");
      return;
    }
    if (offlineMode || !aeroConfigured) {
      setLookupState("notfound");
      return;
    }
    let active = true;
    setLookupState("loading");
    configSeenRef.current = true;
    const url = new URL(
      `/api/flights/search?flight=${encodeURIComponent(rawId)}`,
      window.location.origin,
    );
    if (dateParam) url.searchParams.set("date", dateParam);
    setLookupError(null);
    authFetch(url, {
      cache: "no-store",
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as
          | { flights?: Flight[]; error?: string; mode?: string }
          | null;
        if (!active) return;
        if (!response.ok || data?.error) {
          setLookupError(
            data?.error ?? "Live flight lookup is temporarily unavailable.",
          );
          setLookupState("error");
          return;
        }
        if (data?.flights?.length) {
          upsertFlights(data.flights);
          setLookupState("idle");
        } else {
          setLookupState("notfound");
        }
      })
      .catch(() => {
        if (!active) return;
        setLookupError("Live flight lookup is temporarily unavailable.");
        setLookupState("error");
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, flight?.id, lookupState, offlineMode, aeroConfigured, upsertFlights]);

  // Retrying once when the provider config arrives late (cold load). The
  // configSeenRef flip guard prevents a loop when the provider genuinely has
  // nothing for this number.
  useEffect(() => {
    if (
      aeroConfigured &&
      !configSeenRef.current &&
      lookupState === "notfound" &&
      !offlineMode &&
      /^\s*[A-Za-z0-9]{5,8}\s*$/.test(decodeURIComponent(params.id ?? "").replace(/\s+/g, ""))
    ) {
      setLookupState("idle");
    }
    configSeenRef.current = configSeenRef.current || aeroConfigured;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aeroConfigured, lookupState, offlineMode]);

  useEffect(() => {
    if (!flight) return;
    let active = true;
    setForecast(null);
    setForecastLoading(true);
    setForecastError(null);
    fetchDestinationForecast(
      flight.destination,
      flight.arrivalTimeEstimated,
      flight.flightDate,
    )
      .then((next) => {
        if (active) setForecast(next);
      })
      .catch((error) => {
        if (active) {
          setForecastError(
            error instanceof Error
              ? error.message
              : "Arrival weather is unavailable.",
          );
        }
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
              description="Looking up this flight number live. Only live data is shown."
            />
          ) : (
            <EmptyState
              icon={<Plane className="size-6" />}
              title={
                lookupState === "error"
                  ? "Live flight lookup unavailable"
                  : "Flight not available"
              }
              description={
                offlineMode
                  ? "Offline mode is active and this flight is not cached. Reconnect to fetch it live."
                  : !aeroConfigured
                    ? "Live flight data is unavailable right now. Saved data still works."
                    : lookupState === "error"
                      ? lookupError ??
                        "Live flight lookup is temporarily unavailable. This is not evidence that the flight does not operate."
                      : "No live data found for this number and date. It may not be operating, or the provider may not cover it."
              }
              action={
                <Link href="/explore/CAI">
                  <Button size="sm">Explore direct routes</Button>
                </Link>
              }
            />
          )}
        </Panel>
      </div>
    );
  }

  const meta = STATUS_META[flight.status];
  const isLivePosition =
    Boolean(flight.telemetry.hasLiveLocation) &&
    isFreshTimestamp(flight.fetchedAt);

  const refreshCurrentFlight = async () => {
    if (offlineMode || refreshingCurrent) return;
    setRefreshingCurrent(true);
    try {
      const url = new URL(
        "/api/flights/search",
        window.location.origin,
      );
      url.searchParams.set(
        "flight",
        normalizeFlightNumber(flight.flightNumber),
      );
      if (flight.flightDate) url.searchParams.set("date", flight.flightDate);
      const response = await authFetch(url, { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as
        | { flights?: Flight[]; error?: string }
        | null;
      if (!response.ok || data?.error) {
        throw new Error(
          data?.error ?? "Live flight refresh is temporarily unavailable.",
        );
      }
      if (!data?.flights?.length) {
        throw new Error(
          "The provider returned no live record for this flight and date.",
        );
      }
      upsertFlights(data.flights);
      notify(`${flight.flightNumber} refreshed from the provider.`, "success");
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Live flight refresh is temporarily unavailable.",
        "warning",
      );
    } finally {
      setRefreshingCurrent(false);
    }
  };

  const openNotes = () => {
    setNoteDraft(flight.customNotes);
    setNotesOpen(true);
  };

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-5 lg:px-8 lg:py-7">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <button
            onClick={() => router.back()}
            className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg border border-line/70 bg-surface-2/60 text-muted transition-colors hover:border-line-strong hover:text-ink"
            aria-label="Back"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div className="min-w-0">
            <p className="label-caps text-accent">Flight dossier</p>
            <h1 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight text-ink">
              {flight.flightNumber}
              <span className="text-sm font-normal text-muted">{flight.airline}</span>
              <StatusBadge
                status={flight.status}
                statusReported={flight.statusReported}
                delayMinutes={flight.delayMinutes}
                delayReported={flight.delayReported}
              />
              {isLivePosition && (
                <span className="flex items-center gap-1 rounded-md bg-accent-soft px-2 py-1 text-xs font-medium text-accent">
                  <Radio className="size-3 animate-pulse" /> Live
                </span>
              )}
            </h1>
            <p className="mt-1 text-xs text-subtle">
              {flight.fetchedAt &&
              Number.isFinite(Date.parse(flight.fetchedAt))
                ? `Provider data retrieved ${timeAgo(Date.parse(flight.fetchedAt))}${
                    flight.source ? ` · ${flight.source}` : ""
                  }`
                : "Provider retrieval time not recorded"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <ActionButton
            icon={<Share2 className="size-4" />}
            label="Share"
            onClick={() => setShareOpen(true)}
          />
          <ActionButton
            icon={<Edit3 className="size-4" />}
            label="Note"
            onClick={openNotes}
            active={Boolean(flight.customNotes)}
          />
          <ActionButton
            icon={
              <Glasses
                fill={flight.isWatchlisted ? "currentColor" : "none"}
                className={cn(
                  "size-4 transition-colors",
                  flight.isWatchlisted ? "fill-current text-accent" : "text-muted",
                )}
              />
            }
            label={flight.isWatchlisted ? "Watchlisted" : "Watchlist"}
            active={flight.isWatchlisted}
            onClick={() => toggleWatchlist(flight)}
          />
          <ActionButton
            icon={
              <Radio
                className={cn("size-4", refreshingCurrent && "animate-pulse")}
              />
            }
            label={refreshingCurrent ? "Refreshing" : "Refresh"}
            onClick={() => void refreshCurrentFlight()}
          />
          <Link
            href={
              flight.flightDate
                ? `/map/${encodeURIComponent(flight.id)}?date=${encodeURIComponent(flight.flightDate)}`
                : `/map/${encodeURIComponent(flight.id)}`
            }
          >
            <Button size="sm" variant="outline">
              <MapIcon className="size-4" /> Live map
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-6">
        <div className="min-w-0 space-y-4">
          {/* Hero */}
          <Panel className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 px-4 py-3">
              <div className="flex items-center gap-2">
                <span
                  className="flex size-8 items-center justify-center rounded-lg border font-mono text-xs font-semibold"
                  style={{
                    color: meta.color,
                    backgroundColor: meta.soft,
                    borderColor: `${meta.color}55`,
                  }}
                >
                  {flight.airlineCode}
                </span>
                <div>
                  <p className="text-xs font-medium text-ink">
                    {flight.origin.city} → {flight.destination.city}
                    {flight.flightDate ? ` · ${flightDateLabel(flight.flightDate)}` : ""}
                  </p>
                  <p className="text-xs text-subtle">
                    {flight.aircraft.model} · {flight.aircraft.registration}
                  </p>
                </div>
              </div>
              {flight.delayReason && (
                <span className="rounded-full border border-delayed/40 bg-delayed/10 px-2 py-1 text-xs font-semibold text-delayed">
                  {flight.delayReason}
                </span>
              )}
            </div>
            <div className="p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="font-mono text-2xl font-semibold leading-none tracking-tight text-ink lg:text-[28px]">
                    {flight.origin.code}
                    <span className="mx-2 text-lg text-subtle">→</span>
                    {flight.destination.code}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {flight.origin.name} → {flight.destination.name}
                  </p>
                </div>
                <div className="shrink-0 sm:text-right">
                  <p className="label-caps text-subtle">Estimated arrival</p>
                  <p className="text-lg font-semibold text-ink tabular">
                    {flight.arrivalTimeEstimated}
                  </p>
                  <p className="text-xs text-subtle">
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
                  label="Remaining (calc.)"
                  value={
                    isLivePosition && flight.telemetry.etaMinutesRemaining > 0
                      ? `${Math.floor(flight.telemetry.etaMinutesRemaining / 60)}h ${flight.telemetry.etaMinutesRemaining % 60}m`
                      : "—"
                  }
                  sub={isLivePosition ? "Calculated from position" : "Not reported"}
                />
                <InlineMetric
                  label="Progress (calc.)"
                  value={
                    isLivePosition
                      ? `${Math.round(flight.telemetry.progressPercent * 100)}%`
                      : "—"
                  }
                  sub={
                    isLivePosition
                      ? `${flight.telemetry.distanceRemainingNm} nm remaining`
                      : "Live position not reported"
                  }
                  accent
                />
              </div>

              {flight.statusNote && (
                <p className="mt-3 rounded-lg border border-accent/25 bg-accent-soft px-3 py-2 text-xs font-medium text-accent">
                  {flight.statusNote}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setMapExpanded((value) => !value)} variant="outline">
                  <Expand className="size-3.5" /> {mapExpanded ? "Compact radar" : "Expand radar"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShareOpen(true)}>
                  <Share2 className="size-3.5" /> Share status
                </Button>
              </div>
            </div>
          </Panel>

          <DelayLoungeCard
            delayMinutes={flight.delayMinutes}
            flightNumber={flight.flightNumber}
          />
          <ArrivalEsimCard
            status={flight.status}
            originCountry={flight.origin.country}
            destinationCountry={flight.destination.country}
            destinationCity={flight.destination.city}
          />

          {/* Gates */}
          <div className="grid gap-2 sm:grid-cols-2">
            <GateTile
              label="Departure gate"
              primary={gateLabel(
                flight.terminalDeparture,
                flight.gateDeparture,
              )}
              secondary={reportedOrUnavailable(flight.checkInCounter)}
              icon={<PlaneTakeoff className="size-4" />}
            />
            <GateTile
              label="Arrival gate"
              primary={gateLabel(
                flight.terminalArrival,
                flight.gateArrival,
              )}
              secondary={reportedOrUnavailable(flight.baggageCarousel)}
              icon={<PlaneLanding className="size-4" />}
            />
          </div>

          <div
            className={cn(
              "transition-all duration-300",
              mapExpanded ? "h-[420px]" : "h-[300px]",
            )}
          >
            <FlightMapPreview
              flight={flight}
              className="h-full"
              isExpanded={mapExpanded}
              onToggleExpand={() => setMapExpanded((value) => !value)}
            />
          </div>

          <DestinationWeatherCard
            forecast={forecast}
            loading={forecastLoading}
            error={forecastError}
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
              <div
                className="flex items-start gap-2.5 cursor-pointer select-none"
                onClick={() => toggleWatchlist(flight)}
              >
                <div
                  className={cn(
                    "mt-0.5 rounded-lg border p-1.5 transition-colors",
                    flight.isWatchlisted
                      ? "border-accent/40 bg-accent-soft text-accent"
                      : "border-line bg-surface-2 text-muted",
                  )}
                >
                  <Glasses
                    fill={flight.isWatchlisted ? "currentColor" : "none"}
                    className={cn(
                      "size-4 transition-colors",
                      flight.isWatchlisted ? "fill-current text-accent" : "text-muted",
                    )}
                  />
                </div>
                <div>
                  <p className="text-[13px] font-medium text-ink">
                    {flight.isWatchlisted
                      ? "Saved to your watchlist"
                      : "Add this flight to your watchlist"}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">
                    {flight.isWatchlisted
                      ? "Offline-cached with alerts for gate, delay, boarding, and baggage."
                      : "Persist to the local cache for offline monitoring and alerts."}
                  </p>
                </div>
              </div>
              <button
                onClick={() => toggleWatchlist(flight)}
                className={cn(
                  "relative h-6 w-11 shrink-0 rounded-full border transition-colors",
                  flight.isWatchlisted
                    ? "border-accent bg-accent/30"
                    : "border-line bg-surface-3",
                )}
                aria-label="Toggle watchlist"
              >
                <span
                  className={cn(
                    "absolute top-0.5 size-4.5 rounded-full transition-all",
                    flight.isWatchlisted ? "left-[22px] bg-accent" : "left-0.5 bg-muted",
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
                icon={
                  <Radio
                    className={cn(
                      "size-3.5",
                      refreshingCurrent && "animate-pulse",
                    )}
                  />
                }
                label={refreshingCurrent ? "Refreshing flight" : "Refresh flight"}
                onClick={() => void refreshCurrentFlight()}
              />
            </div>
          </Panel>

          <Panel className="p-3.5">
            <div className="flex items-center justify-between">
              <p className="label-caps text-subtle">Provider telemetry</p>
              <span
                className={cn(
                  "flex items-center gap-1 text-xs font-semibold",
                  isLivePosition ? "text-landed" : "text-subtle",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    isLivePosition
                      ? "animate-pulse-dot bg-landed"
                      : "bg-subtle",
                  )}
                />
                {isLivePosition ? "LIVE POSITION" : "POSITION NOT REPORTED"}
              </span>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <Snapshot label="Altitude" value={isLivePosition ? `${flight.telemetry.altitudeFeet.toLocaleString()} ft` : "—"} accent />
              <Snapshot label="Ground speed" value={isLivePosition ? `${flight.telemetry.groundSpeedKnots} kt` : "—"} />
              <Snapshot label="Mach" value="—" />
              <Snapshot label="Heading" value={isLivePosition ? `${Math.round(flight.telemetry.headingDegrees)}°` : "—"} />
              <Snapshot label="Vertical speed" value="—" />
              <Snapshot label="ETA (calculated)" value={isLivePosition && flight.telemetry.etaMinutesRemaining > 0 ? `${flight.telemetry.etaMinutesRemaining} min` : "—"} accent />
            </div>
            {flight.customNotes && (
              <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-line/60 bg-surface-2 px-2.5 py-2">
                <StickyNote className="mt-0.5 size-3.5 shrink-0 text-accent" />
                <p className="text-xs leading-relaxed text-muted">
                  {flight.customNotes}
                </p>
              </div>
            )}
          </Panel>

          <AircraftInfoCard aircraft={flight.aircraft} />

          <Panel className="p-3.5">
            <p className="label-caps text-subtle">Flight data</p>
            <div className="mt-2 space-y-1.5 text-xs">
              <DataRow label="Airline" value={flight.airline} />
              <DataRow label="Airline code" value={flight.airlineCode} mono />
              <DataRow label="Flight number" value={flight.flightNumber} mono />
              <DataRow
                label="Check-in"
                value={reportedOrUnavailable(flight.checkInCounter)}
              />
              <DataRow
                label="Baggage"
                value={reportedOrUnavailable(flight.baggageCarousel)}
              />
              <DataRow label="Origin TZ" value={flight.origin.timezone} />
              <DataRow label="Dest. TZ" value={flight.destination.timezone} />
            </div>
          </Panel>

          <div className="rounded-xl border border-dashed border-line bg-surface-2/50 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <MapPin className="size-3 text-accent" /> Cached & cloud synced
            </p>
            <p className="mt-1 text-xs leading-relaxed text-subtle">
              Flight state is saved on this device and synced to
              your account when you’re signed in.
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
          updateNotes(flight.flightNumber, noteDraft, flight.flightDate);
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
        "inline-flex h-10 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors",
        active
          ? "border-accent/40 bg-accent-soft text-accent"
          : "border-line/70 bg-surface-2/50 text-muted hover:border-line-strong hover:text-ink",
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
      <p className={cn("mt-0.5 text-sm font-semibold tabular", accent ? "text-accent" : "text-ink")}>
        {value}
      </p>
      {sub && <p className="mt-0.5 truncate text-xs text-subtle">{sub}</p>}
    </div>
  );
}

function assigned(value: string | null | undefined): value is string {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return (
    normalized !== "" &&
    normalized !== "—" &&
    normalized !== "–" &&
    normalized !== "-" &&
    normalized !== "n/a" &&
    normalized !== "tbd" &&
    normalized !== "gate tbd" &&
    normalized !== "carousel tbd" &&
    normalized !== "unknown" &&
    normalized !== "not reported"
  );
}

function gateLabel(terminal: string, gate: string): string {
  const terminalPart = assigned(terminal) ? `Terminal ${terminal}` : null;
  const gatePart = assigned(gate) ? gate : null;
  return [terminalPart, gatePart].filter(Boolean).join(" · ") || "Not reported";
}

function reportedOrUnavailable(value: string | null | undefined): string {
  return assigned(value) ? value : "Not reported";
}

function GateTile({
  label,
  primary,
  secondary,
  icon,
}: {
  label: string;
  primary: string;
  secondary: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line/70 bg-surface p-3.5">
      <div className="flex items-center justify-between">
        <p className="label-caps text-subtle">{label}</p>
        <span className="text-accent">{icon}</span>
      </div>
      <p className="mt-1.5 truncate text-sm font-semibold text-ink">{primary}</p>
      <p className="mt-0.5 truncate text-xs text-accent-2">{secondary}</p>
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
      className="flex min-h-10 items-center gap-1.5 rounded-lg border border-line/70 bg-surface-2 px-2 py-2 text-xs font-medium text-muted transition-colors hover:border-accent/40 hover:text-accent"
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
      <p className="text-xs font-medium uppercase tracking-wide text-subtle">
        {label}
      </p>
      <p className={cn("mt-0.5 text-[13px] font-semibold tabular", accent ? "text-accent" : "text-ink")}>
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
      subtitle="Personal notes stay on your device and sync to your account when signed in."
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
        maxLength={500}
        className="min-h-28 w-full resize-none rounded-lg border border-line bg-surface-2/70 px-3 py-2.5 text-sm leading-relaxed text-ink outline-none transition-colors placeholder:text-subtle/80 hover:border-line-strong focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
      <p className="mt-1.5 text-xs text-subtle">
        Notes stay private to you — only you and your devices can
        see them. Up to 500 characters each.
      </p>
    </Modal>
  );
}
