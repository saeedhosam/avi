import type { AppConfig } from "../config.js";
import { hasValidAeroDataBoxKey } from "../config.js";
import {
  providerCacheFor,
  type ProviderCache,
} from "../lib/provider-cache.js";

export type AeroFetchMode =
  | "LIVE_AERODATABOX"
  | "QUOTA_FALLBACK"
  | "NOT_CONFIGURED"
  | "NOT_FOUND"
  | "INVALID_REQUEST"
  | "ERROR";

export interface AeroFetchResult<T> {
  data: T | null;
  status: number;
  mode: AeroFetchMode;
  /** ISO time the provider response was retrieved (preserved on cache hits). */
  fetchedAt: string;
  /** True when the response came from the shared cache (no unit spend). */
  cached: boolean;
  /** True when the cached response is past its fresh window. */
  stale: boolean;
  cacheAgeSeconds: number;
}

interface AeroRawResponse<T> {
  data: T | null;
  status: number;
  /** False when the provider returned an unparseable body. */
  parsed: boolean;
}

function modeFor(status: number, parsed: boolean): AeroFetchMode {
  if (status === 204) return "LIVE_AERODATABOX";
  if (!parsed) return "ERROR";
  if (status === 400) return "INVALID_REQUEST";
  if (status === 404) return "NOT_FOUND";
  if (status === 429) return "QUOTA_FALLBACK";
  if (status === 401 || status === 403) return "ERROR";
  if (status >= 200 && status < 300) return "LIVE_AERODATABOX";
  return "ERROR";
}

/**
 * Shared AeroDataBox HTTP client.
 *
 * Both the console (HTTP gateway) provider and the watch-engine provider use
 * this class, so host normalisation, auth headers, timeouts, status
 * classification, shared caching, and provenance metadata cannot drift between
 * them. Response-shape mapping stays in each provider.
 */
export class AeroDataBoxClient {
  readonly host: string;
  private readonly apiKey: string;
  private readonly cache: ProviderCache;

  constructor(
    config: AppConfig,
    cache: ProviderCache = providerCacheFor(config),
  ) {
    const host = config.AERODATABOX_API_HOST.replace(/^https?:\/\//, "")
      .replace(/\/$/, "")
      .trim();
    this.host = host || "api.aerodatabox.com";
    this.apiKey = config.AERODATABOX_API_KEY ?? "";
    this.cache = cache;
  }

  get configured(): boolean {
    return hasValidAeroDataBoxKey(this.apiKey);
  }

  url(path: string): string {
    return `https://${this.host}${path}`;
  }

  private headers(): Record<string, string> {
    if (this.host.includes("rapidapi.com")) {
      return {
        Accept: "application/json",
        "X-RapidAPI-Key": this.apiKey,
        "X-RapidAPI-Host": this.host,
      };
    }
    return {
      Accept: "application/json",
      "X-Api-Key": this.apiKey,
    };
  }

  /**
   * Read-through provider call.
   *
   * Only parsed 2xx payloads are cached. Provider errors, quota responses,
   * 204s, 4xx, and malformed bodies are returned uncached so every caller sees
   * the explicit state and nothing is mistaken for a verified empty result.
   */
  async get<T>(
    path: string,
    options: { ttlMs: number; staleTtlMs?: number; timeoutMs?: number },
  ): Promise<AeroFetchResult<T>> {
    const fetchedAt = new Date().toISOString();
    if (!this.configured) {
      return {
        data: null,
        status: 0,
        mode: "NOT_CONFIGURED",
        fetchedAt,
        cached: false,
        stale: false,
        cacheAgeSeconds: 0,
      };
    }

    const loaded = await this.cache.getOrLoad<AeroRawResponse<T>>(
      `aero:${path}`,
      {
        ttlMs: options.ttlMs,
        staleTtlMs: options.staleTtlMs ?? 0,
        source: "AERODATABOX",
        attribution: "AeroDataBox",
        query: path,
        cacheable: (value) =>
          value.parsed &&
          value.data !== null &&
          value.status >= 200 &&
          value.status < 300,
      },
      async () => {
        let response: Response;
        try {
          response = await fetch(this.url(path), {
            headers: this.headers(),
            cache: "no-store",
            signal: AbortSignal.timeout(options.timeoutMs ?? 12_000),
          });
        } catch {
          return { data: null, status: 0, parsed: false };
        }
        if (!response.ok) {
          return { data: null, status: response.status, parsed: true };
        }
        if (response.status === 204) {
          return { data: null, status: 204, parsed: true };
        }
        try {
          return {
            data: (await response.json()) as T,
            status: response.status,
            parsed: true,
          };
        } catch {
          return { data: null, status: response.status, parsed: false };
        }
      },
    );

    return {
      data: loaded.value.data,
      status: loaded.value.status,
      mode: modeFor(loaded.value.status, loaded.value.parsed),
      fetchedAt: loaded.fetchedAt,
      cached: loaded.cached,
      stale: loaded.stale,
      cacheAgeSeconds: loaded.cacheAgeSeconds,
    };
  }
}
