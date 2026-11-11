import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(
    loadConfig({
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      AERODATABOX_API_KEY: "",
    }),
  );
});

afterAll(async () => {
  await app.close();
});

describe("system routes", () => {
  it("returns a healthy liveness probe", async () => {
    const response = await app.inject({ method: "GET", url: "/healthz" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
      service: "avi-api",
    });
  });

  it("reports provider configuration without leaking secrets", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/status" });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.providers.aerodatabox).toBe("not_configured");
    expect(JSON.stringify(body)).not.toContain("DEFAULT_");
  });
});

describe("flight routes", () => {
  it("rejects malformed flight numbers", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/flights/search?number=hello%20world",
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_flight_number");
  });

  it("fails explicitly when AeroDataBox is not configured", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/flights/search?number=BA117",
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: "provider_not_configured",
    });
  });

  it("pauses provider-backed routes when the unit budget is exhausted", async () => {
    const exhausted = await buildApp(
      loadConfig({
        NODE_ENV: "test",
        LOG_LEVEL: "silent",
        UNIT_BUDGET_PER_MONTH: "0",
      }),
    );
    const response = await exhausted.inject({
      method: "GET",
      url: "/v1/flights/search?number=BA117",
    });
    expect(response.statusCode).toBe(429);
    expect(response.json().error).toBe("unit_budget_exhausted");
    await exhausted.close();
  });
});

describe("readiness and cache status", () => {
  it("reports readiness checks including the cache backend", async () => {
    const response = await app.inject({ method: "GET", url: "/readyz" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ready",
      service: "avi-api",
      checks: {
        cache: { backend: "process", shared: false, ok: true },
        schedule: { provider: "none", configured: false },
      },
    });
  });

  it("exposes cache counters and schedule configuration in status", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/status" });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.cache).toMatchObject({
      backend: "process",
      enabled: true,
    });
    expect(body.providers.schedule).toEqual({
      provider: "none",
      configured: false,
    });
  });
});

describe("new provider routes", () => {
  it("reports schedules as unavailable instead of synthesizing days", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/routes/JFK/LHR/schedule",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "unavailable",
      source: "none",
      reason: "no_schedule_provider_configured",
      flights: [],
      validFrom: null,
    });
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("validates schedule route codes", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/routes/XX/YY/schedule",
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_iata_code");
  });

  it("fails explicitly for flight dates when the provider is unconfigured", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/flights/dates?number=BA117",
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error).toBe("provider_not_configured");
  });

  it("fails explicitly for flight delays when the provider is unconfigured", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/flights/BA117/delays",
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error).toBe("provider_not_configured");
  });

  it("fails explicitly for aircraft details when the provider is unconfigured", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/aircraft/G-XLEA",
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error).toBe("provider_not_configured");
  });

  it("fails explicitly for airport info when the provider is unconfigured", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/airports/JFK/info",
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().error).toBe("provider_not_configured");
  });
});
