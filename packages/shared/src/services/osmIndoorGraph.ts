import {
  type AmenityCategory,
  type PointF,
  type TerminalEdgeKind,
  type TerminalGraphEdge,
  type TerminalGraphNode,
  type TerminalNodeKind,
  type TerminalSpatialGraph,
} from "../models/terminalMap.js";

/**
 * Minimal Overpass-shaped indoor payload. Only nodes and ways are used; a
 * relation is accepted in the union so callers can pass an Overpass response
 * without pre-filtering it.
 */
export interface OsmIndoorNodeElement {
  type: "node";
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
}

export interface OsmIndoorWayElement {
  type: "way";
  id: number;
  /** OSM node references in way order. */
  nodes?: number[];
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
}

export interface OsmIndoorRelationElement {
  type: "relation";
  id: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
}

export type OsmIndoorElement =
  OsmIndoorNodeElement | OsmIndoorWayElement | OsmIndoorRelationElement;

export interface OsmIndoorPayload {
  elements?: OsmIndoorElement[];
}

export type OsmIndoorGraphInput = OsmIndoorPayload | OsmIndoorElement[];

export interface OsmIndoorGraphOptions {
  /** Three-letter IATA code stored on the graph. */
  airportCode: string;
  terminalId?: string;
  /** Clock for `updatedAt`. Defaults to now. */
  now?: Date;
  /** Level used when an OSM element has no `level` tag. Defaults to 0. */
  defaultLevel?: number;
}

interface OsmNodeRecord {
  lat: number;
  lon: number;
  tags: Record<string, string>;
}

interface DraftNode {
  id: string;
  level: number;
  kind: TerminalNodeKind;
  lat: number;
  lon: number;
  label?: string;
  amenityId?: string;
  category?: AmenityCategory;
  tags?: Record<string, string>;
}

const EARTH_RADIUS_M = 6_371_000;

function haversineMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const rLat1 = toRad(a.lat);
  const rLat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function levelFromTags(
  tags: Record<string, string> | undefined,
  fallback: number,
): number {
  const raw = tags?.level?.split(";")[0]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) ? Math.max(0, parsed) : fallback;
}

function labelFromTags(tags: Record<string, string>): string | undefined {
  const name = tags.name?.trim() || tags["name:en"]?.trim();
  if (name) return name;
  if (tags.aeroway === "gate" && tags.ref?.trim()) {
    return `Gate ${tags.ref.trim()}`;
  }
  return tags.ref?.trim() || undefined;
}

function categoryForTags(
  tags: Record<string, string> | undefined,
): AmenityCategory | null {
  if (!tags) return null;
  if (tags.aeroway === "gate") return "GATE";
  if (tags.amenity === "lounge" || tags.lounge != null) return "LOUNGE";
  if (tags.barrier === "immigration") return "IMMIGRATION";
  if (
    tags.aeroway === "security" ||
    tags.amenity === "security" ||
    tags.barrier === "security"
  ) {
    return "SECURITY";
  }
  if (
    tags.amenity === "restaurant" ||
    tags.amenity === "cafe" ||
    tags.amenity === "food_court" ||
    tags.amenity === "fast_food"
  ) {
    return "DINING";
  }
  if (tags.shop != null) return "SHOPPING";
  if (tags.amenity === "toilets") return "RESTROOM";
  if (
    tags.amenity === "drinking_water" ||
    tags.amenity === "water_point" ||
    tags.amenity === "fountain"
  ) {
    return "WATER";
  }
  if (tags.amenity === "charging_station" || tags.power_supply != null) {
    return "CHARGING";
  }
  if (
    tags.railway === "station" ||
    tags.railway === "platform" ||
    tags.aeroway === "baggage_claim"
  ) {
    return "TRANSIT";
  }
  if (
    tags.amenity === "first_aid" ||
    tags.amenity === "clinic" ||
    tags.amenity === "doctors"
  ) {
    return "MEDICAL";
  }
  if (tags.leisure === "playground" || tags.leisure === "play_area") {
    return "PLAY_AREA";
  }
  return null;
}

function kindForTags(
  tags: Record<string, string>,
  category: AmenityCategory | undefined,
): TerminalNodeKind {
  if (tags.aeroway === "gate") return "gate";
  if (category === "SECURITY" || tags.aeroway === "security") return "security";
  if (
    tags.entrance != null ||
    tags.door != null ||
    tags.indoor === "entrance"
  ) {
    return "entrance";
  }
  if (category === "TRANSIT") return "platform";
  if (category != null || labelFromTags(tags) != null) return "poi";
  return "junction";
}

/**
 * Classifies a way as a circulation path. Only these ways contribute corridor
 * edges from their node sequence; room outlines and other tagged areas become
 * POIs instead of being wired into the walking graph.
 */
function corridorKindFor(
  tags: Record<string, string> | undefined,
): TerminalEdgeKind | null {
  if (!tags) return null;
  if (tags.highway === "steps" || tags.indoor === "stairs") return "stairs";
  if (tags.highway === "elevator" || tags.indoor === "elevator") {
    return "elevator";
  }
  if (tags.highway === "escalator" || tags.indoor === "escalator") {
    return "escalator";
  }
  if (tags.conveying != null && tags.conveying !== "no") {
    return "moving_walkway";
  }
  if (tags.indoor === "moving_walkway" || tags.highway === "moving_walkway") {
    return "moving_walkway";
  }
  if (tags.railway === "train" || tags.indoor === "train") return "train";
  if (tags.indoor === "corridor" || tags.highway === "corridor") {
    return "corridor";
  }
  if (
    tags.highway === "footway" ||
    tags.highway === "path" ||
    tags.highway === "pedestrian"
  ) {
    return "walkway";
  }
  return null;
}

function speedForKind(kind: TerminalEdgeKind): number {
  switch (kind) {
    case "moving_walkway":
      return 1.8;
    case "train":
      return 5.2;
    case "elevator":
      return 0.9;
    case "escalator":
      return 1.0;
    case "stairs":
      return 0.8;
    default:
      return 1.25;
  }
}

function normalizePoint(
  lat: number,
  lon: number,
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number },
): PointF {
  const lonSpan = bounds.maxLon - bounds.minLon;
  const latSpan = bounds.maxLat - bounds.minLat;
  const x = lonSpan > 0 ? (lon - bounds.minLon) / lonSpan : 0.5;
  const y = latSpan > 0 ? (bounds.maxLat - lat) / latSpan : 0.5;
  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
  };
}

/**
 * Builds a `TerminalSpatialGraph` from OSM indoor nodes and ways.
 *
 * Corridor edges follow each circulation way's node sequence, with haversine
 * distances from the source geometry. Tagged indoor nodes and way centres map
 * to amenity categories and keep their raw tags for provenance; no proximity
 * edges are invented. The result is always `source: "osm_indoor"` and is not a
 * certified indoor survey.
 */
export function buildOsmIndoorGraph(
  input: OsmIndoorGraphInput,
  options: OsmIndoorGraphOptions,
): TerminalSpatialGraph {
  const airportCode = options.airportCode?.trim().toUpperCase() ?? "";
  if (!/^[A-Z]{3}$/.test(airportCode)) {
    throw new Error(
      "buildOsmIndoorGraph requires a 3-letter IATA airport code.",
    );
  }
  const defaultLevel = Math.max(0, Math.trunc(options.defaultLevel ?? 0));
  const elements = Array.isArray(input) ? input : (input.elements ?? []);
  const ways = elements.filter(
    (element): element is OsmIndoorWayElement => element.type === "way",
  );

  const osmNodes = new Map<number, OsmNodeRecord>();
  for (const element of elements) {
    if (element.type !== "node") continue;
    const lat = element.lat;
    const lon = element.lon;
    if (lat == null || lon == null) continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    osmNodes.set(element.id, {
      lat,
      lon,
      tags: element.tags ?? {},
    });
  }

  const levelHints = new Map<number, number>();
  const corridorRefs = new Set<number>();
  for (const way of ways) {
    const wayLevel = levelFromTags(way.tags, defaultLevel);
    const kind = corridorKindFor(way.tags);
    for (const ref of way.nodes ?? []) {
      if (!levelHints.has(ref)) levelHints.set(ref, wayLevel);
      if (kind && osmNodes.has(ref)) corridorRefs.add(ref);
    }
  }

  const drafts: DraftNode[] = [];
  const graphIdByOsmNode = new Map<number, string>();

  for (const [osmId, node] of osmNodes) {
    const tags = node.tags;
    const tagged = Object.keys(tags).length > 0;
    if (!tagged && !corridorRefs.has(osmId)) continue;
    const category = categoryForTags(tags) ?? undefined;
    const label = tagged ? labelFromTags(tags) : undefined;
    const kind = tagged ? kindForTags(tags, category) : "junction";
    const isPoi = category != null || label != null || kind !== "junction";
    const id = `OSM-NODE-${osmId}`;
    drafts.push({
      id,
      level: levelFromTags(tags, levelHints.get(osmId) ?? defaultLevel),
      kind,
      lat: node.lat,
      lon: node.lon,
      ...(label ? { label } : {}),
      ...(isPoi ? { amenityId: id } : {}),
      ...(category ? { category } : {}),
      ...(tagged ? { tags: { ...tags } } : {}),
    });
    graphIdByOsmNode.set(osmId, id);
  }

  for (const way of ways) {
    if (!way.tags) continue;
    // Circulation ways are represented by their node geometry.
    if (corridorKindFor(way.tags)) continue;
    const lat = way.center?.lat;
    const lon = way.center?.lon;
    if (lat == null || lon == null) continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const category = categoryForTags(way.tags) ?? undefined;
    const label = labelFromTags(way.tags);
    if (!category && !label) continue;
    const id = `OSM-WAY-${way.id}`;
    drafts.push({
      id,
      level: levelFromTags(way.tags, defaultLevel),
      kind: kindForTags(way.tags, category),
      lat,
      lon,
      ...(label ? { label } : {}),
      amenityId: id,
      ...(category ? { category } : {}),
      tags: { ...way.tags },
    });
  }

  const bounds =
    drafts.length > 0
      ? {
          minLat: Math.min(...drafts.map((node) => node.lat)),
          maxLat: Math.max(...drafts.map((node) => node.lat)),
          minLon: Math.min(...drafts.map((node) => node.lon)),
          maxLon: Math.max(...drafts.map((node) => node.lon)),
        }
      : { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 };

  const nodes: TerminalGraphNode[] = drafts.map((draft) => {
    const { lat, lon, ...rest } = draft;
    return {
      ...rest,
      point: normalizePoint(lat, lon, bounds),
    };
  });

  const edges: TerminalGraphEdge[] = [];
  const seenEdges = new Set<string>();
  for (const way of ways) {
    const kind = corridorKindFor(way.tags);
    if (!kind || !way.nodes?.length) continue;
    const resolvable: Array<{
      graphId: string;
      node: { lat: number; lon: number };
    }> = [];
    for (const ref of way.nodes) {
      const node = osmNodes.get(ref);
      const graphId = graphIdByOsmNode.get(ref);
      if (node && graphId) resolvable.push({ graphId, node });
    }
    for (let index = 1; index < resolvable.length; index += 1) {
      const previous = resolvable[index - 1];
      const next = resolvable[index];
      if (!previous || !next) continue;
      const distance = haversineMeters(previous.node, next.node);
      if (distance <= 0) continue;
      const key = `${[previous.graphId, next.graphId].sort().join("|")}:${kind}`;
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);
      edges.push({
        id: `${previous.graphId}->${next.graphId}:${kind}`,
        from: previous.graphId,
        to: next.graphId,
        kind,
        distanceMeters: round(distance),
        speedMps: speedForKind(kind),
        bidirectional: kind !== "train",
        accessible: kind !== "stairs",
      });
    }
  }

  return {
    airportCode,
    terminalId: options.terminalId?.trim() || "OSM",
    nodes,
    edges,
    source: "osm_indoor",
    updatedAt: (options.now ?? new Date()).toISOString(),
  };
}
