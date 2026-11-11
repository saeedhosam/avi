import { createHash } from "node:crypto";
import { Redis } from "ioredis";
import type { AppConfig } from "../config.js";

/**
 * Cross-replica provider response cache.
 *
 * Two tiers:
 *  - **L1**: an in-process map (fast, per-instance).
 *  - **L2**: Redis, shared by every gateway replica when `REDIS_URL` is set.
 *
 * Entries are stored with an absolute `freshUntil` and `expiresAt`, the
 * provider/source identity, the retrieval time, and a SHA-256 payload hash so
 * a corrupted or cross-key read is rejected instead of being served as data.
 *
 * Failure/empty outcomes are *never* cached: callers pass a `cacheable`
 * predicate and the cache only stores values that pass it. A provider error,
 * quota response, 204, 400, or 404 therefore reaches the client as an explicit
 * state on every request.
 */

export type ProviderCacheBackend = "redis" | "process";

/** The slice of the ioredis client this module needs. */
export interface ProviderCacheRedis {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    mode: "PX",
    ttlMs: number,
    nx?: "NX",
  ): Promise<"OK" | null>;
  del(key: string): Promise<number>;
  ping(): Promise<string>;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  quit?(): Promise<unknown>;
  disconnect?(): unknown;
}

export interface ProviderCacheEntry<T> {
  /** Entry format version; a mismatch is treated as a miss. */
  v: 1;
  payload: T;
  /** SHA-256 of the canonicalized payload; detects corruption/stale schema. */
  payloadHash: string;
  /** SHA-256 of the canonicalized query, so keys cannot cross-read. */
  queryHash: string;
  source: string;
  attribution: string;
  /** ISO time the provider response was retrieved. */
  fetchedAt: string;
  /** Epoch ms after which the entry is served stale-while-revalidate. */
  freshUntil: number;
  /** Epoch ms after which the entry is deleted. */
  expiresAt: number;
}

export interface ProviderCacheHit<T> {
  value: T;
  fetchedAt: string;
  cached: true;
  /** True when the payload is past its fresh window but not yet expired. */
  stale: boolean;
  /** Age of the payload in whole seconds. */
  cacheAgeSeconds: number;
  /** True when the hit came from the shared (Redis) tier. */
  shared: boolean;
}

export interface ProviderCacheLoad<T> {
  value: T;
  fetchedAt: string;
  cached: boolean;
  stale: boolean;
  cacheAgeSeconds: number;
  shared: boolean;
}

export interface ProviderCacheLoadOptions<T> {
  /** Fresh window. After this the entry may be served stale. */
  ttlMs: number;
  /** Additional time the entry may be served stale while it is refreshed. */
  staleTtlMs?: number;
  source: string;
  attribution: string;
  /** Canonicalized request identity (endpoint + normalized query). */
  query: string;
  /** Only values that pass this predicate are stored. */
  cacheable: (value: T) => boolean;
}

export interface ProviderCacheStats {
  backend: ProviderCacheBackend;
  enabled: boolean;
  hits: number;
  staleHits: number;
  misses: number;
  sharedHits: number;
  stores: number;
  errors: number;
  entries: number;
  keyPrefix: string;
}

export interface ProviderCacheHealth {
  backend: ProviderCacheBackend;
  ok: boolean;
  shared: boolean;
  error?: string;
}

/**
 * Per-endpoint TTL policy. Fresh windows follow provider rules; stale windows
 * let a replica answer immediately while one background task revalidates.
 */
export const PROVIDER_TTL_MS = {
  /** Flight status: short-lived by provider terms. */
  flightStatus: 45_000,
  /** Airport FIDS board (`-2h / +12h` window). */
  airportBoard: 60_000,
  /** Daily route statistics are stable for hours. */
  routeStats: 6 * 60 * 60_000,
  /** Airport search results change rarely. */
  airportSearch: 10 * 60_000,
  /** Published operating dates for a flight number. */
  flightDates: 6 * 60 * 60_000,
  /** Delay statistics (historical/aggregate). */
  flightDelays: 30 * 60_000,
  /** Aircraft reference data. */
  aircraft: 6 * 60 * 60_000,
  /** Airport reference data. */
  airportInfo: 24 * 60 * 60_000,
  /** Provider feed coverage status. */
  airportCoverage: 10 * 60_000,
  /** Published schedules (OAG-sourced forward schedules). */
  routeSchedule: 6 * 60 * 60_000,
} as const;

export const PROVIDER_STALE_MS = {
  flightStatus: 60_000,
  airportBoard: 120_000,
  routeStats: 60 * 60_000,
  airportSearch: 10 * 60_000,
  flightDates: 60 * 60_000,
  flightDelays: 10 * 60_000,
  aircraft: 60 * 60_000,
  airportInfo: 60 * 60_000,
  airportCoverage: 5 * 60_000,
  routeSchedule: 60 * 60_000,
} as const;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Deterministic JSON so the payload hash is stable across key orderings. */
export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export function payloadHash(value: unknown): string {
  return sha256(stableStringify(value));
}

function queryHash(query: string): string {
  return sha256(query);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidEntry(value: unknown): value is ProviderCacheEntry<unknown> {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<ProviderCacheEntry<unknown>>;
  return (
    entry.v === 1 &&
    "payload" in entry &&
    typeof entry.payloadHash === "string" &&
    typeof entry.queryHash === "string" &&
    typeof entry.source === "string" &&
    typeof entry.attribution === "string" &&
    typeof entry.fetchedAt === "string" &&
    Number.isFinite(Date.parse(entry.fetchedAt)) &&
    isNumber(entry.freshUntil) &&
    isNumber(entry.expiresAt)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ProviderCacheOptions {
  /** Redis instance/URL. Omit for per-process caching only. */
  redis?: ProviderCacheRedis | string | null;
  /** Disable both tiers (tests / emergency kill switch). */
  enabled?: boolean;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
  maxLocalEntries?: number;
  keyPrefix?: string;
  log?: { warn: (message: string) => void };
}

export class ProviderCache {
  private readonly redis: ProviderCacheRedis | null;
  private readonly local = new Map<string, ProviderCacheEntry<unknown>>();
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly refreshing = new Set<string>();
  private readonly enabled: boolean;
  private readonly now: () => number;
  private readonly maxLocalEntries: number;
  private readonly keyPrefix: string;
  private readonly log?: { warn: (message: string) => void };
  private readonly counters = {
    hits: 0,
    staleHits: 0,
    misses: 0,
    sharedHits: 0,
    stores: 0,
    errors: 0,
  };

  constructor(options: ProviderCacheOptions = {}) {
    this.enabled = options.enabled ?? true;
    this.now = options.now ?? (() => Date.now());
    this.maxLocalEntries = options.maxLocalEntries ?? 1_000;
    this.keyPrefix = options.keyPrefix ?? "avi:provider-cache:v1:";
    this.log = options.log;
    const source = options.redis;
    if (source && typeof source === "object") {
      this.redis = source;
    } else if (typeof source === "string" && source.length > 0) {
      const client = new Redis(source, {
        lazyConnect: true,
        connectTimeout: 2_000,
        maxRetriesPerRequest: 1,
      });
      client.on("error", () => {
        // Cache failures must never fail a request; callers fall back to the
        // provider and report the miss.
      });
      void client.connect().catch(() => {});
      this.redis = client as unknown as ProviderCacheRedis;
    } else {
      this.redis = null;
    }
  }

  get backend(): ProviderCacheBackend {
    return this.redis ? "redis" : "process";
  }

  get shared(): boolean {
    return this.redis !== null;
  }

  private key(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  /**
   * Reads an entry without side effects. Malformed, expired, wrong-query, or
   * hash-mismatched entries are treated as misses and removed from the shared
   * tier.
   */
  private async read<T>(
    key: string,
    expectedQueryHash: string,
  ): Promise<{ entry: ProviderCacheEntry<T>; shared: boolean } | null> {
    if (!this.enabled) return null;
    const now = this.now();

    const local = this.local.get(key);
    if (local) {
      if (local.expiresAt <= now) {
        this.local.delete(key);
      } else if (local.queryHash === expectedQueryHash) {
        return { entry: local as ProviderCacheEntry<T>, shared: false };
      }
    }

    if (!this.redis) return null;
    try {
      const raw = await this.redis.get(this.key(key));
      if (raw == null) return null;
      const entry = this.parse<T>(raw, expectedQueryHash);
      if (entry === null) {
        this.counters.errors += 1;
        await this.redis.del(this.key(key)).catch(() => 0);
        return null;
      }
      if (entry === "expired") {
        // Normal expiry is not a cache error.
        await this.redis.del(this.key(key)).catch(() => 0);
        return null;
      }
      this.rememberLocal(key, entry);
      this.counters.sharedHits += 1;
      return { entry, shared: true };
    } catch (error) {
      this.counters.errors += 1;
      this.log?.warn(`provider cache read failed (${String(error)})`);
      return null;
    }
  }

  private parse<T>(
    raw: string,
    expectedQueryHash: string,
  ): ProviderCacheEntry<T> | "expired" | null {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isValidEntry(parsed)) return null;
      if (parsed.queryHash !== expectedQueryHash) return null;
      if (parsed.expiresAt <= this.now()) return "expired";
      if (payloadHash(parsed.payload) !== parsed.payloadHash) return null;
      return parsed as ProviderCacheEntry<T>;
    } catch {
      return null;
    }
  }

  private rememberLocal(key: string, entry: ProviderCacheEntry<unknown>): void {
    if (this.local.size >= this.maxLocalEntries) {
      const oldest = this.local.keys().next().value;
      if (oldest) this.local.delete(oldest);
    }
    this.local.set(key, entry);
  }

  private toHit<T>(
    entry: ProviderCacheEntry<T>,
    shared: boolean,
  ): ProviderCacheHit<T> {
    const now = this.now();
    const stale = now >= entry.freshUntil;
    const fetchedMs = Date.parse(entry.fetchedAt);
    return {
      value: entry.payload,
      fetchedAt: entry.fetchedAt,
      cached: true,
      stale,
      cacheAgeSeconds: Math.max(
        0,
        Math.round((now - (Number.isFinite(fetchedMs) ? fetchedMs : now)) / 1_000),
      ),
      shared,
    };
  }

  /** Fresh/stale read. Returns `null` for a miss or an expired entry. */
  async lookup<T>(
    key: string,
    query: string,
  ): Promise<ProviderCacheHit<T> | null> {
    const found = await this.read<T>(key, queryHash(query));
    if (!found) return null;
    return this.toHit(found.entry, found.shared);
  }

  /**
   * Read-through load.
   *
   * - Fresh hit: returned immediately.
   * - Stale hit: returned immediately, with one background revalidation (a
   *   distributed lock prevents every replica refreshing at once).
   * - Miss: a single loader runs per key; a short cross-replica lock ensures
   *   the provider is charged once even when two replicas miss together.
   */
  async getOrLoad<T>(
    key: string,
    options: ProviderCacheLoadOptions<T>,
    producer: () => Promise<T>,
  ): Promise<ProviderCacheLoad<T>> {
    const existing = await this.read<T>(key, queryHash(options.query));
    if (existing) {
      const hit = this.toHit(existing.entry, existing.shared);
      if (hit.stale) {
        this.counters.staleHits += 1;
        this.revalidate(key, options, producer);
      } else {
        this.counters.hits += 1;
      }
      return hit;
    }

    this.counters.misses += 1;
    const value = await this.singleFlight(key, queryHash(options.query), async () => {
      // Another replica may have filled the entry while we waited for the lock.
      const raced = await this.read<T>(key, queryHash(options.query));
      if (raced) return this.toHit(raced.entry, raced.shared);
      const produced = await producer();
      let fetchedAt = new Date(this.now()).toISOString();
      if (options.cacheable(produced)) {
        fetchedAt = await this.store(key, produced, options);
      }
      return {
        value: produced,
        fetchedAt,
        cached: false,
        stale: false,
        cacheAgeSeconds: 0,
        shared: false,
      } satisfies ProviderCacheLoad<T>;
    });
    return value;
  }

  private async singleFlight<T>(
    key: string,
    expectedQueryHash: string,
    loader: () => Promise<ProviderCacheLoad<T>>,
  ): Promise<ProviderCacheLoad<T>> {
    const current = this.inFlight.get(key);
    if (current) return current as Promise<ProviderCacheLoad<T>>;

    const promise = (async () => {
      const haveLock = await this.acquire(`${key}:lock`, 5_000);
      if (!haveLock) {
        // Another replica is fetching. Wait up to one second for its entry.
        const deadline = this.now() + 1_000;
        while (this.now() < deadline) {
          await sleep(50);
          const entry = await this.read<T>(key, expectedQueryHash);
          if (entry && entry.entry.freshUntil > this.now()) {
            return this.toHit(entry.entry, entry.shared);
          }
        }
      }
      try {
        return await loader();
      } finally {
        if (haveLock) await this.release(`${key}:lock`);
      }
    })();

    this.inFlight.set(key, promise as Promise<unknown>);
    try {
      return await promise;
    } finally {
      this.inFlight.delete(key);
    }
  }

  /** Refreshes a stale entry in the background while callers get the stale copy. */
  private revalidate<T>(
    key: string,
    options: ProviderCacheLoadOptions<T>,
    producer: () => Promise<T>,
  ): void {
    if (!this.enabled || this.refreshing.has(key)) return;
    this.refreshing.add(key);
    // Defer so the caller returns the stale hit without waiting for the
    // refresh to start (and so tests observe the stale response first).
    setTimeout(() => {
      void this.runRevalidation(key, options, producer);
    }, 0);
  }

  private async runRevalidation<T>(
    key: string,
    options: ProviderCacheLoadOptions<T>,
    producer: () => Promise<T>,
  ): Promise<void> {
    const lockKey = `${key}:refresh`;
    const haveLock = await this.acquire(lockKey, 10_000);
    try {
      if (!haveLock) return;
      const produced = await producer();
      if (options.cacheable(produced)) {
        await this.store(key, produced, options);
      }
    } catch (error) {
      this.counters.errors += 1;
      this.log?.warn(`provider cache revalidation failed (${String(error)})`);
    } finally {
      this.refreshing.delete(key);
      if (haveLock) await this.release(lockKey);
    }
  }

  private async store<T>(
    key: string,
    value: T,
    options: ProviderCacheLoadOptions<T>,
  ): Promise<string> {
    if (!this.enabled) return new Date(this.now()).toISOString();
    const now = this.now();
    const entry: ProviderCacheEntry<T> = {
      v: 1,
      payload: value,
      payloadHash: payloadHash(value),
      queryHash: queryHash(options.query),
      source: options.source,
      attribution: options.attribution,
      fetchedAt: new Date(now).toISOString(),
      freshUntil: now + Math.max(0, options.ttlMs),
      expiresAt:
        now + Math.max(0, options.ttlMs) + Math.max(0, options.staleTtlMs ?? 0),
    };
    this.rememberLocal(key, entry);
    this.counters.stores += 1;
    if (!this.redis) return entry.fetchedAt;
    try {
      const ttl = entry.expiresAt - now;
      if (ttl <= 0) return entry.fetchedAt;
      await this.redis.set(
        this.key(key),
        JSON.stringify(entry),
        "PX",
        Math.max(1, ttl),
      );
    } catch (error) {
      this.counters.errors += 1;
      this.log?.warn(`provider cache write failed (${String(error)})`);
    }
    return entry.fetchedAt;
  }

  async invalidate(key: string): Promise<void> {
    this.local.delete(key);
    if (!this.redis) return;
    try {
      await this.redis.del(this.key(key));
    } catch (error) {
      this.counters.errors += 1;
      this.log?.warn(`provider cache invalidate failed (${String(error)})`);
    }
  }

  private async acquire(lockKey: string, ttlMs: number): Promise<boolean> {
    if (!this.redis) return true;
    try {
      return (
        (await this.redis.set(
          this.key(lockKey),
          String(this.now()),
          "PX",
          ttlMs,
          "NX",
        )) === "OK"
      );
    } catch {
      // Fail open: a cache lock outage must not block provider calls.
      return true;
    }
  }

  private async release(lockKey: string): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.del(this.key(lockKey));
    } catch {
      // TTL cleans it up.
    }
  }

  stats(): ProviderCacheStats {
    return {
      backend: this.backend,
      enabled: this.enabled,
      ...this.counters,
      entries: this.local.size,
      keyPrefix: this.keyPrefix,
    };
  }

  async health(): Promise<ProviderCacheHealth> {
    if (!this.enabled) {
      return { backend: this.backend, ok: true, shared: false };
    }
    if (!this.redis) {
      return { backend: "process", ok: true, shared: false };
    }
    try {
      const pong = await this.redis.ping();
      return {
        backend: "redis",
        ok: pong.toUpperCase().startsWith("PONG"),
        shared: true,
      };
    } catch (error) {
      return {
        backend: "redis",
        ok: false,
        shared: true,
        error: String(error),
      };
    }
  }

  async close(): Promise<void> {
    const client = this.redis;
    if (!client) return;
    try {
      if (client.quit) await client.quit();
      else client.disconnect?.();
    } catch {
      client.disconnect?.();
    }
  }
}

let singleton: { key: string; cache: ProviderCache } | null = null;

/** Process-wide cache bound to the current configuration. */
export function providerCacheFor(config: AppConfig): ProviderCache {
  const enabled = config.PROVIDER_CACHE_ENABLED;
  const url = enabled ? config.REDIS_URL?.trim() ?? "" : "";
  const key = `${enabled ? "1" : "0"}|${url}`;
  if (!singleton || singleton.key !== key) {
    void singleton?.cache.close();
    singleton = {
      key,
      cache: new ProviderCache({ redis: url || null, enabled }),
    };
  }
  return singleton.cache;
}

/** Test hook: drops the singleton so a new config is honoured. */
export async function resetProviderCache(): Promise<void> {
  if (!singleton) return;
  await singleton.cache.close();
  singleton = null;
}
