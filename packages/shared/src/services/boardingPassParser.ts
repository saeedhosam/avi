import type {
  BoardingPassData,
  BoardingPassFormat,
} from "../models/boardingPass.js";

export interface ParseBoardingPassOptions {
  /** Barcode symbology reported by expo-camera. */
  format?: BoardingPassFormat;
  /** Clock used to resolve the BCBP Julian date. Defaults to now. */
  now?: Date;
}

const BCBP_MANDATORY_LENGTH = 60;

/** Compartment codes from IATA Resolution 792 / PSCRM. */
const CABIN_BY_CODE: Record<string, string> = {
  F: "FIRST",
  A: "FIRST",
  J: "BUSINESS",
  C: "BUSINESS",
  D: "BUSINESS",
  I: "BUSINESS",
  W: "PREMIUM_ECONOMY",
  S: "PREMIUM_ECONOMY",
  Y: "ECONOMY",
  M: "ECONOMY",
  K: "ECONOMY",
  H: "ECONOMY",
  B: "ECONOMY",
  L: "ECONOMY",
  Q: "ECONOMY",
  T: "ECONOMY",
  V: "ECONOMY",
  X: "ECONOMY",
  G: "ECONOMY",
  N: "ECONOMY",
  R: "ECONOMY",
  U: "ECONOMY",
  E: "ECONOMY",
  Z: "ECONOMY",
};

function cleanRaw(raw: string): string {
  return raw
    .replace(/\u0000/g, "")
    .replace(/[\r\n\t]+/g, "")
    .trim();
}

/** BCBP may be embedded in a larger QR payload; locate the `M1` header. */
function locateBcbp(raw: string): { text: string; offset: number } | null {
  const direct = raw.search(/M[1-4][A-Z0-9 ]{2,}/);
  if (direct >= 0) return { text: raw.slice(direct), offset: direct };
  if (raw.length >= BCBP_MANDATORY_LENGTH && /^M/.test(raw)) {
    return { text: raw, offset: 0 };
  }
  // Some scanners strip the leading `M`; accept a leg count followed by a
  // plausible 20-character passenger name.
  if (raw.length >= BCBP_MANDATORY_LENGTH && /^[1-4][A-Z]/.test(raw)) {
    return { text: raw, offset: 0 };
  }
  return null;
}

function normalizeSeat(raw: string): string | null {
  const compact = raw.replace(/\s+/g, "").toUpperCase();
  const match = compact.match(/^0*(\d{1,3})([A-Z])$/);
  if (!match) return null;
  return `${Number(match[1])}${match[2]}`;
}

function normalizePnr(raw: string): string | null {
  const value = raw.replace(/\s+/g, "").toUpperCase();
  if (!value) return null;
  return /^[A-Z0-9]{5,8}$/.test(value) ? value : null;
}

function normalizeFlightNumber(raw: string): string | null {
  const compact = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^\d{1,5}[A-Z]?$/.test(compact)) return null;
  return compact.replace(/^0+/, "") || "0";
}

/** Julian day (1–366) → UTC date for a given year. */
export function julianDateToIso(julian: number, year: number): string | null {
  if (!Number.isInteger(julian) || julian < 1 || julian > 366) return null;
  const date = new Date(Date.UTC(year, 0, 1));
  date.setUTCDate(julian);
  if (date.getUTCFullYear() !== year) {
    // Day 366 in a non-leap year rolls into January of the next year.
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Resolves a BCBP Julian day to the nearest plausible operating date around
 * `now`. A pass scanned in November for a January flight resolves to the next
 * January, while a pass scanned on 1 January for 31 December resolves to the
 * previous year.
 */
export function resolveJulianFlightDate(
  julian: number,
  now: Date = new Date(),
): string | null {
  const currentYear = now.getUTCFullYear();
  const candidates = [currentYear - 1, currentYear, currentYear + 1]
    .map((year) => {
      const iso = julianDateToIso(julian, year);
      if (!iso) return null;
      const time = Date.parse(`${iso}T00:00:00Z`);
      return { iso, time, distance: Math.abs(time - now.getTime()) };
    })
    .filter((entry): entry is { iso: string; time: number; distance: number } =>
      entry != null,
    )
    .sort((a, b) => a.distance - b.distance || b.time - a.time);
  return candidates[0]?.iso ?? null;
}

/**
 * Parses an IATA BCBP (Resolution 792 / PSCRM) barcode on-device.
 *
 * Pure function, no network, no API call. The parser is deliberately strict
 * about mandatory structural fields and returns `valid: false` with warnings
 * instead of inventing values.
 */
export function parseBoardingPass(
  rawInput: string,
  options: ParseBoardingPassOptions = {},
): BoardingPassData {
  const raw = cleanRaw(rawInput);
  const located = locateBcbp(raw);
  const warnings: string[] = [];

  if (!located) {
    return {
      raw,
      format: options.format ?? "UNKNOWN",
      passengerName: "",
      pnr: null,
      airlineCode: "",
      flightNumber: "",
      julianDate: 1,
      flightDate: null,
      origin: "",
      destination: "",
      seatNumber: null,
      cabinClass: null,
      boardingGroup: null,
      sequenceNumber: null,
      checkInSource: null,
      valid: false,
      warnings: ["No IATA BCBP header (M1) found."],
    };
  }

  const text = located.text.padEnd(BCBP_MANDATORY_LENGTH, " ");
  const formatCode = text.slice(0, 1);
  const legCount = Number(text.slice(1, 2));
  const passengerName = text.slice(2, 22).trim().replace(/0+$/, "");
  const pnr = normalizePnr(text.slice(23, 30));
  const origin = text.slice(30, 33).trim().toUpperCase();
  const destination = text.slice(33, 36).trim().toUpperCase();
  const airlineCode = text.slice(36, 39).trim().toUpperCase();
  const flightNumber = normalizeFlightNumber(text.slice(39, 44));
  const julianRaw = text.slice(44, 47).trim();
  const julianDate = Number(julianRaw);
  const compartment = text.slice(47, 48).trim().toUpperCase();
  const seatNumber = normalizeSeat(text.slice(48, 52));
  const sequenceRaw = text.slice(52, 56).trim();
  const sequenceNumber = /^\d{1,4}$/.test(sequenceRaw)
    ? String(Number(sequenceRaw))
    : null;
  const passengerStatus = text.slice(56, 57).trim();
  // Optional check-in source follows the passenger status in M1 data. It is
  // not mandatory, so a missing byte is not a failure.
  const checkInSource = text.slice(58, 59).trim() || null;

  if (formatCode !== "M") warnings.push("Format code is not M (M1).");
  if (!Number.isInteger(legCount) || legCount < 1) {
    warnings.push("Leg count is missing or invalid.");
  } else if (legCount > 1) {
    warnings.push("Multi-leg pass; only the first leg is parsed.");
  }
  if (!passengerName) warnings.push("Passenger name is missing.");
  if (!pnr) warnings.push("Record locator (PNR) is missing.");
  if (!/^[A-Z]{3}$/.test(origin)) warnings.push("Origin is not a 3-letter IATA code.");
  if (!/^[A-Z]{3}$/.test(destination)) warnings.push("Destination is not a 3-letter IATA code.");
  if (!/^[A-Z0-9]{2,3}$/.test(airlineCode)) warnings.push("Operating carrier is missing.");
  if (!flightNumber) warnings.push("Flight number is missing.");
  if (!Number.isInteger(julianDate) || julianDate < 1 || julianDate > 366) {
    warnings.push("Julian operating date is invalid.");
  }
  if (!seatNumber) warnings.push("Seat number is missing or malformed.");

  const flightDate =
    Number.isInteger(julianDate) && julianDate >= 1 && julianDate <= 366
      ? resolveJulianFlightDate(julianDate, options.now)
      : null;

  const valid =
    Boolean(passengerName) &&
    /^[A-Z]{3}$/.test(origin) &&
    /^[A-Z]{3}$/.test(destination) &&
    /^[A-Z0-9]{2,3}$/.test(airlineCode) &&
    Boolean(flightNumber) &&
    flightDate != null;

  if (passengerStatus && !/[A-Z]/.test(passengerStatus)) {
    warnings.push("Passenger status is malformed.");
  }

  return {
    raw,
    format: options.format ?? "UNKNOWN",
    passengerName,
    pnr,
    airlineCode,
    flightNumber: flightNumber ?? "",
    julianDate:
      Number.isInteger(julianDate) && julianDate >= 1 && julianDate <= 366
        ? julianDate
        : 1,
    flightDate,
    origin,
    destination,
    seatNumber,
    cabinClass: compartment ? (CABIN_BY_CODE[compartment] ?? compartment) : null,
    boardingGroup: null,
    sequenceNumber,
    checkInSource,
    valid,
    warnings,
  };
}

/** Gateways need a compact flight ident; the date is always scoped. */
export function boardingPassFlightQuery(pass: BoardingPassData): {
  flightNumber: string;
  date: string | null;
} {
  return {
    flightNumber: `${pass.airlineCode}${pass.flightNumber}`.replace(/\s+/g, "").toUpperCase(),
    date: pass.flightDate,
  };
}

export function boardingPassGatewayPath(pass: BoardingPassData): string {
  const query = boardingPassFlightQuery(pass);
  const date = query.date ?? "today";
  return `/api/gateway/flights/${encodeURIComponent(query.flightNumber)}/${date}`;
}
