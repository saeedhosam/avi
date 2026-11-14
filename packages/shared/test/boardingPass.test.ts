import { describe, expect, it } from "vitest";
import {
  boardingPassGatewayPath,
  julianDateToIso,
  parseBoardingPass,
  resolveJulianFlightDate,
} from "../src/services/boardingPassParser.js";

/**
 * Builds an M1 BCBP string at the exact field offsets defined by IATA RP 792.
 * 57 mandatory characters; optional variable data is omitted.
 */
function buildBcbp(overrides: {
  name?: string;
  pnr?: string;
  origin?: string;
  destination?: string;
  carrier?: string;
  flight?: string;
  julian?: string;
  compartment?: string;
  seat?: string;
  sequence?: string;
} = {}): string {
  const pad = (value: string, length: number) =>
    value.padEnd(length, " ").slice(0, length);
  return [
    "M1",
    pad(overrides.name ?? "DOE/JANE", 20),
    "E",
    pad(overrides.pnr ?? "ABC123", 7),
    overrides.origin ?? "JFK",
    overrides.destination ?? "LHR",
    pad(overrides.carrier ?? "BA ", 3),
    (overrides.flight ?? "00117").padStart(5, "0"),
    overrides.julian ?? "318",
    overrides.compartment ?? "Y",
    (overrides.seat ?? "014A").padStart(4, " "),
    (overrides.sequence ?? "0123").padStart(4, "0"),
    "0",
  ].join("");
}

describe("IATA BCBP parser", () => {
  it("parses a valid M1 boarding pass entirely on-device", () => {
    const pass = parseBoardingPass(buildBcbp(), {
      format: "PDF417",
      now: new Date("2026-11-14T09:00:00Z"),
    });
    expect(pass.valid).toBe(true);
    expect(pass).toMatchObject({
      format: "PDF417",
      passengerName: "DOE/JANE",
      pnr: "ABC123",
      airlineCode: "BA",
      flightNumber: "117",
      julianDate: 318,
      flightDate: "2026-11-14",
      origin: "JFK",
      destination: "LHR",
      seatNumber: "14A",
      cabinClass: "ECONOMY",
      sequenceNumber: "123",
    });
    expect(boardingPassGatewayPath(pass)).toBe(
      "/api/gateway/flights/BA117/2026-11-14",
    );
  });

  it("normalizes leading-zero seat fields", () => {
    const pass = parseBoardingPass(buildBcbp({ seat: "014A" }));
    expect(pass.seatNumber).toBe("14A");
  });

  it("finds the M1 header inside a larger QR payload", () => {
    const raw = `https://example.test/checkin?bcbp=${buildBcbp()}`;
    const pass = parseBoardingPass(raw, { format: "QR" });
    expect(pass.valid).toBe(true);
    expect(pass.origin).toBe("JFK");
  });

  it("rejects non-BCBP data without inventing fields", () => {
    const pass = parseBoardingPass("not a boarding pass");
    expect(pass.valid).toBe(false);
    expect(pass.warnings[0]).toMatch(/BCBP/);
    expect(pass.origin).toBe("");
  });

  it("resolves Julian dates around the new year", () => {
    expect(julianDateToIso(1, 2026)).toBe("2026-01-01");
    expect(resolveJulianFlightDate(1, new Date("2026-11-14T00:00:00Z"))).toBe(
      "2027-01-01",
    );
    expect(resolveJulianFlightDate(365, new Date("2026-01-01T00:00:00Z"))).toBe(
      "2025-12-31",
    );
  });

  it("reports multi-leg passes explicitly", () => {
    const raw = buildBcbp();
    const multi = `${raw.slice(0, 1)}2${raw.slice(2)}`;
    const pass = parseBoardingPass(multi);
    expect(pass.warnings).toContain("Multi-leg pass; only the first leg is parsed.");
  });
});
