import type {
  AircraftInfo,
  Airport,
  Flight,
  FlightStatus,
  FlightTelemetry,
  FlightTimelineEvent,
} from "./types";
import { findAirportNode } from "./data";

export interface AeroAirportDto {
  iata?: string;
  icao?: string;
  name?: string;
  shortName?: string;
  municipalityName?: string;
  countryCode?: string;
  timeZone?: string;
  location?: { lat?: number; lon?: number };
}

interface AeroTimeDto {
  utc?: string;
  local?: string;
}

interface AeroMovementDto {
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

export function hasValidAeroKey() {
  const key = process.env.AERODATABOX_API_KEY?.trim();
  if (!key) return false;
  return (
    key.length >= 16 &&
    !key.startsWith("DEFAULT_") &&
    !["null", "YOUR_AERODATABOX_KEY", "REPLACE_WITH_YOUR_KEY"].includes(key)
  );
}

export function aeroHost() {
  const host = process.env.AERODATABOX_API_HOST?.trim();
  if (!host || host === "null") return "api.aerodatabox.com";
  return host.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function aeroAuthHeaders(host: string): Record<string, string> {
  const key = process.env.AERODATABOX_API_KEY ?? "";
  if (host.includes("rapidapi.com")) {
    return {
      "X-RapidAPI-Key": key,
      "X-RapidAPI-Host": host,
    };
  }
  return { "X-Api-Key": key };
}

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

function resolveAirport(
  dto: AeroAirportDto | undefined,
  fallbackIata: string | undefined,
  defaultIata?: string,
): Airport | null {
  const rawCode = dto?.iata ?? fallbackIata ?? defaultIata;
  if (!rawCode) return null;
  const code = rawCode.trim().toUpperCase();
  const node = findAirportNode(code);
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
    `${flight.origin.code} · live AeroDataBox schedule`,
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
    `${flight.destination.code} · live AeroDataBox schedule`,
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

export function mapAeroFlight(
  dto: AeroFlightDto,
  fallbackIata?: string,
  isDeparture = true,
): Flight | null {
  const rawNumber = dto.number?.trim();
  if (!rawNumber) return null;
  const flightNumber = normalizeFlightNumber(rawNumber);
  const compactId = flightNumber.replace(/\s+/g, "");

  const dep = dto.departure ?? (isDeparture ? dto.movement : undefined);
  const arr = dto.arrival ?? (!isDeparture ? dto.movement : undefined);

  const origin = resolveAirport(dep?.airport, isDeparture ? fallbackIata : undefined);
  const destination = resolveAirport(arr?.airport, !isDeparture ? fallbackIata : undefined);
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

export function mapAeroFids(code: string, dto: AeroFidsResponseDto) {
  const departures = (dto.departures ?? [])
    .map((flight) => mapAeroFlight(flight, code, true))
    .filter((flight): flight is Flight => Boolean(flight));
  const arrivals = (dto.arrivals ?? [])
    .map((flight) => mapAeroFlight(flight, code, false))
    .filter((flight): flight is Flight => Boolean(flight));
  return [...departures, ...arrivals];
}

export async function fetchAeroJson<T>(path: string): Promise<{
  data: T | null;
  status: number;
  mode: "LIVE_AERODATABOX" | "QUOTA_FALLBACK" | "NOT_CONFIGURED" | "ERROR";
}> {
  if (!hasValidAeroKey()) {
    return { data: null, status: 0, mode: "NOT_CONFIGURED" };
  }
  const host = aeroHost();
  try {
    const response = await fetch(`https://${host}${path}`, {
      headers: {
        Accept: "application/json",
        ...aeroAuthHeaders(host),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    if (response.status === 204) {
      return { data: null, status: 204, mode: "LIVE_AERODATABOX" };
    }
    if (response.status === 401 || response.status === 403) {
      return { data: null, status: response.status, mode: "ERROR" };
    }
    if (response.status === 429) {
      return { data: null, status: 429, mode: "QUOTA_FALLBACK" };
    }
    if (!response.ok) {
      return { data: null, status: response.status, mode: "ERROR" };
    }
    const data = (await response.json()) as T;
    return { data, status: response.status, mode: "LIVE_AERODATABOX" };
  } catch {
    return { data: null, status: 0, mode: "ERROR" };
  }
}
