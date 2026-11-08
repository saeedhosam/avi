import { Redis } from "ioredis";
import type { AppConfig } from "../config.js";

export type UserQuotaPlan = "FREE" | "PLUS" | "PRO";

export interface UserQuotaSnapshot {
  /** Units already consumed in the active bucket. */
  used: number;
  /** Units allowed in the active bucket. */
  limit: number;
  /** Epoch ms when the bucket resets. */
  resetsAt: number;
}

interface Bucket {
  value: number;
  expiresAt: number;
}

/** Quota shape from the audit plan; tweak values without touching code. */
export const PROVIDER_QUOTA_LIMITS = {
  anonymousHourlyUnits: 20,
  planDailyUnits: {
    FREE: 100,
    PLUS: 500,
    PRO: 2_000,
  } satisfies Record<UserQuotaPlan, number>,
} as const;

export interface QuotaBackend {
  /** Increments the bucket value, creating it when missing, with a TTL. */
  incrBy(key: string, cost: number, expiresAt: number): Promise<number>;
  get(key: string): Promise<number | null>;
}

class MemoryQuotaBackend implements QuotaBackend {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly log?: { debug: (message: string) => void },
  ) {}

  async incrBy(key: string, cost: number, expiresAt: number): Promise<number> {
    const now = Date.now();
    const existing = this.buckets.get(key);
    if (!existing || existing.expiresAt <= now) {
      this.buckets.set(key, { value: cost, expiresAt });
      return cost;
    }
    existing.value += cost;
    if (this.buckets.size > 5_000) {
      // Prune expired buckets first
      for (const [k, b] of this.buckets) {
        if (b.expiresAt <= now) this.buckets.delete(k);
      }
      // If still overflowing, drop oldest inserted keys
      if (this.buckets.size > 5_000) {
        let toDrop = this.buckets.size - 4_000;
        for (const k of this.buckets.keys()) {
          this.buckets.delete(k);
          if (--toDrop <= 0) break;
        }
      }
    }
    return existing.value;
  }

  async get(key: string): Promise<number | null> {
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.expiresAt <= Date.now()) return null;
    return bucket.value;
  }
}

class RedisQuotaBackend implements QuotaBackend {
  private readonly fallback = new MemoryQuotaBackend();

  constructor(
    private readonly redis: Redis,
    private readonly log?: { warn: (message: string) => void },
  ) {}

  async incrBy(key: string, cost: number, expiresAt: number): Promise<number> {
    try {
      if (cost === 0) {
        const existing = await this.get(key);
        return existing ?? 0;
      }
      const ttl = Math.ceil((expiresAt - Date.now()) / 1000);
      // Atomic pipeline: INCRBY and EXPIRE NX in a single network roundtrip
      // ensures the key can never be created without its expiration TTL.
      const pipeline = this.redis.pipeline().incrby(key, cost);
      if (ttl > 0) {
        pipeline.expire(key, ttl, "NX");
      }
      const results = await pipeline.exec();
      if (!results || !results[0] || results[0][0]) {
        throw results?.[0]?.[0] ?? new Error("Redis quota pipeline failed");
      }
      return results[0][1] as number;
    } catch (error) {
      this.log?.warn?.(`provider quota: Redis unavailable, falling back to in-process (${String(error)})`);
      return this.fallback.incrBy(key, cost, expiresAt);
    }
  }

  async get(key: string): Promise<number | null> {
    try {
      const raw = await this.redis.get(key);
      if (raw === null) return null;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    } catch (error) {
      this.log?.warn?.(`provider quota: Redis unavailable, falling back to in-process (${String(error)})`);
      return this.fallback.get(key);
    }
  }
}

/**
 * Per-identity provider spend. Anonymous accounts are capped hourly because
 * they have no plan; signed-in users use their plan's daily budget. A missing
 * Redis falls back to in-process accounting so a storage outage never turns
 * into an outage of the API.
 */
export class UserQuotaService {
  private readonly backend: QuotaBackend;
  private readonly plans = new Map<string, { plan: UserQuotaPlan; expiresAt: number }>();
  private static readonly PLAN_TTL_MS = 60_000;

  constructor(
    redisOrUrl: Redis | string | undefined,
    private readonly listUserPlans: (uids: string[]) => Promise<Map<string, string>>,
    private readonly log: { warn: (message: string) => void; debug: (message: string) => void } = {
      warn: () => {},
      debug: () => {},
    },
  ) {
    if (redisOrUrl && typeof redisOrUrl === "object") {
      this.backend = new RedisQuotaBackend(redisOrUrl, log);
    } else if (typeof redisOrUrl === "string" && redisOrUrl.length > 0) {
      this.backend = new RedisQuotaBackend(
        new Redis(redisOrUrl, { lazyConnect: false, maxRetriesPerRequest: 2 }),
        log,
      );
    } else {
      this.backend = new MemoryQuotaBackend(log);
    }
  }

  private async resolvePlan(uid: string): Promise<UserQuotaPlan> {
    const cached = this.plans.get(uid);
    if (cached && cached.expiresAt > Date.now()) return cached.plan;
    try {
      const row = (await this.listUserPlans([uid])).get(uid);
      const key = (row ?? "FREE").trim().toUpperCase();
      const plan: UserQuotaPlan =
        key === "PLUS" || key === "PRO" ? (key as UserQuotaPlan) : "FREE";
      this.plans.set(uid, { plan, expiresAt: Date.now() + UserQuotaService.PLAN_TTL_MS });
      return plan;
    } catch {
      return "FREE";
    }
  }

  private resolveBucket(uid: string, isAnonymous: boolean): { key: string; expiresAt: number } {
    const now = new Date();
    if (isAnonymous) {
      const hour = now.toISOString().slice(0, 13);
      const expiresAt = Date.UTC(
        Number(hour.slice(0, 4)),
        Number(hour.slice(5, 7)) - 1,
        Number(hour.slice(8, 10)),
        Number(hour.slice(11, 13)) + 1,
        0,
        0,
        0,
      );
      return { key: `quota:a:${uid}:${hour}`, expiresAt };
    }
    const day = now.toISOString().slice(0, 10);
    const expiresAt = Date.UTC(
      Number(day.slice(0, 4)),
      Number(day.slice(5, 7)) - 1,
      Number(day.slice(8, 10)) + 1,
      0,
      0,
      0,
      0,
    );
    return { key: `quota:u:${uid}:${day}`, expiresAt };
  }

  private resolveLimit(isAnonymous: boolean, plan: UserQuotaPlan): number {
    if (isAnonymous) return PROVIDER_QUOTA_LIMITS.anonymousHourlyUnits;
    return PROVIDER_QUOTA_LIMITS.planDailyUnits[plan];
  }

  async ensureCapacity(
    uid: string,
    isAnonymous: boolean,
    cost: number,
  ): Promise<UserQuotaSnapshot> {
    const { key, expiresAt } = this.resolveBucket(uid, isAnonymous);
    const plan = await this.resolvePlan(uid);
    const limit = this.resolveLimit(isAnonymous, plan);
    const raw = await this.backend.get(key);
    const used = raw ?? 0;
    const resetsAt = Math.min(expiresAt, Date.now() + 24 * 60 * 60 * 1000);
    if (used + cost > limit) {
      this.log.warn(`provider quota exceeded for ${uid}`);
      return { used, limit, resetsAt };
    }
    return { used, limit, resetsAt };
  }

  async consume(uid: string, isAnonymous: boolean, cost: number): Promise<void> {
    const { key, expiresAt } = this.resolveBucket(uid, isAnonymous);
    await this.backend.incrBy(key, cost, expiresAt);
  }

  async refund(uid: string, isAnonymous: boolean, cost: number): Promise<void> {
    const { key } = this.resolveBucket(uid, isAnonymous);
    if (cost <= 0) return;
    const current = await this.backend.get(key);
    if (current === null) return;
    await this.backend.incrBy(key, -Math.min(cost, current), Date.now() + 60_000);
  }

  async snapshot(uid: string, isAnonymous: boolean): Promise<UserQuotaSnapshot> {
    const { key, expiresAt } = this.resolveBucket(uid, isAnonymous);
    const plan = await this.resolvePlan(uid);
    const limit = this.resolveLimit(isAnonymous, plan);
    const used = (await this.backend.get(key)) ?? 0;
    return { used, limit, resetsAt: expiresAt };
  }
}
