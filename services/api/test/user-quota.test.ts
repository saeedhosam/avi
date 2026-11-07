import { describe, expect, it, vi } from "vitest";
import {
  PROVIDER_QUOTA_LIMITS,
  UserQuotaService,
} from "../src/lib/user-quota.js";

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

describe("UserQuotaService", () => {
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
