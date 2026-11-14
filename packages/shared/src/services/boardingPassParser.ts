import type {
  BoardingPassData,
  BoardingPassFormat,
  BoardingPassLeg,
} from "../models/boardingPass.js";

export interface ParseBoardingPassOptions {
  /** Barcode symbology reported by expo-camera. */
  format?: BoardingPassFormat;
  /** Clock used to resolve the BCBP Julian date. Defaults to now. */
  now?: Date;
}

const BCBP_MANDATORY_LENGTH = 60;
/** IATA RP 792 allows at most four legs in one barcode. */
const BCBP_MAX_LEGS = 4;
/**
 * Per-leg block: PNR (7), from (3), to (3), carrier (3), flight (5), Julian
 * date (3), compartment (1), seat (4), sequence (5), status (1), variable
 * data size (2).
 */
const LEG_BLOCK_LENGTH = 37;
/** Format (1) + leg count (1) + passenger name (20) + ET indicator (1). */
const FIRST_LEG_OFFSET = 23;

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
    .filter(
      (entry): entry is { iso: string; time: number; distance: number } =>
        entry != null,
    )
    .sort((a, b) => a.distance - b.distance || b.time - a.time);
  return candidates[0]?.iso ?? null;
}

interface ParsedLegBlock {
  leg: BoardingPassLeg;
  /** Hex field size of the variable-data block that follows this leg. */
  variableDataSize: number | null;
}

function parseVariableDataSize(raw: string): number | null {
  const compact = raw.trim().toUpperCase();
  if (!/^[0-9A-F]{1,2}$/.test(compact)) return null;
  return Number.parseInt(compact, 16);
}

/**
 * Parses one fixed-width leg block. The first block starts after the pass-level
 * header; every later block starts after the preceding leg's variable data.
 */
function parseLegBlock(
  text: string,
  start: number,
  index: number,
  now?: Date,
): ParsedLegBlock {
  const warnings: string[] = [];
  const prefix = index === 0 ? "" : `Leg ${index + 1}: `;
  const warn = (message: string) => warnings.push(`${prefix}${message}`);

  if (text.length < start + LEG_BLOCK_LENGTH) {
    warn("Leg data is missing or truncated.");
  }
  const block = text
    .slice(start, start + LEG_BLOCK_LENGTH)
    .padEnd(LEG_BLOCK_LENGTH, " ");

  const pnr = normalizePnr(block.slice(0, 7));
  const origin = block.slice(7, 10).trim().toUpperCase();
  const destination = block.slice(10, 13).trim().toUpperCase();
  const airlineCode = block.slice(13, 16).trim().toUpperCase();
  const flightNumber = normalizeFlightNumber(block.slice(16, 21));
  const julianRaw = block.slice(21, 24).trim();
  const julianValue = Number(julianRaw);
  const julianValid =
    Number.isInteger(julianValue) && julianValue >= 1 && julianValue <= 366;
  const compartmentCode = block.slice(24, 25).trim().toUpperCase() || null;
  const seatNumber = normalizeSeat(block.slice(25, 29));
  const sequenceRaw = block.slice(29, 34).trim();
  const sequenceNumber = /^\d{1,5}$/.test(sequenceRaw)
    ? String(Number(sequenceRaw))
    : null;
  const passengerStatus = block.slice(34, 35).trim() || null;
  const variableDataSize = parseVariableDataSize(block.slice(35, 37));
  const flightDate = julianValid
    ? resolveJulianFlightDate(julianValue, now)
    : null;

  if (!pnr) warn("Record locator (PNR) is missing.");
  if (!/^[A-Z]{3}$/.test(origin)) warn("Origin is not a 3-letter IATA code.");
  if (!/^[A-Z]{3}$/.test(destination)) {
    warn("Destination is not a 3-letter IATA code.");
  }
  if (!/^[A-Z0-9]{2,3}$/.test(airlineCode)) {
    warn("Operating carrier is missing.");
  }
  if (!flightNumber) warn("Flight number is missing.");
  if (!julianValid) warn("Julian operating date is invalid.");
  if (!seatNumber) warn("Seat number is missing or malformed.");
  if (passengerStatus && !/[A-Z]/.test(passengerStatus)) {
    warn("Passenger status is malformed.");
  }

  const valid =
    /^[A-Z]{3}$/.test(origin) &&
    /^[A-Z]{3}$/.test(destination) &&
    /^[A-Z0-9]{2,3}$/.test(airlineCode) &&
    Boolean(flightNumber) &&
    flightDate != null;

  return {
    leg: {
      index,
      pnr,
      airlineCode,
      flightNumber: flightNumber ?? "",
      julianDate: julianValid ? julianValue : null,
      flightDate,
      origin,
      destination,
      compartmentCode,
      cabinClass: compartmentCode
        ? (CABIN_BY_CODE[compartmentCode] ?? compartmentCode)
        : null,
      seatNumber,
      sequenceNumber,
      passengerStatus,
      valid,
      warnings,
    },
    variableDataSize,
  };
}

/**
 * Parses an IATA BCBP (Resolution 792 / PSCRM) barcode on-device.
 *
 * Pure function, no network, no API call. The parser is deliberately strict
 * about mandatory structural fields and returns `valid: false` with warnings
 * instead of inventing values. Multi-leg passes expose every leg in `legs`;
 * the top-level flight fields remain the first leg for backwards compatibility.
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
      legs: [],
      valid: false,
      warnings: ["No IATA BCBP header (M1) found."],
    };
  }

  const text = located.text.padEnd(BCBP_MANDATORY_LENGTH, " ");
  const formatCode = text.slice(0, 1);
  const legCountRaw = text.slice(1, 2).trim();
  const declaredLegCount = Number(legCountRaw);
  const legCountValid =
    /^\d$/.test(legCountRaw) &&
    declaredLegCount >= 1 &&
    declaredLegCount <= BCBP_MAX_LEGS;
  const expectedLegCount = legCountValid ? declaredLegCount : 1;
  const passengerName = text.slice(2, 22).trim().replace(/0+$/, "");
  // Check-in source lives in the packed conditional/airline variable data, not
  // at a universal fixed offset. It stays null rather than exposing a hex
  // field-size byte as if it were a source.
  const checkInSource = null;

  if (formatCode !== "M") warnings.push("Format code is not M (M1).");
  if (!legCountValid) warnings.push("Leg count is missing or invalid.");
  if (!passengerName) warnings.push("Passenger name is missing.");

  const legs: BoardingPassLeg[] = [];
  const first = parseLegBlock(text, FIRST_LEG_OFFSET, 0, options.now);
  legs.push(first.leg);
  warnings.push(...first.leg.warnings);

  let cursor =
    FIRST_LEG_OFFSET + LEG_BLOCK_LENGTH + (first.variableDataSize ?? 0);
  for (let index = 1; index < expectedLegCount; index += 1) {
    if (!text.slice(cursor).trim()) {
      warnings.push(`Leg ${index + 1} is missing or truncated.`);
      break;
    }
    const parsed = parseLegBlock(text, cursor, index, options.now);
    legs.push(parsed.leg);
    warnings.push(...parsed.leg.warnings);
    cursor += LEG_BLOCK_LENGTH + (parsed.variableDataSize ?? 0);
  }
  if (legs.length < expectedLegCount) {
    warnings.push(
      `Multi-leg pass declares ${expectedLegCount} legs; only ${legs.length} could be parsed.`,
    );
  }

  const firstLeg = legs[0]!;
  const valid =
    Boolean(passengerName) &&
    legCountValid &&
    legs.length === expectedLegCount &&
    legs.every((leg) => leg.valid);

  return {
    raw,
    format: options.format ?? "UNKNOWN",
    passengerName,
    pnr: firstLeg.pnr,
    airlineCode: firstLeg.airlineCode,
    flightNumber: firstLeg.flightNumber,
    julianDate: firstLeg.julianDate ?? 1,
    flightDate: firstLeg.flightDate,
    origin: firstLeg.origin,
    destination: firstLeg.destination,
    seatNumber: firstLeg.seatNumber,
    cabinClass: firstLeg.cabinClass,
    boardingGroup: null,
    sequenceNumber: firstLeg.sequenceNumber,
    checkInSource,
    legs,
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
    flightNumber: `${pass.airlineCode}${pass.flightNumber}`
      .replace(/\s+/g, "")
      .toUpperCase(),
    date: pass.flightDate,
  };
}

export function boardingPassGatewayPath(pass: BoardingPassData): string {
  const query = boardingPassFlightQuery(pass);
  const date = query.date ?? "today";
  return `/api/gateway/flights/${encodeURIComponent(query.flightNumber)}/${date}`;
}
