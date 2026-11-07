import { afterAll, describe, expect, it, vi } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import type { FlightSummary } from "../src/domain/flight.js";
import { WatchEngine } from "../src/engine/watch-engine.js";
import { SupabaseServer } from "../src/lib/supabase-server.js";
import { UsageTracker } from "../src/lib/usage.js";
import { loadConfig } from "../src/config.js";

const MIN = 60_000;

function dayAheadSnapshot(flightNumber: string, flightId: string) {
  return {
    id: flightId,
    flightNumber,
    flightDate: "2026-11-08",
    status: "SCHEDULED",
    statusNote: "Scheduled",
    delayMinutes: 0,
    delayReason: null,
    terminalDeparture: "4",
    gateDeparture: "Gate B10",
    terminalArrival: "3",
    gateArrival: "Gate 22",
    checkInCounter: "—",
    baggageCarousel: "Carousel TBD",
    departureTimeScheduled: "00:30",
    departureTimeEstimated: "00:30",
    arrivalTimeScheduled: "06:30",
    arrivalTimeEstimated: "06:30",
    departureTimeActual: null,
    arrivalTimeActual: null,
    isWatchlisted: true,
    customNotes: "",
    aircraft: { model: "Boeing 777", registration: "G-ZBJG" },
    origin: { code: "JFK", timezone: "UTC", latitude: 40.64, longitude: -73.78 },
    destination: { code: "LHR", timezone: "UTC", latitude: 51.47, longitude: -0.45 },
    telemetry: {
      hasLiveLocation: false,
      currentLatitude: 40.64,
      currentLongitude: -73.78,
      altitudeFeet: 0,
      groundSpeedKnots: 0,
      headingDegrees: 0,
      verticalSpeedFpm: 0,
      mach: 0,
      progressPercent: 0,
      distanceCoveredNm: 0,
      distanceRemainingNm: 5550,
      etaMinutesRemaining: 0,
      waypoints: [],
    },
  };
}

function summaryFor(flightNumber: string): FlightSummary {
  return {
    id: flightNumber.replace(/\s+/g, ""),
    flightNumber,
    airline: "Test Air",
    airlineCode: flightNumber.slice(0, 2),
    status: "DEPARTED",
    statusNote: "En route",
    origin: {
      code: "JFK",
      name: "JFK",
      city: "New York",
      country: "US",
      timezone: "UTC",
      latitude: 40.64,
      longitude: -73.78,
    },
    destination: {
      code: "LHR",
      name: "LHR",
      city: "London",
      country: "GB",
      timezone: "UTC",
      latitude: 51.47,
      longitude: -0.45,
    },
    scheduledDeparture: "2026-11-08 00:30+00:00",
    estimatedDeparture: "2026-11-08 00:30+00:00",
    scheduledArrival: "2026-11-08 06:30+00:00",
    estimatedArrival: "2026-11-08 06:30+00:00",
    terminalDeparture: "4",
    gateDeparture: "B22",
    terminalArrival: "3",
    gateArrival: "22",
    baggageCarousel: "9",
    aircraft: { model: "777", registration: "G-ZBJG" },
    delayMinutes: 0,
    telemetry: {
      hasLiveLocation: false,
      latitude: 0,
      longitude: 0,
      altitudeFeet: 0,
      groundSpeedKnots: 0,
      headingDegrees: 0,
      updatedAt: null,
    },
    source: "aerodatabox",
    updatedAt: new Date().toISOString(),
  };
}

describe("watch engine FIDS consolidation", () => {
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("refreshes two same-origin jobs with one board call and no per-flight calls", async () => {
    const rows = [
      {
        user_id: "u1",
        flight_id: "BA117-2026-11-08",
        flight_number: "BA 117",
        flight_date: "2026-11-08",
        status: "SCHEDULED",
        notes: "",
        snapshot: dayAheadSnapshot("BA 117", "BA117-2026-11-08"),
      },
      {
        user_id: "u2",
        flight_id: "BA178-2026-11-08",
        flight_number: "BA 178",
        flight_date: "2026-11-08",
        status: "SCHEDULED",
        notes: "",
        snapshot: dayAheadSnapshot("BA 178", "BA178-2026-11-08"),
      },
    ];
    const fetchMock = vi.fn().mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/rest/v1/watchlist_items?select=")) {
        return new Response(JSON.stringify(rows), { status: 200 });
      }
      if (url.includes("updated_at=lt.")) {
        return new Response(null, { status: 204 });
      }
      if (url.includes("/rest/v1/flight_alerts?select=flight_number")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.includes("/rest/v1/flight_alerts")) {
        return new Response(null, { status: 204 });
      }
      if (url.includes("/rest/v1/profiles?select=id,plan")) {
        return new Response(JSON.stringify([{ id: "u1", plan: "FREE" }, { id: "u2", plan: "FREE" }]), {
          status: 200,
        });
      }
      if (url.includes("/rest/v1/watchlist_items?")) {
        return new Response(null, { status: 204 });
      }
      return new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const supabase = new SupabaseServer(
      loadConfig({
        NODE_ENV: "test",
        LOG_LEVEL: "silent",
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SECRET_KEY: "sb_secret_test",
      }),
    );
    const searchFlight = vi.fn();
    const lookupFids = vi.fn().mockResolvedValue({
      meta: { source: "live" as const },
      summaries: [summaryFor("BA 117"), summaryFor("BA 178")],
    });
    const provider = {
      searchFlight,
      lookupFids,
      configured: true,
    };

    const engine = new WatchEngine(
      loadConfig({
        NODE_ENV: "test",
        LOG_LEVEL: "silent",
        WATCH_ENGINE_TICK_MS: "300000",
        WATCH_ENGINE_SWEEPS_PER_TICK: "8",
        WATCH_ENGINE_FIDS_MIN_GROUP: "2",
        UNIT_BUDGET_PER_MONTH: "10000",
      }),
      provider,
      supabase,
      new UsageTracker(10_000),
      {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      } as unknown as FastifyBaseLogger,
    );

    const stats = await engine.tick();
    await engine.stop();

    // One board call covers both flights; per-flight searchFlight never runs.
    expect(lookupFids).toHaveBeenCalledTimes(1);
    expect(String(lookupFids.mock.calls[0]?.[0])).toBe("JFK");
    expect(searchFlight).not.toHaveBeenCalled();
    expect(stats.lastSwept).toBe(2);
    // One 2-unit board call, not 2 × 2-unit flight lookups.
    expect(stats.units.unitsUsed).toBe(2);
    // Both rows patched with a board-derived snapshot.
    const patchCalls = fetchMock.mock.calls.filter(
      (call) => {
        const url = String(call[0]);
        return (
          url.includes("/rest/v1/watchlist_items?") &&
          !url.includes("select=") &&
          !url.includes("updated_at=lt.") // snapshot purge is counted separately
        );
      },
    );
    expect(patchCalls).toHaveLength(2);
  });

  it("falls back to per-flight calls when a board lookup fails", async () => {
    const rows = [
      {
        user_id: "u3",
        flight_id: "BA117-2026-11-08",
        flight_number: "BA 117",
        flight_date: "2026-11-08",
        status: "SCHEDULED",
        notes: "",
        snapshot: dayAheadSnapshot("BA 117", "BA117-2026-11-08"),
      },
    ];
    const fetchMock = vi.fn().mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/rest/v1/watchlist_items?select=")) {
        return new Response(JSON.stringify(rows), { status: 200 });
      }
      if (url.includes("/rest/v1/flight_alerts?select=flight_number")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.includes("/rest/v1/flight_alerts")) {
        return new Response(null, { status: 204 });
      }
      if (url.includes("/rest/v1/profiles?select=id,plan")) {
        return new Response(JSON.stringify([{ id: "u3", plan: "FREE" }]), { status: 200 });
      }
      if (url.includes("/rest/v1/watchlist_items?")) {
        return new Response(null, { status: 204 });
      }
      return new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const supabase = new SupabaseServer(
      loadConfig({
        NODE_ENV: "test",
        LOG_LEVEL: "silent",
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SECRET_KEY: "sb_secret_test",
      }),
    );
    const searchFlight = vi.fn().mockResolvedValue({
      flights: [summaryFor("BA 117")],
      meta: { source: "live" as const, fetchedAt: "", cached: false, attribution: "AeroDataBox" },
    });
    const provider = {
      searchFlight,
      lookupFids: vi.fn().mockResolvedValue({
        meta: { source: "error" as const },
        summaries: [],
      }),
      configured: true,
    };

    const engine = new WatchEngine(
      loadConfig({
        NODE_ENV: "test",
        LOG_LEVEL: "silent",
        WATCH_ENGINE_TICK_MS: "300000",
        WATCH_ENGINE_SWEEPS_PER_TICK: "8",
        WATCH_ENGINE_FIDS_MIN_GROUP: "2",
        UNIT_BUDGET_PER_MONTH: "10000",
      }),
      provider,
      supabase,
      new UsageTracker(10_000),
      {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      } as unknown as FastifyBaseLogger,
    );

    const stats = await engine.tick();
    await engine.stop();

    // Board came back empty → the single-flight pass runs and refreshes.
    expect(searchFlight).toHaveBeenCalledTimes(1);
    expect(stats.lastSwept).toBe(1);
    // One 2-unit flight lookup after the failed board; no double spend.
    expect(stats.units.unitsUsed).toBe(2);
  });
});
