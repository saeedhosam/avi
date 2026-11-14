import { z } from "zod";

export const SEAT_CLASSES = [
  "FIRST",
  "BUSINESS",
  "PREMIUM_ECONOMY",
  "ECONOMY",
] as const;
export type SeatClass = (typeof SEAT_CLASSES)[number];

export const WINDOW_ALIGNMENTS = [
  "FULL_WINDOW",
  "MISALIGNED_WINDOW",
  "NO_WINDOW",
  "UNKNOWN",
] as const;
export type WindowAlignment = (typeof WINDOW_ALIGNMENTS)[number];

export interface CabinDimensions {
  /** Centimetres. */
  widthCm: number;
  heightCm: number;
  depthCm: number;
}

export const cabinDimensionsSchema: z.ZodType<CabinDimensions> = z.object({
  widthCm: z.number().positive(),
  heightCm: z.number().positive(),
  depthCm: z.number().positive(),
});

export interface OverheadBinSpec extends CabinDimensions {
  /** IATA aircraft type the bin was measured on. */
  aircraftType: string;
  /** Number of standard 55×40×20 cm carry-ons the bin can take. */
  carryOnCapacity: number;
  note: string;
}

export const overheadBinSpecSchema: z.ZodType<OverheadBinSpec> = z.object({
  widthCm: z.number().positive(),
  heightCm: z.number().positive(),
  depthCm: z.number().positive(),
  aircraftType: z.string(),
  carryOnCapacity: z.number().int().nonnegative(),
  note: z.string(),
});

export interface CabinSeat {
  id: string;
  deck: number;
  row: number;
  letter: string;
  seatClass: SeatClass;
  /** Normalized plan coordinates (0..1) for the deck. */
  position: { x: number; y: number };
  windowAlignment: WindowAlignment;
  hasPowerOutlet: boolean;
  hasUsb: boolean;
  /** Seat pitch in inches when the layout source reported it. */
  pitchInches: number | null;
  reclineInches: number | null;
  isExitRow: boolean;
  hasExtraLegroom: boolean;
}

export const cabinSeatSchema: z.ZodType<CabinSeat> = z.object({
  id: z.string(),
  deck: z.number().int().min(0),
  row: z.number().int().positive(),
  letter: z.string().min(1).max(2),
  seatClass: z.enum(SEAT_CLASSES),
  position: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  }),
  windowAlignment: z.enum(WINDOW_ALIGNMENTS),
  hasPowerOutlet: z.boolean(),
  hasUsb: z.boolean(),
  pitchInches: z.number().positive().nullable(),
  reclineInches: z.number().nonnegative().nullable(),
  isExitRow: z.boolean(),
  hasExtraLegroom: z.boolean(),
});

export const CABIN_FEATURE_KINDS = [
  "LAVATORY",
  "GALLEY",
  "EMERGENCY_EXIT",
  "OVERHEAD_BIN",
  "CLOSET",
  "STAIRS",
  "CREW_REST",
  "WINDOW",
] as const;
export type CabinFeatureKind = (typeof CABIN_FEATURE_KINDS)[number];

export interface CabinFeature {
  id: string;
  deck: number;
  kind: CabinFeatureKind;
  label: string;
  position: { x: number; y: number };
  /** Row span the feature occupies, when relevant. */
  rowRange?: [number, number];
}

export const cabinFeatureSchema: z.ZodType<CabinFeature> = z.object({
  id: z.string(),
  deck: z.number().int().min(0),
  kind: z.enum(CABIN_FEATURE_KINDS),
  label: z.string(),
  position: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  }),
  rowRange: z
    .tuple([z.number().int(), z.number().int()])
    .optional(),
});

export interface CabinDeck {
  index: number;
  name: string;
  seatClasses: SeatClass[];
  rows: number;
  columns: string[];
  /** Normalized starting and ending row positions on the deck. */
  rowStartY: number;
  rowEndY: number;
  aisles: number[];
}

export const cabinDeckSchema: z.ZodType<CabinDeck> = z.object({
  index: z.number().int().min(0),
  name: z.string(),
  seatClasses: z.array(z.enum(SEAT_CLASSES)),
  rows: z.number().int().positive(),
  columns: z.array(z.string()),
  rowStartY: z.number().min(0).max(1),
  rowEndY: z.number().min(0).max(1),
  aisles: z.array(z.number().int().nonnegative()),
});

export interface AircraftCabinLayout {
  /** Normalized IATA/ICAO type, e.g. `B77W`, `A388`, `A320`, `B789`. */
  aircraftType: string;
  layoutKey: string;
  source: "CURATED" | "PARAMETRIC" | "SUPABASE_CACHE";
  updatedAt: string;
  decks: CabinDeck[];
  seats: CabinSeat[];
  features: CabinFeature[];
  overheadBins: OverheadBinSpec[];
  /** False when the layout is an approximate parametric reconstruction. */
  isExact: boolean;
  disclaimer: string;
}

export const aircraftCabinLayoutSchema: z.ZodType<AircraftCabinLayout> =
  z.object({
    aircraftType: z.string(),
    layoutKey: z.string(),
    source: z.enum(["CURATED", "PARAMETRIC", "SUPABASE_CACHE"]),
    updatedAt: z.string(),
    decks: z.array(cabinDeckSchema),
    seats: z.array(cabinSeatSchema),
    features: z.array(cabinFeatureSchema),
    overheadBins: z.array(overheadBinSpecSchema),
    isExact: z.boolean(),
    disclaimer: z.string(),
  });

export interface ResolvedSeat {
  layout: AircraftCabinLayout;
  seat: CabinSeat | null;
  nearbyFeatures: CabinFeature[];
  distanceToLavatoryMeters: number | null;
  distanceToExitMeters: number | null;
  windowNote: string;
  legroomNote: string;
  powerNote: string;
}

export const resolvedSeatSchema: z.ZodType<ResolvedSeat> = z.object({
  layout: aircraftCabinLayoutSchema,
  seat: cabinSeatSchema.nullable(),
  nearbyFeatures: z.array(cabinFeatureSchema),
  distanceToLavatoryMeters: z.number().nonnegative().nullable(),
  distanceToExitMeters: z.number().nonnegative().nullable(),
  windowNote: z.string(),
  legroomNote: z.string(),
  powerNote: z.string(),
});
