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
  /** Provider observation time, only when the provider actually supplies one. */
  locationUpdatedAt?: number;
  /** When this engine received the provider response. */
  fetchedAt?: number;
  /** True when numeric telemetry is retained from an older live fix. */
  stale?: boolean;
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
  statusReported?: boolean;
  statusRaw?: string;
  statusNote?: string | null;
  /** Epoch ms when the engine first observed the LANDED state. */
  landedAt?: number;
  delayMinutes?: number;
  delayReported?: boolean;
  delaySource?: "provider" | "derived" | "unknown";
  delayReason?: string | null;
  /** Provider response identity and freshness for this snapshot. */
  dataSource?: "AERODATABOX";
  fetchedAt?: string;
  cached?: boolean;
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

/**
 * Builds the minimal snapshot the engine can schedule from when the stored
 * payload is missing. Snapshots are purged after 7 days (provider caching
 * terms), but the watchlist row must remain refreshable forever.
 */
export function snapshotFromRow(row: SupabaseWatchRow): WatchSnapshot {
  if (isWatchSnapshot(row.snapshot)) return row.snapshot;
  return {
    id: row.flight_id,
    flightNumber: row.flight_number,
    flightDate: row.flight_date,
    status: row.status ?? undefined,
  };
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

/**
 * Midday UTC approximation for a date-only row. Used only when the snapshot
 * was purged and no departure time/zone survived; it schedules a re-fetch
 * rather than pretending to know the exact departure.
 */
function snapshotDateHintMs(snapshot: WatchSnapshot): number | null {
  const dateIso = typeof snapshot.flightDate === "string" ? snapshot.flightDate : null;
  if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return null;
  const parsed = Date.parse(`${dateIso}T12:00:00Z`);
  return Number.isFinite(parsed) ? parsed : null;
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
  const operatingDate = summary.scheduledDeparture?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  // Never merge a provider result for a different operating date into this
  // snapshot. A date-less match is not evidence that it is the same flight.
  if (snapshot.flightDate && operatingDate && snapshot.flightDate !== operatingDate) {
    return snapshot;
  }
  if (!snapshot.flightDate && operatingDate) snapshot.flightDate = operatingDate;
  if (summary.airline) snapshot.airline = summary.airline;
  if (summary.airlineCode) snapshot.airlineCode = summary.airlineCode;
  if (summary.statusReported) {
    snapshot.status = summary.status;
    snapshot.statusReported = true;
    snapshot.statusRaw = summary.statusRaw;
  } else {
    // Preserve the last verified status when this poll did not report one.
    if (!snapshot.status) snapshot.status = summary.status;
    snapshot.statusReported = snapshot.statusReported ?? false;
    snapshot.statusRaw = summary.statusRaw;
  }
  if (snapshot.status === "LANDED" && typeof snapshot.landedAt !== "number") {
    snapshot.landedAt = nowMs;
  } else if (snapshot.status !== "LANDED") {
    snapshot.landedAt = undefined;
  }
  // If the snapshot payload was pruned, rebuild the airport endpoints from
  // the provider so the snapshot remains a usable Flight face for clients.
  // Only overwrite airport fields the provider explicitly returned. A missing
  // timezone must not replace a previously verified one with "UTC".
  snapshot.origin = {
    ...(snapshot.origin ?? {}),
    code: summary.origin.code || snapshot.origin?.code,
    ...(summary.origin.name ? { name: summary.origin.name } : {}),
    ...(summary.origin.city ? { city: summary.origin.city } : {}),
    ...(summary.origin.country ? { country: summary.origin.country } : {}),
    ...(summary.origin.timezone ? { timezone: summary.origin.timezone } : {}),
    latitude: summary.origin.latitude,
    longitude: summary.origin.longitude,
  };
  snapshot.destination = {
    ...(snapshot.destination ?? {}),
    code: summary.destination.code || snapshot.destination?.code,
    ...(summary.destination.name ? { name: summary.destination.name } : {}),
    ...(summary.destination.city ? { city: summary.destination.city } : {}),
    ...(summary.destination.country ? { country: summary.destination.country } : {}),
    ...(summary.destination.timezone ? { timezone: summary.destination.timezone } : {}),
    latitude: summary.destination.latitude,
    longitude: summary.destination.longitude,
  };
  if (!Array.isArray(snapshot.timeline)) snapshot.timeline = [];
  if (summary.statusNote) snapshot.statusNote = summary.statusNote;
  if (summary.delayReported) {
    snapshot.delayMinutes = summary.delayMinutes;
    snapshot.delayReported = true;
    snapshot.delaySource = summary.delaySource;
    // Only a provider-supplied reason is a fact. FlightSummary currently has
    // no reason field, so this remains null rather than inventing one.
    snapshot.delayReason = null;
  } else {
    // Preserve the last reported delay; do not turn "unknown" into 0 minutes.
    snapshot.delayReported = snapshot.delayReported ?? false;
    snapshot.delaySource = snapshot.delaySource ?? "unknown";
  }
  snapshot.dataSource = "AERODATABOX";
  snapshot.fetchedAt = new Date(nowMs).toISOString();
  snapshot.cached = false;

  const scheduled = timeHHmm(summary.scheduledDeparture);
  if (scheduled) {
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
      // Only a provider-supplied observation time is valid here. The engine
      // response time is recorded separately as `fetchedAt`.
      locationUpdatedAt:
        summary.telemetry.updatedAt != null
          ? Date.parse(summary.telemetry.updatedAt)
          : undefined,
      fetchedAt: nowMs,
      stale: false,
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
    // No live fix this cycle. Clear measured values instead of leaving old
    // altitude/speed/ETA numbers looking current.
    telemetry = {
      ...defaultTelemetry(),
      hasLiveLocation: false,
      locationUpdatedAt: undefined,
      fetchedAt: nowMs,
      stale: true,
      progressPercent:
        summary.status === "LANDED"
          ? 1
          : summary.status === "DEPARTED"
            ? telemetry.progressPercent
            : 0,
      distanceRemainingNm: 0,
      etaMinutesRemaining: 0,
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
    previous.gateDeparture !== "Gate TBD" &&
    next.gateDeparture !== "Gate TBD" &&
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
    next.statusReported !== false &&
    ((next.delayReported &&
      typeof next.delayMinutes === "number" &&
      Number.isFinite(next.delayMinutes) &&
      next.delayMinutes > 0 &&
      (!previous.delayReported ||
        (typeof previous.delayMinutes === "number" &&
          Number.isFinite(previous.delayMinutes) &&
          next.delayMinutes > previous.delayMinutes))) ||
      (next.status === "DELAYED" && previous.status !== "DELAYED"))
  ) {
    drafts.push({
      type: "DELAY",
      title: `Delay update · ${flightNumber}`,
      message: next.delayReported
        ? `${flightNumber} is now delayed by ${next.delayMinutes} minutes. Estimated departure ${next.departureTimeEstimated ?? "—"}. ${next.delayReason ?? ""}`.trim()
        : `${flightNumber} is reported delayed. The provider did not report a delay duration. Estimated departure ${next.departureTimeEstimated ?? "—"}.`,
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
 * restarts do not replay the same change twice. The user id is part of the
 * key: two people watching the same flight must both receive the alert.
 */
export function alertKey(
  userId: string,
  flightNumber: string,
  draft: EngineAlertDraft,
): string {
  return `${userId}|${flightNumber}|${draft.type}|${draft.message}`;
}

export function matchesJob(summary: FlightSummary, job: WatchJob): boolean {
  if (compactFlightNumber(summary.flightNumber) !== compactFlightNumber(job.flightNumber)) {
    return false;
  }
  const summaryDate = summary.scheduledDeparture?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
  // A flight number alone does not identify an operating date. Without a
  // stored date we cannot prove this summary belongs to the watched flight,
  // so it must not be merged into that row.
  if (!job.flightDate) return false;
  return job.flightDate === summaryDate;
}

export interface NextPollSchedule {
  /** ISO instant of the next engine poll; null = settled, no further polls. */
  atMs: number | null;
  /** Priority band (1 = operational window, 9 = far-future/free). */
  priority: number;
}

/**
 * Absolute-time poll ladder. Rather than returning "poll in X minutes", this
 * returns the epoch instant when the *next* poll should fire, so the engine
 * state can live in Postgres and survive restarts.
 *
 * The ladder keeps a stable unit budget: far-future entries cost nothing until
 * their operational window opens, and only operational windows get tight
 * cadence.
 */
export function scheduleNextPoll(snapshot: WatchSnapshot, nowMs: number): NextPollSchedule {
  const settled =
    snapshot.status === "CANCELLED" ||
    (snapshot.status === "LANDED" &&
      Boolean(snapshot.baggageCarousel) &&
      snapshot.baggageCarousel !== "Carousel TBD");
  if (settled) {
    // Terminal state: the persisted snapshot is already final when it was
    // written, so the engine never spends units polling a settled flight.
    return { atMs: null, priority: 3 };
  }

  if (snapshot.status === "LANDED") {
    // Baggage/gate may still change shortly after landing, but do not poll a
    // landed flight forever when no carousel is ever assigned.
    const landedAt = typeof snapshot.landedAt === "number" ? snapshot.landedAt : null;
    if (landedAt != null && nowMs - landedAt > MIN(2 * 60)) {
      return { atMs: null, priority: 3 };
    }
    return { atMs: nowMs + MIN(5), priority: 1 };
  }

  const departureMs = snapshotDepartureMs(snapshot);
  if (departureMs == null) {
    // Snapshot was pruned or never carried a departure time. Use the operating
    // date to schedule a conservative recovery poll instead of polling every
    // 20 minutes forever (or, worse, never recovering).
    const dateHintMs = snapshotDateHintMs(snapshot);
    if (dateHintMs == null) {
      // No trustworthy date either: conservative best-effort sweep.
      return { atMs: nowMs + MIN(20), priority: 5 };
    }
    const deltaMs = dateHintMs - nowMs;
    if (deltaMs > MIN(7 * 24 * 60)) {
      return { atMs: dateHintMs - MIN(7 * 24 * 60), priority: 9 };
    }
    if (deltaMs > MIN(24 * 60)) return { atMs: nowMs + MIN(6 * 60), priority: 6 };
    if (deltaMs > 0) return { atMs: nowMs + MIN(60), priority: 5 };
    return { atMs: nowMs + MIN(20), priority: 5 };
  }

  const deltaMs = departureMs - nowMs;
  if (deltaMs > MIN(7 * 24 * 60)) {
    // Enter the tight window one week before departure.
    return { atMs: departureMs - MIN(7 * 24 * 60), priority: 9 };
  }
  if (deltaMs > MIN(24 * 60)) return { atMs: nowMs + MIN(6 * 60), priority: 6 };
  if (deltaMs > MIN(3 * 60)) return { atMs: nowMs + MIN(60), priority: 5 };
  if (deltaMs > MIN(30)) return { atMs: nowMs + MIN(10), priority: 4 };
  if (deltaMs > MIN(10)) return { atMs: nowMs + MIN(5), priority: 3 };
  if (deltaMs > 0) return { atMs: nowMs + MIN(2), priority: 2 };
  if (deltaMs > -MIN(3 * 60)) return { atMs: nowMs + MIN(3), priority: 1 };
  return { atMs: nowMs + MIN(15), priority: 2 };
}
