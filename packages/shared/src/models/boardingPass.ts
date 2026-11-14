import { z } from "zod";

export const BOARDING_PASS_FORMATS = [
  "PDF417",
  "AZTEC",
  "QR",
  "UNKNOWN",
] as const;
export type BoardingPassFormat = (typeof BOARDING_PASS_FORMATS)[number];

/**
 * One flight leg encoded in an IATA Resolution 792 (BCBP) barcode.
 *
 * The first leg's values are also exposed on {@link BoardingPassData} for
 * backwards compatibility. Fields that could not be parsed are left empty or
 * null; the parser never substitutes a guessed airport, flight, or date.
 */
export interface BoardingPassLeg {
  /** Zero-based position in the barcode. */
  index: number;
  /** Record locator for this leg, when the pass carries one per leg. */
  pnr: string | null;
  airlineCode: string;
  flightNumber: string;
  /** BCBP Julian operating day (1–366), or null when malformed. */
  julianDate: number | null;
  /** ISO YYYY-MM-DD resolved for the operating year, when resolvable. */
  flightDate: string | null;
  origin: string;
  destination: string;
  /** Raw compartment code, e.g. `Y` or `J`. */
  compartmentCode: string | null;
  cabinClass: string | null;
  /** Normalized seat, e.g. `14A`. */
  seatNumber: string | null;
  sequenceNumber: string | null;
  passengerStatus: string | null;
  /** False when a mandatory structural field on this leg could not be parsed. */
  valid: boolean;
  warnings: string[];
}

export const boardingPassLegSchema: z.ZodType<BoardingPassLeg> = z.object({
  index: z.number().int().nonnegative(),
  pnr: z.string().nullable(),
  airlineCode: z.string(),
  flightNumber: z.string(),
  julianDate: z.number().int().min(1).max(366).nullable(),
  flightDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  origin: z.string().length(3),
  destination: z.string().length(3),
  compartmentCode: z.string().nullable(),
  cabinClass: z.string().nullable(),
  seatNumber: z.string().nullable(),
  sequenceNumber: z.string().nullable(),
  passengerStatus: z.string().nullable(),
  valid: z.boolean(),
  warnings: z.array(z.string()),
});

/**
 * Parsed IATA Resolution 792 (BCBP) boarding pass.
 *
 * Neither the PNR nor seat is fetched from a provider: every field below comes
 * from the on-device scan. Flight status is fetched separately from the
 * gateway by flight number and operating date.
 *
 * Top-level fields describe the first leg. Multi-leg passes also expose every
 * parsed leg in {@link BoardingPassData.legs}.
 */
export interface BoardingPassData {
  raw: string;
  format: BoardingPassFormat;
  passengerName: string;
  /** Six-character record locator, when present. */
  pnr: string | null;
  airlineCode: string;
  flightNumber: string;
  /** BCBP Julian operating day of the year (1–366). */
  julianDate: number;
  /** ISO YYYY-MM-DD resolved for the operating year, when resolvable. */
  flightDate: string | null;
  origin: string;
  destination: string;
  /** Normalized seat, e.g. `14A`. */
  seatNumber: string | null;
  cabinClass: string | null;
  boardingGroup: string | null;
  sequenceNumber: string | null;
  /** Check-in source from conditional data when decoded; the parser leaves it null. */
  checkInSource: string | null;
  /** Every leg encoded in the pass, in barcode order. */
  legs: BoardingPassLeg[];
  /** False when a mandatory structural field could not be parsed. */
  valid: boolean;
  warnings: string[];
}

export const boardingPassDataSchema: z.ZodType<BoardingPassData> = z.object({
  raw: z.string(),
  format: z.enum(BOARDING_PASS_FORMATS),
  passengerName: z.string(),
  pnr: z.string().nullable(),
  airlineCode: z.string(),
  flightNumber: z.string(),
  julianDate: z.number().int().min(1).max(366),
  flightDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  origin: z.string().length(3),
  destination: z.string().length(3),
  seatNumber: z.string().nullable(),
  cabinClass: z.string().nullable(),
  boardingGroup: z.string().nullable(),
  sequenceNumber: z.string().nullable(),
  checkInSource: z.string().nullable(),
  legs: z.array(boardingPassLegSchema),
  valid: z.boolean(),
  warnings: z.array(z.string()),
});
