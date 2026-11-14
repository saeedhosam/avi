import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { resetProviderCache } from "../src/lib/provider-cache.js";

const routeDto = {
  routes: [
    {
      destination: {
        iata: "DXB",
        icao: "OMDB",
        name: "Dubai International",
        municipalityName: "Dubai",
        countryCode: "AE",
        timeZone: "Asia/Dubai",
        location: { lat: 25.2532, lon: 55.3657 },
      },
      averageDailyFlights: 6,
      operators: [{ iata: "MS", name: "EgyptAir" }],
    },
  ],
};

const aircraftDto = {
  reg: "SU-GAA",
  iataType: "B77W",
  icaoCode: "B77W",
  model: "Boeing 777-300ER",
  numSeats: 346,
  ageYears: 7,
};

const baseConfig = {
  NODE_ENV: "test" as const,
  LOG_LEVEL: "silent" as const,
  AERODATABOX_API_KEY: "gateway-test-aerodatabox-key-1234567890",
  PROVIDER_AUTH_MODE: "log" as const,
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_test",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface CacheWrite {
  cacheKey: string;
  payload: unknown;
  fetchedAt: string;
  freshUntil: string;
  expiresAt: string;
}

function parseCacheWrite(body: unknown): CacheWrite {
  const row = JSON.parse(String(body)) as {
    cache_key: string;
    payload: unknown;
    fetched_at: string;
    fresh_until: string;
    expires_at: string;
  };
  return {
    cacheKey: row.cache_key,
    payload: row.payload,
    fetchedAt: row.fetched_at,
    freshUntil: row.fresh_until,
    expiresAt: row.expires_at,
  };
}

function supabaseRow(write: CacheWrite) {
  return {
    payload: write.payload,
    source: "AERODATABOX",
    fetched_at: write.fetchedAt,
    fresh_until: write.freshUntil,
    expires_at: write.expiresAt,
  };
}

async function closeApp(app: FastifyInstance | null): Promise<void> {
  if (app) await app.close();
}

describe("gateway Postgres read-through cache", () => {
  beforeEach(async () => {
    await resetProviderCache();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await resetProviderCache();
  });

  it("writes parsed route/aircraft responses and serves them after a Redis flush", async () => {
    const writes: CacheWrite[] = [];
    const providerCalls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/rest/v1/gateway_cache?")) return json([]);
        if (url.includes("/rest/v1/gateway_cache")) {
          writes.push(parseCacheWrite(init?.body));
          return new Response(null, { status: 201 });
        }
        if (url.includes("/rest/v1/cabin_layouts?")) return json([]);
        if (url.includes("/rest/v1/cabin_layouts")) {
          return new Response(null, { status: 201 });
        }
        if (url.includes("/airports/iata/CAI/stats/routes/daily")) {
          providerCalls.push(url);
          return json(routeDto);
        }
        if (url.includes("/aircrafts/reg/SUGAA")) {
          providerCalls.push(url);
          return json(aircraftDto);
        }
        return new Response(null, { status: 404 });
      }),
    );

    const app = await buildApp(loadConfig(baseConfig));
    try {
      const routes = await app.inject({
        method: "GET",
        url: "/api/gateway/airports/CAI/routes",
      });
      expect(routes.statusCode).toBe(200);
      expect(routes.json().provenance.cached).toBe(false);

      const aircraft = await app.inject({
        method: "GET",
        url: "/api/gateway/aircraft/SU-GAA",
      });
      expect(aircraft.statusCode).toBe(200);
      expect(aircraft.json().provenance.cached).toBe(false);
    } finally {
      await closeApp(app);
    }

    expect(providerCalls).toHaveLength(2);
    expect(writes.map((write) => write.cacheKey).sort()).toEqual([
      "aero:aircraft:SUGAA",
      "aero:routes:CAI",
    ]);
    const routeWrite = writes.find((write) => write.cacheKey === "aero:routes:CAI");
    const aircraftWrite = writes.find(
      (write) => write.cacheKey === "aero:aircraft:SUGAA",
    );
    expect(routeWrite).toBeTruthy();
    expect(aircraftWrite).toBeTruthy();
    expect(Date.parse(routeWrite!.freshUntil)).toBeGreaterThan(Date.now());
    expect(Date.parse(aircraftWrite!.freshUntil)).toBeGreaterThan(Date.now());

    await resetProviderCache();
    let providerCalled = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/rest/v1/gateway_cache")) {
          const key = url.searchParams.get("cache_key")?.replace(/^eq\./, "");
          const write = writes.find((entry) => entry.cacheKey === key);
          return json(write ? [supabaseRow(write)] : []);
        }
        providerCalled = true;
        return new Response(null, { status: 500 });
      }),
    );

    const replay = await buildApp(loadConfig(baseConfig));
    try {
      const routes = await replay.inject({
        method: "GET",
        url: "/api/gateway/airports/CAI/routes",
      });
      expect(routes.statusCode).toBe(200);
      expect(routes.headers["x-aeroquest-cache"]).toBe("HIT");
      expect(routes.json().provenance).toMatchObject({
        cached: true,
        stale: false,
        ttlSeconds: 7 * 24 * 60 * 60,
      });
      expect(routes.json().routes).toHaveLength(1);

      const aircraft = await replay.inject({
        method: "GET",
        url: "/api/gateway/aircraft/SU-GAA",
      });
      expect(aircraft.statusCode).toBe(200);
      expect(aircraft.headers["x-aeroquest-cache"]).toBe("HIT");
      expect(aircraft.json().provenance).toMatchObject({
        cached: true,
        stale: false,
        ttlSeconds: 30 * 24 * 60 * 60,
      });
      expect(aircraft.json().aircraft.registration).toBe("SU-GAA");

      const status = await replay.inject({
        method: "GET",
        url: "/v1/status",
      });
      expect(status.json().gatewayCache).toMatchObject({
        configured: true,
        hits: 2,
        writes: 0,
      });
    } finally {
      await closeApp(replay);
    }
    expect(providerCalled).toBe(false);
  });

  it("does not serve stale Postgres rows or cache an empty route result", async () => {
    const writes: CacheWrite[] = [];
    const staleRow = {
      payload: {
        mode: "LIVE_AERODATABOX",
        routes: [
          {
            id: "CAI-DXB",
            origin: {
              iata: "CAI",
              icao: "HECA",
              name: "Cairo",
              city: "Cairo",
              country: "EG",
              region: "MENA",
              latitude: 30.1219,
              longitude: 31.4056,
              timezone: "Africa/Cairo",
              hubAirlines: [],
            },
            destination: {
              iata: "DXB",
              icao: "OMDB",
              name: "Dubai",
              city: "Dubai",
              country: "AE",
              region: "MENA",
              latitude: 25.2532,
              longitude: 55.3657,
              timezone: "Asia/Dubai",
              hubAirlines: [],
            },
            distanceKm: 2_400,
            distanceNm: 1_296,
            estimatedDurationMinutes: 210,
            durationFormatted: "3h 30m",
            durationEstimated: true,
            haulCategory: "MEDIUM_HAUL",
            dailyFlightsCount: 6,
            hasDepartures: true,
            hasArrivals: false,
            operatingCarriers: [],
            isLiveVerified: false,
            dataSource: "AERODATABOX",
          },
        ],
        provenance: {
          source: "AERODATABOX",
          attribution: "AeroDataBox",
          fetchedAt: "2020-01-01T00:00:00.000Z",
          cached: false,
          stale: false,
          cacheAgeSeconds: 0,
          ttlSeconds: 604_800,
        },
      },
      source: "AERODATABOX",
      fetched_at: "2020-01-01T00:00:00.000Z",
      fresh_until: "2020-01-02T00:00:00.000Z",
      expires_at: "2099-01-01T00:00:00.000Z",
    };
    let providerCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/rest/v1/gateway_cache?")) return json([staleRow]);
        if (url.includes("/rest/v1/gateway_cache")) {
          writes.push(parseCacheWrite(init?.body));
          return new Response(null, { status: 201 });
        }
        if (url.includes("/airports/iata/CAI/stats/routes/daily")) {
          providerCalls += 1;
          return json({ routes: [] });
        }
        return new Response(null, { status: 404 });
      }),
    );

    const app = await buildApp(loadConfig(baseConfig));
    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/gateway/airports/CAI/routes",
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().routes).toEqual([]);
      expect(response.json().provenance.cached).toBe(false);
    } finally {
      await closeApp(app);
    }
    expect(providerCalls).toBe(1);
    expect(writes).toHaveLength(0);
  });
});
