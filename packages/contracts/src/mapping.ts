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
  const match = compact.match(/^([A-Z0-9]{2})(\d{1,4}[A-Z]?)$/);
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
    name: dto?.name ?? node?.name ?? `${code} Airport`,
    city: dto?.municipalityName ?? node?.city ?? code,
    country: dto?.countryCode ?? node?.country ?? "—",
    timezone: dto?.timeZone ?? node?.timezone ?? "UTC",
    latitude,
    longitude,
    // Operational weather is fetched live from Open-Meteo by the UI.
    weather: {
      tempC: 0,
      tempF: 32,
      condition: "Live weather not loaded",
      wind: "—",
      visibility: "—",
      humidity: 0,
    },
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
) {
  if (!scheduled || !revised) return 0;
  const start = new Date(scheduled.replace(" ", "T")).getTime();
  const end = new Date(revised.replace(" ", "T")).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / 60000));
}

function mapStatus(raw: string | undefined, delay: number): FlightStatus {
  const status = (raw ?? "").toLowerCase();
  if (status.includes("cancel")) return "CANCELLED";
  if (status.includes("board")) return "BOARDING";
  if (status.includes("arriv") || status.includes("land")) return "LANDED";
  if (status.includes("depart") || status.includes("en route") || status.includes("airborne")) {
    return "DEPARTED";
  }
  if (status.includes("delay") || delay >= 15) return "DELAYED";
  return "SCHEDULED";
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
  const distanceKm =
    dto.greatCircleDistance?.km ??
    Math.round(
      Math.hypot(
        (destination.latitude - origin.latitude) * 111,
        (destination.longitude - origin.longitude) * 111,
      ),
    );
  const distanceNm = dto.greatCircleDistance?.nm ?? Math.round(distanceKm * 0.539957);
  const hasLiveLocation =
    dto.location?.lat != null && dto.location?.lon != null;
  const currentLatitude = dto.location?.lat ?? origin.latitude;
  const currentLongitude = dto.location?.lon ?? origin.longitude;
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
    : distanceNm;
  const groundSpeed = Math.round(dto.location?.groundSpeed?.kt ?? 0);
  const eta =
    hasLiveLocation && groundSpeed > 0
      ? Math.round((remainingNm / groundSpeed) * 60)
      : 0;

  return {
    hasLiveLocation,
    locationUpdatedAt: hasLiveLocation ? Date.now() : undefined,
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
    `${flight.origin.code} · live departure schedule`,
  );
  if (flight.departureTimeEstimated !== flight.departureTimeScheduled) {
    add(
      "Estimated departure",
      flight.departureTimeEstimated,
      `${flight.gateDeparture} · Terminal ${flight.terminalDeparture}`,
      flight.status === "SCHEDULED" || flight.status === "BOARDING",
    );
  }
  add(
    "Actual departure",
    flight.departureTimeActual ?? "",
    `${flight.origin.code} runway departure`,
  );
  add(
    "Scheduled arrival",
    flight.arrivalTimeScheduled,
    `${flight.destination.code} · live arrival schedule`,
  );
  if (flight.arrivalTimeEstimated !== flight.arrivalTimeScheduled) {
    add(
      "Estimated arrival",
      flight.arrivalTimeEstimated,
      `${flight.gateArrival} · Terminal ${flight.terminalArrival}`,
      flight.status === "DEPARTED",
    );
  }
  add(
    "Actual arrival",
    flight.arrivalTimeActual ?? "",
    `${flight.destination.code} runway arrival`,
  );
  if (flight.gateDeparture !== "Gate TBD") {
    add(
      "Departure gate assigned",
      flight.departureTimeScheduled,
      `${flight.gateDeparture} · Terminal ${flight.terminalDeparture}`,
    );
  }
  if (flight.gateArrival !== "Gate TBD") {
    add(
      "Arrival gate assigned",
      flight.arrivalTimeEstimated,
      `${flight.gateArrival} · Terminal ${flight.terminalArrival}`,
    );
  }
  if (flight.baggageCarousel !== "Carousel TBD" && flight.baggageCarousel !== "N/A") {
    add(
      "Baggage belt assigned",
      flight.arrivalTimeEstimated,
      flight.baggageCarousel,
    );
  }

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
  const delay = delayMinutes(
    dep?.scheduledTime?.local ?? arr?.scheduledTime?.local,
    dep?.revisedTime?.local ?? arr?.revisedTime?.local,
  );
  const status = mapStatus(dto.status, delay);
  const airlineCode =
    dto.airline?.iata?.toUpperCase() ??
    flightNumber.split(" ")[0]?.slice(0, 2) ??
    "XX";
  const airline = dto.airline?.name ?? airlineCode;

  const aircraft: AircraftInfo = {
    model: dto.aircraft?.model ?? "Not reported",
    registration: dto.aircraft?.reg ?? "Not reported",
    age: "Not reported",
    wifiAvailable: false,
    powerOutlets: false,
    seatLayout: "Not reported by the live feed",
  };

  const baseFlight: Omit<Flight, "timeline"> = {
    id: compactId,
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
    statusNote:
      status === "DELAYED"
        ? `Delayed ${delay} mins${dep?.quality?.length ? ` · ${dep.quality.join(", ")}` : ""}`
        : status === "BOARDING"
          ? `Boarding at ${gate(dep?.gate)}`
          : status === "DEPARTED"
            ? `En route to ${destination.code}`
            : status === "LANDED"
              ? `Landed at ${destination.code}`
              : "Scheduled",
    delayMinutes: delay,
    delayReason: delay >= 15 ? "Operational / Air Traffic Control revision" : null,
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
