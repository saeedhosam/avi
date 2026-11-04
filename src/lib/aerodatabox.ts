import type {
  AircraftInfo,
  Airport,
  Flight,
  FlightStatus,
  FlightTelemetry,
  FlightTimelineEvent,
} from "./types";
import { mockAirportByCode, getAirportNode, routeAirportToAirport } from "./data";

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
  if (!host || host === "null") return "aerodatabox.p.rapidapi.com";
  return host.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function timeHHmm(iso: string | undefined, fallback: string) {
  if (!iso) return fallback;
  const match = iso.match(/T(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : fallback;
}

function normalizeFlightNumber(raw: string) {
  const compact = raw.replace(/\s+/g, "").toUpperCase();
  const match = compact.match(/^([A-Z0-9]{2,3})(\d{1,4}[A-Z]?)$/);
  return match ? `${match[1]} ${match[2]}` : compact;
}

function resolveAirport(
  dto: AeroAirportDto | undefined,
  fallbackIata: string | undefined,
  defaultIata: string,
): Airport {
  const code = (dto?.iata ?? fallbackIata ?? defaultIata).toUpperCase();
  const known = mockAirportByCode.get(code);
  if (known) {
    return {
      ...known,
      latitude: dto?.location?.lat ?? known.latitude,
      longitude: dto?.location?.lon ?? known.longitude,
      name: dto?.name ?? known.name,
      city: dto?.municipalityName ?? known.city,
    };
  }
  const node = getAirportNode(code);
  const base = routeAirportToAirport(node);
  return {
    ...base,
    latitude: dto?.location?.lat ?? base.latitude,
    longitude: dto?.location?.lon ?? base.longitude,
    name: dto?.name ?? base.name,
    city: dto?.municipalityName ?? base.city,
  };
}

function delayMinutes(
  scheduled: string | undefined,
  revised: string | undefined,
) {
  if (!scheduled || !revised) return 0;
  const start = new Date(scheduled).getTime();
  const end = new Date(revised).getTime();
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
  const progress =
    status === "LANDED" ? 1 : status === "DEPARTED" ? 0.55 : 0.02;

  return {
    currentLatitude:
      dto.location?.lat ??
      origin.latitude + (destination.latitude - origin.latitude) * progress,
    currentLongitude:
      dto.location?.lon ??
      origin.longitude + (destination.longitude - origin.longitude) * progress,
    altitudeFeet: Math.round(dto.location?.altitude?.feet ?? (status === "DEPARTED" ? 36000 : 0)),
    groundSpeedKnots: Math.round(dto.location?.groundSpeed?.kt ?? (status === "DEPARTED" ? 510 : 0)),
    headingDegrees: dto.location?.trueTrack?.deg ?? 90,
    verticalSpeedFpm: 0,
    mach: status === "DEPARTED" ? 0.84 : 0,
    progressPercent: progress,
    distanceCoveredNm: Math.round(distanceNm * progress),
    distanceRemainingNm: Math.round(distanceNm * (1 - progress)),
    etaMinutesRemaining:
      status === "DEPARTED" ? Math.round((distanceKm * (1 - progress)) / 815 * 60) : 0,
    waypoints: [],
  };
}

function buildTimeline(
  flight: Omit<Flight, "timeline">,
): FlightTimelineEvent[] {
  return [
    {
      title: "Check-in & bag drop",
      time: flight.departureTimeScheduled,
      isCompleted: flight.status !== "SCHEDULED",
      isCurrent: flight.status === "SCHEDULED",
      description: `${flight.checkInCounter} · Terminal ${flight.terminalDeparture}`,
    },
    {
      title: "Boarding",
      time: flight.departureTimeEstimated,
      isCompleted: ["DEPARTED", "LANDED"].includes(flight.status),
      isCurrent: flight.status === "BOARDING",
      description: `${flight.gateDeparture} · Terminal ${flight.terminalDeparture}`,
    },
    {
      title: "Takeoff",
      time: flight.departureTimeActual ?? flight.departureTimeEstimated,
      isCompleted: ["DEPARTED", "LANDED"].includes(flight.status),
      isCurrent: false,
      description: `Departure from ${flight.origin.code}`,
    },
    {
      title: "En route",
      time: flight.arrivalTimeEstimated,
      isCompleted: flight.status === "LANDED",
      isCurrent: flight.status === "DEPARTED",
      description: `${flight.origin.code} → ${flight.destination.code}`,
    },
    {
      title: "Arrival",
      time: flight.arrivalTimeEstimated,
      isCompleted: flight.status === "LANDED",
      isCurrent: false,
      description: `${flight.gateArrival} · ${flight.baggageCarousel}`,
    },
  ];
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

  const origin = resolveAirport(dep?.airport, isDeparture ? fallbackIata : undefined, "JFK");
  const destination = resolveAirport(arr?.airport, !isDeparture ? fallbackIata : undefined, "LHR");

  const depScheduled = timeHHmm(
    dep?.scheduledTime?.local ?? dep?.scheduledTime?.utc,
    "12:00",
  );
  const depEstimated = timeHHmm(
    dep?.revisedTime?.local ?? dep?.predictedTime?.local ?? dep?.runwayTime?.local,
    depScheduled,
  );
  const arrScheduled = timeHHmm(
    arr?.scheduledTime?.local ?? arr?.scheduledTime?.utc,
    "16:30",
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
  const airline = dto.airline?.name ?? `${airlineCode} Airlines`;

  const aircraft: AircraftInfo = {
    model: dto.aircraft?.model ?? "Boeing 787-9 Dreamliner",
    registration: dto.aircraft?.reg ?? `N${100 + Math.floor(Math.random() * 900)}ST`,
    age: "4.5 yrs",
    wifiAvailable: true,
    powerOutlets: true,
    seatLayout: "Business, Premium, Economy",
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
        ? `Delayed ${delay} mins · ATC flow management`
        : status === "BOARDING"
          ? `Boarding at ${gate(dep?.gate)}`
          : status === "DEPARTED"
            ? `En route to ${destination.code}`
            : status === "LANDED"
              ? `Landed at ${destination.code}`
              : "On schedule",
    delayMinutes: delay,
    delayReason: delay >= 15 ? "Operational / Air Traffic Control revision" : null,
    terminalDeparture: dep?.terminal ?? "1",
    gateDeparture: gate(dep?.gate),
    checkInCounter: dep?.checkInDesk ?? "Zone A",
    terminalArrival: arr?.terminal ?? "1",
    gateArrival: gate(arr?.gate),
    baggageCarousel: carousel(arr?.baggageBelt),
    aircraft,
    telemetry: buildTelemetry(origin, destination, status, dto),
    isFavorite: false,
    isTracked: false,
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
  mode: "LIVE_AERODATABOX" | "QUOTA_FALLBACK" | "DEMO_CACHE_NO_KEY" | "ERROR";
}> {
  if (!hasValidAeroKey()) {
    return { data: null, status: 0, mode: "DEMO_CACHE_NO_KEY" };
  }
  try {
    const response = await fetch(`https://${aeroHost()}${path}`, {
      headers: {
        Accept: "application/json",
        "X-RapidAPI-Key": process.env.AERODATABOX_API_KEY ?? "",
        "X-RapidAPI-Host": aeroHost(),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
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
