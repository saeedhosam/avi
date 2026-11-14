import { describe, expect, it } from "vitest";
import type { AirlineCabinLayoutOverride } from "../src/models/cabin.js";
import {
  findCuratedAirlineLayout,
  normalizeAircraftType,
  parseSeatNumber,
  resolveCabinLayout,
  resolveSeat,
} from "../src/services/cabinLayouts.js";

describe("cabin layouts", () => {
  it("recognizes common aircraft type aliases", () => {
    expect(normalizeAircraftType("Boeing 777-300ER")).toBe("B77W");
    expect(normalizeAircraftType("A380-800")).toBe("A388");
    expect(normalizeAircraftType("B787-9")).toBe("B789");
    expect(normalizeAircraftType("Airbus A320neo")).toBe("A320");
    expect(normalizeAircraftType("Boeing 737-800")).toBe("B738");
    expect(normalizeAircraftType("B737")).toBe("B738");
    expect(normalizeAircraftType("B738")).toBe("B738");
    expect(normalizeAircraftType("738")).toBe("B738");
    expect(normalizeAircraftType("Embraer E195")).toBe("GENERIC");
  });

  it("builds a narrowbody 737-800 preset", () => {
    const layout = resolveCabinLayout("B738");
    expect(layout.decks).toHaveLength(1);
    expect(layout.decks[0]?.columns).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(layout.seats.length).toBeGreaterThan(150);
    expect(layout.overheadBins[0]?.aircraftType).toBe("B738");
    expect(layout.decks[0]?.seatClasses).toEqual(["BUSINESS", "ECONOMY"]);
    expect(layout.isExact).toBe(false);
  });

  it("falls back to the parametric layout for an unsourced airline", () => {
    const layout = resolveCabinLayout("B738", { airlineCode: "ZZ" });
    expect(layout.aircraftType).toBe("B738");
    expect(layout.source).toBe("PARAMETRIC");
    expect(layout.isExact).toBe(false);
    expect(layout.disclaimer).toMatch(/not a certified cabin plan/);
  });

  it("accepts only explicit, sourced airline overrides", () => {
    const base = resolveCabinLayout("A320");
    const override: AirlineCabinLayoutOverride = {
      airlineCode: "ZZ",
      airlineName: "Example Air",
      aircraftType: "Airbus A320",
      source: "CURATED",
      provenance: {
        document: "Example Air A320 seat map",
        url: "https://example.test/a320-seat-map.pdf",
        verifiedAt: "2026-11-14",
      },
      layout: {
        ...base,
        layoutKey: "ZZ-A320-v1",
        source: "CURATED",
        isExact: true,
      },
    };
    expect(
      findCuratedAirlineLayout("A320", "zz", [override])?.layout.layoutKey,
    ).toBe("ZZ-A320-v1");
    expect(findCuratedAirlineLayout("B738", "ZZ", [override])).toBeNull();
    expect(findCuratedAirlineLayout("A320", "AA", [override])).toBeNull();
  });

  it("builds a two-deck layout for the A380", () => {
    const layout = resolveCabinLayout("A388");
    expect(layout.decks).toHaveLength(2);
    expect(layout.seats.length).toBeGreaterThan(300);
    expect(layout.overheadBins[0]?.aircraftType).toBe("A388");
    expect(layout.isExact).toBe(false);
  });

  it("resolves 14A with window, legroom, and power details", () => {
    const layout = resolveCabinLayout("B77W");
    const resolved = resolveSeat(layout, "14A");
    expect(resolved.seat).toMatchObject({
      row: 14,
      letter: "A",
      windowAlignment: "FULL_WINDOW",
      seatClass: "PREMIUM_ECONOMY",
      hasPowerOutlet: true,
    });
    expect(resolved.windowNote).toMatch(/Full window/);
    expect(resolved.legroomNote).toContain("pitch");
    expect(resolved.distanceToLavatoryMeters).not.toBeNull();
    expect(resolved.nearbyFeatures.length).toBeGreaterThan(0);
  });

  it("marks an unknown seat without inventing details", () => {
    const layout = resolveCabinLayout("A320");
    const resolved = resolveSeat(layout, "99Z");
    expect(resolved.seat).toBeNull();
    expect(resolved.windowNote).toMatch(/not found/i);
  });

  it("parses seat numbers safely", () => {
    expect(parseSeatNumber("014a")).toEqual({ row: 14, letter: "A" });
    expect(parseSeatNumber("Z14")).toBeNull();
  });
});
