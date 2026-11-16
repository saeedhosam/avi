import { describe, expect, it } from "vitest";
import { compareBagToBin, measureBagFromBoundingBox } from "../src/services/baggage.js";
import {
  canUseFeature,
  planFromProductId,
  resolveProduct,
} from "../src/services/entitlements.js";
import { flightCachePolicy } from "../src/services/gatewayCache.js";

describe("AR carry-on sizer", () => {
  const bin = { widthCm: 55, heightCm: 40, depthCm: 25 };

  it("accepts a standard 55×40×20 bag", () => {
    const result = compareBagToBin({ widthCm: 55, heightCm: 40, depthCm: 20 }, bin);
    expect(result.fits).toBe(true);
    expect(result.excessCm).toBe(0);
    expect(result.bagVolumeLiters).toBe(44);
  });

  it("rejects an oversized bag and names the limiting axis", () => {
    const result = compareBagToBin({ widthCm: 60, heightCm: 42, depthCm: 27 }, bin);
    expect(result.fits).toBe(false);
    expect(result.excessCm).toBeGreaterThan(0);
    expect(result.limitingAxis).toBeTruthy();
    expect(result.advice).toMatch(/does not fit/i);
  });

  it("measures a bag from a camera bounding box and reference card", () => {
    const dimensions = measureBagFromBoundingBox({
      pixelWidth: 550,
      pixelHeight: 400,
      pixelDepth: 200,
      calibration: { referenceWidthCm: 8.56, referencePixelWidth: 85.6 },
    });
    expect(dimensions).toMatchObject({
      widthCm: 55,
      heightCm: 40,
    });
    expect(dimensions!.depthCm).toBeGreaterThan(0);
  });
});

describe("entitlements", () => {
  it("keeps acquisition tools free", () => {
    expect(
      canUseFeature("DIRECT_ROUTE_EXPLORER", { plan: "FREE" }).allowed,
    ).toBe(true);
    expect(canUseFeature("CABIN_VIEWER_3D", { plan: "FREE" })).toMatchObject({
      allowed: false,
      reason: "PAYWALLED",
    });
    expect(
      canUseFeature("CABIN_VIEWER_3D", { plan: "FREE" }).upgradePrompt,
    ).toContain("$4.99");
  });

  it("unlocks Pro features on Plus/Pro and active trip passes", () => {
    expect(canUseFeature("SPRINT_MODE", { plan: "PRO" }).allowed).toBe(true);
    expect(
      canUseFeature("SPRINT_MODE", {
        plan: "FREE",
        tripPassExpiresAt: "2026-12-01T00:00:00Z",
        now: "2026-11-14T00:00:00Z",
      }),
    ).toMatchObject({ allowed: true, reason: "TRIP_PASS" });
    expect(
      canUseFeature("SPRINT_MODE", {
        plan: "FREE",
        tripPassExpiresAt: "2026-11-01T00:00:00Z",
        now: "2026-11-14T00:00:00Z",
      }),
    ).toMatchObject({ allowed: false, reason: "EXPIRED" });
  });

  it("maps RevenueCat/Stripe product ids", () => {
    expect(planFromProductId("avi_pro_annual")).toBe("PRO");
    expect(planFromProductId("single_trip_pass_499")).toBe("TRIP_PASS");
    expect(resolveProduct({ plan: "PLUS" })).toBe("PLUS_MONTHLY");
  });
});

describe("gateway cache policy", () => {
  const now = new Date("2026-11-14T12:00:00Z");

  it("uses a 6-hour TTL far from departure", () => {
    expect(
      flightCachePolicy({
        scheduledDeparture: "2026-11-16T12:00:00Z",
        status: "SCHEDULED",
        now,
      }),
    ).toMatchObject({ ttlSeconds: 21_600, reason: "OVER_24H" });
  });

  it("uses a 5-minute TTL close to departure and en route", () => {
    expect(
      flightCachePolicy({
        scheduledDeparture: "2026-11-14T16:00:00Z",
        status: "SCHEDULED",
        now,
      }),
    ).toMatchObject({ ttlSeconds: 300, reason: "UNDER_6H" });
    expect(flightCachePolicy({ status: "DEPARTED", now })).toMatchObject({
      ttlSeconds: 300,
      reason: "EN_ROUTE",
    });
  });

  it("keeps landed flights for 7 days", () => {
    expect(flightCachePolicy({ status: "LANDED", now })).toMatchObject({
      ttlSeconds: 604_800,
      reason: "LANDED",
    });
  });
});
