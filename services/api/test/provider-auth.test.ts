import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

const TOKEN = "Bearer sb_access_token_test_1234567890";
const PROVIDER_KEY = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6";

interface StubOptions {
  plan?: string;
}

function stubGateway(options?: StubOptions) {
  return vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/auth/v1/user")) {
        return new Response(
          JSON.stringify({ id: "u_test_1", is_anonymous: false }),
          { status: 200 },
        );
      }
      if (url.includes("/rest/v1/profiles?")) {
        return new Response(
          JSON.stringify([{ id: "u_test_1", plan: options?.plan ?? "FREE" }]),
          { status: 200 },
        );
      }
      if (url.includes("/flights/number/")) {
        const number = url.split("/flights/number/")[1]?.split("?")[0] ?? "FL000";
        return new Response(
          JSON.stringify([
            {
              number,
              status: "Scheduled",
              departure: {
                airport: {
                  iata: "JFK",
                  name: "John F. Kennedy",
                  municipalityName: "New York",
                  countryCode: "US",
                  timeZone: "UTC",
                  location: { lat: 40.64, lon: -73.78 },
                },
                scheduledTime: { utc: "2026-11-08 00:30+00:00" },
              },
              arrival: {
                airport: {
                  iata: "LHR",
                  name: "Heathrow",
                  municipalityName: "London",
                  countryCode: "GB",
                  timeZone: "UTC",
                  location: { lat: 51.47, lon: -0.45 },
                },
                scheduledTime: { utc: "2026-11-08 06:30+00:00" },
              },
            },
          ]),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 404 });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("provider auth gate", () => {
  it("logs unauthenticated provider calls in log mode", async () => {
    stubGateway();
    const app = await buildApp(
      loadConfig({
        NODE_ENV: "test",
        LOG_LEVEL: "silent",
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SECRET_KEY: "sb_secret_test",
        PROVIDER_AUTH_MODE: "log",
        AERODATABOX_API_KEY: "",
      }),
    );
    const response = await app.inject({
      method: "GET",
      url: "/v1/flights/search?number=BA117",
    });
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it("rejects unauthenticated provider calls in enforce mode", async () => {
    stubGateway();
    const app = await buildApp(
      loadConfig({
        NODE_ENV: "test",
        LOG_LEVEL: "silent",
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SECRET_KEY: "sb_secret_test",
        PROVIDER_AUTH_MODE: "enforce",
        AERODATABOX_API_KEY: "",
      }),
    );
    const response = await app.inject({
      method: "GET",
      url: "/v1/flights/search?number=BA117",
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("unauthorized");
    await app.close();
  });

  it("allows authenticated provider calls in enforce mode", async () => {
    stubGateway();
    const app = await buildApp(
      loadConfig({
        NODE_ENV: "test",
        LOG_LEVEL: "silent",
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SECRET_KEY: "sb_secret_test",
        PROVIDER_AUTH_MODE: "enforce",
        AERODATABOX_API_KEY: "",
      }),
    );
    const response = await app.inject({
      method: "GET",
      url: "/v1/flights/search?number=BA117",
      headers: { authorization: TOKEN },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().meta.source).toBe("not_configured");
    await app.close();
  });

  it("applies plan-based quotas on authenticated provider calls", async () => {
    stubGateway({ plan: "FREE" });
    // 60 units per call against a FREE 100/day limit: one call allowed
    // (charged 60), a second call would be 120 > 100.
    const app = await buildApp(
      loadConfig({
        NODE_ENV: "test",
        LOG_LEVEL: "silent",
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SECRET_KEY: "sb_secret_test",
        PROVIDER_AUTH_MODE: "enforce",
        AERODATABOX_API_KEY: PROVIDER_KEY,
        AERODATABOX_UNITS_PER_FLIGHT: "60",
        UNIT_BUDGET_PER_MONTH: "100000",
      }),
    );
    const first = await app.inject({
      method: "GET",
      url: "/v1/flights/search?number=BA117",
      headers: { authorization: TOKEN },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().meta.source).toBe("live");
    const second = await app.inject({
      method: "GET",
      url: "/v1/flights/search?number=BA118",
      headers: { authorization: TOKEN },
    });
    expect(second.statusCode).toBe(429);
    expect(second.json().error).toBe("quota_exhausted");
    await app.close();
  });
});
