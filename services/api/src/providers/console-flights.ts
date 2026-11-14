/**
 * Console-flight AeroDataBox provider.
 *
 * The AerodataBox -> console `Flight` mapping itself lives in
 * `@avi/contracts` so the web dev fallback (and any future mobile client)
 * consume exactly the same transformation instead of carrying a verbatim
 * copy. This file keeps only the provider surface: key checks, quota
 * fallbacks, shared caching, and the bundled catalog lookup used by the
 * mapper.
 */
import type { AppConfig } from "../config.js";
import type {
  ConsoleRouteStat,
  Flight,
  AirportNode,
} from "../domain/console.js";
import {
  createConsoleMapper,
  inferRegionFromCoords,
  type AeroAirportDto,
  type AeroFlightDto,
  type AeroFidsResponseDto,
  type ConsoleMapper,
} from "@avi/contracts";
import {
  PROVIDER_STALE_MS,
  PROVIDER_TTL_MS,
} from "../lib/provider-cache.js";
import {
  AeroDataBoxClient,
  type AeroFetchMode,
  type AeroFetchResult,
} from "./aero-client.js";
import catalogAirports from "@avi/catalog/airports.json" with { type: "json" };

export type FlightDataMode = AeroFetchMode;

export type ConsoleOutcome<T> = {
  data: T | null;
  status: number;
  mode: FlightDataMode;
  /** True when the provider answered from the shared cache (no unit spend). */
  cached?: boolean;
};

export interface DataProvenance {
  source: "AERODATABOX";
  fetchedAt: string;
  attribution: "AeroDataBox";
  /** True when the response came from the shared cache. */
  cached: boolean;
  /** True when a cached response is past its fresh window. */
  stale: boolean;
  /** Age of the payload in whole seconds. */
  cacheAgeSeconds: number;
}

export function hasValidConsoleAeroKey(key: string | undefined): boolean {
  const value = key?.trim();
  if (!value) return false;
  return (
    value.length >= 16 &&
    !value.startsWith("DEFAULT_") &&
    !["null", "YOUR_AERODATABOX_KEY", "REPLACE_WITH_YOUR_KEY"].includes(value)
  );
}

export {
  inferRegionFromCoords,
  type AeroFlightDto,
  type AeroFidsResponseDto,
  type AirportNodeLookup,
  type ConsoleMapper,
  type ConsoleMapperOptions,
} from "@avi/contracts";

// ── Bundled catalog fallback (single source: `@avi/catalog`) ────────────────

interface CatalogAirport {
  iata: string;
  icao?: string;
  name?: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
}

const catalogByIata = new Map<string, CatalogAirport>(
  (catalogAirports as CatalogAirport[]).map((airport) => [airport.iata, airport]),
);

function findCatalogAirportNode(iata: string): AirportNode | undefined {
  const node = catalogByIata.get(iata.trim().toUpperCase());
  if (!node?.latitude || !node?.longitude) return undefined;
  return {
    iata: node.iata,
    icao: node.icao ?? "",
    name: node.name ?? node.iata,
    city: node.city ?? "",
    country: node.country ?? "",
    region: inferRegionFromCoords(node.latitude, node.longitude),
    latitude: node.latitude,
    longitude: node.longitude,
    timezone: node.timezone ?? "UTC",
    hubAirlines: [],
  };
}

const consoleMapper: ConsoleMapper = createConsoleMapper({
  lookupAirportNode: findCatalogAirportNode,
});

/** Console `Flight` mapper bound to the bundled catalog fallback. */
export function mapConsoleFlight(
  dto: AeroFlightDto,
  fallbackIata?: string,
  isDeparture = true,
): Flight | null {
  return consoleMapper.mapFlight(dto, fallbackIata, isDeparture);
}

/** Console FIDS mapper bound to the bundled catalog fallback. */
export function mapConsoleFids(code: string, dto: AeroFidsResponseDto): Flight[] {
  return consoleMapper.mapFids(code, dto);
}

function provenanceOf(result: AeroFetchResult<unknown>): DataProvenance {
  return {
    source: "AERODATABOX",
    fetchedAt: result.fetchedAt,
    attribution: "AeroDataBox",
    cached: result.cached,
    stale: result.stale,
    cacheAgeSeconds: result.cacheAgeSeconds,
  };
}

// ── Aircraft ────────────────────────────────────────────────────────────────

interface AeroAircraftDto {
  reg?: string;
  active?: boolean;
  airlineName?: string;
  iataType?: string;
  icaoCode?: string;
  model?: string;
  numSeats?: number | null;
  ageYears?: number | null;
  firstFlightDate?: string;
  deliveryDate?: string;
  engineType?: string;
  numEngines?: number | null;
  isFreighter?: boolean;
  image?: {
    url?: string;
    webUrl?: string | null;
    author?: string | null;
    license?: string;
    htmlAttributions?: string[] | null;
  };
}

export interface ConsoleAircraft {
  reg: string;
  active: boolean | null;
  airlineName: string | null;
  iataType: string | null;
  icaoCode: string | null;
  model: string | null;
  numSeats: number | null;
  ageYears: number | null;
  firstFlightDate: string | null;
  deliveryDate: string | null;
  engineType: string | null;
  numEngines: number | null;
  isFreighter: boolean | null;
  image: {
    url: string;
    webUrl: string | null;
    author: string | null;
    license: string | null;
    attributions: string[] | null;
  } | null;
}

export function mapConsoleAircraft(
  data: AeroAircraftDto | null,
): ConsoleAircraft | null {
  if (!data?.reg) return null;
  return {
    reg: data.reg,
    active: data.active ?? null,
    airlineName: data.airlineName ?? null,
    iataType: data.iataType ?? null,
    icaoCode: data.icaoCode ?? null,
    model: data.model ?? null,
    numSeats: data.numSeats ?? null,
    ageYears: data.ageYears ?? null,
    firstFlightDate: data.firstFlightDate ?? null,
    deliveryDate: data.deliveryDate ?? null,
    engineType: data.engineType ?? null,
    numEngines: data.numEngines ?? null,
    isFreighter: data.isFreighter ?? null,
    image: data.image?.url
      ? {
          url: data.image.url,
          webUrl: data.image.webUrl ?? null,
          author: data.image.author ?? null,
          license: data.image.license ?? null,
          attributions: data.image.htmlAttributions ?? null,
        }
      : null,
  };
}

// ── Airport info ────────────────────────────────────────────────────────────

interface AeroAirportInfoDto {
  iata?: string;
  icao?: string;
  fullName?: string;
  shortName?: string;
  municipalityName?: string;
  country?: { code?: string; name?: string };
  continent?: { name?: string };
  timeZone?: string;
  location?: { lat?: number; lon?: number };
  elevation?: { feet?: number };
  currentTime?: { local?: string; utc?: string };
  urls?: Record<string, string | undefined>;
  runways?: Array<{
    name?: string;
    trueHdg?: number;
    length?: { feet?: number };
    width?: { feet?: number };
    surface?: string;
    isClosed?: boolean;
    hasLighting?: boolean;
  }>;
}

export interface ConsoleAirportInfo {
  iata: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  countryName: string | null;
  continent: string | null;
  timezone: string;
  latitude: number;
  longitude: number;
  elevationFeet: number | null;
  localTime: string | null;
  urls: Record<string, string>;
  runways: Array<{
    name: string | null;
    trueHdg: number | null;
    lengthFeet: number | null;
    widthFeet: number | null;
    surface: string | null;
    isClosed: boolean | null;
    hasLighting: boolean | null;
  }>;
}

export function mapConsoleAirportInfo(
  data: AeroAirportInfoDto | null,
  fallbackIata: string,
): ConsoleAirportInfo | null {
  if (!data || data.location?.lat == null || data.location.lon == null) {
    return null;
  }
  const urls: Record<string, string> = {};
  for (const [key, value] of Object.entries(data.urls ?? {})) {
    if (typeof value === "string" && value.length > 0) urls[key] = value;
  }
  return {
    iata: data.iata?.toUpperCase() ?? fallbackIata,
    icao: data.icao?.toUpperCase() ?? "",
    name: data.fullName ?? data.shortName ?? data.iata ?? fallbackIata,
    city: data.municipalityName ?? "",
    country: data.country?.code ?? "",
    countryName: data.country?.name ?? null,
    continent: data.continent?.name ?? null,
    // Never substitute "UTC" for a missing timezone: that is a fabricated DST
    // claim. The field is empty and clients must treat it as unavailable.
    timezone: data.timeZone ?? "",
    latitude: data.location.lat,
    longitude: data.location.lon,
    elevationFeet:
      data.elevation?.feet != null ? Math.round(data.elevation.feet) : null,
    localTime: data.currentTime?.local ?? null,
    urls,
    runways: (data.runways ?? []).map((runway) => ({
      name: runway.name ?? null,
      trueHdg: runway.trueHdg ?? null,
      lengthFeet:
        runway.length?.feet != null ? Math.round(runway.length.feet) : null,
      widthFeet:
        runway.width?.feet != null ? Math.round(runway.width.feet) : null,
      surface: runway.surface ?? null,
      isClosed: runway.isClosed ?? null,
      hasLighting: runway.hasLighting ?? null,
    })),
  };
}

// ── Flight dates ────────────────────────────────────────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function mapFlightDates(data: unknown): string[] | null {
  const raw = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { dates?: unknown }).dates)
      ? ((data as { dates: unknown[] }).dates)
      : null;
  if (!raw) return null;
  return [...new Set(raw.filter((value): value is string => typeof value === "string" && ISO_DATE.test(value)))].sort();
}

// ── Flight delay statistics ─────────────────────────────────────────────────

interface AeroDelayBracket {
  delayedFrom?: string | null;
  delayedTo?: string | null;
  num?: number;
  percentage?: number | null;
}

interface AeroDelayStatDto {
  airportIcao?: string;
  class?: string;
  scheduledHourUtc?: number | null;
  medianDelay?: string;
  delayIndex?: number | null;
  numConsideredFlights?: number;
  numFlightsDelayedBrackets?: AeroDelayBracket[];
  delayPercentiles?: Array<{ percentile?: number; delay?: string }>;
  fromUtc?: string;
  toUtc?: string;
}

interface AeroFlightDelaysDto {
  number?: string;
  origins?: AeroDelayStatDto[];
  destinations?: AeroDelayStatDto[];
}

export interface ConsoleDelayStat {
  airportIcao: string | null;
  class: string | null;
  scheduledHourUtc: number | null;
  medianDelay: string | null;
  delayIndex: number | null;
  numConsideredFlights: number | null;
  brackets: Array<{
    delayedFrom: string | null;
    delayedTo: string | null;
    num: number | null;
    percentage: number | null;
  }>;
  percentiles: Array<{ percentile: number | null; delay: string | null }>;
  fromUtc: string | null;
  toUtc: string | null;
}

function mapDelayStat(raw: AeroDelayStatDto): ConsoleDelayStat {
  return {
    airportIcao: raw.airportIcao ?? null,
    class: raw.class ?? null,
    scheduledHourUtc: raw.scheduledHourUtc ?? null,
    medianDelay: raw.medianDelay ?? null,
    delayIndex: raw.delayIndex ?? null,
    numConsideredFlights: raw.numConsideredFlights ?? null,
    brackets: (raw.numFlightsDelayedBrackets ?? []).map((bracket) => ({
      delayedFrom: bracket.delayedFrom ?? null,
      delayedTo: bracket.delayedTo ?? null,
      num: bracket.num ?? null,
      percentage: bracket.percentage ?? null,
    })),
    percentiles: (raw.delayPercentiles ?? []).map((entry) => ({
      percentile: entry.percentile ?? null,
      delay: entry.delay ?? null,
    })),
    fromUtc: raw.fromUtc ?? null,
    toUtc: raw.toUtc ?? null,
  };
}

export function mapFlightDelays(
  data: unknown,
): { number: string | null; origins: ConsoleDelayStat[]; destinations: ConsoleDelayStat[] } | null {
  if (!data || typeof data !== "object") return null;
  const dto = data as AeroFlightDelaysDto;
  if (
    (!Array.isArray(dto.origins) && !Array.isArray(dto.destinations)) ||
    (dto.origins != null && !Array.isArray(dto.origins)) ||
    (dto.destinations != null && !Array.isArray(dto.destinations))
  ) {
    return null;
  }
  return {
    number: dto.number ?? null,
    origins: (dto.origins ?? []).map(mapDelayStat),
    destinations: (dto.destinations ?? []).map(mapDelayStat),
  };
}

// ── Airport feed coverage ───────────────────────────────────────────────────

export type FeedStatus =
  | "Down"
  | "Degraded"
  | "OKPartial"
  | "OK"
  | "Unknown"
  | "Unavailable";

export interface ConsoleAirportCoverage {
  iata: string;
  icao: string;
  schedules: FeedStatus;
  liveUpdates: FeedStatus;
  adsb: FeedStatus;
}

function feedStatus(value: string | undefined): FeedStatus {
  switch (value) {
    case "Down":
    case "Degraded":
    case "OKPartial":
    case "OK":
    case "Unavailable":
      return value;
    default:
      return "Unknown";
  }
}

export function mapAirportCoverage(
  data: unknown,
  iata: string,
  icao: string,
): ConsoleAirportCoverage | null {
  if (!data || typeof data !== "object") return null;
  const dto = data as {
    flightSchedulesFeed?: { status?: string };
    liveFlightUpdatesFeed?: { status?: string };
    adsbUpdatesFeed?: { status?: string };
  };
  return {
    iata,
    icao,
    schedules: feedStatus(dto.flightSchedulesFeed?.status),
    liveUpdates: feedStatus(dto.liveFlightUpdatesFeed?.status),
    adsb: feedStatus(dto.adsbUpdatesFeed?.status),
  };
}

// ── Provider ────────────────────────────────────────────────────────────────

export class ConsoleFlightProvider {
  private readonly client: AeroDataBoxClient;

  constructor(
    config: AppConfig,
    client: AeroDataBoxClient = new AeroDataBoxClient(config),
  ) {
    this.client = client;
  }

  get configured(): boolean {
    return this.client.configured;
  }

  private base(result: AeroFetchResult<unknown>) {
    return {
      mode: result.mode,
      status: result.status,
      ...provenanceOf(result),
    };
  }

  /** Full console `Flight` search; `date` scopes to the operating day. */
  async lookupFlight(
    rawNumber: string,
    date?: string,
    ttl?: { ttlMs: number; staleTtlMs?: number },
  ): Promise<{
    mode: FlightDataMode;
    status: number;
    flights: Flight[];
  } & DataProvenance> {
    const flightNumber = rawNumber.replace(/\s+/g, "").toUpperCase();
    const path = date
      ? `/flights/number/${flightNumber}/${date}?dateLocalRole=Departure&withAircraftImage=false&withLocation=true`
      : `/flights/number/${flightNumber}?withAircraftImage=false&withLocation=true`;
    const result = await this.client.get<AeroFlightDto[]>(path, {
      ttlMs: ttl?.ttlMs ?? PROVIDER_TTL_MS.flightStatus,
      staleTtlMs: ttl?.staleTtlMs ?? PROVIDER_STALE_MS.flightStatus,
    });

    if (result.data != null && !Array.isArray(result.data)) {
      return {
        ...this.base({ ...result, mode: "ERROR" }),
        flights: [],
      };
    }

    const flights = (result.data ?? [])
      .map((dto) => mapConsoleFlight(dto))
      .filter((flight): flight is Flight => Boolean(flight))
      .filter((flight) => !date || flight.flightDate === date)
      .map((flight) => ({
        ...flight,
        source: "aerodatabox",
        fetchedAt: result.fetchedAt,
      }));

    return { ...this.base(result), flights };
  }

  async lookupAirportFids(
    code: string,
    ttl?: { ttlMs: number; staleTtlMs?: number },
  ): Promise<{
    mode: FlightDataMode;
    status: number;
    flights: Flight[];
    window: { from: string; to: string };
  } & DataProvenance> {
    const windowStart = new Date(Date.now() - 120 * 60_000).toISOString();
    const windowEnd = new Date(Date.now() + 720 * 60_000).toISOString();
    const result = await this.client.get<AeroFidsResponseDto>(
      `/flights/airports/iata/${code}?offsetMinutes=-120&durationMinutes=720&direction=Both&withLeg=true&withCancelled=true&withCodeshared=false`,
      {
        ttlMs: ttl?.ttlMs ?? PROVIDER_TTL_MS.airportBoard,
        staleTtlMs: ttl?.staleTtlMs ?? PROVIDER_STALE_MS.airportBoard,
      },
    );

    if (
      result.data != null &&
      (typeof result.data !== "object" ||
        (!Array.isArray(result.data.departures) &&
          !Array.isArray(result.data.arrivals)))
    ) {
      return {
        ...this.base({ ...result, mode: "ERROR" }),
        flights: [],
        window: { from: windowStart, to: windowEnd },
      };
    }

    const mapped = result.data ?? { departures: [], arrivals: [] };
    const all = mapConsoleFids(code, mapped);
    const departures = all
      .filter((flight) => flight.origin.code === code)
      .slice(0, 100);
    const arrivals = all
      .filter((flight) => flight.destination.code === code)
      .slice(0, 100);
    const flights = [...departures, ...arrivals].map((flight) => ({
      ...flight,
      source: "aerodatabox",
      fetchedAt: result.fetchedAt,
    }));

    return {
      ...this.base(result),
      flights,
      window: { from: windowStart, to: windowEnd },
    };
  }

  async lookupAirportRoutes(
    code: string,
    ttl?: { ttlMs: number; staleTtlMs?: number },
  ): Promise<{
    mode: FlightDataMode;
    status: number;
    routes: ConsoleRouteStat[];
    statisticsWindowDays: 7;
    note: string;
    omittedRoutes: number;
  } & DataProvenance> {
    const result = await this.client.get<{
      routes?: Array<{
        destination?: AeroAirportDto;
        averageDailyFlights?: number;
        operators?: Array<{ iata?: string; name?: string }>;
      }>;
    }>(`/airports/iata/${code}/stats/routes/daily`, {
      ttlMs: ttl?.ttlMs ?? PROVIDER_TTL_MS.routeStats,
      staleTtlMs: ttl?.staleTtlMs ?? PROVIDER_STALE_MS.routeStats,
    });

    if (result.data != null && !Array.isArray(result.data.routes)) {
      return {
        ...this.base({ ...result, mode: "ERROR" }),
        routes: [],
        statisticsWindowDays: 7 as const,
        note: "AeroDataBox returned an unexpected route-statistics payload.",
        omittedRoutes: 0,
      };
    }

    const rawRoutes = result.data?.routes ?? [];
    const omittedRoutes = rawRoutes.filter(
      (route) =>
        !route.destination?.iata ||
        route.destination.location?.lat == null ||
        route.destination.location?.lon == null,
    ).length;
    const routes = rawRoutes
      .filter(
        (route) =>
          route.destination?.iata &&
          route.destination.location?.lat != null &&
          route.destination.location?.lon != null,
      )
      .map<ConsoleRouteStat>((route) => {
        const daily = route.averageDailyFlights;
        return {
          destination: route.destination!.iata!,
          destinationName: route.destination?.name,
          city: route.destination?.municipalityName,
          country: route.destination?.countryCode,
          icao: route.destination?.icao,
          timezone: route.destination?.timeZone,
          latitude: route.destination!.location!.lat!,
          longitude: route.destination!.location!.lon!,
          // Never turn a missing average into a fabricated "1 flight/day".
          dailyFlights:
            typeof daily === "number" && Number.isFinite(daily) && daily > 0
              ? Math.round(daily * 10) / 10
              : null,
          operators: (route.operators ?? [])
            .filter((operator) => operator.iata || operator.name)
            .map((operator) => ({
              code: operator.iata ?? "",
              name: operator.name ?? operator.iata ?? "",
            })),
        };
      });

    return {
      ...this.base(result),
      routes,
      statisticsWindowDays: 7 as const,
      note: "AeroDataBox daily route statistics cover the previous 7 days. They are not a forward schedule.",
      omittedRoutes,
    };
  }

  async searchAirports(
    q: string,
  ): Promise<{
    mode: FlightDataMode;
    status: number;
    airports: AirportNode[];
  } & DataProvenance> {
    const result = await this.client.get<{ items?: AeroAirportDto[] }>(
      `/airports/search/term?q=${encodeURIComponent(q)}&limit=20`,
      {
        ttlMs: PROVIDER_TTL_MS.airportSearch,
        staleTtlMs: PROVIDER_STALE_MS.airportSearch,
      },
    );

    if (result.data != null && !Array.isArray(result.data.items)) {
      return {
        ...this.base({ ...result, mode: "ERROR" }),
        airports: [],
      };
    }

    const airports: AirportNode[] = (result.data?.items ?? [])
      .filter(
        (item) =>
          item.iata &&
          item.location?.lat != null &&
          item.location?.lon != null,
      )
      .map((item) => ({
        iata: item.iata!.toUpperCase(),
        icao: item.icao ?? "",
        name: item.name ?? item.shortName ?? item.iata!,
        city: item.municipalityName ?? "",
        country: item.countryCode ?? "",
        region: inferRegionFromCoords(
          item.location!.lat!,
          item.location!.lon!,
        ),
        latitude: item.location!.lat!,
        longitude: item.location!.lon!,
        timezone: item.timeZone ?? "",
        hubAirlines: [],
      }));

    return { ...this.base(result), airports };
  }

  /** Operating departure dates published for a flight number. */
  async lookupFlightDates(
    rawNumber: string,
  ): Promise<{
    mode: FlightDataMode;
    status: number;
    dates: string[];
  } & DataProvenance> {
    const flightNumber = rawNumber.replace(/\s+/g, "").toUpperCase();
    const result = await this.client.get<unknown>(
      `/flights/number/${flightNumber}/dates`,
      {
        ttlMs: PROVIDER_TTL_MS.flightDates,
        staleTtlMs: PROVIDER_STALE_MS.flightDates,
      },
    );
    const dates = mapFlightDates(result.data);
    if (dates == null) {
      return {
        ...this.base({ ...result, mode: result.data == null ? result.mode : "ERROR" }),
        dates: [],
      };
    }
    return { ...this.base(result), dates };
  }

  /** Historical delay statistics for a flight number. */
  async lookupFlightDelays(
    rawNumber: string,
  ): Promise<{
    mode: FlightDataMode;
    status: number;
    delays: {
      number: string | null;
      origins: ConsoleDelayStat[];
      destinations: ConsoleDelayStat[];
    } | null;
  } & DataProvenance> {
    const flightNumber = rawNumber.replace(/\s+/g, "").toUpperCase();
    const result = await this.client.get<AeroFlightDelaysDto>(
      `/flights/number/${flightNumber}/delays`,
      {
        ttlMs: PROVIDER_TTL_MS.flightDelays,
        staleTtlMs: PROVIDER_STALE_MS.flightDelays,
      },
    );
    const delays = mapFlightDelays(result.data);
    if (result.data != null && delays == null) {
      return { ...this.base({ ...result, mode: "ERROR" }), delays: null };
    }
    return { ...this.base(result), delays };
  }

  /** Aircraft reference data by registration. */
  async lookupAircraft(
    rawReg: string,
    ttl?: { ttlMs: number; staleTtlMs?: number },
  ): Promise<{
    mode: FlightDataMode;
    status: number;
    aircraft: ConsoleAircraft | null;
  } & DataProvenance> {
    const reg = rawReg.replace(/[\s-]/g, "").toUpperCase();
    const result = await this.client.get<AeroAircraftDto>(
      `/aircrafts/reg/${encodeURIComponent(reg)}`,
      {
        ttlMs: ttl?.ttlMs ?? PROVIDER_TTL_MS.aircraft,
        staleTtlMs: ttl?.staleTtlMs ?? PROVIDER_STALE_MS.aircraft,
      },
    );
    const aircraft = mapConsoleAircraft(result.data);
    const mode =
      result.data != null && aircraft == null ? ("ERROR" as const) : result.mode;
    return { ...this.base({ ...result, mode }), aircraft };
  }

  /** Airport reference data (runways, timezone, local time, links). */
  async lookupAirportInfo(
    code: string,
  ): Promise<{
    mode: FlightDataMode;
    status: number;
    airport: ConsoleAirportInfo | null;
  } & DataProvenance> {
    const result = await this.client.get<AeroAirportInfoDto>(
      `/airports/iata/${code}?withRunways=true&withTime=true`,
      {
        ttlMs: PROVIDER_TTL_MS.airportInfo,
        staleTtlMs: PROVIDER_STALE_MS.airportInfo,
      },
    );
    const airport = mapConsoleAirportInfo(result.data, code);
    const mode =
      result.data != null && airport == null ? ("ERROR" as const) : result.mode;
    return { ...this.base({ ...result, mode }), airport };
  }

  /** Provider feed coverage for the airport's ICAO code. */
  async lookupAirportCoverage(
    code: string,
  ): Promise<{
    mode: FlightDataMode;
    status: number;
    coverage: ConsoleAirportCoverage | null;
  } & DataProvenance> {
    const icao = catalogByIata.get(code)?.icao?.trim().toUpperCase();
    if (!icao) {
      return {
        mode: "NOT_FOUND",
        status: 0,
        source: "AERODATABOX",
        fetchedAt: new Date().toISOString(),
        attribution: "AeroDataBox",
        cached: false,
        stale: false,
        cacheAgeSeconds: 0,
        coverage: null,
      };
    }
    const result = await this.client.get<unknown>(
      `/health/services/airports/${encodeURIComponent(icao)}/feeds`,
      {
        ttlMs: PROVIDER_TTL_MS.airportCoverage,
        staleTtlMs: PROVIDER_STALE_MS.airportCoverage,
      },
    );
    const coverage = mapAirportCoverage(result.data, code, icao);
    const mode =
      result.data != null && coverage == null ? ("ERROR" as const) : result.mode;
    return { ...this.base({ ...result, mode }), coverage };
  }

  /** True when the provider charged a unit for this outcome. */
  charged(result: { mode: FlightDataMode; cached?: boolean }): boolean {
    return result.mode === "LIVE_AERODATABOX" && !result.cached;
  }
}
