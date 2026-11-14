import { describe, expect, it } from "vitest";
import type { Flight } from "../src/models/flight.js";
import {
  diffFlights,
  evaluateTightConnection,
} from "../src/services/flightStateDiffer.js";
import { geodesicDistanceKm, interpolateGreatCircle } from "../src/services/geodesic.js";

function flight(overrides: Partial<Flight> = {}): Flight {
  const base: Flight = {
    id: "BA117-2026-11-14",
    flightDate: "2026-11-14",
    flightNumber: "BA 117",
    airline: "British Airways",
    airlineCode: "BA",
    origin: {
      code: "JFK",
      name: "John F. Kennedy International",
      city: "New York",
      country: "US",
      timezone: "America/New_York",
      latitude: 40.6413,
      longitude: -73.7781,
      weather: {
        tempC: 10,
        tempF: 50,
        condition: "Clear",
        wind: "5 kt W",
        visibility: "10+ mi",
        humidity: 40,
      },
      weatherReported: true,
    },
    destination: {
      code: "LHR",
      name: "London Heathrow",
      city: "London",
      country: "GB",
      timezone: "Europe/London",
      latitude: 51.47,
      longitude: -0.4543,
      weather: {
        tempC: 12,
        tempF: 54,
        condition: "Cloudy",
        wind: "8 kt SW",
        visibility: "10+ mi",
        humidity: 70,
      },
      weatherReported: true,
    },
    departureTimeScheduled: "18:30",
    departureTimeEstimated: "18:30",
    departureTimeActual: null,
    arrivalTimeScheduled: "06:20",
    arrivalTimeEstimated: "06:20",
    arrivalTimeActual: null,
    status: "SCHEDULED",
    statusReported: true,
    statusRaw: "Scheduled",
    statusNote: "Scheduled",
    delayMinutes: 0,
    delayReported: true,
    delaySource: "provider",
    delayReason: null,
    terminalDeparture: "T8",
    gateDeparture: "Gate B22",
    checkInCounter: "—",
    terminalArrival: "T5",
    gateArrival: "Gate TBD",
    baggageCarousel: "Carousel TBD",
    aircraft: {
      model: "Boeing 777-300ER",
      registration: "G-STBA",
      age: "8 years",
      wifiAvailable: true,
      powerOutlets: true,
      seatLayout: null,
    },
    telemetry: {
      hasLiveLocation: false,
      currentLatitude: 0,
      currentLongitude: 0,
      altitudeFeet: 0,
      groundSpeedKnots: 0,
      headingDegrees: 0,
      verticalSpeedFpm: 0,
      mach: 0,
      progressPercent: 0,
      distanceCoveredNm: 0,
      distanceRemainingNm: 0,
      etaMinutesRemaining: 0,
      waypoints: [],
    },
    timeline: [],
    isWatchlisted: true,
    customNotes: "",
    source: "AERODATABOX",
    fetchedAt: "2026-11-14T10:00:00.000Z",
  };
  return {
    ...base,
    ...overrides,
    origin: { ...base.origin, ...(overrides.origin ?? {}) },
    destination: { ...base.destination, ...(overrides.destination ?? {}) },
    aircraft: { ...base.aircraft, ...(overrides.aircraft ?? {}) },
    telemetry: { ...base.telemetry, ...(overrides.telemetry ?? {}) },
  };
}

let counter = 0;
const idFactory = () => `test-${++counter}`;
const now = new Date("2026-11-14T10:00:00Z");

describe("flightStateDiffer", () => {
  it("emits a gate alert only for a real reassignment", () => {
    counter = 0;
    const alerts = diffFlights(flight(), flight({ gateDeparture: "Gate B24" }), {
      now,
      idFactory,
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      type: "GATE_CHANGE",
      flightNumber: "BA 117",
      id: "test-1",
    });
    expect(alerts[0]?.message).toContain("B22");
    expect(alerts[0]?.message).toContain("B24");
  });

  it("does not alert when the previous gate was TBD", () => {
    const alerts = diffFlights(
      flight({ gateDeparture: "Gate TBD" }),
      flight({ gateDeparture: "Gate B24" }),
      { now, idFactory },
    );
    expect(alerts).toHaveLength(0);
  });

  it("emits terminal changes separately", () => {
    const alerts = diffFlights(
      flight(),
      flight({ terminalArrival: "T3" }),
      { now, idFactory },
    );
    expect(alerts.map((alert) => alert.type)).toEqual(["TERMINAL_CHANGE"]);
    expect(alerts[0]?.message).toContain("T5");
    expect(alerts[0]?.message).toContain("T3");
  });

  it("emits a delay alert only when the increase reaches the threshold", () => {
    const small = diffFlights(
      flight({ delayMinutes: 10 }),
      flight({ delayMinutes: 20, status: "DELAYED" }),
      { now, idFactory, delayThresholdMinutes: 15 },
    );
    expect(small).toHaveLength(0);

    const large = diffFlights(
      flight({ delayMinutes: 10 }),
      flight({ delayMinutes: 25, status: "DELAYED" }),
      { now, idFactory, delayThresholdMinutes: 15 },
    );
    expect(large.some((alert) => alert.type === "DELAY")).toBe(true);
  });

  it("emits baggage and landing alerts with honest missing-belt copy", () => {
    const alerts = diffFlights(
      flight({ baggageCarousel: "Carousel 4", status: "DEPARTED" }),
      flight({
        baggageCarousel: "Carousel 7",
        status: "LANDED",
        gateArrival: "Gate T5A",
      }),
      { now, idFactory },
    );
    expect(alerts.map((alert) => alert.type)).toEqual(["BAGGAGE", "BAGGAGE"]);
    expect(alerts[0]?.message).toContain("London");
    expect(alerts[1]?.message).toContain("Carousel 7");
  });

  it("crosses midnight for tight connections", () => {
    expect(evaluateTightConnection({ arrivalTime: "23:50", boardingTime: "00:20" })).toMatchObject({
      minutesBetween: 30,
      isTight: true,
      isCritical: false,
    });
  });
});

describe("geodesic", () => {
  it("calculates the JFK–LHR great-circle distance", () => {
    const km = geodesicDistanceKm(40.6413, -73.7781, 51.47, -0.4543);
    expect(km).toBeGreaterThan(5_400);
    expect(km).toBeLessThan(5_700);
  });

  it("interpolates endpoints and the midpoint", () => {
    expect(interpolateGreatCircle({ latitude: 0, longitude: 0 }, { latitude: 10, longitude: 10 }, 0)).toEqual({
      latitude: 0,
      longitude: 0,
    });
    expect(interpolateGreatCircle({ latitude: 0, longitude: 0 }, { latitude: 10, longitude: 10 }, 1)).toEqual({
      latitude: 10,
      longitude: 10,
    });
    const mid = interpolateGreatCircle({ latitude: 0, longitude: 0 }, { latitude: 10, longitude: 10 }, 0.5);
    expect(mid.latitude).toBeGreaterThan(4);
    expect(mid.latitude).toBeLessThan(6);
  });
});
