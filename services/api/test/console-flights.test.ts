import { afterEach, describe, expect, it, vi } from "vitest";
import {
  inferRegionFromCoords,
  mapAirportCoverage,
  mapConsoleAircraft,
  mapConsoleAirportInfo,
  mapConsoleFids,
  mapConsoleFlight,
  mapFlightDates,
  mapFlightDelays,
  type AeroFlightDto,
} from "../src/providers/console-flights.js";
import { loadConfig } from "../src/config.js";
import { ConsoleFlightProvider } from "../src/providers/console-flights.js";
import { AeroDataBoxClient } from "../src/providers/aero-client.js";
import { ProviderCache, type ProviderCacheRedis } from "../src/lib/provider-cache.js";

const departureDto: AeroFlightDto = {
  number: "AA 100",
  status: "Delayed",
  airline: { name: "American Airlines", iata: "AA" },
  aircraft: { reg: "N732AN", model: "Boeing 777-300ER" },
  departure: {
    airport: {
      iata: "JFK",
      name: "John F. Kennedy",
      municipalityName: "New York",
      countryCode: "US",
      timeZone: "America/New_York",
      location: { lat: 40.6413, lon: -73.7781 },
    },
    scheduledTime: { local: "2026-11-08 18:30-05:00" },
    revisedTime: { local: "2026-11-08 19:05-05:00" },
    terminal: "8",
    gate: "B14",
    checkInDesk: "12-18",
  },
  arrival: {
    airport: {
      iata: "LHR",
      name: "London Heathrow",
      municipalityName: "London",
      countryCode: "GB",
      timeZone: "Europe/London",
      location: { lat: 51.47, lon: -0.4543 },
    },
    scheduledTime: { local: "2026-11-09 06:35+00:00" },
    terminal: "3",
    gate: "22",
    baggageBelt: "7",
  },
};

describe("console flight mapping (parity with the web client)", () => {
  it("maps a departure DTO with schedule, delay, gates, and operating date", () => {
    const flight = mapConsoleFlight(departureDto);
    expect(flight).not.toBeNull();
    expect(flight!.id).toBe("AA100-2026-11-08");
    expect(flight!.flightDate).toBe("2026-11-08");
    expect(flight!.flightNumber).toBe("AA 100");
    expect(flight!.airline).toBe("American Airlines");
    expect(flight!.origin.code).toBe("JFK");
    expect(flight!.destination.code).toBe("LHR");
    expect(flight!.departureTimeScheduled).toBe("18:30");
    expect(flight!.departureTimeEstimated).toBe("19:05");
    expect(flight!.status).toBe("DELAYED");
    expect(flight!.gateDeparture).toBe("Gate B14");
    expect(flight!.terminalDeparture).toBe("8");
    expect(flight!.baggageCarousel).toBe("Carousel 7");
    expect(flight!.delayMinutes).toBe(35);
    expect(flight!.statusNote).toContain("Delayed 35 mins");
  });

  it("drops flights that lack both endpoints", () => {
    expect(
      mapConsoleFlight({ number: "AA1", departure: undefined, arrival: undefined }),
    ).toBeNull();
  });

  it("maps FIDS rows with the direction fallback codes", () => {
    const flights = mapConsoleFids("JFK", { departures: [departureDto] });
    expect(flights).toHaveLength(1);
    expect(flights[0]!.origin.code).toBe("JFK");
  });

  it("does not invent gate-assignment timeline events", () => {
    const flight = mapConsoleFlight(departureDto)!;
    const titles = flight.timeline.map((event) => event.title);
    expect(titles).toContain("Scheduled departure");
    expect(titles).not.toContain("Departure gate assigned");
    expect(flight.statusReported).toBe(true);
    expect(flight.statusRaw).toBe("Delayed");
    // The provider does not report a delay reason.
    expect(flight.delayReason).toBeNull();
  });

  it("infers the same regions as the web catalog helper", () => {
    expect(inferRegionFromCoords(40.6, -73.7)).toBe("AMERICAS");
    expect(inferRegionFromCoords(29.9, 31.2)).toBe("MENA");
    expect(inferRegionFromCoords(51.4, -0.45)).toBe("EUROPE");
    expect(inferRegionFromCoords(-33.8, 151.2)).toBe("ASIA_PACIFIC");
  });
});

describe("ConsoleFlightProvider", () => {
  const configuredProvider = new ConsoleFlightProvider(
    loadConfig({
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      AERODATABOX_API_KEY: "direct-aerodatabox-key-1234567890",
    }),
  );

  it("reports not-configured without a valid key", () => {
    const unconfigured = new ConsoleFlightProvider(
      loadConfig({ AERODATABOX_API_KEY: "DEFAULT_AERODATABOX_KEY" }),
    );
    expect(unconfigured.configured).toBe(false);
    expect(configuredProvider.configured).toBe(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not report a provider 404 as live empty data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
    );
    const outcome = await configuredProvider.lookupAirportRoutes("XXX");
    expect(outcome.mode).toBe("NOT_FOUND");
    expect(outcome.routes).toEqual([]);
  });

  it("does not report a provider 204 as a verified route list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );
    const outcome = await configuredProvider.lookupAirportRoutes("CAI");
    expect(outcome.status).toBe(204);
    expect(outcome.routes).toEqual([]);
  });
});

function fakeRedis(): ProviderCacheRedis {
  const store = new Map<string, string>();
  return {
    get: async (key) => store.get(key) ?? null,
    set: async (key, value, _mode, _ttl, nx) => {
      if (nx === "NX" && store.has(key)) return null;
      store.set(key, value);
      return "OK";
    },
    del: async (key) => (store.delete(key) ? 1 : 0),
    ping: async () => "PONG",
    on: () => {},
  };
}

const cachedConfig = loadConfig({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  AERODATABOX_API_KEY: "direct-aerodatabox-key-1234567890",
});

function providerWithCache(cache: ProviderCache): ConsoleFlightProvider {
  return new ConsoleFlightProvider(
    cachedConfig,
    new AeroDataBoxClient(cachedConfig, cache),
  );
}

describe("new console provider endpoints", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serves a second replica's board lookup from the shared cache", async () => {
    const redis = fakeRedis();
    const replicaA = providerWithCache(new ProviderCache({ redis }));
    const replicaB = providerWithCache(new ProviderCache({ redis }));
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ departures: [departureDto], arrivals: [] }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const first = await replicaA.lookupAirportFids("JFK");
    const second = await replicaB.lookupAirportFids("JFK");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first.flights).toHaveLength(1);
    expect(second.cached).toBe(true);
    expect(second.flights).toHaveLength(1);
    expect(second.fetchedAt).toBe(first.fetchedAt);
  });

  it("maps published operating dates and drops invalid entries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify(["2026-11-09", "2026-11-08", "not-a-date", "2026-11-08"]),
          { status: 200 },
        ),
      ),
    );
    const provider = providerWithCache(new ProviderCache());
    const outcome = await provider.lookupFlightDates("BA117");
    expect(outcome.mode).toBe("LIVE_AERODATABOX");
    expect(outcome.dates).toEqual(["2026-11-08", "2026-11-09"]);
  });

  it("preserves missing delay-statistic fields as null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            number: "BA117",
            origins: [{ airportIcao: "EGLL", medianDelay: "00:05:00" }],
            destinations: [],
          }),
          { status: 200 },
        ),
      ),
    );
    const provider = providerWithCache(new ProviderCache());
    const outcome = await provider.lookupFlightDelays("BA117");
    expect(outcome.delays?.number).toBe("BA117");
    expect(outcome.delays?.origins[0]).toMatchObject({
      airportIcao: "EGLL",
      medianDelay: "00:05:00",
      delayIndex: null,
      numConsideredFlights: null,
    });
    expect(outcome.delays?.destinations).toEqual([]);
  });

  it("treats a malformed delay payload as an error, not an empty result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ unexpected: true }), { status: 200 }),
      ),
    );
    const provider = providerWithCache(new ProviderCache());
    const outcome = await provider.lookupFlightDelays("BA117");
    expect(outcome.mode).toBe("ERROR");
    expect(outcome.delays).toBeNull();
  });

  it("maps aircraft data and preserves unknown fields as null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            reg: "G-XLEA",
            model: "Boeing 777",
            image: { url: "https://example.test/g-xlea.jpg" },
          }),
          { status: 200 },
        ),
      ),
    );
    const provider = providerWithCache(new ProviderCache());
    const outcome = await provider.lookupAircraft("G-XLEA");
    expect(outcome.aircraft).toMatchObject({
      reg: "G-XLEA",
      model: "Boeing 777",
      active: null,
      numSeats: null,
      image: { url: "https://example.test/g-xlea.jpg" },
    });
  });

  it("does not invent a UTC timezone when the provider omits one", () => {
    const airport = mapConsoleAirportInfo(
      {
        iata: "JFK",
        icao: "KJFK",
        fullName: "John F. Kennedy International",
        location: { lat: 40.6413, lon: -73.7781 },
      },
      "JFK",
    );
    expect(airport?.timezone).toBe("");
    expect(airport?.runways).toEqual([]);
    expect(airport?.localTime).toBeNull();
  });

  it("reports Unknown feed coverage rather than assuming OK", () => {
    const coverage = mapAirportCoverage(
      { flightSchedulesFeed: { status: "OK" } },
      "JFK",
      "KJFK",
    );
    expect(coverage).toEqual({
      iata: "JFK",
      icao: "KJFK",
      schedules: "OK",
      liveUpdates: "Unknown",
      adsb: "Unknown",
    });
  });

  it("returns NOT_FOUND coverage when the catalog has no ICAO code", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const provider = providerWithCache(new ProviderCache());
    const outcome = await provider.lookupAirportCoverage("QQQ");
    expect(outcome.mode).toBe("NOT_FOUND");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("pure mappers", () => {
  it("returns null for non-array flight-date payloads", () => {
    expect(mapFlightDates({ unexpected: true })).toBeNull();
  });

  it("maps delay percentile entries even when one field is missing", () => {
    const delays = mapFlightDelays({
      number: "BA117",
      origins: [{ delayPercentiles: [{ percentile: 50 }, { delay: "00:10:00" }] }],
      destinations: [],
    });
    expect(delays?.origins[0]?.percentiles).toEqual([
      { percentile: 50, delay: null },
      { percentile: null, delay: "00:10:00" },
    ]);
  });

  it("returns null aircraft when the provider omits the registration", () => {
    expect(mapConsoleAircraft({ model: "Boeing 777" })).toBeNull();
  });
});
