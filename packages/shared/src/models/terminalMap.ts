import { z } from "zod";

/**
 * Indoor POI taxonomy. `ALL` is a UI filter, not a stored POI category; the
 * remaining values map to OpenStreetMap indoor/amenity tags where available.
 */
export const AMENITY_CATEGORIES = [
  "ALL",
  "GATE",
  "LOUNGE",
  "SECURITY",
  "IMMIGRATION",
  "DINING",
  "SHOPPING",
  "RESTROOM",
  "WATER",
  "CHARGING",
  "TRANSIT",
  "MEDICAL",
  "PLAY_AREA",
] as const;

export type AmenityCategory = (typeof AMENITY_CATEGORIES)[number];

export const AMENITY_META: Record<
  AmenityCategory,
  { displayName: string; tag: string; color: string; shortLabel: string }
> = {
  ALL: {
    displayName: "All",
    tag: "filter_all",
    color: "#35D3E6",
    shortLabel: "POI",
  },
  GATE: {
    displayName: "Gates",
    tag: "aeroway=gate",
    color: "#35D3E6",
    shortLabel: "GATE",
  },
  LOUNGE: {
    displayName: "Lounges",
    tag: "amenity=lounge",
    color: "#E0A24C",
    shortLabel: "VIP",
  },
  SECURITY: {
    displayName: "Security",
    tag: "aeroway=security",
    color: "#E26F6F",
    shortLabel: "SEC",
  },
  IMMIGRATION: {
    displayName: "Immigration",
    tag: "barrier=immigration",
    color: "#E08A4C",
    shortLabel: "IMM",
  },
  DINING: {
    displayName: "Dining & Coffee",
    tag: "amenity=restaurant|cafe",
    color: "#E08A4C",
    shortLabel: "EAT",
  },
  SHOPPING: {
    displayName: "Duty Free & Shops",
    tag: "shop=duty_free",
    color: "#A78BFA",
    shortLabel: "SHOP",
  },
  RESTROOM: {
    displayName: "Restrooms",
    tag: "amenity=toilets",
    color: "#5BA7D9",
    shortLabel: "WC",
  },
  WATER: {
    displayName: "Water Station",
    tag: "amenity=drinking_water",
    color: "#5BA7D9",
    shortLabel: "H2O",
  },
  CHARGING: {
    displayName: "Power Outlet",
    tag: "amenity=charging_station",
    color: "#35C48F",
    shortLabel: "PWR",
  },
  TRANSIT: {
    displayName: "Transit & Baggage",
    tag: "railway=station|aeroway=baggage_claim",
    color: "#35C48F",
    shortLabel: "TRAIN",
  },
  MEDICAL: {
    displayName: "Medical",
    tag: "amenity=first_aid",
    color: "#E26F6F",
    shortLabel: "MED",
  },
  PLAY_AREA: {
    displayName: "Play Area",
    tag: "leisure=playground",
    color: "#A78BFA",
    shortLabel: "PLAY",
  },
};

export interface PointF {
  /** Normalized 0..1 terminal-plan coordinate. */
  x: number;
  y: number;
}

export const pointFSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

export interface TerminalAmenity {
  id: string;
  name: string;
  category: AmenityCategory;
  airportCode: string;
  terminal: string;
  concourse: string;
  /** 0 = arrivals/baggage, 1 = departures/gates, 2 = mezzanine/lounges. */
  level: number;
  locationDescription: string;
  /** Normalized coordinate (0..1). */
  position: PointF;
  gateNumber: string | null;
  openingHours: string;
  accessInfo: string | null;
  waitTimeMinutes: number | null;
  walkTimeFromSecurityMinutes: number;
  walkDistanceMeters: number;
  rating: number | null;
  assignedFlightNumber: string | null;
  features: string[];
  /** Provenance for OSM-ingested POIs; curated layouts leave this undefined. */
  osm?: {
    id: string;
    tags: Record<string, string>;
  };
}

export const terminalAmenitySchema: z.ZodType<TerminalAmenity> = z.object({
  id: z.string().min(1),
  name: z.string(),
  category: z.enum(AMENITY_CATEGORIES),
  airportCode: z.string().length(3),
  terminal: z.string(),
  concourse: z.string(),
  level: z.number().int().min(0),
  locationDescription: z.string(),
  position: pointFSchema,
  gateNumber: z.string().nullable(),
  openingHours: z.string(),
  accessInfo: z.string().nullable(),
  waitTimeMinutes: z.number().int().nonnegative().nullable(),
  walkTimeFromSecurityMinutes: z.number().nonnegative(),
  walkDistanceMeters: z.number().nonnegative(),
  rating: z.number().min(0).max(5).nullable(),
  assignedFlightNumber: z.string().nullable(),
  features: z.array(z.string()),
  osm: z
    .object({
      id: z.string(),
      tags: z.record(z.string(), z.string()),
    })
    .optional(),
});

export interface ConcourseSection {
  id: string;
  name: string;
  start: PointF;
  end: PointF;
  width: number;
  gatesRange: string;
}

export const concourseSectionSchema: z.ZodType<ConcourseSection> = z.object({
  id: z.string().min(1),
  name: z.string(),
  start: pointFSchema,
  end: pointFSchema,
  width: z.number().positive(),
  gatesRange: z.string(),
});

export interface ConcourseFloor {
  level: number;
  levelName: string;
  description: string;
  /** Canonical field name. */
  concourseSections: ConcourseSection[];
  centralHubCenter: PointF;
  securityPosition: PointF;
  entrancePosition: PointF;
}

type ConcourseFloorInput = Omit<ConcourseFloor, "concourseSections"> & {
  concourseSections?: ConcourseSection[];
  /** Legacy Android field name accepted for backwards compatibility. */
  concourses?: ConcourseSection[];
};

export const concourseFloorSchema = z
  .object({
    level: z.number().int().min(0),
    levelName: z.string(),
    description: z.string(),
    concourseSections: z.array(concourseSectionSchema).optional(),
    concourses: z.array(concourseSectionSchema).optional(),
    centralHubCenter: pointFSchema,
    securityPosition: pointFSchema,
    entrancePosition: pointFSchema,
  })
  .transform((floor): ConcourseFloor => {
    const { concourses, ...rest } = floor;
    return {
      ...rest,
      concourseSections: floor.concourseSections ?? concourses ?? [],
    };
  });

export interface AirportTerminalLayout {
  airportCode: string;
  airportName: string;
  city: string;
  terminalId: string;
  terminalName: string;
  availableLevels: number[];
  floors: Record<string, ConcourseFloor>;
  amenities: TerminalAmenity[];
}

export const airportTerminalLayoutSchema = z.object({
  airportCode: z.string().length(3),
  airportName: z.string(),
  city: z.string(),
  terminalId: z.string(),
  terminalName: z.string(),
  availableLevels: z.array(z.number().int().min(0)),
  floors: z.record(z.string(), concourseFloorSchema),
  amenities: z.array(terminalAmenitySchema),
});

// ── Spatial graph: reusable indoor navigation schema ─────────────────────────

export const TERMINAL_NODE_KINDS = [
  "poi",
  "junction",
  "gate",
  "security",
  "entrance",
  "platform",
] as const;
export type TerminalNodeKind = (typeof TERMINAL_NODE_KINDS)[number];

export interface TerminalGraphNode {
  id: string;
  level: number;
  kind: TerminalNodeKind;
  point: PointF;
  label?: string;
  amenityId?: string;
  /** Mapped amenity category for OSM-derived nodes; curated nodes omit it. */
  category?: AmenityCategory;
  /** Raw source tags for provenance (OSM indoor ingestion only). */
  tags?: Record<string, string>;
}

export const terminalGraphNodeSchema: z.ZodType<TerminalGraphNode> = z.object({
  id: z.string().min(1),
  level: z.number().int().min(0),
  kind: z.enum(TERMINAL_NODE_KINDS),
  point: pointFSchema,
  label: z.string().optional(),
  amenityId: z.string().optional(),
  category: z.enum(AMENITY_CATEGORIES).optional(),
  tags: z.record(z.string(), z.string()).optional(),
});

export const TERMINAL_EDGE_KINDS = [
  "corridor",
  "walkway",
  "moving_walkway",
  "train",
  "stairs",
  "escalator",
  "elevator",
] as const;
export type TerminalEdgeKind = (typeof TERMINAL_EDGE_KINDS)[number];

export interface TerminalGraphEdge {
  id: string;
  from: string;
  to: string;
  kind: TerminalEdgeKind;
  distanceMeters: number;
  /** Walking speed for this edge; moving walkways and trains are faster. */
  speedMps: number;
  bidirectional: boolean;
  accessible: boolean;
}

export const terminalGraphEdgeSchema: z.ZodType<TerminalGraphEdge> = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  kind: z.enum(TERMINAL_EDGE_KINDS),
  distanceMeters: z.number().nonnegative(),
  speedMps: z.number().positive(),
  bidirectional: z.boolean(),
  accessible: z.boolean(),
});

export interface TerminalSpatialGraph {
  airportCode: string;
  terminalId: string;
  nodes: TerminalGraphNode[];
  edges: TerminalGraphEdge[];
  source: "curated" | "parametric" | "osm_indoor";
  updatedAt: string;
}

export const terminalSpatialGraphSchema: z.ZodType<TerminalSpatialGraph> =
  z.object({
    airportCode: z.string().length(3),
    terminalId: z.string(),
    nodes: z.array(terminalGraphNodeSchema),
    edges: z.array(terminalGraphEdgeSchema),
    source: z.enum(["curated", "parametric", "osm_indoor"]),
    updatedAt: z.string(),
  });

export interface TerminalRouteStep {
  from: TerminalGraphNode;
  to: TerminalGraphNode;
  edge: TerminalGraphEdge;
  instruction: string;
}

export interface TerminalRoute {
  fromNodeId: string;
  toNodeId: string;
  steps: TerminalRouteStep[];
  path: TerminalGraphNode[];
  totalDistanceMeters: number;
  estimatedMinutes: number;
  usesMovingWalkway: boolean;
  usesTrain: boolean;
  accessible: boolean;
}

export const terminalRouteSchema: z.ZodType<TerminalRoute> = z.object({
  fromNodeId: z.string(),
  toNodeId: z.string(),
  steps: z.array(
    z.object({
      from: terminalGraphNodeSchema,
      to: terminalGraphNodeSchema,
      edge: terminalGraphEdgeSchema,
      instruction: z.string(),
    }),
  ),
  path: z.array(terminalGraphNodeSchema),
  totalDistanceMeters: z.number().nonnegative(),
  estimatedMinutes: z.number().nonnegative(),
  usesMovingWalkway: z.boolean(),
  usesTrain: z.boolean(),
  accessible: z.boolean(),
});

export const SPRINT_URGENCIES = ["normal", "sprint", "critical"] as const;
export type SprintUrgency = (typeof SPRINT_URGENCIES)[number];

export interface SprintModeState {
  active: boolean;
  urgency: SprintUrgency;
  minutesUntilBoarding: number;
  arrivalGate: string;
  departureGate: string;
  route: TerminalRoute | null;
  headline: string;
  detail: string;
}

export const sprintModeStateSchema: z.ZodType<SprintModeState> = z.object({
  active: z.boolean(),
  urgency: z.enum(SPRINT_URGENCIES),
  minutesUntilBoarding: z.number().finite(),
  arrivalGate: z.string(),
  departureGate: z.string(),
  route: terminalRouteSchema.nullable(),
  headline: z.string(),
  detail: z.string(),
});

export interface FogOfWarState {
  visitedAirportCodes: string[];
  visitedTerminalKeys: string[];
  visitedAircraftTypes: string[];
  badges: string[];
  updatedAt: string;
}

export const fogOfWarStateSchema: z.ZodType<FogOfWarState> = z.object({
  visitedAirportCodes: z.array(z.string().length(3)),
  visitedTerminalKeys: z.array(z.string()),
  visitedAircraftTypes: z.array(z.string()),
  badges: z.array(z.string()),
  updatedAt: z.string(),
});
