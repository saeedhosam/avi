import type { AirportTerminalLayout } from "../models/terminalMap.js";
import {
  AMENITY_META,
  type AmenityCategory,
  type ConcourseFloor,
  type FogOfWarState,
  type PointF,
  type SprintModeState,
  type TerminalAmenity,
  type TerminalEdgeKind,
  type TerminalGraphEdge,
  type TerminalGraphNode,
  type TerminalRoute,
  type TerminalRouteStep,
  type TerminalSpatialGraph,
} from "../models/terminalMap.js";
import { minutesBetweenTimes } from "./flightStateDiffer.js";

export interface TerminalDimensions {
  widthMeters: number;
  heightMeters: number;
}

export const DEFAULT_TERMINAL_DIMENSIONS: TerminalDimensions = {
  widthMeters: 800,
  heightMeters: 600,
};

export interface TerminalGraphBuildOptions {
  dimensions?: TerminalDimensions;
  /** Only build one floor; omit to build every available level. */
  levels?: number[];
}

function floorForLevel(
  layout: AirportTerminalLayout,
  level: number,
): ConcourseFloor | null {
  return layout.floors[String(level)] ?? layout.floors[level as unknown as string] ?? null;
}

function pointDistanceMeters(
  a: PointF,
  b: PointF,
  dimensions: TerminalDimensions,
): number {
  return Math.hypot(
    (a.x - b.x) * dimensions.widthMeters,
    (a.y - b.y) * dimensions.heightMeters,
  );
}

function edgeKindForAmenity(amenity: TerminalAmenity): TerminalEdgeKind {
  const text = [...amenity.features, amenity.name, amenity.locationDescription]
    .join(" ")
    .toLowerCase();
  if (text.includes("airtrain") || text.includes("terminal train") || text.includes("automated people mover")) {
    return "train";
  }
  if (text.includes("moving walkway") || text.includes("travelator")) {
    return "moving_walkway";
  }
  return "walkway";
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

function nodeId(prefix: string, level: number, suffix: string): string {
  return `${prefix}-${level}-${suffix}`.toUpperCase().replace(/\s+/g, "_");
}

function edgeId(from: string, to: string, kind: TerminalEdgeKind): string {
  return `${from}->${to}:${kind}`;
}

/**
 * Builds a reusable spatial graph from the curated terminal layout:
 * entrances, security, the central hub, concourse piers, gates, and every POI.
 *
 * This is a *stylized* navigation model, not certified AMDB data. Distances
 * use the supplied terminal dimensions and are labelled approximate in the UI.
 */
export function buildTerminalGraph(
  layout: AirportTerminalLayout,
  options: TerminalGraphBuildOptions = {},
): TerminalSpatialGraph {
  const dimensions = options.dimensions ?? DEFAULT_TERMINAL_DIMENSIONS;
  const levels = options.levels ?? layout.availableLevels;
  const nodes: TerminalGraphNode[] = [];
  const edges: TerminalGraphEdge[] = [];

  const addNode = (node: TerminalGraphNode) => {
    nodes.push(node);
    return node;
  };
  const connect = (
    from: TerminalGraphNode,
    to: TerminalGraphNode,
    kind: TerminalEdgeKind,
    overrideDistance?: number,
  ) => {
    const distance =
      overrideDistance ??
      pointDistanceMeters(from.point, to.point, dimensions) +
        Math.abs(from.level - to.level) * 30;
    const edge: TerminalGraphEdge = {
      id: edgeId(from.id, to.id, kind),
      from: from.id,
      to: to.id,
      kind,
      distanceMeters: round(distance),
      speedMps: speedForKind(kind),
      bidirectional: kind !== "train",
      accessible: kind !== "stairs",
    };
    edges.push(edge);
  };

  for (const level of levels) {
    const floor = floorForLevel(layout, level);
    if (!floor) continue;

    const hub = addNode({
      id: nodeId("hub", level, "center"),
      level,
      kind: "junction",
      point: floor.centralHubCenter,
      label: `${floor.levelName} hub`,
    });
    const security = addNode({
      id: nodeId("security", level, "main"),
      level,
      kind: "security",
      point: floor.securityPosition,
      label: "Security checkpoint",
    });
    const entrance = addNode({
      id: nodeId("entrance", level, "main"),
      level,
      kind: "entrance",
      point: floor.entrancePosition,
      label: "Terminal entrance",
    });
    connect(entrance, security, "walkway");
    connect(security, hub, "walkway");

    for (const section of floor.concourseSections) {
      const start = addNode({
        id: nodeId("section", level, `${section.id}-start`),
        level,
        kind: "junction",
        point: section.start,
        label: section.name,
      });
      const end = addNode({
        id: nodeId("section", level, `${section.id}-end`),
        level,
        kind: "junction",
        point: section.end,
        label: section.name,
      });
      const kind: TerminalEdgeKind =
        /moving walkway|airtrain|train/i.test(section.name)
          ? "moving_walkway"
          : "corridor";
      connect(start, end, kind);
      // Attach the pier to whichever end is closer to the hub.
      const hubToStart = pointDistanceMeters(hub.point, start.point, dimensions);
      const hubToEnd = pointDistanceMeters(hub.point, end.point, dimensions);
      connect(hub, hubToStart <= hubToEnd ? start : end, "corridor");
      if (hubToStart <= hubToEnd) {
        connect(hub, end, "corridor");
      } else {
        connect(hub, start, "corridor");
      }
    }

    const levelAmenities = layout.amenities.filter((amenity) => amenity.level === level);
    const baseNodes = nodes.filter((node) => node.level === level);
    for (const amenity of levelAmenities) {
      const poi = addNode({
        id: nodeId("poi", level, amenity.id),
        level,
        kind: amenity.category === "GATE" ? "gate" : "poi",
        point: amenity.position,
        label: amenity.name,
        amenityId: amenity.id,
      });
      const nearest = baseNodes
        .map((node) => ({
          node,
          distance: pointDistanceMeters(node.point, poi.point, dimensions),
        }))
        .sort((a, b) => a.distance - b.distance)[0];
      if (nearest) {
        connect(poi, nearest.node, edgeKindForAmenity(amenity));
      }
    }
  }

  // Connect floors through the hub with accessible and stair options.
  const sortedLevels = [...levels].sort((a, b) => a - b);
  for (let index = 1; index < sortedLevels.length; index += 1) {
    const lower = nodes.find((node) => node.id === nodeId("hub", sortedLevels[index - 1]!, "center"));
    const upper = nodes.find((node) => node.id === nodeId("hub", sortedLevels[index]!, "center"));
    if (lower && upper) {
      connect(lower, upper, "elevator");
      connect(lower, upper, "escalator");
    }
  }

  return {
    airportCode: layout.airportCode,
    terminalId: layout.terminalId,
    nodes,
    edges,
    source: "curated",
    updatedAt: new Date().toISOString(),
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

interface Neighbor {
  node: TerminalGraphNode;
  edge: TerminalGraphEdge;
}

function adjacency(graph: TerminalSpatialGraph): Map<string, Neighbor[]> {
  const map = new Map<string, Neighbor[]>();
  const add = (fromId: string, toId: string, edge: TerminalGraphEdge) => {
    const to = graph.nodes.find((node) => node.id === toId);
    if (!to) return;
    const list = map.get(fromId) ?? [];
    list.push({ node: to, edge });
    map.set(fromId, list);
  };
  for (const edge of graph.edges) {
    add(edge.from, edge.to, edge);
    if (edge.bidirectional) add(edge.to, edge.from, edge);
  }
  return map;
}

interface DistanceState {
  nodeId: string;
  cost: number;
  minutes: number;
  distance: number;
  previous: { nodeId: string; edge: TerminalGraphEdge } | null;
}

export interface ShortestPathOptions {
  accessibleOnly?: boolean;
  /** Extra seconds added for level changes, queueing, or train waits. */
  transferPenaltySeconds?: number;
}

/**
 * Dijkstra over the indoor graph. Cost is travel time (distance/speed), with a
 * configurable fixed penalty for changing level. Returns null when disconnected.
 */
export function shortestPath(
  graph: TerminalSpatialGraph,
  fromNodeId: string,
  toNodeId: string,
  options: ShortestPathOptions = {},
): TerminalRoute | null {
  const from = graph.nodes.find((node) => node.id === fromNodeId);
  const to = graph.nodes.find((node) => node.id === toNodeId);
  if (!from || !to) return null;
  const map = adjacency(graph);
  const penalty = options.transferPenaltySeconds ?? 90;
  const distances = new Map<string, DistanceState>();
  distances.set(from.id, {
    nodeId: from.id,
    cost: 0,
    minutes: 0,
    distance: 0,
    previous: null,
  });
  const queue = new Set<string>([from.id]);

  while (queue.size > 0) {
    let currentId: string | null = null;
    let currentCost = Number.POSITIVE_INFINITY;
    for (const id of queue) {
      const state = distances.get(id);
      if (state && state.cost < currentCost) {
        currentCost = state.cost;
        currentId = id;
      }
    }
    if (currentId == null) break;
    queue.delete(currentId);
    if (currentId === to.id) break;

    const state = distances.get(currentId);
    if (!state) continue;
    const currentNode = graph.nodes.find((node) => node.id === currentId);
    for (const neighbor of map.get(currentId) ?? []) {
      if (options.accessibleOnly && !neighbor.edge.accessible) continue;
      const changesLevel =
        currentNode != null && neighbor.node.level !== currentNode.level;
      const levelPenalty =
        changesLevel &&
        neighbor.edge.kind !== "elevator" &&
        neighbor.edge.kind !== "escalator"
          ? penalty
          : 0;
      const seconds =
        neighbor.edge.distanceMeters / Math.max(0.1, neighbor.edge.speedMps) +
        levelPenalty;
      const candidateCost = state.cost + seconds;
      const existing = distances.get(neighbor.node.id);
      if (!existing || candidateCost < existing.cost) {
        distances.set(neighbor.node.id, {
          nodeId: neighbor.node.id,
          cost: candidateCost,
          minutes: candidateCost / 60,
          distance: state.distance + neighbor.edge.distanceMeters,
          previous: { nodeId: currentId, edge: neighbor.edge },
        });
        queue.add(neighbor.node.id);
      }
    }
  }

  const target = distances.get(to.id);
  if (!target) return null;

  const steps: TerminalRouteStep[] = [];
  const path: TerminalGraphNode[] = [to];
  let cursor: DistanceState | undefined = target;
  while (cursor?.previous) {
    const fromNode = graph.nodes.find((node) => node.id === cursor!.previous!.nodeId);
    const toNode = graph.nodes.find((node) => node.id === cursor!.nodeId);
    if (!fromNode || !toNode) break;
    steps.unshift({
      from: fromNode,
      to: toNode,
      edge: cursor.previous.edge,
      instruction: edgeInstruction(cursor.previous.edge, toNode),
    });
    path.unshift(fromNode);
    cursor = distances.get(cursor.previous.nodeId);
  }

  const kinds = new Set(steps.map((step) => step.edge.kind));
  return {
    fromNodeId: from.id,
    toNodeId: to.id,
    steps,
    path,
    totalDistanceMeters: Math.round(target.distance),
    estimatedMinutes: Math.max(0.5, Math.round(target.minutes * 10) / 10),
    usesMovingWalkway: kinds.has("moving_walkway"),
    usesTrain: kinds.has("train"),
    accessible: steps.every((step) => step.edge.accessible),
  };
}

function edgeInstruction(edge: TerminalGraphEdge, destination: TerminalGraphNode): string {
  const label = destination.label ? ` to ${destination.label}` : "";
  switch (edge.kind) {
    case "moving_walkway":
      return `Take the moving walkway${label} (${Math.round(edge.distanceMeters)} m).`;
    case "train":
      return `Take the terminal train${label}.`;
    case "elevator":
      return `Take the elevator to level ${destination.level}${label}.`;
    case "escalator":
      return `Take the escalator to level ${destination.level}${label}.`;
    case "stairs":
      return `Take the stairs to level ${destination.level}${label}.`;
    default:
      return `Walk ${Math.round(edge.distanceMeters)} m${label}.`;
  }
}

export function findAmenityNode(
  graph: TerminalSpatialGraph,
  layout: AirportTerminalLayout,
  amenityId: string,
): TerminalGraphNode | null {
  const amenity = layout.amenities.find((item) => item.id === amenityId);
  if (!amenity) return null;
  return (
    graph.nodes.find((node) => node.amenityId === amenityId) ??
    graph.nodes.find(
      (node) =>
        node.level === amenity.level &&
        Math.abs(node.point.x - amenity.position.x) < 1e-6 &&
        Math.abs(node.point.y - amenity.position.y) < 1e-6,
    ) ??
    null
  );
}

export function findGateNode(
  graph: TerminalSpatialGraph,
  gateNumber: string,
): TerminalGraphNode | null {
  const clean = gateNumber.trim().replace(/^gate\s*/i, "").toUpperCase();
  return (
    graph.nodes.find(
      (node) => node.kind === "gate" && node.label?.toUpperCase().includes(clean),
    ) ??
    graph.nodes.find((node) => node.amenityId?.toUpperCase().endsWith(clean)) ??
    null
  );
}

export interface NearestPoiResult {
  amenity: TerminalAmenity;
  node: TerminalGraphNode;
  route: TerminalRoute;
}

export interface NearestPoiOptions extends ShortestPathOptions {
  /** Restrict results to one floor. */
  level?: number;
}

/** Finds the quickest reachable POI in a category from a graph node. */
export function findNearestAmenity(
  graph: TerminalSpatialGraph,
  layout: AirportTerminalLayout,
  fromNodeId: string,
  category: AmenityCategory,
  options: NearestPoiOptions = {},
): NearestPoiResult | null {
  if (category === "ALL") return null;
  const candidates = layout.amenities.filter(
    (amenity) =>
      amenity.category === category &&
      (options.level == null || amenity.level === options.level),
  );
  let best: NearestPoiResult | null = null;
  for (const amenity of candidates) {
    const node = findAmenityNode(graph, layout, amenity.id);
    if (!node) continue;
    const route = shortestPath(graph, fromNodeId, node.id, options);
    if (!route) continue;
    if (!best || route.estimatedMinutes < best.route.estimatedMinutes) {
      best = { amenity, node, route };
    }
  }
  return best;
}

export interface SprintModeInput {
  layout: AirportTerminalLayout;
  graph: TerminalSpatialGraph;
  arrivalGate: string;
  departureGate: string;
  /** Scheduled arrival at the gate (HH:mm or ISO). */
  arrivalTime: string;
  /** Boarding time of the onward flight (HH:mm or ISO). */
  boardingTime: string;
  now?: string;
  accessibleOnly?: boolean;
}

function connectionMinutes(input: SprintModeInput): number {
  return minutesBetweenTimes(input.arrivalTime, input.boardingTime);
}

/**
 * Tight-Connection Sprint Mode. Activates below 45 minutes between arrival and
 * onward boarding and returns the fastest walking path, including any moving
 * walkways or terminal trains represented in the graph.
 */
export function evaluateSprintMode(input: SprintModeInput): SprintModeState {
  const minutes = connectionMinutes(input);
  const fromNode = findGateNode(input.graph, input.arrivalGate);
  const toNode = findGateNode(input.graph, input.departureGate);
  const route =
    fromNode && toNode
      ? shortestPath(input.graph, fromNode.id, toNode.id, {
          accessibleOnly: input.accessibleOnly,
        })
      : null;
  const active = Number.isFinite(minutes) && minutes < 45;
  const urgency = !active ? "normal" : minutes < 20 ? "critical" : "sprint";
  if (!active) {
    return {
      active: false,
      urgency,
      minutesUntilBoarding: minutes,
      arrivalGate: input.arrivalGate,
      departureGate: input.departureGate,
      route,
      headline: "Connection is comfortable",
      detail: Number.isFinite(minutes)
        ? `${Math.round(minutes)} minutes between arrival and boarding.`
        : "Connection timing is unavailable.",
    };
  }
  return {
    active: true,
    urgency,
    minutesUntilBoarding: minutes,
    arrivalGate: input.arrivalGate,
    departureGate: input.departureGate,
    route,
    headline:
      urgency === "critical"
        ? `SPRINT: ${Math.round(minutes)} min to boarding`
        : `Tight connection: ${Math.round(minutes)} min`,
    detail: route
      ? `${route.estimatedMinutes} min walk · ${route.totalDistanceMeters} m${route.usesTrain ? " · terminal train" : ""}${route.usesMovingWalkway ? " · moving walkway" : ""}`
      : "No indoor route is available for these gates.",
  };
}

/** One-tap glowing POI pills requested by the terminal HUD. */
export const QUICK_POI_FILTERS: Array<{
  category: AmenityCategory;
  label: string;
  icon: string;
}> = [
  { category: "RESTROOM", label: "Restroom", icon: "wc" },
  { category: "SECURITY", label: "Security", icon: "shield" },
  { category: "IMMIGRATION", label: "Immigration", icon: "passport" },
  { category: "WATER", label: "Water", icon: "water" },
  { category: "CHARGING", label: "Power", icon: "bolt" },
  { category: "LOUNGE", label: "Lounge", icon: "lounge" },
];

export function quickFilterMeta(category: AmenityCategory) {
  return QUICK_FILTER_FILTERS.get(category) ?? AMENITY_META[category];
}

const QUICK_FILTER_FILTERS = new Map(
  QUICK_POI_FILTERS.map((filter) => [
    filter.category,
    { ...AMENITY_META[filter.category], displayName: filter.label },
  ]),
);

// ── Fog-of-war passport gamification ────────────────────────────────────────

export interface FogVisit {
  airportCode: string;
  terminalId: string;
  level: number;
  aircraftType?: string;
  now?: string;
}

export function emptyFogOfWarState(now = new Date().toISOString()): FogOfWarState {
  return {
    visitedAirportCodes: [],
    visitedTerminalKeys: [],
    visitedAircraftTypes: [],
    badges: [],
    updatedAt: now,
  };
}

/**
 * Records a terminal walk. Fog clears per airport/terminal-level key; badges
 * unlock deterministically from the visited sets (no random rewards).
 */
export function recordFogVisit(
  state: FogOfWarState,
  visit: FogVisit,
): FogOfWarState {
  const airport = visit.airportCode.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(airport)) return state;
  const terminalKey = `${airport}-${visit.terminalId}-L${visit.level}`.toUpperCase();
  const airports = new Set(state.visitedAirportCodes);
  const terminals = new Set(state.visitedTerminalKeys);
  const aircraft = new Set(state.visitedAircraftTypes);
  airports.add(airport);
  terminals.add(terminalKey);
  if (visit.aircraftType?.trim()) {
    aircraft.add(visit.aircraftType.trim().toUpperCase());
  }

  const badges = new Set(state.badges);
  if (airports.size >= 1) badges.add("FIRST_TERMINAL_CLEARED");
  if (airports.size >= 5) badges.add("FIVE_AIRPORTS");
  if (airports.size >= 15) badges.add("GLOBAL_NOMAD");
  if (terminals.size >= 10) badges.add("TERMINAL_CARTOGRAPHER");
  if (aircraft.size >= 3) badges.add("AIRFRAME_COLLECTOR");

  return {
    visitedAirportCodes: [...airports].sort(),
    visitedTerminalKeys: [...terminals].sort(),
    visitedAircraftTypes: [...aircraft].sort(),
    badges: [...badges].sort(),
    updatedAt: visit.now ?? new Date().toISOString(),
  };
}

export function fogCoverageForAirport(
  state: FogOfWarState,
  airportCode: string,
  totalLevels: number,
): number {
  const code = airportCode.trim().toUpperCase();
  const visited = state.visitedTerminalKeys.filter((key) =>
    key.startsWith(`${code}-`),
  ).length;
  if (totalLevels <= 0) return 0;
  return Math.min(1, visited / totalLevels);
}
