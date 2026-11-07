import { afterEach, describe, expect, it, vi } from "vitest";
import {
  alertKey,
  diffAlerts,
  isWatchSnapshot,
  matchesJob,
  mergeSnapshot,
  scheduleNextPoll,
  snapshotDepartureMs,
  snapshotFromRow,
  type WatchJob,
  type WatchSnapshot,
} from "../src/engine/snapshot.js";
import { UsageTracker, UserMeter } from "../src/lib/usage.js";
import { SupabaseServer } from "../src/lib/supabase-server.js";
import { concurrencyLimitFor, PLAN_LIMITS } from "../src/engine/plans.js";
import { loadConfig } from "../src/config.js";
import type { FlightSummary } from "../src/domain/flight.js";

const MIN = 60_000;

function baseSnapshot(overrides: Partial<WatchSnapshot> = {}): WatchSnapshot {
  return {
    id: "BA117-2026-11-08",
    flightNumber: "BA 117",
    flightDate: "2026-11-08",
    airline: "British Airways",
    airlineCode: "BA",
    status: "SCHEDULED",
    statusNote: "Scheduled",
    delayMinutes: 0,
    delayReason: null,
    terminalDeparture: "3",
    gateDeparture: "Gate TBD",
    terminalArrival: "5",
    gateArrival: "Gate 22",
    baggageCarousel: "Carousel TBD",
    departureTimeScheduled: "18:30",
    departureTimeEstimated: "18:30",
    arrivalTimeScheduled: "06:35",
    arrivalTimeEstimated: "06:35",
    departureTimeActual: null,
    arrivalTimeActual: null,
    isWatchlisted: true,
    customNotes: "Seat 12A, window",
    aircraft: { model: "Boeing 777", registration: "G-XLEA" },
    origin: {
      code: "JFK",
      timezone: "America/New_York",
      latitude: 40.6413,
      longitude: -73.7781,
    },
    destination: {
      code: "LHR",
      timezone: "Europe/London",
      latitude: 51.47,
      longitude: -0.4543,
    },
    telemetry: {
      hasLiveLocation: false,
      currentLatitude: 40.6413,
      currentLongitude: -73.7781,
      altitudeFeet: 0,
      groundSpeedKnots: 0,
      headingDegrees: 0,
      verticalSpeedFpm: 0,
      mach: 0,
      progressPercent: 0,
      distanceCoveredNm: 0,
      distanceRemainingNm: 5555,
      etaMinutesRemaining: 0,
      waypoints: [],
    },
    ...overrides,
  };
}

function baseSummary(overrides: Partial<FlightSummary> = {}): FlightSummary {
  return {
    id: "BA117-2026-11-08",
    flightNumber: "BA 117",
    airline: "British Airways",
    airlineCode: "BA",
    status: "DEPARTED",
    statusNote: "En route",
    origin: {
      code: "JFK",
      name: "John F. Kennedy",
      city: "New York",
      country: "US",
      timezone: "America/New_York",
      latitude: 40.6413,
      longitude: -73.7781,
    },
    destination: {
      code: "LHR",
      name: "Heathrow",
      city: "London",
      country: "GB",
      timezone: "Europe/London",
      latitude: 51.47,
      longitude: -0.4543,
    },
    scheduledDeparture: "2026-11-08 18:30-05:00",
    estimatedDeparture: "2026-11-08 18:30-05:00",
    scheduledArrival: "2026-11-09 06:35+00:00",
    estimatedArrival: "2026-11-09 06:35+00:00",
    terminalDeparture: "3",
    gateDeparture: "B14",
    terminalArrival: "5",
    gateArrival: "22",
    baggageCarousel: "7",
    aircraft: { model: "Boeing 777", registration: "G-XLEA" },
    delayMinutes: 0,
    telemetry: {
      hasLiveLocation: true,
      latitude: 46.0,
      longitude: -40.0,
      altitudeFeet: 36000,
      groundSpeedKnots: 480,
      headingDegrees: 62,
      updatedAt: "2026-11-09T00:00:00Z",
    },
    source: "aerodatabox",
    updatedAt: "2026-11-09T00:00:00Z",
    ...overrides,
  };
}

describe("zoned time conversion", () => {
  it("converts a departure wall-clock time to UTC", () => {
    const utcMs = snapshotDepartureMs(baseSnapshot());
    expect(utcMs).not.toBeNull();
    // 18:30 America/New_York (-05:00) -> 23:30 UTC on 2026-11-08.
    expect(new Date(utcMs!).toISOString()).toBe("2026-11-08T23:30:00.000Z");
  });

  it("returns null when data is missing", () => {
    expect(snapshotDepartureMs(baseSnapshot({ origin: undefined } as Partial<WatchSnapshot>))).toBeNull();
    expect(snapshotDepartureMs(baseSnapshot({ flightDate: null }))).toBeNull();
  });
});

describe("poll ladder (scheduleNextPoll)", () => {
  const now = Date.parse("2026-11-08T00:00:00Z");

  /** Builds a snapshot departing `deltaMinutes` from `now`, expressed in the
   *  departure airport's own timezone (as the web client stores it). */
  function snapshotDeparting(
    deltaMinutes: number,
    overrides: Partial<WatchSnapshot> = {},
  ): WatchSnapshot {
    const target = now + deltaMinutes * MIN;
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    const parts = new Map(
      formatter.formatToParts(new Date(target)).map((part) => [part.type, part.value] as const),
    );
    return baseSnapshot({
      flightDate: `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`,
      departureTimeScheduled: `${parts.get("hour")}:${parts.get("minute")}`,
      ...overrides,
    });
  }

  it("defers far-future flights until a week before departure", () => {
    const schedule = scheduleNextPoll(snapshotDeparting(8 * 24 * 60), now);
    expect(schedule.atMs).toBe(now + 8 * 24 * 60 * MIN - 7 * 24 * 60 * MIN);
    expect(schedule.priority).toBe(9);
  });

  it("keeps 1-7 day runway flights at a 6h cadence", () => {
    const schedule = scheduleNextPoll(snapshotDeparting(30 * 60), now);
    expect(schedule.atMs).toBe(now + 6 * 60 * MIN);
    expect(schedule.priority).toBe(6);
  });

  it("accelerates inside the operational window", () => {
    expect(scheduleNextPoll(snapshotDeparting(10 * 60), now).atMs).toBe(now + 60 * MIN);
    expect(scheduleNextPoll(snapshotDeparting(2 * 60), now).atMs).toBe(now + 10 * MIN);
    expect(scheduleNextPoll(snapshotDeparting(18), now).atMs).toBe(now + 5 * MIN);
    expect(scheduleNextPoll(snapshotDeparting(3), now).atMs).toBe(now + 2 * MIN);
  });

  it("polls airborne flights every 3 minutes after departure", () => {
    const schedule = scheduleNextPoll(
      snapshotDeparting(-25, { status: "DEPARTED" }),
      now + 25 * MIN,
    );
    expect(schedule.atMs).toBe(now + 25 * MIN + 3 * MIN);
    expect(schedule.priority).toBe(1);
  });

  it("polls landed flights every 5 minutes until baggage is assigned", () => {
    const landing = baseSnapshot({ status: "LANDED", baggageCarousel: "Carousel TBD", landedAt: now });
    const schedule = scheduleNextPoll(landing, now);
    expect(schedule.atMs).toBe(now + 5 * MIN);
  });

  it("stops polling once a landed flight is fully settled", () => {
    const settled = baseSnapshot({ status: "LANDED", baggageCarousel: "Carousel 7" });
    expect(scheduleNextPoll(settled, now).atMs).toBeNull();
  });

  it("keeps polling a landed flight inside the baggage grace window", () => {
    const landed = baseSnapshot({
      status: "LANDED",
      baggageCarousel: "Carousel TBD",
      landedAt: now - 5 * MIN,
    });
    expect(scheduleNextPoll(landed, now).atMs).toBe(now + 5 * MIN);
  });

  it("stops polling a landed flight after the baggage grace window", () => {
    const landed = baseSnapshot({
      status: "LANDED",
      baggageCarousel: "Carousel TBD",
      landedAt: now - 3 * 60 * MIN,
    });
    expect(scheduleNextPoll(landed, now).atMs).toBeNull();
  });

  it("never re-polls cancelled flights", () => {
    const cancelled = baseSnapshot({ status: "CANCELLED" });
    expect(scheduleNextPoll(cancelled, now).atMs).toBeNull();
  });
});

describe("mergeSnapshot", () => {
  it("merges provider data and preserves client-owned fields", () => {
    const previous = baseSnapshot();
    const summary = baseSummary({ delayMinutes: 35, status: "DELAYED" });
    const merged = mergeSnapshot(previous, summary, 1234);

    expect(merged.status).toBe("DELAYED");
    expect(merged.delayMinutes).toBe(35);
    expect(merged.gateDeparture).toBe("Gate B14");
    expect(merged.baggageCarousel).toBe("Carousel 7");
    expect(merged.departureTimeEstimated).toBe("18:30");
    expect(merged.isWatchlisted).toBe(true);
    expect(merged.customNotes).toBe("Seat 12A, window");
    expect(merged.id).toBe("BA117-2026-11-08");
  });

  it("fills telemetry with live positions and route progress", () => {
    const merged = mergeSnapshot(baseSnapshot(), baseSummary(), 1234);
    expect(merged.telemetry?.hasLiveLocation).toBe(true);
    expect(merged.telemetry?.currentLatitude).toBe(46);
    expect(merged.telemetry?.progressPercent).toBeGreaterThan(0);
    expect(merged.telemetry?.etaMinutesRemaining).toBeGreaterThan(0);
  });

  it("rebuilds airports and schedule when the snapshot was pruned", () => {
    const merged = mergeSnapshot(
      { flightNumber: "BA 117", flightDate: "2026-11-08" },
      baseSummary(),
      1234,
    );
    expect(merged.origin?.code).toBe("JFK");
    expect(merged.destination?.code).toBe("LHR");
    expect(merged.departureTimeScheduled).toBe("18:30");
    expect(merged.timeline).toEqual([]);
  });

  it("does not fabricate a live position when none is reported", () => {
    const summary = baseSummary({
      telemetry: {
        hasLiveLocation: false,
        latitude: 0,
        longitude: 0,
        altitudeFeet: 0,
        groundSpeedKnots: 0,
        headingDegrees: 0,
        updatedAt: null,
      },
    });
    const merged = mergeSnapshot(baseSnapshot(), summary, 1234);
    expect(merged.telemetry?.hasLiveLocation).toBe(false);
    expect(merged.telemetry?.currentLatitude).toBe(40.6413);
    expect(merged.telemetry?.progressPercent).toBe(0);
  });
});

describe("diffAlerts", () => {
  it("only emits alerts for real changes", () => {
    // previous already reflects what the provider reports now.
    const previous = baseSnapshot({ gateDeparture: "Gate B14" });
    const merged = mergeSnapshot(previous, baseSummary(), 1234);
    expect(diffAlerts(previous, merged, "BA 117")).toEqual([]);
  });

  it("emits gate change", () => {
    const previous = baseSnapshot({ gateDeparture: "Gate B12" });
    const next = mergeSnapshot(previous, baseSummary({ gateDeparture: "B28" }), 1234);
    const drafts = diffAlerts(previous, next, "BA 117");
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.type).toBe("GATE_CHANGE");
    expect(drafts[0]?.message).toContain("Gate B28");
  });

  it("emits delay updates only when the delay increases", () => {
    const previous = baseSnapshot({ delayMinutes: 10 });
    const worse = mergeSnapshot(previous, baseSummary({ delayMinutes: 40 }), 1234);
    const drafts = diffAlerts(previous, worse, "BA 117");
    expect(drafts.some((draft) => draft.type === "DELAY")).toBe(true);
  });

  it("emits boarding", () => {
    const previous = baseSnapshot();
    const boarding = mergeSnapshot(previous, baseSummary({ status: "BOARDING" }), 1234);
    expect(diffAlerts(previous, boarding, "BA 117").some((d) => d.type === "BOARDING")).toBe(true);
  });

  it("emits baggage once a belt is assigned after landing", () => {
    const previous = baseSnapshot({ status: "LANDED", baggageCarousel: "Carousel TBD" });
    const next = mergeSnapshot(previous, baseSummary({ status: "LANDED", baggageCarousel: "7" }), 1234);
    expect(diffAlerts(previous, next, "BA 117").some((d) => d.type === "BAGGAGE")).toBe(true);
  });
});

describe("alertKey + matchesJob", () => {
  const job: WatchJob = {
    key: "BA117|2026-11-08",
    flightNumber: "BA117",
    flightDate: "2026-11-08",
    rows: [],
    priority: 1,
    deltaMs: 0,
  };

  it("deduplicates per user on user + flight + type + message", () => {
    const draft = { type: "GATE_CHANGE" as const, title: "t", message: "m" };
    expect(alertKey("u1", "BA 117", draft)).toBe("u1|BA 117|GATE_CHANGE|m");
    expect(alertKey("u2", "BA 117", draft)).not.toBe(alertKey("u1", "BA 117", draft));
  });

  it("matches supplier summary to the job flight number and operating date", () => {
    expect(matchesJob(baseSummary(), job)).toBe(true);
    expect(matchesJob(baseSummary({ flightNumber: "BA 118" }), job)).toBe(false);
    expect(matchesJob(baseSummary({ scheduledDeparture: "2026-11-09 18:30-05:00" }), job)).toBe(false);
  });

  it("accepts legacy rows without a flight date", () => {
    expect(matchesJob(baseSummary(), { ...job, flightDate: null })).toBe(true);
  });
});

describe("isWatchSnapshot", () => {
  it("accepts client snapshots and rejects junk", () => {
    expect(isWatchSnapshot(baseSnapshot())).toBe(true);
    expect(isWatchSnapshot({})).toBe(false);
    expect(isWatchSnapshot(null)).toBe(false);
  });
});

describe("pruned snapshot recovery", () => {
  const now = Date.parse("2026-11-07T00:00:00Z");

  it("reconstructs engine identity from the watchlist row", () => {
    const snapshot = snapshotFromRow({
      user_id: "u1",
      flight_id: "BA117-2026-11-08",
      flight_number: "BA 117",
      flight_date: "2026-11-08",
      status: "SCHEDULED",
      notes: "",
      snapshot: null,
    });
    expect(snapshot.flightNumber).toBe("BA 117");
    expect(snapshot.flightDate).toBe("2026-11-08");
  });

  it("does not poll a date-only row more than a week before departure", () => {
    const hint = Date.parse("2026-12-01T12:00:00Z");
    const schedule = scheduleNextPoll(
      { flightNumber: "BA 117", flightDate: "2026-12-01" } as WatchSnapshot,
      now,
    );
    expect(schedule.atMs).toBe(hint - 7 * 24 * 60 * MIN);
    expect(schedule.priority).toBe(9);
  });

  it("schedules a recovery poll once the operating date is near", () => {
    const schedule = scheduleNextPoll(
      { flightNumber: "BA 117", flightDate: "2026-11-08" } as WatchSnapshot,
      now,
    );
    expect(schedule.atMs).not.toBeNull();
  });
});

describe("plan concurrency limits (Track A)", () => {
  const now = Date.parse("2026-11-08T00:00:00Z");
  const WINDOW = 48 * 60 * MIN; // active slot window

  it("maps plan strings to slot limits", () => {
    expect(concurrencyLimitFor("free")).toBe(PLAN_LIMITS.FREE);
    expect(concurrencyLimitFor("PLUS")).toBe(PLAN_LIMITS.PLUS);
    expect(concurrencyLimitFor("PRO")).toBe(PLAN_LIMITS.PRO);
    expect(concurrencyLimitFor(undefined)).toBe(PLAN_LIMITS.FREE);
    expect(concurrencyLimitFor("ULTRA")).toBe(PLAN_LIMITS.FREE);
  });

  it("enforces the free-plan concurrency cap", () => {
    const meter = new UserMeter();
    const limit = concurrencyLimitFor("FREE");
    expect(meter.hasCapacity("u1", "AA100|2026-11-08", limit, WINDOW, 0)).toBe(true);
    meter.track("u1", "AA100|2026-11-08", now, 1);
    meter.track("u1", "BA117|2026-11-08", now, 1);
    meter.track("u1", "UA200|2026-11-08", now, 1);
    expect(meter.hasCapacity("u1", "DL900|2026-11-08", limit, WINDOW, now)).toBe(false);
  });

  it("re-polling an active slot does not consume a new one", () => {
    const meter = new UserMeter();
    const limit = concurrencyLimitFor("FREE");
    meter.track("u1", "AA100|2026-11-08", now, 1);
    meter.track("u1", "BA117|2026-11-08", now, 1);
    meter.track("u1", "UA200|2026-11-08", now, 1);
    expect(meter.hasCapacity("u1", "AA100|2026-11-08", limit, WINDOW, now)).toBe(true);
  });

  it("slots expire after the active window", () => {
    const meter = new UserMeter();
    meter.track("u1", "AA100|2026-11-08", 0, 1);
    meter.track("u1", "BA117|2026-11-08", 0, 1);
    meter.track("u1", "UA200|2026-11-08", 0, 1);
    expect(meter.hasCapacity("u1", "AA100|2026-11-08", PLAN_LIMITS.FREE, WINDOW, WINDOW + 1)).toBe(true);
  });

  it("attributes shared refresh cost per user", () => {
    const meter = new UserMeter();
    meter.track("u1", "AA100|d", now, 1);
    meter.track("u2", "AA100|d", now, 1);
    expect(meter.users()).toBe(2);
  });
});

describe("UsageTracker", () => {
  it("tracks consumption against the budget", () => {
    const tracker = new UsageTracker(10);
    expect(tracker.overBudget).toBe(false);
    tracker.add(4);
    expect(tracker.unitsUsed).toBe(4);
    expect(tracker.overBudget).toBe(false);
    tracker.add(8);
    expect(tracker.unitsUsed).toBe(12);
    expect(tracker.overBudget).toBe(true);
    expect(tracker.snapshot().unitsBudget).toBe(10);
  });

  it("ignores non-positive additions", () => {
    const tracker = new UsageTracker(10);
    tracker.add(0);
    tracker.add(-3);
    tracker.add(Number.NaN);
    expect(tracker.unitsUsed).toBe(0);
  });
});

describe("SupabaseServer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const serverConfig = loadConfig({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    SUPABASE_URL: "https://example.supabase.co/",
    SUPABASE_SECRET_KEY: "sb_secret_test",
  });

  it("is ready only with both URL and secret key", () => {
    expect(new SupabaseServer(serverConfig).ready).toBe(true);
    expect(new SupabaseServer(loadConfig({ NODE_ENV: "test" })).ready).toBe(false);
  });

  it("reads the watchlist through PostgREST without double fetches", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              user_id: "u1",
              flight_id: "BA117",
              flight_number: "BA 117",
              flight_date: "2026-11-08",
              status: "SCHEDULED",
              notes: "",
              next_poll_at: "2026-11-07T00:00:00Z",
              poll_priority: 4,
              snapshot: baseSnapshot(),
            },
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const rows = await new SupabaseServer(serverConfig).listWatchlist(1000);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.flight_number).toBe("BA 117");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/rest/v1/watchlist_items?next_poll_at=lte.");
    expect((options as RequestInit).headers).toMatchObject({
      Authorization: "Bearer sb_secret_test",
      Prefer: "return=minimal",
    });
  });

  it("fetches plan tiers for a user batch", async () => {
    const planMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          { id: "u1", plan: "PLUS" },
          { id: "u2", plan: null },
        ]),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", planMock);
    const plans = await new SupabaseServer(serverConfig).listUserPlans(["u1", "u2"]);
    expect(plans.get("u1")).toBe("PLUS");
    expect(plans.get("u2")).toBe("FREE");
    const url = planMock.mock.calls[0]?.[0] as string;
    expect(url).toContain("/rest/v1/profiles?select=id,plan&id=in.(");
    expect(url).toContain('"u1"'); // PostgREST lists require quoted id values
  });

  it("patches a snapshot + ladder and inserts dedupe-safe alerts", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const server = new SupabaseServer(serverConfig);
    await server.write(
      { user_id: "u1", flight_id: "BA117" },
      {
        snapshot: { flightNumber: "BA 117" },
        status: "DEPARTED",
        alerts: [
          { user_id: "u1", flight_number: "BA 117", alert_type: "GATE_CHANGE", title: "t", message: "m", is_read: false },
        ],
        nextPollAt: 1_727_000_000_000,
        pollPriority: 1,
      },
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [patchUrl, patchInit] = fetchMock.mock.calls[0]!;
    expect(patchUrl).toContain("/rest/v1/watchlist_items?");
    expect((patchInit as RequestInit).method).toBe("PATCH");
    expect(JSON.parse(String((patchInit as RequestInit).body))).toMatchObject({
      next_poll_at: new Date(1_727_000_000_000).toISOString(),
      poll_priority: 1,
    });
    const [postUrl, postInit] = fetchMock.mock.calls[1]!;
    expect(postUrl).toContain("/rest/v1/flight_alerts");
    expect((postInit as RequestInit).method).toBe("POST");
    expect((postInit as RequestInit).headers).toMatchObject({
      Prefer: "return=minimal,resolution=ignore-duplicates",
    });
  });
});
