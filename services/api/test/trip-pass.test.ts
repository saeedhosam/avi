import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import {
  tripPassCheckoutUrl,
  tripPassFromPolarWebhook,
  tripPassFromWebhook,
} from "../src/lib/billing.js";

const SECRET = "whsec_trip_pass_test";
const DAY_MS = 24 * 60 * 60_000;

function sign(payload: string, timestamp: string): string {
  return createHmac("sha256", SECRET)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
}

const tripPassConfig = loadConfig({
  NODE_ENV: "test",
  TRIP_PASS_PRODUCT_ID: "555",
  TRIP_PASS_DURATION_DAYS: "30",
});

const orderBody = JSON.stringify({
  meta: { event_name: "order_created", custom_data: { user_id: "u1" } },
  data: {
    id: 9001,
    attributes: { variant_id: 555, customer_id: 777 },
  },
});

describe("trip-pass configuration and webhook mapping", () => {
  it("returns a valid configured checkout URL only", () => {
    expect(
      tripPassCheckoutUrl(
        loadConfig({
          NODE_ENV: "test",
          TRIP_PASS_CHECKOUT_URL: "https://checkout.example/trip-pass",
        }),
      ),
    ).toBe("https://checkout.example/trip-pass");
    expect(tripPassCheckoutUrl(loadConfig({ NODE_ENV: "test" }))).toBeNull();
    expect(
      tripPassCheckoutUrl(
        loadConfig({
          NODE_ENV: "test",
          TRIP_PASS_CHECKOUT_URL: "not-a-url",
        }),
      ),
    ).toBeNull();
  });

  it("maps a matching LS order variant to a trip-pass grant", () => {
    expect(
      tripPassFromWebhook(JSON.parse(orderBody), tripPassConfig),
    ).toEqual({ durationDays: 30 });
    const unrelated = JSON.parse(orderBody) as {
      data: { attributes: { variant_id: number } };
    };
    unrelated.data.attributes.variant_id = 999;
    expect(tripPassFromWebhook(unrelated, tripPassConfig)).toBeNull();
  });

  it("maps a matching Polar order product/price and ignores refunds", () => {
    const polar = loadConfig({
      NODE_ENV: "test",
      TRIP_PASS_PRODUCT_ID: "prd_trip_1,price_trip_1",
      TRIP_PASS_DURATION_DAYS: "14",
    });
    expect(
      tripPassFromPolarWebhook(
        {
          type: "order.created",
          data: { id: "o1", product_id: "prd_trip_1" },
        },
        polar,
      ),
    ).toEqual({ durationDays: 14 });
    expect(
      tripPassFromPolarWebhook(
        {
          type: "order.created",
          data: { id: "o1", product_id: "prd_trip_1", status: "refunded" },
        },
        polar,
      ),
    ).toBeNull();
    expect(
      tripPassFromPolarWebhook(
        {
          type: "order.created",
          data: { id: "o2", product_id: "prd_something_else" },
        },
        polar,
      ),
    ).toBeNull();
  });
});

describe("trip-pass checkout route", () => {
  it("returns the configured URL and an explicit 503 when unset", async () => {
    const configured = await buildApp(
      loadConfig({
        NODE_ENV: "test",
        LOG_LEVEL: "silent",
        TRIP_PASS_CHECKOUT_URL: "https://checkout.example/trip-pass",
        TRIP_PASS_DURATION_DAYS: "30",
      }),
    );
    try {
      const response = await configured.inject({
        method: "GET",
        url: "/v1/billing/trip-pass",
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        url: "https://checkout.example/trip-pass",
        provider: "manual",
        durationDays: 30,
      });
      const post = await configured.inject({
        method: "POST",
        url: "/v1/billing/trip-pass",
      });
      expect(post.statusCode).toBe(200);
      expect(post.json().url).toBe("https://checkout.example/trip-pass");
    } finally {
      await configured.close();
    }

    const unconfigured = await buildApp(
      loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent" }),
    );
    try {
      const response = await unconfigured.inject({
        method: "GET",
        url: "/v1/billing/trip-pass",
      });
      expect(response.statusCode).toBe(503);
      expect(response.json().error).toBe("trip_pass_not_configured");
    } finally {
      await unconfigured.close();
    }
  });
});

describe("trip-pass webhook entitlement", () => {
  it("never grants without a valid signature and extends expiry for a matching order", async () => {
    const app = await buildApp(
      loadConfig({
        NODE_ENV: "test",
        LOG_LEVEL: "silent",
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SECRET_KEY: "sb_secret_test",
        BILLING_PROVIDER: "lemon_squeezy",
        LEMONSQUEEZY_WEBHOOK_SECRET: SECRET,
        TRIP_PASS_PRODUCT_ID: "555",
        TRIP_PASS_DURATION_DAYS: "30",
      }),
    );
    const patches: Array<{ body: unknown; url: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input: unknown, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/rest/v1/billing_events?")) {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        if (url.includes("/rest/v1/profiles?") && init?.method === "GET") {
          return new Response(
            JSON.stringify([
              { plan: "FREE", trip_pass_expires_at: null },
            ]),
            { status: 200 },
          );
        }
        if (url.includes("/rest/v1/profiles?") && init?.method === "PATCH") {
          patches.push({ url, body: init?.body });
          return new Response(null, { status: 204 });
        }
        if (url.includes("/rest/v1/billing_events")) {
          return new Response(null, { status: 201 });
        }
        return new Response("{}", { status: 404 });
      }),
    );

    try {
      const unsigned = await app.inject({
        method: "POST",
        url: "/v1/webhooks/lemon-squeezy",
        headers: { "content-type": "application/json" },
        payload: orderBody,
      });
      expect(unsigned.statusCode).toBe(401);
      expect(patches).toHaveLength(0);

      const timestamp = String(Math.floor(Date.now() / 1000));
      const signed = await app.inject({
        method: "POST",
        url: "/v1/webhooks/lemon-squeezy",
        headers: {
          "content-type": "application/json",
          "x-signature-timestamp": timestamp,
          "x-signature": sign(orderBody, timestamp),
        },
        payload: orderBody,
      });
      expect(signed.statusCode).toBe(200);
      expect(patches).toHaveLength(1);
      const patch = JSON.parse(String(patches[0]?.body)) as {
        plan?: string;
        trip_pass_expires_at?: string;
      };
      expect(patch.plan).toBeUndefined();
      const expiresAt = Date.parse(patch.trip_pass_expires_at ?? "");
      expect(expiresAt).toBeGreaterThan(Date.now() + 29 * DAY_MS);
      expect(expiresAt).toBeLessThan(Date.now() + 31 * DAY_MS);
    } finally {
      await app.close();
      vi.unstubAllGlobals();
    }
  });
});
