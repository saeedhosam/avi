import { Redis } from "ioredis";
import type { AppConfig } from "../config.js";
import type { EngineStats } from "../engine/watch-engine.js";

/** Redis key the worker publishes its latest tick stats to. */
const STATS_KEY = "avi:engine:status";
/** A worker dead for longer than this makes the gateway report stats as null. */
const STATS_TTL_SECONDS = 90;

export class EngineStatusStore {
  private readonly redis: Redis | null;
  private readonly memory: { stats: EngineStats | null; at: number } = { stats: null, at: 0 };

  constructor(
    redisUrl: string | undefined,
    private readonly log: { warn: (message: string) => void },
  ) {
    this.redis = redisUrl
      ? new Redis(redisUrl, { lazyConnect: false, maxRetriesPerRequest: 2 })
      : null;
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