/**
 * Shared AeroDataBox -> console `Flight` mapping.
 *
 * This is the verbatim mapper that used to exist twice - once in the gateway
 * (`services/api/src/providers/console-flights.ts`) and once in the web dev
 * fallback (`apps/web/src/lib/aerodatabox.ts`). Values (ids, gates, timelines,
 * progress) must stay byte-compatible with the historical web output, so the
 * transformation lives here in one place and each consumer binds its own
 * airport-node lookup (api: `@avi/catalog`, web: `@/lib/data`).
 */
import type {
  AircraftInfo,
  Airport,
  AirportNode,
  Flight,
  FlightStatus,
  FlightTelemetry,
  FlightTimelineEvent,
  RouteRegion,
} from "./types.js";

export type AirportNodeLookup = (iata: string) => AirportNode | undefined;

export interface ConsoleMapperOptions {
  /**
   * Resolves an airport from the bundled reference catalog when the provider
   * payload lacks coordinates or metadata.
   */
  lookupAirportNode: AirportNodeLookup;
}

export interface ConsoleMapper {
  mapFlight(
    dto: AeroFlightDto,
    fallbackIata?: string,
    isDeparture?: boolean,
  ): Flight | null;
  mapFids(code: string, dto: AeroFidsResponseDto): Flight[];
}

/** Builds a mapper whose airport lookups are bound at construction time. */

// ── AeroDataBox DTOs ──────────────────────────────────────────────────────────

export interface AeroAirportDto {  iata?: string;
  icao?: string;
  name?: string;
  shortName?: string;
  municipalityName?: string;
  countryCode?: string;
  timeZone?: string;
  location?: { lat?: number; lon?: number };
}

export interface AeroTimeDto {
  utc?: string;
  local?: string;
}

export interface AeroMovementDto {
  airport?: AeroAirportDto;
  scheduledTime?: AeroTimeDto;
  revisedTime?: AeroTimeDto;
  predictedTime?: AeroTimeDto;
  runwayTime?: AeroTimeDto;
  terminal?: string;
  checkInDesk?: string;
  gate?: string;
  baggageBelt?: string;
  runway?: string;
  quality?: string[];
}

export interface AeroFlightDto {
  number?: string;
  status?: string;
  departure?: AeroMovementDto;
  arrival?: AeroMovementDto;
  movement?: AeroMovementDto;
  airline?: { name?: string; iata?: string; icao?: string };
  aircraft?: { reg?: string; model?: string };
  location?: {
    lat?: number;
    lon?: number;
    altitude?: { feet?: number };
    groundSpeed?: { kt?: number };
    trueTrack?: { deg?: number };
  };
  greatCircleDistance?: { km?: number; nm?: number };
}

export interface AeroFidsResponseDto {
  departures?: AeroFlightDto[];
  arrivals?: AeroFlightDto[];
}

// ── Mapping helpers (ported from the web client) ─────────────────────────────



function timeHHmm(iso: string | undefined, fallback: string) {
  if (!iso) return fallback;
  const match = iso.match(/[T ](\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : fallback;
}

function normalizeFlightNumber(raw: string) {
  const compact = raw.replace(/\s+/g, "").toUpperCase();
  const match = compact.match(/^([A-Z]{2,3})(\d{1,4}[A-Z]?)$/);
  return match ? `${match[1]} ${match[2]}` : compact;
}

/** Departure date in the departure airport's timezone (ISO YYYY-MM-DD). */
function scheduledDepartureDate(
  dto: AeroMovementDto | undefined,
): string | undefined {
  const raw = dto?.scheduledTime?.local ?? dto?.scheduledTime?.utc;
  return raw?.match(/\d{4}-\d{2}-\d{2}/)?.[0];
}

function resolveAirport(
  dto: AeroAirportDto | undefined,
  fallbackIata: string | undefined,
  defaultIata: string | undefined,
  lookupAirportNode: AirportNodeLookup | undefined,
): Airport | null {
  const rawCode = dto?.iata ?? fallbackIata ?? defaultIata;
  if (!rawCode) return null;
  const code = rawCode.trim().toUpperCase();
  const node = lookupAirportNode?.(code);
  const latitude = dto?.location?.lat ?? node?.latitude;
  const longitude = dto?.location?.lon ?? node?.longitude;

  // A flight without both endpoints cannot be plotted or tracked honestly.
  if (latitude == null || longitude == null) return null;

  return {
    code,
    // Missing metadata is left missing. The code is the only value we can
    // verify here, so the UI can render "not reported" instead of an invented
    // airport name, city, country or timezone.
    name: dto?.name ?? node?.name ?? code,
    city: dto?.municipalityName ?? node?.city ?? "",
    country: dto?.countryCode ?? node?.country ?? "",
    timezone: dto?.timeZone ?? node?.timezone ?? "",
    latitude,
    longitude,
    // Operational weather is fetched separately; these values are explicit
    // placeholders, never a weather claim.
    weather: {
      tempC: 0,
      tempF: 32,
      condition: "Weather not loaded",
      wind: "",
      visibility: "",
      humidity: 0,
    },
    weatherReported: false,
  };
}

function distanceNmBetween(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) {
  const R = 3440.065;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const rLat1 = (lat1 * Math.PI) / 180;
  const rLat2 = (lat2 * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function delayMinutes(
  scheduled: string | undefined,
  revised: string | undefined,
): number | null {
  if (!scheduled || !revised) return null;
  const start = new Date(scheduled.replace(" ", "T")).getTime();
  const end = new Date(revised.replace(" ", "T")).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, Math.round((end - start) / 60000));
}

interface MappedStatus {
  status: FlightStatus;
  reported: boolean;
  raw: string;
}

function mapStatus(raw: string | undefined, delay: number | null): MappedStatus {
  const rawText = raw?.trim() ?? "";
  const status = rawText.toLowerCase();
  if (status.includes("cancel")) {
    return { status: "CANCELLED", reported: true, raw: rawText };
  }
  if (status.includes("board")) {
    return { status: "BOARDING", reported: true, raw: rawText };
  }
  if (status.includes("arriv") || status.includes("land")) {
    return { status: "LANDED", reported: true, raw: rawText };
  }
  if (
    status.includes("depart") ||
    status.includes("en route") ||
    status.includes("airborne")
  ) {
    return { status: "DEPARTED", reported: true, raw: rawText };
  }
  if (status.includes("delay")) {
    return { status: "DELAYED", reported: true, raw: rawText };
  }
  if (status.includes("schedul")) {
    return { status: "SCHEDULED", reported: true, raw: rawText };
  }
  // A delay computed from the provider's scheduled/revised times is evidence
  // of a delay even when the status string is absent.
  if (delay != null && delay >= 15) {
    return { status: "DELAYED", reported: true, raw: rawText };
  }
  // A missing or unrecognised status is not evidence that a flight is
  // scheduled. Keep the neutral display value but mark it unreported so the
  // UI can render "Status not reported" instead of "Scheduled".
  return { status: "SCHEDULED", reported: false, raw: rawText };
}

function gate(value: string | undefined, prefix = "Gate") {
  if (!value) return `${prefix} TBD`;
  return value.toLowerCase().startsWith(prefix.toLowerCase())
    ? value
    : `${prefix} ${value}`;
}

function carousel(value: string | undefined) {
  if (!value) return "Carousel TBD";
  return /carousel|belt/i.test(value) ? value : `Carousel ${value}`;
}

function buildTelemetry(
  origin: Airport,
  destination: Airport,
  status: FlightStatus,
  dto: AeroFlightDto,
): FlightTelemetry {
  const distanceNm =
    dto.greatCircleDistance?.nm ??
    Math.round(
      distanceNmBetween(
        origin.latitude,
        origin.longitude,
        destination.latitude,
        destination.longitude,
      ),
    );
  const hasLiveLocation =
    dto.location?.lat != null && dto.location?.lon != null;
  // Never claim the origin is the aircraft's current position. When the
  // provider has no location, the telemetry is explicitly empty.
  const currentLatitude = hasLiveLocation ? dto.location!.lat! : 0;
  const currentLongitude = hasLiveLocation ? dto.location!.lon! : 0;
  const flownNm = hasLiveLocation
    ? distanceNmBetween(
        origin.latitude,
        origin.longitude,
        currentLatitude,
        currentLongitude,
      )
    : 0;
  const progress =
    status === "LANDED"
      ? 1
      : status === "DEPARTED" && hasLiveLocation && distanceNm > 0
        ? Math.min(0.98, Math.max(0, flownNm / distanceNm))
        : 0;
  const remainingNm = hasLiveLocation
    ? Math.max(0, Math.round(distanceNm - flownNm))
    : 0;
  const groundSpeed = Math.round(dto.location?.groundSpeed?.kt ?? 0);
  const eta =
    hasLiveLocation && groundSpeed > 0
      ? Math.round((remainingNm / groundSpeed) * 60)
      : 0;

  return {
    hasLiveLocation,
    // The provider does not expose the observation timestamp. Do not stamp
    // the mapping time as if it were the aircraft's last update.
    locationUpdatedAt: undefined,
    currentLatitude,
    currentLongitude,
    altitudeFeet: Math.round(dto.location?.altitude?.feet ?? 0),
    groundSpeedKnots: groundSpeed,
    headingDegrees: dto.location?.trueTrack?.deg ?? 0,
    verticalSpeedFpm: 0,
    mach: 0,
    progressPercent: progress,
    distanceCoveredNm: Math.round(flownNm),
    distanceRemainingNm: remainingNm,
    etaMinutesRemaining: eta,
    waypoints: [],
    isDerived: hasLiveLocation,
  };
}

function buildTimeline(
  flight: Omit<Flight, "timeline">,
): FlightTimelineEvent[] {
  const events: FlightTimelineEvent[] = [];
  const add = (
    title: string,
    time: string,
    description: string,
    current = false,
  ) => {
    if (!time || time === "—") return;
    events.push({
      title,
      time,
      isCompleted: !current,
      isCurrent: current,
      description,
    });
  };

  add(
    "Scheduled departure",
    flight.departureTimeScheduled,
    `${flight.origin.code} · scheduled time`,
  );
  if (flight.departureTimeEstimated !== flight.departureTimeScheduled) {
    add(
      "Estimated departure",
      flight.departureTimeEstimated,
      `${flight.origin.code} · provider estimate`,
      flight.status === "SCHEDULED" || flight.status === "BOARDING",
    );
  }
  add(
    "Actual departure",
    flight.departureTimeActual ?? "",
    `${flight.origin.code} · provider-recorded runway time`,
  );
  add(
    "Scheduled arrival",
    flight.arrivalTimeScheduled,
    `${flight.destination.code} · scheduled time`,
  );
  if (flight.arrivalTimeEstimated !== flight.arrivalTimeScheduled) {
    add(
      "Estimated arrival",
      flight.arrivalTimeEstimated,
      `${flight.destination.code} · provider estimate`,
      flight.status === "DEPARTED",
    );
  }
  add(
    "Actual arrival",
    flight.arrivalTimeActual ?? "",
    `${flight.destination.code} · provider-recorded runway time`,
  );

  // Gate and baggage values are shown in the flight header and dedicated
  // tiles. They are not timeline events: the provider does not give the time
  // a gate or belt was assigned, so inventing one here would be misleading.
  return events;
}

export function mapConsoleFlight(
  dto: AeroFlightDto,
  fallbackIata: string | undefined,
  isDeparture: boolean,
  lookupAirportNode: AirportNodeLookup | undefined,
): Flight | null {
  const rawNumber = dto.number?.trim();
  if (!rawNumber) return null;
  const flightNumber = normalizeFlightNumber(rawNumber);
  const compactId = flightNumber.replace(/\s+/g, "");

  const dep = dto.departure ?? (isDeparture ? dto.movement : undefined);
  const arr = dto.arrival ?? (!isDeparture ? dto.movement : undefined);
  // The operating date scoped to the departure airport's own timezone.
  const departureDate = scheduledDepartureDate(dep);

  const origin = resolveAirport(dep?.airport, isDeparture ? fallbackIata : undefined, undefined, lookupAirportNode);
  const destination = resolveAirport(arr?.airport, !isDeparture ? fallbackIata : undefined, undefined, lookupAirportNode);
  if (!origin || !destination) return null;

  const depScheduled = timeHHmm(
    dep?.scheduledTime?.local ?? dep?.scheduledTime?.utc,
    "—",
  );
  const depEstimated = timeHHmm(
    dep?.revisedTime?.local ?? dep?.predictedTime?.local ?? dep?.runwayTime?.local,
    depScheduled,
  );
  const arrScheduled = timeHHmm(
    arr?.scheduledTime?.local ?? arr?.scheduledTime?.utc,
    "—",
  );
  const arrEstimated = timeHHmm(
    arr?.revisedTime?.local ?? arr?.predictedTime?.local ?? arr?.runwayTime?.local,
    arrScheduled,
  );
  // Delay must be computed within one movement. Mixing departure scheduled
  // time with an arrival revision produces multi-hour phantom delays.
  const depDelay = delayMinutes(
    dep?.scheduledTime?.local ?? dep?.scheduledTime?.utc,
    dep?.revisedTime?.local ??
      dep?.revisedTime?.utc ??
      dep?.predictedTime?.local ??
      dep?.predictedTime?.utc,
  );
  const arrDelay = delayMinutes(
    arr?.scheduledTime?.local ?? arr?.scheduledTime?.utc,
    arr?.revisedTime?.local ??
      arr?.revisedTime?.utc ??
      arr?.predictedTime?.local ??
      arr?.predictedTime?.utc,
  );
  const reportedDelay = isDeparture ? depDelay : arrDelay;
  const delay = reportedDelay ?? 0;
  const delayReported = reportedDelay != null;
  const mappedStatus = mapStatus(dto.status, reportedDelay);
  const status = mappedStatus.status;
  // Never invent an airline code from the first two characters of a flight
  // number. A missing code is surfaced as missing.
  const airlineCode = dto.airline?.iata?.toUpperCase() ?? "";
  const airline = dto.airline?.name ?? "Not reported";

  const aircraft: AircraftInfo = {
    model: dto.aircraft?.model ?? "Not reported",
    registration: dto.aircraft?.reg ?? "Not reported",
    age: null,
    wifiAvailable: null,
    powerOutlets: null,
    seatLayout: null,
  };

  const baseFlight: Omit<Flight, "timeline"> = {
    // Flight number alone is not a unique identity across operating dates.
    id: `${compactId}-${departureDate ?? "unknown"}`,
    flightDate: departureDate,
    flightNumber,
    airline,
    airlineCode,
    origin,
    destination,
    departureTimeScheduled: depScheduled,
    departureTimeEstimated: depEstimated,
    departureTimeActual: timeHHmm(dep?.runwayTime?.local, "") || null,
    arrivalTimeScheduled: arrScheduled,
    arrivalTimeEstimated: arrEstimated,
    arrivalTimeActual: timeHHmm(arr?.runwayTime?.local, "") || null,
    status,
    statusReported: mappedStatus.reported,
    statusRaw: mappedStatus.raw,
    statusNote: !mappedStatus.reported
      ? "Status not reported by provider"
      : status === "DELAYED"
        ? delayReported
          ? `Delayed ${delay} mins${dep?.quality?.length ? ` · ${dep.quality.join(", ")}` : ""}`
          : "Delayed · duration not reported"
        : status === "BOARDING"
          ? `Boarding at ${gate(dep?.gate)}`
          : status === "DEPARTED"
            ? `En route to ${destination.code}`
            : status === "LANDED"
              ? `Landed at ${destination.code}`
              : "Scheduled",
    delayMinutes: delay,
    delayReported,
    delaySource: delayReported ? "derived" : "unknown",
    // The provider does not supply a reason for the delay. Any text here
    // would be an invented explanation.
    delayReason: null,
    terminalDeparture: dep?.terminal ?? "—",
    gateDeparture: gate(dep?.gate),
    checkInCounter: dep?.checkInDesk ?? "—",
    terminalArrival: arr?.terminal ?? "—",
    gateArrival: gate(arr?.gate),
    baggageCarousel: carousel(arr?.baggageBelt),
    aircraft,
    telemetry: buildTelemetry(origin, destination, status, dto),
    isWatchlisted: false,
    customNotes: "",
  };

  return { ...baseFlight, timeline: buildTimeline(baseFlight) };
}

export function mapConsoleFids(
  code: string,
  dto: AeroFidsResponseDto,
  lookupAirportNode: AirportNodeLookup | undefined,
) {
  const departures = (dto.departures ?? [])
    .map((flight) => mapConsoleFlight(flight, code, true, lookupAirportNode))
    .filter((flight): flight is Flight => Boolean(flight));
  const arrivals = (dto.arrivals ?? [])
    .map((flight) => mapConsoleFlight(flight, code, false, lookupAirportNode))
    .filter((flight): flight is Flight => Boolean(flight));
  return [...departures, ...arrivals];
}


/**
 * Infers the console route region from an airport's coordinates. Lives here
 * because both the gateway and the web dev fallback used identical copies.
 */
export function inferRegionFromCoords(latitude: number, longitude: number): RouteRegion {
  if (longitude < -25) return "AMERICAS";
  if (latitude >= 15 && latitude <= 38 && longitude >= -18 && longitude <= 60) {
    return "MENA";
  }
  if (latitude < 15 && longitude >= -20 && longitude <= 55) return "AFRICA";
  if (longitude > 60) return "ASIA_PACIFIC";
  return "EUROPE";
}


export function createConsoleMapper(options: ConsoleMapperOptions): ConsoleMapper {
  return {
    mapFlight: (dto, fallbackIata, isDeparture = true) =>
      mapConsoleFlight(dto, fallbackIata, isDeparture, options.lookupAirportNode),
    mapFids: (code, dto) => mapConsoleFids(code, dto, options.lookupAirportNode),
  };
}
