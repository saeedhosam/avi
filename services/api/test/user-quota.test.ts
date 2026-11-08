import { describe, expect, it, vi } from "vitest";
import {
  PROVIDER_QUOTA_LIMITS,
  UserQuotaService,
} from "../src/lib/user-quota.js";
import type { Redis } from "ioredis";

const log = {
  debug: vi.fn(),
  warn: vi.fn(),
};

function service(planFor: (uid: string) => string | undefined = () => "FREE") {
  return new UserQuotaService(
    undefined,
    async (uids) =>
      new Map(
        uids.map((uid) => {
          const value = planFor(uid);
          return [uid, value ?? "FREE"] as const;
        }),
      ),
    log,
  );
}

describe("UserQuotaService (Memory Backend)", () => {
  it("uses the documented anonymous hourly and plan daily limits", () => {
    expect(PROVIDER_QUOTA_LIMITS.anonymousHourlyUnits).toBe(20);
    expect(PROVIDER_QUOTA_LIMITS.planDailyUnits.FREE).toBe(100);
    expect(PROVIDER_QUOTA_LIMITS.planDailyUnits.PLUS).toBe(500);
    expect(PROVIDER_QUOTA_LIMITS.planDailyUnits.PRO).toBe(2_000);
  });

  it("allows the last call on the limit and denies the next", async () => {
    const quota = service();
    for (let index = 0; index < 9; index += 1) {
      await quota.consume("u1", true, 2);
    }
    const atLimit = await quota.ensureCapacity("u1", true, 2);
    expect(atLimit.used).toBe(18);
    expect(atLimit.used + 2).toBe(atLimit.limit);

    await quota.consume("u1", true, 2);
    const denial = await quota.ensureCapacity("u1", true, 2);
    expect(denial.used).toBe(20);
    expect(denial.used + 2).toBeGreaterThan(denial.limit);
  });

  it("uses plan-based daily limits for signed-in users", async () => {
    const quota = service();
    for (let index = 0; index < 49; index += 1) {
      await quota.consume("u2", false, 2);
    }
    expect((await quota.ensureCapacity("u2", false, 2)).used).toBe(98);
    expect((await quota.ensureCapacity("u2", false, 2)).used + 2).toBe(
      (await quota.ensureCapacity("u2", false, 2)).limit,
    );

    await quota.consume("u2", false, 2);
    const denial = await quota.ensureCapacity("u2", false, 2);
    expect(denial.used).toBe(100);
    expect(denial.used + 2).toBeGreaterThan(denial.limit);
  });

  it("restores capacity with a refund", async () => {
    const quota = service();
    for (let index = 0; index < 50; index += 1) {
      await quota.consume("u3", false, 2);
    }
    expect((await quota.ensureCapacity("u3", false, 2)).used + 2).toBeGreaterThan(
      (await quota.ensureCapacity("u3", false, 2)).limit,
    );
    await quota.refund("u3", false, 2);
    const snapshot = await quota.ensureCapacity("u3", false, 2);
    expect(snapshot.used).toBe(98);
    expect(snapshot.used + 2).toBe(snapshot.limit);
  });

  it("caches the plan lookup between calls", async () => {
    const listUserPlans = vi
      .fn()
      .mockResolvedValue(new Map([["u4", "PRO"]]));
    const quota = new UserQuotaService(undefined, listUserPlans, log);
    await quota.ensureCapacity("u4", false, 2);
    await quota.ensureCapacity("u4", false, 2);
    expect(listUserPlans).toHaveBeenCalledTimes(1);
  });

  it("falls back to FREE when the plan lookup fails", async () => {
    const listUserPlans = vi.fn().mockRejectedValue(new Error("unavailable"));
    const quota = new UserQuotaService(undefined, listUserPlans, log);
    const capacity = await quota.ensureCapacity("u5", false, 2);
    expect(capacity.limit).toBe(100);
    expect(capacity.used).toBe(0);
  });
});

describe("UserQuotaService (Redis Backend)", () => {
  function createMockRedis() {
    const store = new Map<string, string>();
    const calls: { op: string; args: unknown[] }[] = [];

    const mockRedis = {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      pipeline: vi.fn(() => {
        const queued: (() => [Error | null, unknown])[] = [];
        const pipe = {
          incrby: vi.fn((key: string, amount: number) => {
            calls.push({ op: "incrby", args: [key, amount] });
            queued.push(() => {
              const current = Number(store.get(key) ?? "0");
              const next = current + amount;
              store.set(key, String(next));
              return [null, next];
            });
            return pipe;
          }),
          expire: vi.fn((key: string, ttl: number, mode?: string) => {
            calls.push({ op: "expire", args: [key, ttl, mode] });
            queued.push(() => [null, 1]);
            return pipe;
          }),
          exec: vi.fn(async () => queued.map((fn) => fn())),
        };
        return pipe;
      }),
      _store: store,
      _calls: calls,
    };

    return mockRedis as unknown as Redis & {
      _store: Map<string, string>;
      _calls: { op: string; args: unknown[] }[];
    };
  }

  it("executes atomic pipeline with INCRBY and EXPIRE NX in Redis", async () => {
    const mockRedis = createMockRedis();
    const quota = new UserQuotaService(
      mockRedis,
      async () => new Map([["u-redis-1", "FREE"]]),
      log,
    );

    await quota.consume("u-redis-1", false, 10);

    // Verify pipeline was called
    expect(mockRedis.pipeline).toHaveBeenCalled();
    const incrCall = mockRedis._calls.find((c) => c.op === "incrby");
    expect(incrCall).toBeDefined();
    expect(incrCall?.args[1]).toBe(10);

    const expireCall = mockRedis._calls.find((c) => c.op === "expire");
    expect(expireCall).toBeDefined();
    expect(expireCall?.args[2]).toBe("NX");

    const capacity = await quota.ensureCapacity("u-redis-1", false, 2);
    expect(capacity.used).toBe(10);
  });

  it("successfully refunds quota in Redis with negative increment", async () => {
    const mockRedis = createMockRedis();
    const quota = new UserQuotaService(
      mockRedis,
      async () => new Map([["u-redis-2", "FREE"]]),
      log,
    );

    // Consume 20
    await quota.consume("u-redis-2", false, 20);
    let snapshot = await quota.snapshot("u-redis-2", false);
    expect(snapshot.used).toBe(20);

    // Refund 6
    await quota.refund("u-redis-2", false, 6);

    const refundIncr = mockRedis._calls.filter((c) => c.op === "incrby");
    expect(refundIncr.length).toBe(2);
    expect(refundIncr[1]?.args[1]).toBe(-6);

    snapshot = await quota.snapshot("u-redis-2", false);
    expect(snapshot.used).toBe(14);
  });

  it("falls back to memory backend gracefully if Redis pipeline fails", async () => {
    const mockRedis = {
      get: vi.fn().mockRejectedValue(new Error("Connection refused")),
      pipeline: vi.fn(() => ({
        incrby: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockRejectedValue(new Error("Redis offline")),
      })),
    } as unknown as Redis;

    const quota = new UserQuotaService(
      mockRedis,
      async () => new Map([["u-failover", "FREE"]]),
      log,
    );

    // Should not throw, should fall back to in-memory
    await quota.consume("u-failover", false, 4);
    const capacity = await quota.ensureCapacity("u-failover", false, 2);
    expect(capacity.used).toBe(4);
    expect(log.warn).toHaveBeenCalled();
  });
});
