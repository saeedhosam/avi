import type { FlightStatus } from "../models/flight.js";

/**
 * AeroDataBox Starter-safe cache policy.
 *
 * Client devices never call AeroDataBox directly. The Hetzner gateway uses
 * these TTLs with `ProviderCache.getOrLoad`, whose single-flight/Redis lock
 * coalesces burst refreshes into one provider call.
 */
export const GATEWAY_TTL_SECONDS = {
  flightFarFuture: 6 * 60 * 60,
  flightNearDeparture: 5 * 60,
  flightSettled: 7 * 24 * 60 * 60,
  flightMidRange: 30 * 60,
  airportRoutes: 7 * 24 * 60 * 60,
  airportBoard: 10 * 60,
  aircraft: 30 * 24 * 60 * 60,
  weather: 15 * 60,
} as const;

export const GATEWAY_STALE_SECONDS = {
  flight: 60,
  airportRoutes: 24 * 60 * 60,
  airportBoard: 5 * 60,
  aircraft: 30 * 24 * 60 * 60,
  weather: 15 * 60,
} as const;

export interface FlightTtlInput {
  /** Scheduled departure as ISO timestamp or HH:mm on the flight date. */
  scheduledDeparture?: string | null;
  status?: FlightStatus | null;
  now?: Date;
}

export interface FlightTtlDecision {
  ttlSeconds: number;
  staleSeconds: number;
  reason:
    | "LANDED"
    | "EN_ROUTE"
    | "UNDER_6H"
    | "OVER_24H"
    | "6_TO_24H"
    | "UNKNOWN_SCHEDULE";
}

/**
 * Dynamic flight TTL:
 * - landed/arrived → 7 days
 * - en route or under 6 hours → 5 minutes
 * - more than 24 hours away → 6 hours
 * - 6–24 hours away → 30 minutes
 *
 * The stale window lets a replica answer instantly while one process refreshes.
 */
export function flightCachePolicy(input: FlightTtlInput): FlightTtlDecision {
  const status = input.status ?? null;
  if (status === "LANDED") {
    return {
      ttlSeconds: GATEWAY_TTL_SECONDS.flightSettled,
      staleSeconds: 0,
      reason: "LANDED",
    };
  }
  if (status === "DEPARTED") {
    return {
      ttlSeconds: GATEWAY_TTL_SECONDS.flightNearDeparture,
      staleSeconds: GATEWAY_STALE_SECONDS.flight,
      reason: "EN_ROUTE",
    };
  }
  const now = input.now ?? new Date();
  const departure = parseDeparture(input.scheduledDeparture, now);
  if (departure == null) {
    return {
      ttlSeconds: GATEWAY_TTL_SECONDS.flightMidRange,
      staleSeconds: GATEWAY_STALE_SECONDS.flight,
      reason: "UNKNOWN_SCHEDULE",
    };
  }
  const hours = (departure - now.getTime()) / 3_600_000;
  if (hours < 6) {
    return {
      ttlSeconds: GATEWAY_TTL_SECONDS.flightNearDeparture,
      staleSeconds: GATEWAY_STALE_SECONDS.flight,
      reason: "UNDER_6H",
    };
  }
  if (hours > 24) {
    return {
      ttlSeconds: GATEWAY_TTL_SECONDS.flightFarFuture,
      staleSeconds: GATEWAY_STALE_SECONDS.flight,
      reason: "OVER_24H",
    };
  }
  return {
    ttlSeconds: GATEWAY_TTL_SECONDS.flightMidRange,
    staleSeconds: GATEWAY_STALE_SECONDS.flight,
    reason: "6_TO_24H",
  };
}

function parseDeparture(
  value: string | null | undefined,
  now: Date,
): number | null {
  if (!value) return null;
  const direct = Date.parse(value);
  if (Number.isFinite(direct)) return direct;
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const date = new Date(now);
  date.setHours(Number(match[1]), Number(match[2]), 0, 0);
  if (date.getTime() < now.getTime() - 6 * 3_600_000) {
    date.setDate(date.getDate() + 1);
  }
  return date.getTime();
}

export function flightCacheKey(flightNumber: string, date: string): string {
  const compact = flightNumber.replace(/\s+/g, "").toUpperCase();
  return `aero:flight:${compact}:${date}`;
}

export function airportRoutesCacheKey(iata: string): string {
  return `aero:routes:${iata.trim().toUpperCase()}`;
}

export function airportBoardCacheKey(iata: string): string {
  return `aero:board:${iata.trim().toUpperCase()}`;
}

export function aircraftCacheKey(regOrIcao: string): string {
  return `aero:aircraft:${regOrIcao.trim().toUpperCase()}`;
}

export function cabinLayoutCacheKey(aircraftType: string): string {
  return `cabin-layout:${aircraftType.trim().toUpperCase()}`;
}

/**
 * Cache keys may be served from Redis or Supabase `gateway_cache`; the TTL is
 * part of the decision so long-lived rows (routes, aircraft) are not evicted
 * on the same schedule as live flight status.
 */
export interface GatewayCacheWrite {
  key: string;
  ttlSeconds: number;
  staleSeconds: number;
  source: "AERODATABOX" | "OPEN_METEO" | "SUPABASE";
}

export function flightCacheWrite(
  flightNumber: string,
  date: string,
  input: FlightTtlInput,
): GatewayCacheWrite {
  const policy = flightCachePolicy(input);
  return {
    key: flightCacheKey(flightNumber, date),
    ttlSeconds: policy.ttlSeconds,
    staleSeconds: policy.staleSeconds,
    source: "AERODATABOX",
  };
}
