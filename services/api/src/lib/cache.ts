interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();

  constructor(private readonly maxEntries = 500) {}

  get<T>(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    if (this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey) this.entries.delete(oldestKey);
    }
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  async getOrSet<T>(
    key: string,
    ttlMs: number,
    producer: () => Promise<T>,
  ): Promise<{ value: T; cached: boolean }> {
    const existing = this.get<T>(key);
    if (existing !== undefined) return { value: existing, cached: true };
    const value = await producer();
    this.set(key, value, ttlMs);
    return { value, cached: false };
  }
}
