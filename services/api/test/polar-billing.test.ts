import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  planPatchFromPolarWebhook,
  verifyPolarSignature,
} from "../src/lib/billing.js";
import { loadConfig } from "../src/config.js";

const SECRET = "whsec_polar_test";
const BODY = JSON.stringify({
  type: "subscription.created",
  data: {
    id: "sub_123",
    status: "active",
    product_id: "prd_pro_777",
    price_id: "price_pro_monthly",
    customer_id: "c_9",
    metadata: { user_id: "u1" },
  },
});

const polarConfig = loadConfig({
  NODE_ENV: "test",
  POLAR_PRICE_PLUS: "prd_plus,PRI_plus_year",
  POLAR_PRICE_PRO: "prd_pro_777,PRI_pro_year",
});

describe("Polar webhook signature", () => {
  const good = createHmac("sha256", SECRET).update(BODY).digest("hex");

  it("accepts valid signatures", () => {
    expect(verifyPolarSignature(SECRET, BODY, good)).toBe(true);
  });

  it("rejects tampered payloads", () => {
    expect(verifyPolarSignature(SECRET, BODY, "bogus")).toBe(false);
    expect(verifyPolarSignature("other", BODY, good)).toBe(false);
  });
});

describe("Polar plan mapping", () => {
  it("maps subscription.created by product id", () => {
    const patch = planPatchFromPolarWebhook(JSON.parse(BODY), polarConfig);
    expect(patch?.plan).toBe("PRO");
    expect(patch?.billingCustomerId).toBe("c_9");
  });

  it("downgrades to FREE on cancel/revoke", () => {
    const cancel = {
      type: "subscription.canceled",
      data: {
        id: "sub_123",
        product_id: "prd_pro_777",
        customer_id: "c_9",
        metadata: { user_id: "u1" },
      },
    };
    expect(planPatchFromPolarWebhook(cancel, polarConfig)?.plan).toBe("FREE");
  });

  it("maps PLUS by price id", () => {
    const plus = {
      type: "subscription.active",
      data: {
        id: "sub_55",
        product_id: "prd_plus_other",
        price_id: "PRI_plus_year",
        customer_id: "c_9",
        metadata: { user_id: "u1" },
      },
    };
    expect(planPatchFromPolarWebhook(plus, polarConfig)?.plan).toBe("PLUS");
  });

  it("ignores unrelated products", () => {
    const other = {
      type: "order.created",
      data: { id: "o_1", product_id: "prd_something_else" },
    };
    expect(planPatchFromPolarWebhook(other, polarConfig)).toBeNull();
  });
});

describe("polar webhook route", () => {
  it("rejects unsigned payloads and writes plan for signed ones", async () => {
    const { buildApp } = await import("../src/app.js");
    const app = await buildApp(
      loadConfig({
        NODE_ENV: "test",
        LOG_LEVEL: "silent",
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SECRET_KEY: "sb_secret_test",
        BILLING_PROVIDER: "polar",
        POLAR_WEBHOOK_SECRET: SECRET,
        POLAR_PRICE_PRO: "prd_pro_777",
        POLAR_PRICE_PLUS: "prd_plus",
      }),
    );
    const patches: Array<{ body: unknown; url: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input: unknown, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/rest/v1/profiles?")) {
          patches.push({ url, body: init?.body });
          return new Response(null, { status: 204 });
        }
        if (url.includes("/rest/v1/flight_alerts")) {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        return new Response("{}", { status: 404 });
      }),
    );

    const unsigned = await app.inject({
      method: "POST",
      url: "/v1/webhooks/polar",
      headers: { "content-type": "application/json" },
      payload: BODY,
    });
    expect(unsigned.statusCode).toBe(401);
    expect(patches).toHaveLength(0);

    const goodSig = createHmac("sha256", SECRET).update(BODY).digest("hex");
    const signed = await app.inject({
      method: "POST",
      url: "/v1/webhooks/polar",
      headers: {
        "content-type": "application/json",
        "polar-webhook-signature": goodSig,
      },
      payload: BODY,
    });
    expect(signed.statusCode).toBe(200);
    expect(patches).toHaveLength(1);
    const body = JSON.parse(String(patches[0]?.body)) as { plan?: string };
    expect(body.plan).toBe("PRO");

    await app.close();
    vi.unstubAllGlobals();
  });
});
