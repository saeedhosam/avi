import { describe, expect, it } from "vitest";
import {
  boardingPassGatewayPath,
  julianDateToIso,
  parseBoardingPass,
  resolveJulianFlightDate,
} from "../src/services/boardingPassParser.js";

interface LegOverrides {
  pnr?: string;
  origin?: string;
  destination?: string;
  carrier?: string;
  flight?: string;
  julian?: string;
  compartment?: string;
  seat?: string;
  sequence?: string;
  status?: string;
  variableSize?: string;
}

interface BcbpOverrides extends LegOverrides {
  name?: string;
  legs?: LegOverrides[];
  /** Variable-data payload appended after the matching leg block. */
  variableData?: string[];
}

const pad = (value: string, length: number) =>
  value.padEnd(length, " ").slice(0, length);

/** Builds one fixed-width 37-character IATA RP 792 leg block. */
function buildLeg(overrides: LegOverrides = {}): string {
  return [
    pad(overrides.pnr ?? "ABC123", 7),
    overrides.origin ?? "JFK",
    overrides.destination ?? "LHR",
    pad(overrides.carrier ?? "BA ", 3),
    (overrides.flight ?? "00117").padStart(5, "0"),
    overrides.julian ?? "318",
    overrides.compartment ?? "Y",
    (overrides.seat ?? "014A").padStart(4, " "),
    (overrides.sequence ?? "0123").padStart(5, "0"),
    overrides.status ?? "0",
    overrides.variableSize ?? "00",
  ].join("");
}

/**
 * Builds the pass-level header (format, leg count, name, ET indicator) followed
 * by each leg block, with optional variable data between legs.
 */
function buildBcbp(overrides: BcbpOverrides = {}): string {
  const legs = overrides.legs ?? [overrides];
  const count = Math.min(4, Math.max(1, legs.length));
  const chunks = [
    "M",
    String(count),
    pad(overrides.name ?? "DOE/JANE", 20),
    "E",
  ];
  legs.slice(0, count).forEach((leg, index) => {
    chunks.push(buildLeg(leg));
    const variableData = overrides.variableData?.[index];
    if (variableData) chunks.push(variableData);
  });
  return chunks.join("");
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
    expect(pass.legs).toHaveLength(1);
    expect(pass.legs[0]).toMatchObject({
      index: 0,
      origin: "JFK",
      destination: "LHR",
      compartmentCode: "Y",
      seatNumber: "14A",
      valid: true,
    });
    expect(boardingPassGatewayPath(pass)).toBe(
      "/api/gateway/flights/BA117/2026-11-14",
    );
  });

  it("parses the canonical IATA RP 792 sample offsets", () => {
    const pass = parseBoardingPass(
      "M1DESMARAIS/LUC       EABC123 YULFRAAC 0834 226F001A0025 100",
      { now: new Date("2026-11-14T09:00:00Z") },
    );
    expect(pass).toMatchObject({
      passengerName: "DESMARAIS/LUC",
      pnr: "ABC123",
      origin: "YUL",
      destination: "FRA",
      airlineCode: "AC",
      flightNumber: "834",
      julianDate: 226,
      flightDate: "2026-08-14",
      seatNumber: "1A",
      cabinClass: "FIRST",
      sequenceNumber: "25",
      valid: true,
    });
    expect(pass.legs[0]).toMatchObject({
      passengerStatus: "1",
      valid: true,
    });
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
    expect(pass.legs).toEqual([]);
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

  it("parses both legs of a two-leg pass and keeps leg-one compatibility", () => {
    const pass = parseBoardingPass(
      buildBcbp({
        name: "DOE/JANE",
        legs: [
          {
            pnr: "ABC123",
            origin: "JFK",
            destination: "LHR",
            carrier: "BA ",
            flight: "00117",
            julian: "318",
            compartment: "Y",
            seat: "014A",
            sequence: "0123",
          },
          {
            pnr: "XYZ789",
            origin: "LHR",
            destination: "DXB",
            carrier: "EK ",
            flight: "00009",
            julian: "319",
            compartment: "C",
            seat: "002C",
            sequence: "0042",
          },
        ],
      }),
      { now: new Date("2026-11-14T09:00:00Z") },
    );

    expect(pass.valid).toBe(true);
    expect(pass.legs).toHaveLength(2);
    expect(pass).toMatchObject({
      origin: "JFK",
      destination: "LHR",
      airlineCode: "BA",
      flightNumber: "117",
      seatNumber: "14A",
    });
    expect(pass.legs[0]).toEqual(
      expect.objectContaining({
        index: 0,
        pnr: "ABC123",
        origin: "JFK",
        destination: "LHR",
        airlineCode: "BA",
        flightNumber: "117",
        julianDate: 318,
        flightDate: "2026-11-14",
        compartmentCode: "Y",
        cabinClass: "ECONOMY",
        seatNumber: "14A",
        sequenceNumber: "123",
      }),
    );
    expect(pass.legs[1]).toEqual(
      expect.objectContaining({
        index: 1,
        pnr: "XYZ789",
        origin: "LHR",
        destination: "DXB",
        airlineCode: "EK",
        flightNumber: "9",
        julianDate: 319,
        flightDate: "2026-11-15",
        compartmentCode: "C",
        cabinClass: "BUSINESS",
        seatNumber: "2C",
        sequenceNumber: "42",
        valid: true,
      }),
    );
  });

  it("uses each leg's variable-data size to find the next leg", () => {
    const pass = parseBoardingPass(
      buildBcbp({
        legs: [
          {
            pnr: "ABC123",
            origin: "JFK",
            destination: "LHR",
            carrier: "BA ",
            flight: "00117",
            julian: "318",
            variableSize: "04",
          },
          {
            pnr: "XYZ789",
            origin: "LHR",
            destination: "DXB",
            carrier: "EK ",
            flight: "00009",
            julian: "319",
          },
        ],
        variableData: ["WXYZ"],
      }),
    );

    expect(pass.legs).toHaveLength(2);
    expect(pass.legs[1]).toMatchObject({
      origin: "LHR",
      destination: "DXB",
      airlineCode: "EK",
      julianDate: 319,
    });
    expect(pass.valid).toBe(true);
  });

  it("reports a missing second leg instead of inventing it", () => {
    const raw = buildBcbp();
    const multi = `${raw.slice(0, 1)}2${raw.slice(2)}`;
    const pass = parseBoardingPass(multi);
    expect(pass.valid).toBe(false);
    expect(pass.legs).toHaveLength(1);
    expect(pass.warnings).toContain("Leg 2 is missing or truncated.");
    expect(pass.warnings).toContain(
      "Multi-leg pass declares 2 legs; only 1 could be parsed.",
    );
  });

  it("marks a malformed second leg without substituting values", () => {
    const pass = parseBoardingPass(
      buildBcbp({
        legs: [
          {
            pnr: "ABC123",
            origin: "JFK",
            destination: "LHR",
            carrier: "BA ",
            flight: "00117",
            julian: "318",
          },
          {
            pnr: "XYZ789",
            origin: "LHR",
            destination: "X  ",
            carrier: "EK ",
            flight: "00009",
            julian: "999",
            seat: "ZZ",
            sequence: "0042",
          },
        ],
      }),
    );

    expect(pass.valid).toBe(false);
    expect(pass.legs).toHaveLength(2);
    expect(pass.legs[1]).toMatchObject({
      index: 1,
      pnr: "XYZ789",
      origin: "LHR",
      destination: "X",
      julianDate: null,
      flightDate: null,
      seatNumber: null,
      valid: false,
    });
    expect(pass.legs[1]?.warnings).toEqual(
      expect.arrayContaining([
        "Leg 2: Destination is not a 3-letter IATA code.",
        "Leg 2: Julian operating date is invalid.",
        "Leg 2: Seat number is missing or malformed.",
      ]),
    );
  });
});
