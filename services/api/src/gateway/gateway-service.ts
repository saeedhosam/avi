import type { FastifyBaseLogger } from "fastify";
import { z } from "zod";
import {
  OpenMeteoWeatherService,
  aircraftCacheKey,
  airportRoutesCacheKey,
  aircraftCabinLayoutSchema,
  diffFlights,
  estimateBlockMinutes,
  flightCacheKey,
  flightSchema,
  formatDuration,
  geodesicDistanceKm,
  inferRegionFromCoords,
  kmToNm,
  mapToRealtimeAirportWeather,
  resolveCabinLayout,
  gatewayAircraftResponseSchema,
  gatewayRoutesResponseSchema,
  terminalSpatialGraphSchema,
  type AircraftCabinLayout,
  type AirportNode,
  type DirectFlightConnection,
  type Flight,
  type GatewayAircraftResponse,
  type GatewayBoardFlight,
  type GatewayBoardResponse,
  type GatewayFlightsResponse,
  type GatewayProvenance,
  type GatewayRoutesResponse,
  type OperatingCarrierRoute,
} from "@avi/shared";
import catalogAirports from "@avi/catalog/airports.json" with { type: "json" };
import type { AppConfig } from "../config.js";
import {
  providerCacheFor,
  type ProviderCache,
  type ProviderCacheLoad,
} from "../lib/provider-cache.js";
import type {
  SupabaseServer,
  TerminalGraphRow,
} from "../lib/supabase-server.js";
import type {
  ConsoleAircraft,
  ConsoleFlightProvider,
  DataProvenance,
} from "../providers/console-flights.js";
import { ExpoPushService } from "./expo-push.js";

interface CatalogAirport {
  iata: string;
  icao?: string;
  name?: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  region?: string;
  hubAirlines?: string[];
}

const catalogByIata = new Map<string, CatalogAirport>(
  (catalogAirports as CatalogAirport[]).map((airport) => [airport.iata, airport]),
);

const DAY_MS = 24 * 60 * 60_000;
const FLIGHT_SETTLED_TTL_MS = 7 * DAY_MS;
const ROUTES_TTL_MS = 7 * DAY_MS;
const ROUTES_STALE_MS = DAY_MS;
const BOARD_TTL_MS = 10 * 60_000;
const BOARD_STALE_MS = 5 * 60_000;
const AIRCRAFT_TTL_MS = 30 * DAY_MS;
const AIRCRAFT_STALE_MS = 30 * DAY_MS;

/** Response shape for an ingested indoor graph (shared graph + row metadata). */
export const gatewayTerminalGraphResponseSchema = z.object({
  airportCode: z.string().length(3),
  terminalId: z.string(),
  graph: terminalSpatialGraphSchema,
  source: z.enum(["osm_indoor", "curated", "parametric"]),
  fetchedAt: z.string(),
});

export type GatewayTerminalGraphResponse = z.infer<
  typeof gatewayTerminalGraphResponseSchema
>;

export interface GatewayCacheCounters {
  hits: number;
  misses: number;
  writes: number;
  errors: number;
}

interface GatewayCacheHit<T> {
  payload: T;
  fetchedAt: string;
}

export class GatewayServiceError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "GatewayServiceError";
  }
}

export interface GatewayServiceOptions {
  config: AppConfig;
  consoleFlights: ConsoleFlightProvider;
  supabase: SupabaseServer;
  expoPush: ExpoPushService;
  log: FastifyBaseLogger;
  weather?: OpenMeteoWeatherService;
}

function baseProvenance(
  outcome: DataProvenance,
  ttlSeconds: number,
): GatewayProvenance {
  return {
    source: "AERODATABOX",
    attribution: outcome.attribution,
    fetchedAt: outcome.fetchedAt,
    cached: outcome.cached,
    stale: outcome.stale,
    cacheAgeSeconds: outcome.cacheAgeSeconds,
    ttlSeconds,
  };
}

/**
 * Provenance for a response served from a cache tier. The payload's original
 * retrieval time and attribution are preserved; only freshness changes.
 */
function cachedProvenance(
  provenance: GatewayProvenance,
  stale: boolean,
  ttlSeconds: number,
): GatewayProvenance {
  const fetchedMs = Date.parse(provenance.fetchedAt);
  return {
    source: provenance.source,
    attribution: provenance.attribution,
    fetchedAt: provenance.fetchedAt,
    cached: true,
    stale: stale || provenance.stale,
    cacheAgeSeconds: Number.isFinite(fetchedMs)
      ? Math.max(0, Math.round((Date.now() - fetchedMs) / 1_000))
      : provenance.cacheAgeSeconds,
    ttlSeconds,
  };
}

/** Provenance for a fresh payload read from the Postgres cache tier. */
function postgresProvenance(
  fetchedAt: string,
  ttlSeconds: number,
): GatewayProvenance {
  const fetchedMs = Date.parse(fetchedAt);
  return {
    source: "AERODATABOX",
    attribution: "AeroDataBox",
    fetchedAt,
    cached: true,
    stale: false,
    cacheAgeSeconds: Number.isFinite(fetchedMs)
      ? Math.max(0, Math.round((Date.now() - fetchedMs) / 1_000))
      : 0,
    ttlSeconds,
  };
}

function catalogNode(iata: string): AirportNode | null {
  const node = catalogByIata.get(iata.trim().toUpperCase());
  if (!node || node.latitude == null || node.longitude == null) return null;
  return {
    iata: node.iata.toUpperCase(),
    icao: node.icao ?? "",
    name: node.name ?? node.iata,
    city: node.city ?? "",
    country: node.country ?? "",
    region: inferRegionFromCoords(node.latitude, node.longitude),
    latitude: node.latitude,
    longitude: node.longitude,
    timezone: node.timezone ?? "",
    hubAirlines: node.hubAirlines ?? [],
  };
}

function toRouteNode(stat: {
  destination: string;
  destinationName?: string | null;
  city?: string | null;
  country?: string | null;
  icao?: string | null;
  timezone?: string | null;
  latitude: number;
  longitude: number;
}): AirportNode {
  return {
    iata: stat.destination.toUpperCase(),
    icao: stat.icao ?? "",
    name: stat.destinationName ?? stat.destination,
    city: stat.city ?? stat.destination,
    country: stat.country ?? "",
    region: inferRegionFromCoords(stat.latitude, stat.longitude),
    latitude: stat.latitude,
    longitude: stat.longitude,
    timezone: stat.timezone ?? "",
    hubAirlines: [],
  };
}

function flightTtlForDate(date: string, now = new Date()): {
  ttlMs: number;
  staleMs: number;
  ttlSeconds: number;
} {
  const target = Date.parse(`${date}T12:00:00Z`);
  if (!Number.isFinite(target)) {
    return { ttlMs: 30 * 60_000, staleMs: 60_000, ttlSeconds: 30 * 60 };
  }
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).getTime();
  if (target < today) {
    return {
      ttlMs: FLIGHT_SETTLED_TTL_MS,
      staleMs: 0,
      ttlSeconds: FLIGHT_SETTLED_TTL_MS / 1000,
    };
  }
  const hours = (target - now.getTime()) / 3_600_000;
  if (target < today + DAY_MS || hours < 24) {
    return { ttlMs: 5 * 60_000, staleMs: 60_000, ttlSeconds: 300 };
  }
  return {
    ttlMs: 6 * 60 * 60_000,
    staleMs: 60_000,
    ttlSeconds: 6 * 60 * 60,
  };
}

/**
 * AeroDataBox Starter-safe gateway service.
 *
 * Every AeroDataBox call goes through the shared provider cache, with a
 * Starter-specific TTL policy and Redis single-flight coalescing. Fresh flight
 * responses are diffed against the last Supabase snapshot before an Expo push
 * fan-out, and the diff itself is coalesced through the cache so a burst of
 * refreshes produces one notification decision.
 */
export class GatewayService {
  private readonly weather: OpenMeteoWeatherService;
  private readonly cache: ProviderCache;
  private readonly gatewayCacheCounters: GatewayCacheCounters = {
    hits: 0,
    misses: 0,
    writes: 0,
    errors: 0,
  };

  constructor(private readonly options: GatewayServiceOptions) {
    this.weather = options.weather ?? new OpenMeteoWeatherService();
    this.cache = providerCacheFor(options.config);
  }

  private async settleCachedFlight(
    flightKey: string,
  ): Promise<{ flight: Flight; fetchedAt: string } | null> {
    const row = await this.options.supabase.getFlightSnapshot(flightKey);
    if (!row) return null;
    const fetchedAtMs = Date.parse(row.fetched_at);
    if (
      !Number.isFinite(fetchedAtMs) ||
      Date.now() - fetchedAtMs > FLIGHT_SETTLED_TTL_MS
    ) {
      return null;
    }
    const parsed = flightSchema.safeParse(row.snapshot);
    if (!parsed.success || parsed.data.status !== "LANDED") return null;
    return { flight: parsed.data, fetchedAt: row.fetched_at };
  }

  async getFlight(
    rawNumber: string,
    date: string,
  ): Promise<GatewayFlightsResponse> {
    const compact = rawNumber.replace(/\s+/g, "").toUpperCase();
    if (!/^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/.test(compact)) {
      throw new GatewayServiceError(
        400,
        "invalid_flight_number",
        "Use an airline code and flight number, for example BA117.",
      );
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new GatewayServiceError(
        400,
        "invalid_flight_date",
        "Use an ISO operating date, for example 2026-11-14.",
      );
    }
    const key = flightCacheKey(compact, date);

    // A landed flight is settled: the Starter terms cap retention at 7 days,
    // and no provider call is needed while that snapshot is valid.
    const settled = await this.settleCachedFlight(key);
    if (settled) {
      return {
        mode: "LIVE_AERODATABOX",
        flights: [settled.flight],
        provenance: {
          source: "AERODATABOX",
          attribution: "AeroDataBox",
          fetchedAt: settled.fetchedAt,
          cached: true,
          stale: true,
          cacheAgeSeconds: Math.max(
            0,
            Math.round((Date.now() - Date.parse(settled.fetchedAt)) / 1000),
          ),
          ttlSeconds: FLIGHT_SETTLED_TTL_MS / 1000,
        },
      };
    }

    const policy = flightTtlForDate(date);
    const outcome = await this.options.consoleFlights.lookupFlight(compact, date, {
      ttlMs: policy.ttlMs,
      // Do not serve stale flight status: a background revalidation would not
      // pass through the differ, which could miss the gate/terminal change the
      // passenger needs. A cache miss waits for the coalesced refresh instead.
      staleTtlMs: 0,
    });
    if (outcome.mode !== "LIVE_AERODATABOX") {
      if (outcome.mode === "NOT_FOUND" || outcome.flights.length === 0) {
        throw new GatewayServiceError(
          404,
          "flight_not_found",
          "No flight matches that number and operating date.",
        );
      }
      if (outcome.mode === "NOT_CONFIGURED") {
        throw new GatewayServiceError(
          503,
          "provider_not_configured",
          "Live flight data is not configured.",
        );
      }
      if (outcome.mode === "QUOTA_FALLBACK") {
        throw new GatewayServiceError(
          429,
          "provider_quota_exhausted",
          "Live flight lookups are paused until the provider quota resets.",
        );
      }
      throw new GatewayServiceError(
        outcome.mode === "INVALID_REQUEST" ? 400 : 502,
        "provider_failure",
        "The live flight provider is temporarily unavailable.",
      );
    }
    if (outcome.status === 204) {
      throw new GatewayServiceError(
        503,
        "flight_data_unavailable",
        "The provider returned no flight data. This is not evidence that the flight does not exist.",
      );
    }

    const filtered = outcome.flights
      .map((candidate) => flightSchema.safeParse(candidate))
      .filter((parsed) => parsed.success)
      .map((parsed) => parsed.data)
      .filter(
        (flight) =>
          flight.flightNumber.replace(/\s+/g, "").toUpperCase() === compact,
      );
    const allParsed = outcome.flights
      .map((candidate) => flightSchema.safeParse(candidate))
      .filter((parsed) => parsed.success)
      .map((parsed) => parsed.data);
    const flight = filtered[0] ?? allParsed[0];
    if (!flight) {
      throw new GatewayServiceError(
        404,
        "flight_not_found",
        "No plotable flight matches that number and operating date.",
      );
    }

    const provenance = baseProvenance(outcome, policy.ttlSeconds);
    if (!outcome.cached) {
      await this.processFreshFlight(key, flight, outcome.fetchedAt);
    }
    return {
      mode: outcome.mode,
      flights: [flight],
      provenance,
    };
  }

  /**
   * Diff + notify only once per fresh provider response, even when 50 clients
   * hit the gateway simultaneously. The cache lock is shared across replicas
   * when Redis is configured.
   */
  private async processFreshFlight(
    flightKey: string,
    flight: Flight,
    fetchedAt: string,
  ): Promise<void> {
    const diffKey = `gateway-diff:${flightKey}:${fetchedAt}`;
    try {
      await this.cache.getOrLoad(
        diffKey,
        {
          ttlMs: 5 * 60_000,
          staleTtlMs: 0,
          source: "AERODATABOX",
          attribution: "AeroQuest gateway",
          query: diffKey,
          cacheable: () => true,
        },
        async () => {
          const previousRow = await this.options.supabase.getFlightSnapshot(flightKey);
          if (previousRow) {
            const previous = flightSchema.safeParse(previousRow.snapshot);
            if (previous.success) {
              const alerts = diffFlights(previous.data, flight, {
                includeTerminal: true,
                includeBaggage: true,
              });
              if (alerts.length > 0) {
                await this.options.expoPush.notifyFlightChanges(flight, alerts);
              }
            }
          }
          await this.options.supabase.upsertFlightSnapshot(
            flightKey,
            flight.flightNumber,
            flight,
            new Date(Date.now() + FLIGHT_SETTLED_TTL_MS).toISOString(),
          );
          return { processed: true };
        },
      );
    } catch (error) {
      this.options.log.warn(
        { err: error, flight: flight.flightNumber },
        "gateway flight diff failed",
      );
    }
  }

  /**
   * Long-lived route payloads are cached at two tiers: Redis (hot, via the
   * shared provider cache) and Postgres `gateway_cache` (survives a Redis
   * flush). Both are checked before spending an AeroDataBox unit.
   */
  async getRoutes(iata: string): Promise<GatewayRoutesResponse> {
    const code = iata.trim().toUpperCase();
    const origin = catalogNode(code);
    if (!origin) {
      throw new GatewayServiceError(
        404,
        "airport_unknown",
        "No verified coordinates are available for that airport code.",
      );
    }
    const key = airportRoutesCacheKey(code);
    const loaded = await this.cache.getOrLoad<GatewayRoutesResponse>(
      key,
      {
        ttlMs: ROUTES_TTL_MS,
        staleTtlMs: ROUTES_STALE_MS,
        source: "AERODATABOX",
        attribution: "AeroDataBox",
        query: key,
        cacheable: (value) => value.routes.length > 0,
      },
      () => this.loadRoutes(code, origin, key),
    );
    return this.withCacheProvenance(loaded, ROUTES_TTL_MS / 1_000);
  }

  private async loadRoutes(
    code: string,
    origin: AirportNode,
    cacheKey: string,
  ): Promise<GatewayRoutesResponse> {
    const cached = await this.readGatewayCache(
      cacheKey,
      gatewayRoutesResponseSchema,
    );
    if (cached) {
      return {
        ...cached.payload,
        provenance: postgresProvenance(
          cached.fetchedAt,
          ROUTES_TTL_MS / 1_000,
        ),
      };
    }

    const outcome = await this.options.consoleFlights.lookupAirportRoutes(code, {
      ttlMs: ROUTES_TTL_MS,
      staleTtlMs: ROUTES_STALE_MS,
    });
    if (outcome.mode !== "LIVE_AERODATABOX") {
      throw new GatewayServiceError(
        outcome.mode === "NOT_FOUND" ? 404 : outcome.mode === "QUOTA_FALLBACK" ? 429 : 502,
        outcome.mode === "NOT_FOUND" ? "airport_not_found" : "provider_failure",
        outcome.mode === "NOT_FOUND"
          ? "The provider has no route statistics for that airport."
          : "Live route data is temporarily unavailable.",
      );
    }
    if (outcome.status === 204) {
      throw new GatewayServiceError(
        503,
        "route_data_unavailable",
        "The provider returned no route data. This is not evidence that no routes exist.",
      );
    }

    const connections: DirectFlightConnection[] = outcome.routes
      .map((stat) => {
        const destination = toRouteNode(stat);
        const distanceKm = Math.round(
          geodesicDistanceKm(
            origin.latitude,
            origin.longitude,
            destination.latitude,
            destination.longitude,
          ),
        );
        const estimatedMinutes = estimateBlockMinutes(distanceKm);
        const carriers: OperatingCarrierRoute[] = stat.operators
          .filter((operator) => operator.code || operator.name)
          .map((operator) => ({
            airlineCode: operator.code.toUpperCase(),
            airlineName: operator.name || operator.code,
            flightNumbers: [],
            dailyFrequencies: null,
            aircraftTypes: [],
          }));
        return {
          id: `${origin.iata}-${destination.iata}`,
          origin,
          destination,
          distanceKm,
          distanceNm: Math.round(kmToNm(distanceKm)),
          estimatedDurationMinutes: estimatedMinutes,
          durationFormatted: formatDuration(estimatedMinutes),
          // Route stats do not report block time. The value is explicitly an
          // estimate derived from great-circle distance.
          durationEstimated: true,
          haulCategory:
            distanceKm < 1500
              ? "SHORT_HAUL"
              : distanceKm <= 4000
                ? "MEDIUM_HAUL"
                : "LONG_HAUL",
          dailyFlightsCount: stat.dailyFlights,
          hasDepartures: true,
          hasArrivals: false,
          operatingCarriers: carriers,
          isLiveVerified: false,
          dataSource: "AERODATABOX",
          updatedAt: outcome.fetchedAt,
        } satisfies DirectFlightConnection;
      })
      .sort(
        (a, b) =>
          (b.dailyFlightsCount ?? -1) - (a.dailyFlightsCount ?? -1) ||
          a.distanceKm - b.distanceKm,
      );

    const response: GatewayRoutesResponse = {
      mode: outcome.mode,
      routes: connections,
      provenance: baseProvenance(outcome, ROUTES_TTL_MS / 1_000),
    };
    if (!outcome.cached && connections.length > 0) {
      await this.writeGatewayCache(
        cacheKey,
        response,
        outcome.fetchedAt,
        ROUTES_TTL_MS,
        ROUTES_STALE_MS,
      );
    }
    return response;
  }

  async getBoard(iata: string): Promise<GatewayBoardResponse> {
    const code = iata.trim().toUpperCase();
    const outcome = await this.options.consoleFlights.lookupAirportFids(code, {
      ttlMs: BOARD_TTL_MS,
      staleTtlMs: BOARD_STALE_MS,
    });
    if (outcome.mode !== "LIVE_AERODATABOX") {
      throw new GatewayServiceError(
        outcome.mode === "NOT_FOUND" ? 404 : outcome.mode === "QUOTA_FALLBACK" ? 429 : 502,
        outcome.mode === "NOT_FOUND" ? "airport_not_found" : "provider_failure",
        outcome.mode === "NOT_FOUND"
          ? "The provider has no airport board for that code."
          : "Live airport board data is temporarily unavailable.",
      );
    }
    if (outcome.status === 204) {
      throw new GatewayServiceError(
        503,
        "board_data_unavailable",
        "The provider returned no board data. This is not evidence that no flights operate.",
      );
    }

    const flights: GatewayBoardFlight[] = outcome.flights
      .map((candidate) => flightSchema.safeParse(candidate))
      .filter((parsed) => parsed.success)
      .map((parsed) => parsed.data)
      .map((flight) => ({
        flight,
        direction: flight.origin.code === code ? "DEPARTURE" : "ARRIVAL",
      }));

    let weather: GatewayBoardResponse["weather"] = null;
    const airport = catalogByIata.get(code);
    if (airport?.latitude != null && airport.longitude != null) {
      try {
        const raw = await this.weather.fetchRaw(airport.latitude, airport.longitude);
        const mapped = mapToRealtimeAirportWeather(airport.icao ?? code, raw);
        weather = {
          code,
          source: "OPEN_METEO",
          tempC: mapped.tempC,
          condition: mapped.condition,
          wind: mapped.wind,
          humidity: mapped.humidity,
          fetchedAt: new Date().toISOString(),
        };
      } catch (error) {
        this.options.log.warn(
          { err: error, airport: code },
          "gateway board weather unavailable",
        );
      }
    }

    return {
      mode: outcome.mode,
      airportCode: code,
      flights,
      weather,
      provenance: baseProvenance(outcome, BOARD_TTL_MS / 1000),
    };
  }

  async getAircraft(regOrIcao: string): Promise<GatewayAircraftResponse> {
    const normalized = regOrIcao.replace(/[\s-]/g, "").toUpperCase();
    const key = aircraftCacheKey(normalized);
    const loaded = await this.cache.getOrLoad<GatewayAircraftResponse>(
      key,
      {
        ttlMs: AIRCRAFT_TTL_MS,
        staleTtlMs: AIRCRAFT_STALE_MS,
        source: "AERODATABOX",
        attribution: "AeroDataBox",
        query: key,
        cacheable: (value) => Boolean(value.aircraft.registration),
      },
      () => this.loadAircraft(regOrIcao, key),
    );
    return this.withCacheProvenance(loaded, AIRCRAFT_TTL_MS / 1_000);
  }

  private async loadAircraft(
    regOrIcao: string,
    cacheKey: string,
  ): Promise<GatewayAircraftResponse> {
    const cached = await this.readGatewayCache(
      cacheKey,
      gatewayAircraftResponseSchema,
    );
    if (cached) {
      return {
        ...cached.payload,
        provenance: postgresProvenance(
          cached.fetchedAt,
          AIRCRAFT_TTL_MS / 1_000,
        ),
      };
    }

    const outcome = await this.options.consoleFlights.lookupAircraft(regOrIcao, {
      ttlMs: AIRCRAFT_TTL_MS,
      staleTtlMs: AIRCRAFT_STALE_MS,
    });
    if (outcome.status === 204) {
      throw new GatewayServiceError(
        503,
        "aircraft_data_unavailable",
        "The provider returned no aircraft data. This is not evidence that the registration does not exist.",
      );
    }
    if (outcome.mode !== "LIVE_AERODATABOX" || !outcome.aircraft) {
      throw new GatewayServiceError(
        outcome.mode === "NOT_FOUND" ? 404 : 502,
        outcome.mode === "NOT_FOUND" ? "aircraft_not_found" : "provider_failure",
        outcome.mode === "NOT_FOUND"
          ? "The provider has no aircraft with that registration."
          : "Aircraft reference data is temporarily unavailable.",
      );
    }

    const aircraft = outcome.aircraft;
    const resolved = await this.resolveCachedCabinLayout(aircraft);
    const layout = resolved?.layout ?? null;
    const response: GatewayAircraftResponse = {
      aircraft: {
        registration: aircraft.reg,
        icaoCode: aircraft.icaoCode,
        iataType: aircraft.iataType,
        model: aircraft.model,
        numSeats: aircraft.numSeats,
        ageYears: aircraft.ageYears,
        cabinLayoutKey: layout?.layoutKey ?? null,
        cabinLayoutCached: resolved?.fromCache ?? false,
      },
      layout,
      provenance: baseProvenance(outcome, AIRCRAFT_TTL_MS / 1_000),
    };
    if (!outcome.cached) {
      await this.writeGatewayCache(
        cacheKey,
        response,
        outcome.fetchedAt,
        AIRCRAFT_TTL_MS,
        AIRCRAFT_STALE_MS,
      );
    }
    return response;
  }

  /**
   * Ingested OSM graphs are read exactly for the requested airport/terminal.
   * There is deliberately no curated fallback here: the client already owns
   * the curated catalog and must not be told an unrelated airport's graph is
   * this airport's indoor layout.
   */
  async getTerminalGraph(
    iata: string,
    terminal: string,
  ): Promise<GatewayTerminalGraphResponse> {
    const airportCode = iata.trim().toUpperCase();
    const terminalId = terminal.trim();
    if (!this.options.supabase.ready) {
      throw new GatewayServiceError(
        503,
        "terminal_graph_unavailable",
        "Ingested terminal graphs are not configured on this gateway.",
      );
    }
    let row: TerminalGraphRow | null;
    try {
      row = await this.options.supabase.getTerminalGraph(
        airportCode,
        terminalId,
      );
    } catch (error) {
      this.options.log.warn(
        { err: error, airport: airportCode, terminal: terminalId },
        "terminal graph read failed",
      );
      throw new GatewayServiceError(
        502,
        "terminal_graph_unavailable",
        "The ingested terminal graph store is temporarily unavailable.",
      );
    }
    if (!row) {
      throw new GatewayServiceError(
        404,
        "terminal_graph_not_found",
        "No ingested indoor graph exists for that airport and terminal.",
      );
    }
    const parsed = terminalSpatialGraphSchema.safeParse(row.graph);
    if (
      !parsed.success ||
      parsed.data.airportCode.toUpperCase() !== airportCode ||
      parsed.data.terminalId !== terminalId
    ) {
      this.options.log.warn(
        { airport: airportCode, terminal: terminalId },
        "terminal graph payload failed validation",
      );
      throw new GatewayServiceError(
        502,
        "terminal_graph_invalid",
        "The stored terminal graph is invalid for that airport and terminal.",
      );
    }
    const source =
      row.source === "curated" ||
      row.source === "parametric" ||
      row.source === "osm_indoor"
        ? row.source
        : parsed.data.source;
    return {
      airportCode,
      terminalId,
      graph: parsed.data,
      source,
      fetchedAt: row.fetched_at,
    };
  }

  /** Postgres read-through hit counters exposed by `/v1/status`. */
  gatewayCacheStats(): GatewayCacheCounters & { configured: boolean } {
    return {
      configured: this.options.supabase.ready,
      ...this.gatewayCacheCounters,
    };
  }

  private async readGatewayCache<T>(
    key: string,
    schema: z.ZodType<T>,
  ): Promise<GatewayCacheHit<T> | null> {
    if (!this.options.supabase.ready) return null;
    try {
      const row = await this.options.supabase.getGatewayCache(key);
      if (!row) {
        this.gatewayCacheCounters.misses += 1;
        return null;
      }
      const freshUntil = Date.parse(row.fresh_until);
      const expiresAt = Date.parse(row.expires_at);
      if (
        !Number.isFinite(freshUntil) ||
        freshUntil <= Date.now() ||
        (Number.isFinite(expiresAt) && expiresAt <= Date.now())
      ) {
        this.gatewayCacheCounters.misses += 1;
        return null;
      }
      const parsed = schema.safeParse(row.payload);
      if (!parsed.success) {
        this.gatewayCacheCounters.errors += 1;
        this.options.log.warn(
          { key },
          "gateway cache payload failed validation",
        );
        return null;
      }
      this.gatewayCacheCounters.hits += 1;
      return { payload: parsed.data, fetchedAt: row.fetched_at };
    } catch (error) {
      this.gatewayCacheCounters.errors += 1;
      this.options.log.warn(
        { err: error, key },
        "gateway cache read failed",
      );
      return null;
    }
  }

  private async writeGatewayCache(
    key: string,
    payload: GatewayRoutesResponse | GatewayAircraftResponse,
    fetchedAt: string,
    freshMs: number,
    staleMs: number,
  ): Promise<void> {
    if (!this.options.supabase.ready) return;
    try {
      const fetchedMs = Date.parse(fetchedAt);
      const baseMs = Number.isFinite(fetchedMs) ? fetchedMs : Date.now();
      const freshUntil = baseMs + freshMs;
      await this.options.supabase.upsertGatewayCache({
        cacheKey: key,
        payload,
        source: "AERODATABOX",
        fetchedAt: new Date(baseMs).toISOString(),
        freshUntil: new Date(freshUntil).toISOString(),
        expiresAt: new Date(freshUntil + staleMs).toISOString(),
      });
      this.gatewayCacheCounters.writes += 1;
    } catch (error) {
      this.gatewayCacheCounters.errors += 1;
      this.options.log.warn(
        { err: error, key },
        "gateway cache write failed",
      );
    }
  }

  private withCacheProvenance(
    loaded: ProviderCacheLoad<GatewayRoutesResponse>,
    ttlSeconds: number,
  ): GatewayRoutesResponse;
  private withCacheProvenance(
    loaded: ProviderCacheLoad<GatewayAircraftResponse>,
    ttlSeconds: number,
  ): GatewayAircraftResponse;
  private withCacheProvenance(
    loaded: ProviderCacheLoad<
      GatewayRoutesResponse | GatewayAircraftResponse
    >,
    ttlSeconds: number,
  ): GatewayRoutesResponse | GatewayAircraftResponse {
    if (!loaded.cached) return loaded.value;
    return {
      ...loaded.value,
      provenance: cachedProvenance(
        loaded.value.provenance,
        loaded.stale,
        ttlSeconds,
      ),
    };
  }

  private async resolveCachedCabinLayout(
    aircraft: ConsoleAircraft,
  ): Promise<{ layout: AircraftCabinLayout; fromCache: boolean } | null> {
    const type = aircraft.iataType ?? aircraft.model ?? aircraft.icaoCode;
    if (!type) return null;
    try {
      const cached = await this.options.supabase.getCabinLayout(type);
      if (cached) {
        const parsed = resolveCabinLayoutFromCache(cached);
        if (parsed) return { layout: parsed, fromCache: true };
      }
      const layout = resolveCabinLayout(type);
      await this.options.supabase.upsertCabinLayout(
        type,
        layout,
        layout.source,
      );
      return { layout, fromCache: false };
    } catch (error) {
      this.options.log.warn({ err: error, type }, "cabin layout cache failed");
      return { layout: resolveCabinLayout(type), fromCache: false };
    }
  }
}

function resolveCabinLayoutFromCache(value: unknown): AircraftCabinLayout | null {
  const parsed = aircraftCabinLayoutSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
