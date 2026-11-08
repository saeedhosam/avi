import { describe, expect, it } from "vitest";
import {
  classifyHaul,
  clamp,
  estimateDurationMinutes,
  flightDateLabel,
  formatDuration,
  geodesicDistanceKm,
  kmToNm,
  normalizeFlightNumber,
  splitFlightQuery,
  statusLabel,
} from "../src/lib/utils";

describe("Web Utils", () => {
  describe("clamp", () => {
    it("clamps values between min and max", () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
    });
  });

  describe("normalizeFlightNumber", () => {
    it("strips whitespace, hyphens, and uppercases", () => {
      expect(normalizeFlightNumber(" ba 123 ")).toBe("BA123");
      expect(normalizeFlightNumber("ua-456")).toBe("UA456");
      expect(normalizeFlightNumber("af 001")).toBe("AF001");
      expect(normalizeFlightNumber("lh-789a")).toBe("LH789A");
    });
  });

  describe("formatDuration", () => {
    it("formats minutes into hours and minutes", () => {
      expect(formatDuration(45)).toBe("45m");
      expect(formatDuration(60)).toBe("1h 00m");
      expect(formatDuration(95)).toBe("1h 35m");
      expect(formatDuration(615)).toBe("10h 15m");
    });
  });

  describe("classifyHaul", () => {
    it("categorizes distances correctly", () => {
      expect(classifyHaul(500)).toBe("SHORT_HAUL");
      expect(classifyHaul(1499)).toBe("SHORT_HAUL");
      expect(classifyHaul(1500)).toBe("MEDIUM_HAUL");
      expect(classifyHaul(4000)).toBe("MEDIUM_HAUL");
      expect(classifyHaul(4001)).toBe("LONG_HAUL");
    });
  });

  describe("estimateDurationMinutes", () => {
    it("computes reasonable duration with minimum floor", () => {
      expect(estimateDurationMinutes(100)).toBe(45); // clamped to floor 45 min
      const transat = estimateDurationMinutes(5500);
      expect(transat).toBeGreaterThan(400);
      expect(transat).toBeLessThan(500);
    });
  });

  describe("geodesicDistanceKm & kmToNm", () => {
    it("computes accurate distance between known airports (LHR to JFK)", () => {
      // LHR: 51.4700, -0.4543 | JFK: 40.6413, -73.7781
      const distKm = geodesicDistanceKm(51.47, -0.4543, 40.6413, -73.7781);
      expect(distKm).toBeGreaterThan(5500);
      expect(distKm).toBeLessThan(5600);

      const nm = kmToNm(distKm);
      expect(nm).toBeGreaterThan(2950);
      expect(nm).toBeLessThan(3050);
    });
  });

  describe("statusLabel", () => {
    it("returns standard label or delayed label with minutes", () => {
      expect(statusLabel("SCHEDULED")).toBe("Scheduled");
      expect(statusLabel("DELAYED", 0)).toBe("Delayed");
      expect(statusLabel("DELAYED", 45)).toBe("+45m Delayed");
      expect(statusLabel("LANDED")).toBe("Landed");
    });
  });

  describe("flightDateLabel", () => {
    it("formats ISO date into day and short month", () => {
      expect(flightDateLabel("2026-03-13")).toBe("13 MAR");
      expect(flightDateLabel("2026-11-08")).toBe("8 NOV");
      expect(flightDateLabel(null)).toBe("");
    });
  });

  describe("splitFlightQuery", () => {
    it("parses combined flight number and ISO date", () => {
      const res = splitFlightQuery("BA286 2026-03-13");
      expect(res.number).toBe("BA286");
      expect(res.date).toBe("2026-03-13");
    });

    it("parses alphanumeric month date like 'AA123, 13-MAR'", () => {
      const res = splitFlightQuery("AA123, 13-MAR");
      expect(res.number).toBe("AA123");
      expect(res.date).toMatch(/\d{4}-03-13/);
    });

    it("returns plain flight number when no date is present", () => {
      const res = splitFlightQuery("AF001");
      expect(res.number).toBe("AF001");
      expect(res.date).toBeNull();
    });
  });
});
