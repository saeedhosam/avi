import { describe, expect, it } from "vitest";
import {
  ProviderCache,
  payloadHash,
  stableStringify,
  type ProviderCacheRedis,
} from "../src/lib/provider-cache.js";

function fakeRedis() {
  const store = new Map<string, string>();
  const redis: ProviderCacheRedis = {
    get: async (key) => store.get(key) ?? null,
    set: async (key, value, _mode, _ttl, nx) => {
      if (nx === "NX" && store.has(key)) return null;
      store.set(key, value);
      return "OK";
    },
    del: async (key) => (store.delete(key) ? 1 : 0),
    ping: async () => "PONG",
    on: () => {},
  };
  return { redis, store };
}

const baseOptions = {
  ttlMs: 1_000,
  staleTtlMs: 5_000,
  source: "TEST",
  attribution: "Test provider",
  query: "route/JFK/LHR",
  cacheable: () => true,
};

describe("ProviderCache", () => {
  it("serves a second replica from the shared tier without calling the provider", async () => {
    const { redis } = fakeRedis();
    const replicaA = new ProviderCache({ redis });
    const replicaB = new ProviderCache({ redis });
    let calls = 0;
    const producer = async () => {
      calls += 1;
      return { ok: true, value: "payload" };
    };

    const first = await replicaA.getOrLoad("shared-key", baseOptions, producer);
    const second = await replicaB.getOrLoad("shared-key", baseOptions, producer);

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.shared).toBe(true);
    expect(second.value).toEqual({ ok: true, value: "payload" });
    expect(calls).toBe(1);
  });

  it("serves stale data and revalidates in the background", async () => {
    let clock = 1_000_000;
    const cache = new ProviderCache({ now: () => clock });
    let calls = 0;
    const producer = async () => {
      calls += 1;
      return { version: calls };
    };

    await cache.getOrLoad("stale-key", baseOptions, producer);
    clock += 1_500;

    const stale = await cache.getOrLoad("stale-key", baseOptions, producer);
    expect(stale.cached).toBe(true);
    expect(stale.stale).toBe(true);
    expect(stale.value).toEqual({ version: 1 });
    expect(calls).toBe(1);

    // Background refresh runs once after the stale response.
    await new Promise((resolve) => setTimeout(resolve, 30));
    const fresh = await cache.getOrLoad("stale-key", baseOptions, producer);
    expect(fresh.stale).toBe(false);
    expect(fresh.value).toEqual({ version: 2 });
  });

  it("expires entries after the stale window", async () => {
    let clock = 1_000_000;
    const cache = new ProviderCache({ now: () => clock });
    let calls = 0;
    const producer = async () => ({ calls: ++calls });

    await cache.getOrLoad("expiring", baseOptions, producer);
    clock += 1_000 + 5_000 + 1;
    const result = await cache.getOrLoad("expiring", baseOptions, producer);
    expect(result.cached).toBe(false);
    expect(calls).toBe(2);
  });

  it("never caches values rejected by the cacheable predicate", async () => {
    const cache = new ProviderCache();
    let calls = 0;
    const producer = async () => {
      calls += 1;
      return { mode: "ERROR" as const, value: null };
    };
    const options = {
      ...baseOptions,
      cacheable: (value: { mode: string }) => value.mode === "LIVE",
    };

    const first = await cache.getOrLoad("error-key", options, producer);
    const second = await cache.getOrLoad("error-key", options, producer);
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(false);
    expect(calls).toBe(2);
  });

  it("rejects malformed shared payloads instead of serving them", async () => {
    const { redis, store } = fakeRedis();
    const cache = new ProviderCache({ redis, keyPrefix: "test:" });
    store.set("test:bad", "{not-json");
    await expect(cache.lookup("bad", "query")).resolves.toBeNull();
    expect(cache.stats().errors).toBeGreaterThan(0);
    expect(store.has("test:bad")).toBe(false);
  });

  it("rejects a payload whose hash does not match", async () => {
    const { redis, store } = fakeRedis();
    const writer = new ProviderCache({ redis, keyPrefix: "test:" });
    await writer.getOrLoad("tampered", baseOptions, async () => ({
      flight: "BA117",
    }));

    const stored = store.get("test:tampered");
    expect(stored).toBeTruthy();
    const entry = JSON.parse(stored!);
    entry.payload = { flight: "XX1" };
    store.set("test:tampered", JSON.stringify(entry));

    // A different replica has no local copy, so it must read the shared entry.
    const reader = new ProviderCache({ redis, keyPrefix: "test:" });
    await expect(reader.lookup("tampered", baseOptions.query)).resolves.toBeNull();
  });

  it("does not read or write when disabled", async () => {
    const cache = new ProviderCache({ enabled: false });
    let calls = 0;
    const producer = async () => ({ calls: ++calls });
    await cache.getOrLoad("off", baseOptions, producer);
    const second = await cache.getOrLoad("off", baseOptions, producer);
    expect(second.cached).toBe(false);
    expect(calls).toBe(2);
    expect(cache.stats().entries).toBe(0);
  });

  it("deduplicates concurrent loads for one key", async () => {
    const cache = new ProviderCache();
    let calls = 0;
    const producer = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { ok: true };
    };
    const [a, b] = await Promise.all([
      cache.getOrLoad("dedupe", baseOptions, producer),
      cache.getOrLoad("dedupe", baseOptions, producer),
    ]);
    expect(calls).toBe(1);
    expect(a.value).toEqual({ ok: true });
    expect(b.value).toEqual({ ok: true });
  });

  it("reports cache health and stats", async () => {
    const { redis } = fakeRedis();
    const cache = new ProviderCache({ redis });
    const health = await cache.health();
    expect(health).toMatchObject({ backend: "redis", ok: true, shared: true });
    const stats = cache.stats();
    expect(stats.backend).toBe("redis");
    expect(stats.enabled).toBe(true);
  });

  it("canonicalizes payloads regardless of key order", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
    expect(payloadHash({ a: [1, 2] })).toBe(payloadHash({ a: [1, 2] }));
  });
});
