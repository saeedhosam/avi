import { Redis } from "ioredis";
import type { AppConfig } from "../config.js";
import type { EngineStats } from "../engine/watch-engine.js";

/** Redis key the worker publishes its latest tick stats to. */
const STATS_KEY = "avi:engine:status";
/** Redis key for distributed single-writer leader election across worker containers. */
const LEADER_LOCK_KEY = "avi:engine:leader_lock";
/** A worker dead for longer than this makes the gateway report stats as null. */
const STATS_TTL_SECONDS = 90;

export class EngineStatusStore {
  private readonly redis: Redis | null;
  private readonly memory: { stats: EngineStats | null; at: number } = { stats: null, at: 0 };

  constructor(
    redisOrUrl: Redis | string | undefined,
    private readonly log: { warn: (message: string) => void },
  ) {
    if (redisOrUrl && typeof redisOrUrl === "object") {
      this.redis = redisOrUrl;
    } else if (typeof redisOrUrl === "string" && redisOrUrl.length > 0) {
      this.redis = new Redis(redisOrUrl, { lazyConnect: false, maxRetriesPerRequest: 2 });
    } else {
      this.redis = null;
    }
  }

  /**
   * Acquires or renews the distributed leader lease. Only the leader container executes ticks.
   */
  async acquireLock(instanceId: string, ttlSeconds = 30): Promise<boolean> {
    if (!this.redis) return true; // Single-process mode
    try {
      const res = await this.redis.set(LEADER_LOCK_KEY, instanceId, "EX", ttlSeconds, "NX");
      if (res === "OK") return true;
      const current = await this.redis.get(LEADER_LOCK_KEY);
      if (current === instanceId) {
        await this.redis.expire(LEADER_LOCK_KEY, ttlSeconds);
        return true;
      }
      return false;
    } catch (error) {
      this.log.warn(`engine leader lock error, assuming single worker (${String(error)})`);
      return true;
    }
  }

  /** Releases the leader lease upon graceful container shutdown. */
  async releaseLock(instanceId: string): Promise<void> {
    if (!this.redis) return;
    try {
      const current = await this.redis.get(LEADER_LOCK_KEY);
      if (current === instanceId) {
        await this.redis.del(LEADER_LOCK_KEY);
      }
    } catch (error) {
      this.log.warn(`engine leader lock release failed (${String(error)})`);
    }
  }

  /** Publishes the latest tick stats. A worker writes only after a successful tick. */
  async write(stats: EngineStats): Promise<void> {
    const payload = JSON.stringify(stats);
    if (!this.redis) {
      this.memory.stats = stats;
      this.memory.at = Date.now();
      return;
    }
    try {
      await this.redis.set(STATS_KEY, payload, "EX", STATS_TTL_SECONDS);
    } catch (error) {
      this.log.warn(`engine status store write failed, caching in-process (${String(error)})`);
      this.memory.stats = stats;
      this.memory.at = Date.now();
    }
  }

  async read(): Promise<EngineStats | null> {
    if (this.redis) {
      try {
        const raw = await this.redis.get(STATS_KEY);
        if (raw == null) return null;
        return JSON.parse(raw) as EngineStats;
      } catch (error) {
        this.log.warn(`engine status store read failed, falling back in-process (${String(error)})`);
      }
    }
    // In-process memory is only meaningful when this process IS the worker.
    return this.memory.stats ?? null;
  }
}

export function engineStatusStoreFor(config: AppConfig, log: { warn: (message: string) => void }) {
  return new EngineStatusStore(config.REDIS_URL, log);
}