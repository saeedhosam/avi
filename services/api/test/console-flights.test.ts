import { describe, expect, it } from "vitest";
import {
  inferRegionFromCoords,
  mapConsoleFids,
  mapConsoleFlight,
  type AeroFlightDto,
} from "../src/providers/console-flights.js";
import { loadConfig } from "../src/config.js";
import { ConsoleFlightProvider } from "../src/providers/console-flights.js";

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
    expect(flight!.id).toBe("AA100");
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

  it("builds a timeline with gate assignment events", () => {
    const flight = mapConsoleFlight(departureDto)!;
    const titles = flight.timeline.map((event) => event.title);
    expect(titles).toContain("Scheduled departure");
    expect(titles).toContain("Departure gate assigned");
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
});
