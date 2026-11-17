import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { routeAirports } from "../src/lib/data";
import { watchRowId } from "../src/lib/supabase";
import { AIRCRAFT_PRESETS } from "../src/lib/airplane-data";
import { mapOpenMeteoToForecast } from "../src/lib/weather";
import type { Airport } from "../src/lib/types";

interface ReferenceAirportRecord {
  iata: string;
  timezone?: string;
  historical?: boolean;
}

const referenceAirports = JSON.parse(
  readFileSync(
    new URL("../src/data/global-airports.json", import.meta.url),
    "utf8",
  ),
) as ReferenceAirportRecord[];

const airport: Airport = {
  code: "JFK",
  name: "John F. Kennedy",
  city: "New York",
  country: "US",
  timezone: "America/New_York",
  latitude: 40.64,
  longitude: -73.78,
  weather: {
    tempC: 0,
    tempF: 0,
    condition: "",
    wind: "",
    visibility: "",
    humidity: 0,
  },
};

describe("data integrity guards", () => {
  it("appends the operating date to a watchlist id exactly once", () => {
    expect(
      watchRowId({
        id: "BA117-2026-11-08",
        flightNumber: "BA 117",
        flightDate: "2026-11-08",
      }),
    ).toBe("BA117-2026-11-08");
  });

  it("never generates seat availability", () => {
    for (const aircraft of AIRCRAFT_PRESETS) {
      for (const row of aircraft.rows) {
        for (const seat of row.seats) {
          expect(seat.status).toBe("UNKNOWN");
        }
      }
    }
  });

  it("does not synthesize an arrival forecast from incomplete Open-Meteo data", () => {
    expect(() =>
      mapOpenMeteoToForecast(airport, "12:00", {
        current: { temperature_2m: 20 },
      }),
    ).toThrow(/incomplete/i);
  });

  it("does not ship timezone abbreviations as reference facts", () => {
    // "CEST (UTC+2)" is wrong half the year and is not an IANA identifier.
    for (const node of referenceAirports) {
      expect(node.timezone).toBeUndefined();
    }
  });

  it("marks known closed airports as historical", () => {
    for (const iata of ["TXL", "SXF", "THF"]) {
      const node = referenceAirports.find((entry) => entry.iata === iata);
      if (!node) continue;
      expect(node.historical).toBe(true);
    }
  });

  it("ships the local glyph and sprite subsets used by the globe", () => {
    const assets = [
      "../public/map/glyphs/Noto Sans Regular/0-255.pbf",
      "../public/map/glyphs/Noto Sans Bold/0-255.pbf",
      "../public/map/glyphs/Noto Sans Italic/0-255.pbf",
      "../public/map/sprite/ofm.json",
      "../public/map/sprite/ofm.png",
      "../public/map/sprite/ofm@2x.png",
    ];
    for (const asset of assets) {
      expect(statSync(new URL(asset, import.meta.url)).size).toBeGreaterThan(0);
    }
  });

  it("limits the map catalogue to airports-routes.csv rows with coordinates", () => {
    expect(routeAirports.length).toBeGreaterThan(3000);
    expect(routeAirports.length).toBeLessThan(referenceAirports.length);
    expect(new Set(routeAirports.map((airport) => airport.iata)).size).toBe(
      routeAirports.length,
    );
    for (const airport of routeAirports) {
      expect(airport.iata).toMatch(/^[A-Z]{3}$/);
      expect(airport.destCount ?? 0).toBeGreaterThan(0);
      expect(Number.isFinite(airport.latitude)).toBe(true);
      expect(Number.isFinite(airport.longitude)).toBe(true);
      expect(airport.historical).not.toBe(true);
    }
  });
});
