import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  planPatchFromPolarWebhook,
  verifyPolarSignature,
} from "../src/lib/billing.js";
import { loadConfig } from "../src/config.js";

// Standard Webhooks secret: whsec_<base64 key>.
const SECRET_KEY = Buffer.from("0123456789abcdef0123456789abcdef");
const SECRET = `whsec_${SECRET_KEY.toString("base64")}`;

function signStandardWebhook(
  body: string,
  id = "msg_test_1",
  timestamp = String(Math.floor(Date.now() / 1000)),
) {
  const signature = createHmac("sha256", SECRET_KEY)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  return {
    id,
    timestamp,
    signature: `v1,${signature}`,
  };
}

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

describe("Polar webhook signature (Standard Webhooks)", () => {
  it("accepts valid webhook-id / webhook-timestamp / webhook-signature headers", () => {
    expect(verifyPolarSignature(SECRET, BODY, signStandardWebhook(BODY))).toBe(true);
  });

  it("rejects tampered payloads, wrong keys, and stale timestamps", () => {
    expect(
      verifyPolarSignature(SECRET, BODY, {
        ...signStandardWebhook(BODY),
        signature: "v1,AAAA",
      }),
    ).toBe(false);
    expect(verifyPolarSignature("whsec_other", BODY, signStandardWebhook(BODY))).toBe(false);
    expect(
      verifyPolarSignature(
        SECRET,
        BODY,
        signStandardWebhook(BODY, "msg_test_1", String(Math.floor(Date.now() / 1000) - 3600)),
      ),
    ).toBe(false);
  });

  it("accepts multiple v1 signatures (rotation)", () => {
    const signed = signStandardWebhook(BODY);
    expect(
      verifyPolarSignature(SECRET, BODY, {
        ...signed,
        signature: `v1,AAAA ${signed.signature}`,
      }),
    ).toBe(true);
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

describe("polar checkout route encapulation", () => {
  it("checkout keeps normal JSON parsing (auth gate returns 401, not 400)", async () => {
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
      }),
    );
    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      headers: { "content-type": "application/json" },
      payload: { target: "PLUS" },
    });
    // Missing access token must surface as unauthorized — a 400 body/target
    // validation error would mean the buffer-parser leaked into this route.
    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).error).toBe("unauthorized");
    await app.close();
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

    const signedHeaders = signStandardWebhook(BODY);
    const signed = await app.inject({
      method: "POST",
      url: "/v1/webhooks/polar",
      headers: {
        "content-type": "application/json",
        "webhook-id": signedHeaders.id,
        "webhook-timestamp": signedHeaders.timestamp,
        "webhook-signature": signedHeaders.signature,
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
