import type { AppConfig } from "../config.js";
import { hasValidAeroDataBoxKey } from "../config.js";
import type {
  FlightEndpoint,
  FlightSearchResult,
  FlightStatus,
  FlightSummary,
} from "../domain/flight.js";
import { TtlCache } from "../lib/cache.js";

interface AeroAirportDto {
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
  gate?: string;
  checkInDesk?: string;
  baggageBelt?: string;
  runway?: string;
  quality?: string[];
}

interface AeroFlightDto {
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

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

function normalizeFlightNumber(raw: string): string {
  const compact = raw.replace(/\s+/g, "").toUpperCase();
  const match = compact.match(/^([A-Z0-9]{2,3})(\d{1,4}[A-Z]?)$/);
  return match ? `${match[1]} ${match[2]}` : compact;
}

function firstTime(time: AeroTimeDto | undefined): string {
  return time?.local ?? time?.utc ?? "";
}

function resolveAirport(
  dto: AeroAirportDto | undefined,
): FlightEndpoint | null {
  if (!dto) return null;
  const code = dto.iata?.trim().toUpperCase();
  const lat = dto.location?.lat;
  const lon = dto.location?.lon;
  if (!code || lat == null || lon == null) return null;
  return {
    code,
    name: dto.name ?? `${code} Airport`,
    city: dto.municipalityName ?? code,
    country: dto.countryCode ?? "",
    timezone: dto.timeZone ?? "UTC",
    latitude: lat,
    longitude: lon,
  };
}

function mapStatus(raw: string | undefined, delayMinutes: number): FlightStatus {
  const status = (raw ?? "").toLowerCase();
  if (status.includes("cancel")) return "CANCELLED";
  if (status.includes("board")) return "BOARDING";
  if (status.includes("arriv") || status.includes("land")) return "LANDED";
  if (
    status.includes("depart") ||
    status.includes("en route") ||
    status.includes("airborne")
  ) {
    return "DEPARTED";
  }
  if (status.includes("delay") || delayMinutes >= 15) return "DELAYED";
  return "SCHEDULED";
}

function parseTime(value: string | undefined): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value.replace(" ", "T"));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function computeDelay(
  scheduled: AeroTimeDto | undefined,
  revised: AeroTimeDto | undefined,
): number {
  const start = parseTime(scheduled?.utc ?? scheduled?.local);
  const end = parseTime(revised?.utc ?? revised?.local);
  if (start == null || end == null) return 0;
  return Math.max(0, Math.round((end - start) / 60_000));
}

function mapFlight(
  dto: AeroFlightDto,
  isDeparture = true,
): FlightSummary | null {
  const rawNumber = dto.number?.trim();
  if (!rawNumber) return null;

  const departure = dto.departure ?? (isDeparture ? dto.movement : undefined);
  const arrival = dto.arrival ?? (!isDeparture ? dto.movement : undefined);
  const origin = resolveAirport(departure?.airport);
  const destination = resolveAirport(arrival?.airport);
  if (!origin || !destination) return null;

  const flightNumber = normalizeFlightNumber(rawNumber);
  const compactNumber = flightNumber.replace(/\s+/g, "");
  const scheduledDeparture = firstTime(departure?.scheduledTime);
  const delayMinutes = computeDelay(
    departure?.scheduledTime,
    departure?.revisedTime ?? departure?.predictedTime,
  );
  const hasLiveLocation =
    dto.location?.lat != null && dto.location?.lon != null;

  return {
    id: `${compactNumber}-${scheduledDeparture.slice(0, 10) || "unknown"}`,
    flightNumber,
    airline: dto.airline?.name ?? "",
    airlineCode: dto.airline?.iata ?? compactNumber.slice(0, 2),
    status: mapStatus(dto.status, delayMinutes),
    statusNote: dto.status ?? "",
    origin,
    destination,
    scheduledDeparture,
    estimatedDeparture: firstTime(
      departure?.revisedTime ?? departure?.predictedTime,
    ),
    scheduledArrival: firstTime(arrival?.scheduledTime),
    estimatedArrival: firstTime(
      arrival?.revisedTime ?? arrival?.predictedTime,
    ),
    terminalDeparture: departure?.terminal ?? "",
    gateDeparture: departure?.gate ?? "",
    terminalArrival: arrival?.terminal ?? "",
    gateArrival: arrival?.gate ?? "",
    baggageCarousel: arrival?.baggageBelt ?? "",
    aircraft: {
      model: dto.aircraft?.model ?? "",
      registration: dto.aircraft?.reg ?? "",
    },
    delayMinutes,
    telemetry: {
      hasLiveLocation,
      latitude: dto.location?.lat ?? 0,
      longitude: dto.location?.lon ?? 0,
      altitudeFeet: Math.round(dto.location?.altitude?.feet ?? 0),
      groundSpeedKnots: Math.round(dto.location?.groundSpeed?.kt ?? 0),
      headingDegrees: dto.location?.trueTrack?.deg ?? 0,
      updatedAt: hasLiveLocation ? new Date().toISOString() : null,
    },
    source: "aerodatabox",
    updatedAt: new Date().toISOString(),
  };
}

export class AeroDataBoxProvider {
  private readonly cache = new TtlCache(500);
  private readonly host: string;

  constructor(private readonly config: AppConfig) {
    const host = config.AERODATABOX_API_HOST.replace(/^https?:\/\//, "")
      .replace(/\/$/, "")
      .trim();
    this.host = host || "api.aerodatabox.com";
  }

  get configured(): boolean {
    return hasValidAeroDataBoxKey(this.config.AERODATABOX_API_KEY);
  }

  private headers(): Record<string, string> {
    const key = this.config.AERODATABOX_API_KEY ?? "";
    if (this.host.includes("rapidapi.com")) {
      return {
        Accept: "application/json",
        "X-RapidAPI-Key": key,
        "X-RapidAPI-Host": this.host,
      };
    }
    return {
      Accept: "application/json",
      "X-Api-Key": key,
    };
  }

  async searchFlight(rawNumber: string): Promise<FlightSearchResult> {
    const flightNumber = rawNumber.replace(/\s+/g, "").toUpperCase();
    const fetchedAt = new Date().toISOString();

    if (!this.configured) {
      return {
        flights: [],
        meta: {
          source: "not_configured",
          fetchedAt,
          cached: false,
          attribution: "AeroDataBox",
        },
      };
    }

    const cacheKey = `flight:${flightNumber}`;
    const cached = this.cache.get<FlightSummary[]>(cacheKey);
    if (cached) {
      return {
        flights: cached,
        meta: {
          source: "cached",
          fetchedAt,
          cached: true,
          attribution: "AeroDataBox",
        },
      };
    }

    const url = `https://${this.host}/flights/number/${encodeURIComponent(
      flightNumber,
    )}?withAircraftImage=false&withLocation=true`;

    let response: Response;
    try {
      response = await fetch(url, {
        headers: this.headers(),
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      throw new ProviderError("AeroDataBox request failed", 502);
    }

    if (response.status === 204) {
      this.cache.set(cacheKey, [], 60_000);
      return {
        flights: [],
        meta: {
          source: "live",
          fetchedAt,
          cached: false,
          attribution: "AeroDataBox",
        },
      };
    }

    if (response.status === 401 || response.status === 403) {
      throw new ProviderError(
        "AeroDataBox authentication failed. Check AERODATABOX_API_KEY.",
        502,
      );
    }

    if (response.status === 429) {
      return {
        flights: [],
        meta: {
          source: "quota_fallback",
          fetchedAt,
          cached: false,
          attribution: "AeroDataBox",
        },
      };
    }

    if (!response.ok) {
      throw new ProviderError(
        `AeroDataBox request failed with HTTP ${response.status}`,
        502,
      );
    }

    const payload = (await response.json()) as AeroFlightDto[];
    const flights = payload
      .map((dto) => mapFlight(dto))
      .filter((flight): flight is FlightSummary => flight !== null);

    this.cache.set(cacheKey, flights, 60_000);

    return {
      flights,
      meta: {
        source: "live",
        fetchedAt,
        cached: false,
        attribution: "AeroDataBox",
      },
    };
  }

  /**
   * Whole-airport board (departures + arrivals) in the summary shape used by
   * the watch engine. One request covers every watched flight sharing that
   * airport in the refresh window — a 2-unit call replacing N × 2-unit calls.
   */
  async lookupFids(rawCode: string): Promise<{
    meta: { source: "live" | "cached" | "quota_fallback" | "not_configured" | "error" };
    summaries: FlightSummary[];
  }> {
    const code = rawCode.trim().toUpperCase();
    if (!this.configured) {
      return { meta: { source: "not_configured" }, summaries: [] };
    }
    const cacheKey = `fids:${code}`;
    const cached = this.cache.get<FlightSummary[]>(cacheKey);
    if (cached) {
      return {
        meta: { source: "cached" },
        summaries: cached,
      };
    }

    let response: Response;
    try {
      response = await fetch(
        `https://${this.host}/flights/airports/iata/${encodeURIComponent(code)}?direction=Both&withLeg=true&withCancelled=true&withCodeshared=false`,
        {
          headers: this.headers(),
          signal: AbortSignal.timeout(12_000),
        },
      );
    } catch {
      return { meta: { source: "error" }, summaries: [] };
    }

    if (response.status === 429) {
      return { meta: { source: "quota_fallback" }, summaries: [] };
    }
    if (!response.ok) {
      return { meta: { source: "error" }, summaries: [] };
    }

    let payload: { departures?: unknown[]; arrivals?: unknown[] } = {};
    try {
      payload = (await response.json()) as { departures?: unknown[]; arrivals?: unknown[] };
    } catch {
      return { meta: { source: "error" }, summaries: [] };
    }

    const departures = (Array.isArray(payload.departures) ? payload.departures : [])
      .map((dto) => mapFlight(dto as unknown as AeroFlightDto, true));
    const arrivals = (Array.isArray(payload.arrivals) ? payload.arrivals : [])
      .map((dto) => mapFlight(dto as unknown as AeroFlightDto, false));
    const summaries = [...departures, ...arrivals].filter(
      (flight): flight is FlightSummary => flight !== null,
    );

    this.cache.set(cacheKey, summaries, 60_000);
    return { meta: { source: "live" }, summaries };
  }
}
