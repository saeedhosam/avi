/**
 * Console-flight AeroDataBox provider.
 *
 * The AerodataBox -> console `Flight` mapping itself moved to
 * `@avi/contracts` so the web dev fallback (and any future mobile client)
 * consume exactly the same transformation instead of carrying a verbatim
 * copy. This file keeps only the provider surface: key checks, quota
 * fallbacks, caching, and the bundled catalog lookup used by the mapper.
 */
import type { AppConfig } from "../config.js";
import type { ConsoleRouteStat, Flight, RouteRegion, AirportNode } from "../domain/console.js";
import {
  createConsoleMapper,
  inferRegionFromCoords,
  type AeroAirportDto,
  type AeroFlightDto,
  type AeroFidsResponseDto,
  type ConsoleMapper,
} from "@avi/contracts";
import { TtlCache } from "../lib/cache.js";
import catalogAirports from "@avi/catalog/airports.json" with { type: "json" };

export type FlightDataMode =
  | "LIVE_AERODATABOX"
  | "QUOTA_FALLBACK"
  | "NOT_CONFIGURED"
  | "ERROR";

export type ConsoleOutcome<T> = {
  data: T | null;
  status: number;
  mode: FlightDataMode;
  /** True when the provider answered from its in-process cache (no unit spend). */
  cached?: boolean;
};

export function hasValidConsoleAeroKey(key: string | undefined): boolean {
  const value = key?.trim();
  if (!value) return false;
  return (
    value.length >= 16 &&
    !value.startsWith("DEFAULT_") &&
    !["null", "YOUR_AERODATABOX_KEY", "REPLACE_WITH_YOUR_KEY"].includes(value)
  );
}

function normalizeHost(host: string | undefined): string {
  if (!host || host === "null") return "api.aerodatabox.com";
  return host.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export { inferRegionFromCoords, type AeroFlightDto, type AeroFidsResponseDto, type AirportNodeLookup, type ConsoleMapper, type ConsoleMapperOptions } from "@avi/contracts";


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

export class ConsoleFlightProvider {
  private readonly flightCache = new TtlCache(500);
  private readonly fidsCache = new TtlCache(300);
  private readonly routesCache = new TtlCache(300);
  private readonly airportsCache = new TtlCache(200);
  private readonly host: string;

  constructor(private readonly config: AppConfig) {
    this.host = normalizeHost(config.AERODATABOX_API_HOST);
  }

  get configured(): boolean {
    return hasValidConsoleAeroKey(this.config.AERODATABOX_API_KEY);
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
    return { Accept: "application/json", "X-Api-Key": key };
  }

  private async fetchJson<T>(
    path: string,
  ): Promise<ConsoleOutcome<T>> {
    if (!this.configured) {
      return { data: null, status: 0, mode: "NOT_CONFIGURED" };
    }
    try {
      const response = await fetch(`https://${this.host}${path}`, {
        headers: this.headers(),
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
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
      if (response.status === 400 || response.status === 404) {
        return { data: null, status: response.status, mode: "LIVE_AERODATABOX" };
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

  /** Full console `Flight` search; `date` scopes to the operating day. */
  async lookupFlight(
    rawNumber: string,
    date?: string,
  ): Promise<{ mode: FlightDataMode; status: number; flights: Flight[]; cached?: boolean }> {
    const flightNumber = rawNumber.replace(/\s+/g, "").toUpperCase();
    const cacheKey = `lookup:${flightNumber}|${date ?? "any"}`;
    const cached = this.flightCache.get<{ mode: FlightDataMode; status: number; flights: Flight[]; cached?: boolean }>(cacheKey);
    if (cached) return { ...cached, cached: true };

    const path = date
      ? `/flights/number/${flightNumber}/${date}?dateLocalRole=Departure&withAircraftImage=false&withLocation=true`
      : `/flights/number/${flightNumber}?withAircraftImage=false&withLocation=true`;
    const { data, status, mode } = await this.fetchJson<AeroFlightDto[]>(path);

    const flights = (data ?? [])
      .map((dto) => mapConsoleFlight(dto))
      .filter((flight): flight is Flight => Boolean(flight))
      .filter((flight) => !date || flight.flightDate === date);

    const outcome = { mode, status, flights };
    // Cache durable outcomes only; errors and "not configured" stay uncached
    // so configuration changes apply at once.
    if (mode === "LIVE_AERODATABOX" || mode === "QUOTA_FALLBACK") {
      this.flightCache.set(cacheKey, outcome, 60_000);
    }
    return outcome;
  }

  async lookupAirportFids(
    code: string,
  ): Promise<{ mode: FlightDataMode; status: number; flights: Flight[]; cached?: boolean }> {
    const cacheKey = `fids:${code}`;
    const cached = this.fidsCache.get<{ mode: FlightDataMode; status: number; flights: Flight[]; cached?: boolean }>(cacheKey);
    if (cached) return { ...cached, cached: true };

    const { data, status, mode } = await this.fetchJson<AeroFidsResponseDto>(
      `/flights/airports/iata/${code}?direction=Both&withLeg=true&withCancelled=true&withCodeshared=false`,
    );
    const mapped = (data ?? { departures: [], arrivals: [] });
    const all = mapConsoleFids(code, mapped);
    const departures = all
      .filter((flight) => flight.origin.code === code)
      .slice(0, 100);
    const arrivals = all
      .filter((flight) => flight.destination.code === code)
      .slice(0, 100);
    const outcome = { mode, status, flights: [...departures, ...arrivals] };
    if (mode === "LIVE_AERODATABOX" || mode === "QUOTA_FALLBACK") {
      this.fidsCache.set(cacheKey, outcome, 60_000);
    }
    return outcome;
  }

  async lookupAirportRoutes(
    code: string,
  ): Promise<{ mode: FlightDataMode; status: number; routes: ConsoleRouteStat[]; cached?: boolean }> {
    const cacheKey = `routes:${code}`;
    const cached = this.routesCache.get<{ mode: FlightDataMode; status: number; routes: ConsoleRouteStat[]; cached?: boolean }>(cacheKey);
    if (cached) return { ...cached, cached: true };

    const { data, status, mode } = await this.fetchJson<{
      routes?: Array<{
        destination?: AeroAirportDto;
        averageDailyFlights?: number;
        operators?: Array<{ iata?: string; name?: string }>;
      }>;
    }>(`/airports/iata/${code}/stats/routes/daily`);

    const routes = (data?.routes ?? [])
      .filter(
        (route) =>
          route.destination?.iata &&
          route.destination.location?.lat != null &&
          route.destination.location?.lon != null,
      )
      .map<ConsoleRouteStat>((route) => ({
        destination: route.destination!.iata!,
        destinationName: route.destination?.name,
        city: route.destination?.municipalityName,
        country: route.destination?.countryCode,
        icao: route.destination?.icao,
        timezone: route.destination?.timeZone,
        latitude: route.destination!.location!.lat!,
        longitude: route.destination!.location!.lon!,
        dailyFlights: Math.max(1, Math.round(route.averageDailyFlights ?? 1)),
        operators: (route.operators ?? [])
          .filter((operator) => operator.iata || operator.name)
          .map((operator) => ({
            code: operator.iata ?? operator.name?.slice(0, 2).toUpperCase() ?? "",
            name: operator.name ?? operator.iata ?? "",
          })),
      }));

    const outcome = { mode, status, routes };
    if (mode === "LIVE_AERODATABOX") {
      // Daily route stats are stable; cache them for six hours.
      this.routesCache.set(cacheKey, outcome, 6 * 60 * 60_000);
    }
    return outcome;
  }

  async searchAirports(
    q: string,
  ): Promise<{ mode: FlightDataMode; status: number; airports: AirportNode[]; cached?: boolean }> {
    const cacheKey = `airports-search:${q}`;
    const cached = this.airportsCache.get<{ mode: FlightDataMode; status: number; airports: AirportNode[]; cached?: boolean }>(cacheKey);
    if (cached) return { ...cached, cached: true };

    const { data, status, mode } = await this.fetchJson<{
      items?: AeroAirportDto[];
    }>(`/airports/search/term?q=${encodeURIComponent(q)}&limit=20`);

    const airports: AirportNode[] = (data?.items ?? [])
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
        timezone: item.timeZone ?? "UTC",
        hubAirlines: [],
      }));

    const outcome = { mode, status, airports };
    if (mode === "LIVE_AERODATABOX") {
      this.airportsCache.set(cacheKey, outcome, 10 * 60_000);
    }
    return outcome;
  }
}
