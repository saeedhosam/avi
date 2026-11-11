import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { ProviderCache } from "../src/lib/provider-cache.js";
import {
  addDays,
  createScheduleProvider,
  FlightAwareScheduleProvider,
  ScheduleService,
  UnavailableScheduleProvider,
} from "../src/providers/schedule.js";

function flightAwareConfig() {
  return loadConfig({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    SCHEDULE_PROVIDER: "flightaware",
    FLIGHTAWARE_API_KEY: "k".repeat(24),
  });
}

const fixture = {
  links: null,
  num_pages: 1,
  scheduled: [
    {
      ident: "BAW117",
      ident_iata: "BA117",
      actual_ident: null,
      actual_ident_iata: null,
      aircraft_type: "B77W",
      scheduled_out: "2026-11-12T18:30:00Z",
      scheduled_in: "2026-11-13T06:35:00Z",
      origin: "EGLL",
      origin_iata: "LHR",
      destination: "KJFK",
      destination_iata: "JFK",
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("schedule provider selection", () => {
  it("reports schedules as explicitly unavailable when no provider is configured", async () => {
    const config = loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent" });
    const service = new ScheduleService(createScheduleProvider(config));
    expect(service.id).toBe("none");
    expect(service.configured).toBe(false);
    const result = await service.lookup({
      origin: "LHR",
      destination: "JFK",
      days: 7,
    });
    expect(result.status).toBe("unavailable");
    expect(result.source).toBe("none");
    expect(result.reason).toBe("no_schedule_provider_configured");
    expect(result.flights).toEqual([]);
    expect(result.validFrom).toBeNull();
  });

  it("reports missing credentials instead of pretending the source is live", async () => {
    const config = loadConfig({
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      SCHEDULE_PROVIDER: "flightaware",
    });
    const provider = new FlightAwareScheduleProvider(config);
    expect(provider.configured).toBe(false);
    const result = await provider.lookup({
      origin: "LHR",
      destination: "JFK",
      days: 7,
    });
    expect(result.status).toBe("unavailable");
    expect(result.reason).toBe("schedule_provider_credentials_missing");
  });

  it("adds days in UTC across month boundaries", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("FlightAwareScheduleProvider", () => {
  it("maps published schedules with an explicit time basis and window", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new FlightAwareScheduleProvider(
      flightAwareConfig(),
      new ProviderCache(),
    );
    const result = await provider.lookup({
      origin: "LHR",
      destination: "JFK",
      date: "2026-11-12",
      days: 1,
    });

    expect(result.status).toBe("verified");
    expect(result.source).toBe("flightaware");
    expect(result.timeBasis).toBe("utc");
    expect(result.validFrom).toBe("2026-11-12");
    expect(result.validTo).toBe("2026-11-12");
    expect(result.flights).toHaveLength(1);
    expect(result.flights[0]).toMatchObject({
      ident: "BAW117",
      identIata: "BA117",
      origin: "LHR",
      destination: "JFK",
      serviceDate: "2026-11-12",
      aircraftType: "B77W",
      scheduledOut: "2026-11-12T18:30:00Z",
    });

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("/schedules/2026-11-12/2026-11-13");
    expect(url).toContain("origin=LHR");
    expect(url).toContain("destination=JFK");
  });

  it("treats an empty published window as verified-empty, not invented flights", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ scheduled: [], num_pages: 1 }), {
          status: 200,
        }),
      ),
    );
    const provider = new FlightAwareScheduleProvider(
      flightAwareConfig(),
      new ProviderCache(),
    );
    const result = await provider.lookup({
      origin: "LHR",
      destination: "JFK",
      date: "2026-11-12",
      days: 1,
    });
    expect(result.status).toBe("verified");
    expect(result.flights).toEqual([]);
    expect(result.reason).toBeNull();
  });

  it("maps provider failures to explicit unavailable reasons", async () => {
    const cases: Array<[number, string]> = [
      [400, "provider_rejected_query"],
      [401, "provider_auth_failed"],
      [404, "route_not_found"],
      [429, "provider_quota_exhausted"],
      [502, "provider_http_502"],
    ];
    for (const [status, reason] of cases) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(null, { status })),
      );
      const provider = new FlightAwareScheduleProvider(
        flightAwareConfig(),
        new ProviderCache(),
      );
      const result = await provider.lookup({
        origin: "LHR",
        destination: "JFK",
        date: "2026-11-12",
        days: 1,
      });
      expect(result.status).toBe("unavailable");
      expect(result.reason).toBe(reason);
      expect(result.flights).toEqual([]);
    }
  });

  it("does not cache an unavailable outcome", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new FlightAwareScheduleProvider(
      flightAwareConfig(),
      new ProviderCache(),
    );
    await provider.lookup({
      origin: "LHR",
      destination: "JFK",
      date: "2026-11-12",
      days: 1,
    });
    await provider.lookup({
      origin: "LHR",
      destination: "JFK",
      date: "2026-11-12",
      days: 1,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a malformed provider payload instead of serving it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{not-json", { status: 200 })),
    );
    const provider = new FlightAwareScheduleProvider(
      flightAwareConfig(),
      new ProviderCache(),
    );
    const result = await provider.lookup({
      origin: "LHR",
      destination: "JFK",
      date: "2026-11-12",
      days: 1,
    });
    expect(result.status).toBe("unavailable");
    expect(result.reason).toBe("provider_payload_invalid");
  });

  it("flags rows outside the requested route/window as partial", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            scheduled: [
              fixture.scheduled[0],
              { ...fixture.scheduled[0], destination_iata: "BOS" },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    const provider = new FlightAwareScheduleProvider(
      flightAwareConfig(),
      new ProviderCache(),
    );
    const result = await provider.lookup({
      origin: "LHR",
      destination: "JFK",
      date: "2026-11-12",
      days: 1,
    });
    expect(result.status).toBe("partial");
    expect(result.omittedFlights).toBe(1);
    expect(result.flights).toHaveLength(1);
  });

  it("serves a repeated query from the shared cache without a second provider call", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(fixture), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new FlightAwareScheduleProvider(
      flightAwareConfig(),
      new ProviderCache(),
    );
    await provider.lookup({
      origin: "LHR",
      destination: "JFK",
      date: "2026-11-12",
      days: 1,
    });
    const second = await provider.lookup({
      origin: "LHR",
      destination: "JFK",
      date: "2026-11-12",
      days: 1,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.cached).toBe(true);
    expect(second.flights).toHaveLength(1);
  });
});

describe("UnavailableScheduleProvider", () => {
  it("never synthesizes operating days", async () => {
    const provider = new UnavailableScheduleProvider();
    const result = await provider.lookup({
      origin: "LHR",
      destination: "JFK",
      days: 7,
    });
    expect(result.flights).toEqual([]);
    expect(result.status).toBe("unavailable");
    expect(result.timeBasis).toBeNull();
  });
});
