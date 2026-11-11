import { describe, expect, it } from "vitest";
import { buildChangeAlerts } from "../src/lib/store";
import type { Flight } from "../src/lib/types";

const mockWeather = {
  tempC: 20,
  tempF: 68,
  condition: "Clear",
  wind: "5 kt",
  visibility: "10 mi",
  humidity: 50,
};

const mockOrigin = {
  code: "JFK",
  name: "John F. Kennedy",
  city: "New York",
  country: "USA",
  timezone: "America/New_York",
  latitude: 40.6413,
  longitude: -73.7781,
  weather: mockWeather,
};

const mockDest = {
  code: "LHR",
  name: "London Heathrow",
  city: "London",
  country: "UK",
  timezone: "Europe/London",
  latitude: 51.47,
  longitude: -0.4543,
  weather: mockWeather,
};

const baseFlight: Flight = {
  id: "BA123",
  flightNumber: "BA123",
  airline: "British Airways",
  airlineCode: "BA",
  origin: mockOrigin,
  destination: mockDest,
  departureTimeScheduled: "10:00",
  departureTimeEstimated: "10:00",
  departureTimeActual: null,
  arrivalTimeScheduled: "22:00",
  arrivalTimeEstimated: "22:00",
  arrivalTimeActual: null,
  status: "SCHEDULED",
  statusReported: true,
  statusRaw: "Scheduled",
  statusNote: "On time",
  delayMinutes: 0,
  delayReported: true,
  delaySource: "derived",
  delayReason: null,
  terminalDeparture: "5",
  gateDeparture: "Gate A10",
  checkInCounter: "Desks 1-4",
  terminalArrival: "7",
  gateArrival: "Gate 12",
  baggageCarousel: "Carousel 3",
  aircraft: {
    model: "A350-1000",
    registration: "G-XWBA",
    age: "3 years",
    wifiAvailable: true,
    powerOutlets: true,
    seatLayout: "3-3-3",
  },
  telemetry: {
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
    hasLiveLocation: false,
  },
  timeline: [],
  isWatchlisted: true,
  customNotes: "",
};

describe("Web Store State Differ (buildChangeAlerts)", () => {
  it("emits no alerts when flight state is unchanged", () => {
    const alerts = buildChangeAlerts(baseFlight, { ...baseFlight });
    expect(alerts.length).toBe(0);
  });

  it("detects gate change and generates GATE_CHANGE alert", () => {
    const next: Flight = {
      ...baseFlight,
      gateDeparture: "Gate B22",
    };
    const alerts = buildChangeAlerts(baseFlight, next);
    expect(alerts.length).toBe(1);
    expect(alerts[0]!.type).toBe("GATE_CHANGE");
    expect(alerts[0]!.message).toContain("Gate A10 to Gate B22");
  });

  it("detects delay increase and generates DELAY alert", () => {
    const next: Flight = {
      ...baseFlight,
      status: "DELAYED",
      delayMinutes: 45,
      departureTimeEstimated: "10:45",
    };
    const alerts = buildChangeAlerts(baseFlight, next);
    expect(alerts.length).toBe(1);
    expect(alerts[0]!.type).toBe("DELAY");
    expect(alerts[0]!.message).toContain("delayed by 45 minutes");
  });

  it("detects boarding transition and generates BOARDING alert", () => {
    const next: Flight = {
      ...baseFlight,
      status: "BOARDING",
    };
    const alerts = buildChangeAlerts(baseFlight, next);
    expect(alerts.length).toBe(1);
    expect(alerts[0]!.type).toBe("BOARDING");
    expect(alerts[0]!.message).toContain("Boarding has started");
  });

  it("detects flight cancellation and generates CANCELLATION alert", () => {
    const next: Flight = {
      ...baseFlight,
      status: "CANCELLED",
      delayReason: "Air traffic control strike",
    };
    const alerts = buildChangeAlerts(baseFlight, next);
    expect(alerts.length).toBe(1);
    expect(alerts[0]!.type).toBe("CANCELLATION");
    expect(alerts[0]!.message).toContain("has been cancelled");
  });

  it("detects baggage carousel assignment on landing", () => {
    const landedFlight: Flight = {
      ...baseFlight,
      status: "LANDED",
      baggageCarousel: "Carousel TBD",
    };
    const updatedCarousel: Flight = {
      ...landedFlight,
      baggageCarousel: "Carousel 7",
    };
    const alerts = buildChangeAlerts(landedFlight, updatedCarousel);
    expect(alerts.length).toBe(1);
    expect(alerts[0]!.type).toBe("BAGGAGE");
    expect(alerts[0]!.message).toContain("Carousel 7");
  });
});
