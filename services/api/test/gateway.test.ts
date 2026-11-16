import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

let app: FastifyInstance;

const flightDto = {
  number: "AQ 100",
  status: "Scheduled",
  airline: { name: "Avi Air", iata: "AQ" },
  aircraft: { reg: "SU-GAA", model: "Boeing 777-300ER" },
  departure: {
    airport: {
      iata: "CAI",
      name: "Cairo International",
      municipalityName: "Cairo",
      countryCode: "EG",
      timeZone: "Africa/Cairo",
      location: { lat: 30.1219, lon: 31.4056 },
    },
    scheduledTime: { local: "2026-12-01 10:00+02:00" },
    terminal: "3",
    gate: "B14",
  },
  arrival: {
    airport: {
      iata: "DXB",
      name: "Dubai International",
      municipalityName: "Dubai",
      countryCode: "AE",
      timeZone: "Asia/Dubai",
      location: { lat: 25.2532, lon: 55.3657 },
    },
    scheduledTime: { local: "2026-12-01 15:10+04:00" },
    terminal: "3",
    gate: "A7",
    baggageBelt: "12",
  },
};

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

const openMeteoDto = {
  current: {
    time: "2026-12-01T10:00",
    temperature_2m: 24.4,
    relative_humidity_2m: 45,
    precipitation: 0,
    weather_code: 0,
    wind_speed_10m: 8.2,
    wind_direction_10m: 315,
    surface_pressure: 1012.4,
    visibility: 20_000,
  },
  hourly: {
    time: ["2026-12-01T10:00", "2026-12-01T11:00", "2026-12-01T12:00"],
    temperature_2m: [24, 25, 26],
    precipitation_probability: [0, 0, 0],
    weather_code: [0, 0, 0],
    wind_speed_10m: [8, 9, 10],
  },
  daily: {
    time: ["2026-12-01"],
    weather_code: [0],
    temperature_2m_max: [27],
    temperature_2m_min: [18],
    precipitation_probability_max: [0],
  },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeAll(async () => {
  app = await buildApp(
    loadConfig({
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      AERODATABOX_API_KEY: "gateway-test-aerodatabox-key-1234567890",
      PROVIDER_AUTH_MODE: "log",
    }),
  );
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("api.open-meteo.com")) return json(openMeteoDto);
      if (url.includes("/flights/number/AQ100/")) return json([flightDto]);
      if (url.includes("/airports/iata/CAI/stats/routes/daily")) {
        return json(routeDto);
      }
      if (url.includes("/flights/airports/iata/CAI")) {
        return json({ departures: [flightDto], arrivals: [] });
      }
      if (url.includes("/aircrafts/reg/SUGAA")) {
        return json({
          reg: "SU-GAA",
          iataType: "B77W",
          icaoCode: "B77W",
          model: "Boeing 777-300ER",
          numSeats: 346,
          ageYears: 7,
        });
      }
      return new Response(null, { status: 404 });
    }),
  );
});

describe("Avi gateway", () => {
  it("caches flight status and reports a cache hit", async () => {
    const first = await app.inject({
      method: "GET",
      url: "/api/gateway/flights/AQ100/2026-12-01",
    });
    expect(first.statusCode).toBe(200);
    const firstBody = first.json();
    expect(firstBody.mode).toBe("LIVE_AERODATABOX");
    expect(firstBody.provenance.cached).toBe(false);
    expect(firstBody.provenance.ttlSeconds).toBe(6 * 60 * 60);
    expect(firstBody.flights[0]).toMatchObject({
      id: "AQ100-2026-12-01",
      flightNumber: "AQ 100",
      origin: { code: "CAI" },
      destination: { code: "DXB" },
      gateDeparture: "Gate B14",
      baggageCarousel: "Carousel 12",
    });
    expect(first.headers["x-avi-cache"]).toBe("MISS");

    const second = await app.inject({
      method: "GET",
      url: "/api/gateway/flights/AQ100/2026-12-01",
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().provenance.cached).toBe(true);
    expect(second.headers["x-avi-cache"]).toBe("HIT");
  });

  it("maps route statistics into explorer connections with estimated durations", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/gateway/airports/CAI/routes",
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.routes).toHaveLength(1);
    expect(body.routes[0]).toMatchObject({
      id: "CAI-DXB",
      origin: { iata: "CAI" },
      destination: { iata: "DXB" },
      durationEstimated: true,
      dailyFlightsCount: 6,
      dataSource: "AERODATABOX",
      isLiveVerified: false,
    });
    expect(body.routes[0].operatingCarriers[0]).toMatchObject({
      airlineCode: "MS",
      airlineName: "EgyptAir",
      dailyFrequencies: null,
    });
    expect(body.provenance.ttlSeconds).toBe(7 * 24 * 60 * 60);
  });

  it("merges FIDS with Open-Meteo weather", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/gateway/airports/CAI/board",
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.airportCode).toBe("CAI");
    expect(body.flights[0].direction).toBe("DEPARTURE");
    expect(body.weather).toMatchObject({
      code: "CAI",
      source: "OPEN_METEO",
      tempC: 24,
      condition: "Clear Sky",
    });
    expect(body.provenance.ttlSeconds).toBe(10 * 60);
  });

  it("returns an aircraft cabin layout and caches the shape", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/gateway/aircraft/SU-GAA",
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.aircraft).toMatchObject({
      registration: "SU-GAA",
      iataType: "B77W",
      numSeats: 346,
      cabinLayoutCached: false,
    });
    expect(body.layout.aircraftType).toBe("B77W");
    expect(body.layout.seats.length).toBeGreaterThan(100);
    expect(body.layout.isExact).toBe(false);
    expect(body.provenance.ttlSeconds).toBe(30 * 24 * 60 * 60);
  });

  it("rejects malformed dates and flight numbers", async () => {
    const badDate = await app.inject({
      method: "GET",
      url: "/api/gateway/flights/AQ100/December-1",
    });
    expect(badDate.statusCode).toBe(400);
    const badNumber = await app.inject({
      method: "GET",
      url: "/api/gateway/flights/not-a-flight/2026-12-01",
    });
    expect(badNumber.statusCode).toBe(400);
  });
});
