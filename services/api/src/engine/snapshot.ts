import type { FlightSummary } from "../domain/flight.js";
import type { SupabaseWatchRow } from "../lib/supabase-server.js";

export type EngineAlertType =
  | "GATE_CHANGE"
  | "DELAY"
  | "BOARDING"
  | "CANCELLATION"
  | "BAGGAGE";

/** Mirrors the web client's FlightTelemetry so engine writes stay drop-in. */
export interface WatchSnapshotTelemetry {
  hasLiveLocation?: boolean;
  locationUpdatedAt?: number;
  currentLatitude: number;
  currentLongitude: number;
  altitudeFeet: number;
  groundSpeedKnots: number;
  headingDegrees: number;
  verticalSpeedFpm: number;
  mach: number;
  progressPercent: number;
  distanceCoveredNm: number;
  distanceRemainingNm: number;
  etaMinutesRemaining: number;
  waypoints: unknown[];
}

/** Mirrors the web client's Flight face as stored in watchlist_items.snapshot. */
export interface WatchSnapshot {
  id?: string;
  flightNumber?: string;
  flightDate?: string | null;
  airline?: string;
  airlineCode?: string;
  status?: string;
  statusNote?: string | null;
  delayMinutes?: number;
  delayReason?: string | null;
  terminalDeparture?: string;
  gateDeparture?: string;
  terminalArrival?: string;
  gateArrival?: string;
  checkInCounter?: string;
  baggageCarousel?: string;
  departureTimeScheduled?: string;
  departureTimeEstimated?: string;
  arrivalTimeScheduled?: string;
  arrivalTimeEstimated?: string;
  departureTimeActual?: string | null;
  arrivalTimeActual?: string | null;
  isWatchlisted?: boolean;
  customNotes?: string;
  aircraft?: { model?: string; registration?: string };
  origin?: {
    code?: string;
    timezone?: string;
    latitude?: number;
    longitude?: number;
    [extra: string]: unknown;
  };
  destination?: {
    code?: string;
    timezone?: string;
    latitude?: number;
    longitude?: number;
    [extra: string]: unknown;
  };
  telemetry?: WatchSnapshotTelemetry;
  timeline?: unknown[];
  [extra: string]: unknown;
}

export interface EngineAlertDraft {
  type: EngineAlertType;
  title: string;
  message: string;
}

export interface WatchJob {
  key: string;
  flightNumber: string;
  flightDate: string | null;
  rows: SupabaseWatchRow[];
  priority: number;
  deltaMs: number;
}

export interface DueDecision {
  due: boolean;
  priority: number;
  deltaMs: number;
  nextPollMs: number;
}

const MIN = (minutes: number) => minutes * 60_000;

/** Flight-number matcher without surrounding whitespace. */
export function compactFlightNumber(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, "").toUpperCase();
}

/** Extracts "HH:MM" from provider timestamps like "2026-11-08 18:30-05:00". */
export function timeHHmm(iso: string | null | undefined): string | null {
  const match = iso?.match(/[T ](\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : null;
}

/** Web client uses "Gate B14" style labels; keep that convention server-side. */
export function gateLabel(value: string): string {
  const trimmed = value.trim();
  return /^[Gg]ate/.test(trimmed) ? trimmed : `Gate ${trimmed}`;
}

export function carouselLabel(value: string): string {
  const trimmed = value.trim();
  return /carousel|belt/i.test(trimmed) ? trimmed : `Carousel ${trimmed}`;
}

export function isWatchSnapshot(value: unknown): value is WatchSnapshot {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as WatchSnapshot).flightNumber === "string" &&
    (value as WatchSnapshot).flightNumber!.length > 0
  );
}

function ianaOffsetMs(ianaTimeZone: string, at: number): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: ianaTimeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = new Map<string, string>(
    formatter
      .formatToParts(new Date(at))
      .map((part) => [part.type, part.value] as const),
  );
  const read = (type: string) => Number(parts.get(type) ?? 0);
  const asUTC = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour") % 24,
    read("minute"),
    read("second"),
  );
  return asUTC - at;
}

/** Converts a wall-clock time in a departure airport timezone to UTC epoch ms. */
export function zonedWallClockToUtcMs(
  dateIso: string,
  hhmm: string,
  ianaTimeZone: string,
): number | null {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return null;
    const parts = hhmm.split(":").map(Number);
    const hours = parts[0];
    const minutes = parts[1];
    if (hours == null || minutes == null || !Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    const padded = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    const wallMs = Date.parse(`${dateIso}T${padded}:00Z`);
    if (!Number.isFinite(wallMs)) return null;
    let utcMs = wallMs - ianaOffsetMs(ianaTimeZone, wallMs);
    utcMs = wallMs - ianaOffsetMs(ianaTimeZone, utcMs); // refine once across DST edges
    return utcMs;
  } catch {
    return null;
  }
}

/** Departure epoch for a snapshot, or null when the data is missing. */
export function snapshotDepartureMs(snapshot: WatchSnapshot): number | null {
  const dateIso = typeof snapshot.flightDate === "string" ? snapshot.flightDate : null;
  const hhmm = /(\d{1,2}):(\d{2})/.exec(snapshot.departureTimeScheduled ?? "")?.[0] ?? null;
  const timezone = snapshot.origin?.timezone;
  if (!dateIso || !hhmm || !timezone) return null;
  try {
    return zonedWallClockToUtcMs(dateIso, hhmm, timezone);
  } catch {
    return null;
  }
}

function isFiniteCoord(airport: WatchSnapshot["origin"]): boolean {
  return (
    typeof airport?.latitude === "number" &&
    Number.isFinite(airport.latitude) &&
    typeof airport?.longitude === "number" &&
    Number.isFinite(airport.longitude)
  );
}

export function haversineNm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 3440.065;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function defaultTelemetry(): WatchSnapshotTelemetry {
  return {
    hasLiveLocation: false,
    currentLatitude: 0,
    currentLongitude: 0,
    altitudeFeet: 0,
    groundSpeedKnots: 0,
    headingDegrees: 0,
    verticalSpeedFpm: 0,
    mach: 0,
    progressPercent: 0,
    distanceCoveredNm: 0,
    distanceRemainingNm: 0,
    etaMinutesRemaining: 0,
    waypoints: [],
  };
}

/**
 * Merges a provider summary into a client snapshot. Only fields the engine
 * owns (status, delay, live telemetry, gates) are rewritten; user content such
 * as `isWatchlisted`, `customNotes`, and timeline history is preserved.
 */
export function mergeSnapshot(
  previous: WatchSnapshot,
  summary: FlightSummary,
  nowMs: number,
): WatchSnapshot {
  const snapshot: WatchSnapshot = {
    ...previous,
    telemetry: { ...(previous.telemetry ?? defaultTelemetry()) },
  };

  snapshot.flightNumber = snapshot.flightNumber || summary.flightNumber;
  if (summary.airline) snapshot.airline = summary.airline;
  if (summary.airlineCode) snapshot.airlineCode = summary.airlineCode;
  snapshot.status = summary.status;
  if (summary.statusNote) snapshot.statusNote = summary.statusNote;
  if (Number.isFinite(summary.delayMinutes)) {
    snapshot.delayMinutes = summary.delayMinutes;
    snapshot.delayReason =
      summary.delayMinutes >= 15 ? "Operational / Air Traffic Control revision" : null;
  }

  const scheduled = timeHHmm(summary.scheduledDeparture);
  if (scheduled && !/^\d{1,2}:\d{2}$/.test(snapshot.departureTimeScheduled ?? "")) {
    snapshot.departureTimeScheduled = scheduled;
  }
  const depEstimate = timeHHmm(summary.estimatedDeparture);
  if (depEstimate) snapshot.departureTimeEstimated = depEstimate;
  const arrEstimate = timeHHmm(summary.estimatedArrival);
  if (arrEstimate) snapshot.arrivalTimeEstimated = arrEstimate;

  if (summary.terminalDeparture) snapshot.terminalDeparture = summary.terminalDeparture;
  if (summary.gateDeparture) snapshot.gateDeparture = gateLabel(summary.gateDeparture);
  if (summary.terminalArrival) snapshot.terminalArrival = summary.terminalArrival;
  if (summary.gateArrival) snapshot.gateArrival = gateLabel(summary.gateArrival);
  if (summary.baggageCarousel) snapshot.baggageCarousel = carouselLabel(summary.baggageCarousel);
  if (summary.aircraft?.model || summary.aircraft?.registration) {
    snapshot.aircraft = {
      ...snapshot.aircraft,
      ...(summary.aircraft.model ? { model: summary.aircraft.model } : {}),
      ...(summary.aircraft.registration ? { registration: summary.aircraft.registration } : {}),
    };
  }

  const origin = snapshot.origin;
  const destination = snapshot.destination;
  const totalNm =
    isFiniteCoord(origin) && isFiniteCoord(destination)
      ? haversineNm(origin!.latitude!, origin!.longitude!, destination!.latitude!, destination!.longitude!)
      : null;

  let telemetry = snapshot.telemetry ?? defaultTelemetry();
  if (
    summary.telemetry.hasLiveLocation &&
    Number.isFinite(summary.telemetry.latitude) &&
    Number.isFinite(summary.telemetry.longitude)
  ) {
    const flownNm =
      totalNm != null && totalNm > 0
        ? haversineNm(origin!.latitude!, origin!.longitude!, summary.telemetry.latitude, summary.telemetry.longitude)
        : 0;
    const remainingNm =
      totalNm != null
        ? Math.max(0, Math.round(totalNm - flownNm))
        : (snapshot.telemetry?.distanceRemainingNm ?? 0);
    const etaMinutes =
      remainingNm > 0 && summary.telemetry.groundSpeedKnots > 0
        ? Math.round((remainingNm / summary.telemetry.groundSpeedKnots) * 60)
        : 0;
    const progress =
      summary.status === "LANDED"
        ? 1
        : summary.status === "DEPARTED" && totalNm
          ? Math.min(0.98, Math.max(0, flownNm / totalNm))
          : 0;
    telemetry = {
      ...telemetry,
      hasLiveLocation: true,
      locationUpdatedAt: nowMs,
      currentLatitude: summary.telemetry.latitude,
      currentLongitude: summary.telemetry.longitude,
      altitudeFeet: summary.telemetry.altitudeFeet,
      groundSpeedKnots: summary.telemetry.groundSpeedKnots,
      headingDegrees: summary.telemetry.headingDegrees,
      progressPercent: progress,
      distanceCoveredNm: Math.round(flownNm),
      distanceRemainingNm: remainingNm,
      etaMinutesRemaining: etaMinutes,
    };
  } else if (summary.telemetry.hasLiveLocation === false) {
    // No live fix from the provider this cycle; drop the live flag but keep
    // any previously known position so the UI does not fabricate fresh data.
    telemetry = {
      ...telemetry,
      hasLiveLocation: false,
      locationUpdatedAt: undefined,
      progressPercent:
        summary.status === "LANDED"
          ? 1
          : summary.status === "DEPARTED"
            ? telemetry.progressPercent
            : 0,
    };
  }
  snapshot.telemetry = telemetry;
  return snapshot;
}

/**
 * Change detection between the snapshot the engine previously saw and the
 * freshly merged one. Mirrors the web client's alert semantics so both sides
 * produce the same titles and messages.
 */
export function diffAlerts(
  previous: WatchSnapshot,
  next: WatchSnapshot,
  flightNumber: string,
): EngineAlertDraft[] {
  const drafts: EngineAlertDraft[] = [];
  const airline = next.airline || "Flight";

  if (
    previous.gateDeparture &&
    next.gateDeparture &&
    previous.gateDeparture !== next.gateDeparture
  ) {
    drafts.push({
      type: "GATE_CHANGE",
      title: `Gate change · ${flightNumber}`,
      message: `${airline} ${flightNumber} departure gate changed from ${previous.gateDeparture} to ${next.gateDeparture} (Terminal ${next.terminalDeparture ?? "—"}).`,
    });
  }

  if (next.status === "CANCELLED" && previous.status !== "CANCELLED") {
    drafts.push({
      type: "CANCELLATION",
      title: `Flight cancelled · ${flightNumber}`,
      message: `${flightNumber} (${next.origin?.code ?? previous.origin?.code ?? "—"} → ${next.destination?.code ?? previous.destination?.code ?? "—"}) has been cancelled. ${next.delayReason ?? "Contact your airline for rebooking."}`,
    });
  } else if (
    (Number.isFinite(next.delayMinutes) &&
      Number.isFinite(previous.delayMinutes) &&
      (next.delayMinutes ?? 0) > (previous.delayMinutes ?? 0)) ||
    (next.status === "DELAYED" && previous.status !== "DELAYED")
  ) {
    drafts.push({
      type: "DELAY",
      title: `Delay update · ${flightNumber}`,
      message: `${flightNumber} is now delayed by ${next.delayMinutes ?? 0} minutes. Estimated departure ${next.departureTimeEstimated ?? "—"}. ${next.delayReason ?? ""}`.trim(),
    });
  }

  if (next.status === "BOARDING" && previous.status !== "BOARDING") {
    drafts.push({
      type: "BOARDING",
      title: `Boarding · ${flightNumber}`,
      message: `Boarding has started for ${flightNumber} at ${next.gateDeparture ?? "Gate TBD"}, Terminal ${next.terminalDeparture ?? "—"}.`,
    });
  }

  if (
    next.status === "LANDED" &&
    next.baggageCarousel &&
    next.baggageCarousel !== "Carousel TBD" &&
    next.baggageCarousel !== previous.baggageCarousel
  ) {
    drafts.push({
      type: "BAGGAGE",
      title: `Baggage update · ${flightNumber}`,
      message: `Baggage for ${flightNumber} is assigned to ${next.baggageCarousel} at ${next.destination?.code ?? previous.destination?.code ?? "—"}.`,
    });
  }

  return drafts;
}

/**
 * Deduplication key shared with recent-alert seeding from Supabase so engine
 * restarts do not replay the same change twice.
 */
export function alertKey(flightNumber: string, draft: EngineAlertDraft): string {
  return `${flightNumber}|${draft.type}|${draft.message}`;
}

/**
 * Polling ladder: units belong to the flight-day, not the calendar. Far-out
 * entries are effectively free; the operational window gets tight cadence.
 */
export function evaluateDue(
  snapshot: WatchSnapshot,
  lastRefreshMs: number,
  nowMs: number,
): DueDecision {
  const ageMs = nowMs - lastRefreshMs;
  const when = (nextPollMs: number, priority: number, deltaMs: number): DueDecision => ({
    due: ageMs >= nextPollMs,
    priority,
    deltaMs,
    nextPollMs,
  });

  const isSettled =
    snapshot.status === "CANCELLED" ||
    (snapshot.status === "LANDED" &&
      Boolean(snapshot.baggageCarousel) &&
      snapshot.baggageCarousel !== "Carousel TBD");
  if (isSettled) {
    // Terminal state: the client snapshot is already final when it was saved,
    // so the engine never spends units polling settled flights.
    return { due: false, priority: 3, deltaMs: 0, nextPollMs: 0 };
  }

  if (snapshot.status === "LANDED") {
    // baggage/gate may still update shortly after landing.
    return when(MIN(5), 1, Number.NaN);
  }

  const departureMs = snapshotDepartureMs(snapshot);
  if (departureMs == null) {
    // No trustworthy departure time: conservative best-effort sweep.
    return when(MIN(20), 5, Number.NaN);
  }

  const deltaMs = departureMs - nowMs;
  if (deltaMs > MIN(7 * 24 * 60)) {
    // Far-future watchlist entries cost nothing until the trip window opens.
    return { due: false, priority: 9, deltaMs, nextPollMs: 0 };
  }
  if (deltaMs > MIN(24 * 60)) return when(MIN(6 * 60), 6, deltaMs);
  if (deltaMs > MIN(3 * 60)) return when(MIN(60), 5, deltaMs);
  if (deltaMs > MIN(30)) return when(MIN(10), 4, deltaMs);
  if (deltaMs > MIN(10)) return when(MIN(5), 3, deltaMs);
  if (deltaMs > 0) return when(MIN(2), 2, deltaMs);
  if (deltaMs > -MIN(3 * 60)) return when(MIN(3), 1, deltaMs);
  return when(MIN(15), 2, deltaMs);
}

export function matchesJob(summary: FlightSummary, job: WatchJob): boolean {
  if (compactFlightNumber(summary.flightNumber) !== compactFlightNumber(job.flightNumber)) {
    return false;
  }
  const summaryDate = summary.scheduledDeparture?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
  return (job.flightDate ?? null) === summaryDate;
}
