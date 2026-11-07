import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  billingUpgradeEnabled,
  planPatchFromWebhook,
  verifyLemonSqueezySignature,
} from "../src/lib/billing.js";
import { loadConfig } from "../src/config.js";

const SECRET = "whsec_test_123";
const BODY = JSON.stringify({
  meta: { event_name: "subscription_created", custom_data: { user_id: "u1" } },
  data: {
    id: 101,
    attributes: {
      status: "active",
      variant_id: 42,
      customer_id: 777,
    },
  },
});

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("hex");
}

const billingConfig = loadConfig({
  NODE_ENV: "test",
  LEMONSQUEEZY_VARIANT_PLUS: "41",
  LEMONSQUEEZY_VARIANT_PRO: "42",
});

describe("upgrade-visibility flag (regression — polar previously reported false)", () => {
  it("is true for every self-serve provider", () => {
    expect(billingUpgradeEnabled("lemon_squeezy")).toBe(true);
    expect(billingUpgradeEnabled("polar")).toBe(true);
  });

  it("is false for manual and unknown providers", () => {
    expect(billingUpgradeEnabled("manual")).toBe(false);
    expect(billingUpgradeEnabled(undefined)).toBe(false);
    expect(billingUpgradeEnabled("nonsense")).toBe(false);
  });
});

describe("Lemon Squeezy webhook signature", () => {
  const now = String(Math.floor(Date.now() / 1000));

  it("accepts a valid timestamped signature", () => {
    expect(
      verifyLemonSqueezySignature(SECRET, BODY, sign(`${now}.${BODY}`), now),
    ).toBe(true);
  });

  it("rejects a tampered body, forged secret, or stale timestamp", () => {
    expect(verifyLemonSqueezySignature(SECRET, BODY, sign("999.bad"), "999")).toBe(false);
    expect(verifyLemonSqueezySignature("other", BODY, sign(`${now}.${BODY}`), now)).toBe(false);
    expect(verifyLemonSqueezySignature(SECRET, BODY, undefined, now)).toBe(false);
    expect(
      verifyLemonSqueezySignature(SECRET, BODY, sign(`123.${BODY}`), "123"),
    ).toBe(false);
  });
});

describe("plan mapping from webhook payloads", () => {
  const event = JSON.parse(BODY) as Parameters<typeof planPatchFromWebhook>[0];

  it("maps a subscription variant to its plan", () => {
    const patch = planPatchFromWebhook(event, billingConfig);
    expect(patch?.plan).toBe("PRO");
    expect(patch?.billingCustomerId).toBe("777");
  });

  it("maps any variant inside a comma-separated tier list", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      LEMONSQUEEZY_VARIANT_PLUS: "41,44",
      LEMONSQUEEZY_VARIANT_PRO: "42,77",
    });
    const yearly = {
      meta: { event_name: "subscription_created", custom_data: { user_id: "u1" } },
      data: { id: 101, attributes: { status: "active", variant_id: 44, customer_id: 777 } },
    };
    expect(planPatchFromWebhook(yearly, config)?.plan).toBe("PLUS");
  });

  it("cancels to FREE on terminal subscription statuses", () => {
    const cancelled = {
      meta: { event_name: "subscription_updated", custom_data: { user_id: "u1" } },
      data: { id: 101, attributes: { status: "expired", variant_id: 42, customer_id: 777 } },
    };
    expect(planPatchFromWebhook(cancelled, billingConfig)?.plan).toBe("FREE");
  });

  it("one-time orders upgrade without touching unrelated variants", () => {
    const order = {
      meta: { event_name: "order_created", custom_data: { user_id: "u1" } },
      data: { id: 9, attributes: { variant_id: 41, customer_id: 777 } },
    };
    expect(planPatchFromWebhook(order, billingConfig)?.plan).toBe("PLUS");

    const unrelated = {
      meta: { event_name: "order_created", custom_data: { user_id: "u1" } },
      data: { id: 10, attributes: { variant_id: 999, customer_id: 777 } },
    };
    expect(planPatchFromWebhook(unrelated, billingConfig)).toBeNull();
  });
});

describe("billing webhook route", () => {
  it("rejects unsigned payloads and writes the plan for valid ones", async () => {
    vi.resetModules();
    const { buildApp } = await import("../src/app.js");
    const app = await buildApp(
      loadConfig({
        NODE_ENV: "test",
        LOG_LEVEL: "silent",
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SECRET_KEY: "sb_secret_test",
        BILLING_PROVIDER: "lemon_squeezy",
        LEMONSQUEEZY_WEBHOOK_SECRET: SECRET,
        LEMONSQUEEZY_VARIANT_PRO: "42",
      }),
    );
    const patches: Array<{ body: unknown; url: string; method: string }> = [];
    const fetchMock = vi.fn().mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/rest/v1/profiles?")) {
        patches.push({ url, method: init?.method ?? "", body: init?.body });
        return new Response(null, { status: 204 });
      }
      if (url.includes("/rest/v1/flight_alerts")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    // Unsigned request must be rejected without writing.
    const unsigned = await app.inject({
      method: "POST",
      url: "/v1/webhooks/lemon-squeezy",
      headers: { "content-type": "application/json" },
      payload: BODY,
    });
    expect(unsigned.statusCode).toBe(401);
    expect(patches).toHaveLength(0);

    // Signed request maps to plan=PRO and patches the profile.
    const now = String(Math.floor(Date.now() / 1000));
    const signed = await app.inject({
      method: "POST",
      url: "/v1/webhooks/lemon-squeezy",
      headers: {
        "content-type": "application/json",
        "x-signature-timestamp": now,
        "x-signature": sign(`${now}.${BODY}`),
      },
      payload: BODY,
    });
    expect(signed.statusCode).toBe(200);
    expect(patches).toHaveLength(1);
    expect(String(patches[0]?.url)).toContain("/rest/v1/profiles?");
    const body = JSON.parse(String(patches[0]?.body)) as { plan?: string };
    expect(body.plan).toBe("PRO");

    // The manual default advertises billing as unavailable.
    const manualApp = await buildApp(
      loadConfig({
        NODE_ENV: "test",
        LOG_LEVEL: "silent",
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SECRET_KEY: "sb_secret_test",
      }),
    );
    const manual = await manualApp.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      payload: { target: "PLUS" },
    });
    expect(manual.statusCode).toBe(503);
    expect(JSON.parse(manual.body).error).toBe("billing_unavailable");

    await app.close();
    await manualApp.close();
    vi.unstubAllGlobals();
  });
});
