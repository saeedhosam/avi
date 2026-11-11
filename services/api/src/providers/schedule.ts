import { z } from "zod";
import type { AppConfig } from "../config.js";
import {
  PROVIDER_STALE_MS,
  PROVIDER_TTL_MS,
  providerCacheFor,
  type ProviderCache,
} from "../lib/provider-cache.js";

/**
 * Forward schedule provider seam.
 *
 * AeroDataBox daily route statistics are a trailing 7-day average and do not
 * contain operating weekdays. A truthful timetable therefore needs a real
 * schedule source. This module defines the provider interface and implements
 * FlightAware AeroAPI's published-schedule endpoint (OAG-sourced).
 *
 * When no provider is configured (or credentials are missing) the service
 * returns `status: "unavailable"` with a machine-readable reason. It never
 * synthesizes operating days, frequencies, or an empty "verified" schedule.
 */

export type ScheduleStatus = "verified" | "partial" | "unavailable";

export interface ScheduledFlight {
  ident: string;
  identIata: string | null;
  actualIdent: string | null;
  actualIdentIata: string | null;
  aircraftType: string | null;
  origin: string;
  destination: string;
  /** Provider-local gate departure (AeroAPI returns Zulu). */
  scheduledOut: string;
  scheduledIn: string | null;
  /** Operating date in the provider's time basis (`timeBasis`). */
  serviceDate: string;
}

export interface RouteSchedule {
  status: ScheduleStatus;
  source: string;
  attribution: string | null;
  fetchedAt: string;
  timeBasis: "utc" | null;
  validFrom: string | null;
  validTo: string | null;
  flights: ScheduledFlight[];
  reason: string | null;
  omittedFlights: number;
  cached: boolean;
  stale: boolean;
  cacheAgeSeconds: number;
}

export interface ScheduleLookup {
  origin: string;
  destination: string;
  /** First operating date (UTC). Defaults to today. */
  date?: string;
  /** Number of days to request, clamped by `SCHEDULE_MAX_DAYS`. */
  days: number;
}

export interface ScheduleProvider {
  readonly id: string;
  readonly configured: boolean;
  lookup(query: ScheduleLookup): Promise<RouteSchedule>;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(dateIso: string, days: number): string {
  const parsed = Date.parse(`${dateIso}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return dateIso;
  return new Date(parsed + days * 24 * 60 * 60_000).toISOString().slice(0, 10);
}

function unavailable(
  source: string,
  reason: string,
  attribution: string | null = null,
): RouteSchedule {
  return {
    status: "unavailable",
    source,
    attribution,
    fetchedAt: new Date().toISOString(),
    timeBasis: null,
    validFrom: null,
    validTo: null,
    flights: [],
    reason,
    omittedFlights: 0,
    cached: false,
    stale: false,
    cacheAgeSeconds: 0,
  };
}

/** Used when no schedule provider is configured. */
export class UnavailableScheduleProvider implements ScheduleProvider {
  readonly id = "none";
  readonly configured = false;

  async lookup(_query?: ScheduleLookup): Promise<RouteSchedule> {
    return unavailable("none", "no_schedule_provider_configured");
  }
}

const AeroApiScheduleSchema = z.object({
  scheduled: z.array(
    z.object({
      ident: z.string(),
      ident_iata: z.string().nullable().optional(),
      actual_ident: z.string().nullable().optional(),
      actual_ident_iata: z.string().nullable().optional(),
      aircraft_type: z.string().nullable().optional(),
      scheduled_out: z.string().nullable().optional(),
      scheduled_in: z.string().nullable().optional(),
      origin: z.string().nullable().optional(),
      origin_iata: z.string().nullable().optional(),
      destination: z.string().nullable().optional(),
      destination_iata: z.string().nullable().optional(),
    }),
  ),
  num_pages: z.number().optional(),
  links: z.unknown().optional(),
});

const ATTRIBUTION = "FlightAware AeroAPI (OAG schedules)";
const SOURCE = "FLIGHTAWARE";

/**
 * FlightAware AeroAPI published schedules.
 *
 * `GET {base}/schedules/{date_start}/{date_end}` with `origin`/`destination`
 * filters. AeroAPI exposes up to 3 weeks per request and one year forward.
 * All times are Zulu, so responses are labelled `timeBasis: "utc"` rather than
 * pretending to know local time.
 */
export class FlightAwareScheduleProvider implements ScheduleProvider {
  readonly id = "flightaware";
  private readonly cache: ProviderCache;
  private readonly log?: { warn: (message: string) => void };

  constructor(
    private readonly config: AppConfig,
    cache: ProviderCache = providerCacheFor(config),
    log?: { warn: (message: string) => void },
  ) {
    this.cache = cache;
    this.log = log;
  }

  get configured(): boolean {
    const key = this.config.FLIGHTAWARE_API_KEY?.trim() ?? "";
    return key.length >= 16;
  }

  async lookup(query: ScheduleLookup): Promise<RouteSchedule> {
    if (!this.configured) {
      return unavailable(
        this.id,
        "schedule_provider_credentials_missing",
        ATTRIBUTION,
      );
    }

    const start = ISO_DATE.test(query.date ?? "") ? query.date! : todayUtc();
    const days = Math.min(
      Math.max(1, query.days),
      this.config.SCHEDULE_MAX_DAYS,
    );
    const endExclusive = addDays(start, days);
    const validTo = addDays(start, days - 1);
    const cacheKey = `schedule:${query.origin}:${query.destination}:${start}:${days}`;

    const cached = await this.cache.getOrLoad<RouteSchedule>(
      cacheKey,
      {
        ttlMs: PROVIDER_TTL_MS.routeSchedule,
        staleTtlMs: PROVIDER_STALE_MS.routeSchedule,
        source: SOURCE,
        attribution: ATTRIBUTION,
        query: cacheKey,
        // Never cache an outage/quota/auth failure as an empty schedule.
        cacheable: (value) =>
          value.status === "verified" || value.status === "partial",
      },
      () => this.fetchSchedule(query, start, endExclusive, validTo),
    );

    return {
      ...cached.value,
      cached: cached.cached,
      stale: cached.stale,
      cacheAgeSeconds: cached.cacheAgeSeconds,
      fetchedAt: cached.cached ? cached.fetchedAt : cached.value.fetchedAt,
    };
  }

  private async fetchSchedule(
    query: ScheduleLookup,
    start: string,
    endExclusive: string,
    validTo: string,
  ): Promise<RouteSchedule> {
    const base = this.config.FLIGHTAWARE_API_BASE_URL.replace(/\/+$/, "");
    const params = new URLSearchParams({
      origin: query.origin,
      destination: query.destination,
      max_pages: "2",
      include_codeshares: "false",
      include_regional: "false",
    });
    const url = `${base}/schedules/${start}/${endExclusive}?${params.toString()}`;

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "x-apikey": this.config.FLIGHTAWARE_API_KEY ?? "",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      this.log?.warn(`flightaware schedules request failed (${String(error)})`);
      return unavailable(this.id, "provider_unreachable", ATTRIBUTION);
    }

    if (response.status === 204) {
      return unavailable(this.id, "provider_returned_no_data", ATTRIBUTION);
    }
    if (response.status === 400) {
      return unavailable(this.id, "provider_rejected_query", ATTRIBUTION);
    }
    if (response.status === 401 || response.status === 403) {
      return unavailable(this.id, "provider_auth_failed", ATTRIBUTION);
    }
    if (response.status === 404) {
      return unavailable(this.id, "route_not_found", ATTRIBUTION);
    }
    if (response.status === 429) {
      return unavailable(this.id, "provider_quota_exhausted", ATTRIBUTION);
    }
    if (!response.ok) {
      return unavailable(
        this.id,
        `provider_http_${response.status}`,
        ATTRIBUTION,
      );
    }

    let payload: z.infer<typeof AeroApiScheduleSchema>;
    try {
      payload = AeroApiScheduleSchema.parse(await response.json());
    } catch {
      return unavailable(this.id, "provider_payload_invalid", ATTRIBUTION);
    }

    let omitted = 0;
    const flights: ScheduledFlight[] = [];
    for (const row of payload.scheduled) {
      if (!row.scheduled_out || !ISO_DATE.test(row.scheduled_out.slice(0, 10))) {
        omitted += 1;
        continue;
      }
      const serviceDate = row.scheduled_out.slice(0, 10);
      if (serviceDate < start || serviceDate >= endExclusive) {
        omitted += 1;
        continue;
      }
      const origin = row.origin_iata ?? row.origin ?? query.origin;
      const destination =
        row.destination_iata ?? row.destination ?? query.destination;
      if (
        origin.toUpperCase() !== query.origin ||
        destination.toUpperCase() !== query.destination
      ) {
        omitted += 1;
        continue;
      }
      flights.push({
        ident: row.ident,
        identIata: row.ident_iata ?? null,
        actualIdent: row.actual_ident ?? null,
        actualIdentIata: row.actual_ident_iata ?? null,
        aircraftType: row.aircraft_type ?? null,
        origin: origin.toUpperCase(),
        destination: destination.toUpperCase(),
        scheduledOut: row.scheduled_out,
        scheduledIn: row.scheduled_in ?? null,
        serviceDate,
      });
    }

    flights.sort((a, b) => a.scheduledOut.localeCompare(b.scheduledOut));

    return {
      status: omitted > 0 ? "partial" : "verified",
      source: this.id,
      attribution: ATTRIBUTION,
      fetchedAt: new Date().toISOString(),
      timeBasis: "utc",
      validFrom: start,
      validTo,
      flights,
      reason:
        omitted > 0
          ? "Some published rows were outside the requested route/window or lacked a departure time."
          : null,
      omittedFlights: omitted,
      cached: false,
      stale: false,
      cacheAgeSeconds: 0,
    };
  }
}

export function createScheduleProvider(
  config: AppConfig,
  cache?: ProviderCache,
  log?: { warn: (message: string) => void },
): ScheduleProvider {
  switch (config.SCHEDULE_PROVIDER) {
    case "flightaware":
      return new FlightAwareScheduleProvider(config, cache, log);
    default:
      return new UnavailableScheduleProvider();
  }
}

/** Thin service wrapper so routes never construct providers themselves. */
export class ScheduleService {
  constructor(private readonly provider: ScheduleProvider) {}

  get id(): string {
    return this.provider.id;
  }

  get configured(): boolean {
    return this.provider.configured;
  }

  lookup(query: ScheduleLookup): Promise<RouteSchedule> {
    return this.provider.lookup(query);
  }
}
