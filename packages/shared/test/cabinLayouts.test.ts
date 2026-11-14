import { describe, expect, it } from "vitest";
import {
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
    expect(normalizeAircraftType("Embraer E195")).toBe("GENERIC");
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
