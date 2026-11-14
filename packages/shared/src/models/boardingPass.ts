import { z } from "zod";

export const BOARDING_PASS_FORMATS = [
  "PDF417",
  "AZTEC",
  "QR",
  "UNKNOWN",
] as const;
export type BoardingPassFormat = (typeof BOARDING_PASS_FORMATS)[number];

/**
 * Parsed IATA Resolution 792 (BCBP) boarding pass.
 *
 * Neither the PNR nor seat is fetched from a provider: every field below comes
 * from the on-device scan. Flight status is fetched separately from the
 * gateway by flight number and operating date.
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
  checkInSource: string | null;
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
  valid: z.boolean(),
  warnings: z.array(z.string()),
});
