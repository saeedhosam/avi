/**
 * OSM indoor graph ingestion (Overpass → Supabase `terminal_graphs`).
 *
 * Usage:
 *   pnpm --filter @avi/api ingest:indoor -- CAI --terminal=T3 --radius=2500
 *
 * The resulting graph is a proximity graph over tagged indoor nodes and way
 * centres. It is explicitly `source: "osm_indoor"` and is *not* a certified
 * indoor survey. The curated catalog remains the deterministic fallback.
 */
import catalogAirports from "@avi/catalog/airports.json" with { type: "json" };
import { loadConfig } from "../config.js";

interface CatalogAirport {
  iata: string;
  latitude?: number;
  longitude?: number;
}

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
}

interface GraphNode {
  id: string;
  level: number;
  kind: "poi" | "junction" | "gate" | "security" | "entrance" | "platform";
  point: { x: number; y: number };
  label?: string;
  amenityId?: string;
}

interface GraphEdge {
  id: string;
  from: string;
  to: string;
  kind: "corridor" | "walkway" | "moving_walkway" | "train" | "stairs" | "escalator" | "elevator";
  distanceMeters: number;
  speedMps: number;
  bidirectional: boolean;
  accessible: boolean;
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

function parseArgs(argv: string[]) {
  const iata = argv[0]?.trim().toUpperCase();
  let terminal = "T3";
  let radius = 2500;
  for (const arg of argv.slice(1)) {
    if (arg.startsWith("--terminal=")) terminal = arg.slice("--terminal=".length);
    if (arg.startsWith("--radius=")) {
      const parsed = Number(arg.slice("--radius=".length));
      if (Number.isFinite(parsed)) radius = Math.min(5000, Math.max(300, parsed));
    }
  }
  return { iata, terminal, radius };
}

function categoryFor(tags: Record<string, string>): {
  category: string;
  kind: GraphNode["kind"];
} {
  if (tags.aeroway === "gate") return { category: "GATE", kind: "gate" };
  if (tags.amenity === "toilets") return { category: "RESTROOM", kind: "poi" };
  if (tags.amenity === "charging_station") return { category: "CHARGING", kind: "poi" };
  if (tags.amenity === "drinking_water") return { category: "WATER", kind: "poi" };
  if (tags.amenity === "lounge") return { category: "LOUNGE", kind: "poi" };
  if (tags.amenity === "restaurant" || tags.amenity === "cafe") {
    return { category: "DINING", kind: "poi" };
  }
  if (tags.shop === "duty_free") return { category: "SHOPPING", kind: "poi" };
  if (tags.barrier === "immigration") return { category: "IMMIGRATION", kind: "security" };
  if (tags.amenity === "first_aid") return { category: "MEDICAL", kind: "poi" };
  if (tags.railway === "station" || tags.aeroway === "baggage_claim") {
    return { category: "TRANSIT", kind: "platform" };
  }
  return { category: "TRANSIT", kind: "junction" };
}

async function main() {
  const { iata, terminal, radius } = parseArgs(process.argv.slice(2));
  if (!iata || !/^[A-Z]{3}$/.test(iata)) {
    throw new Error("Pass a 3-letter IATA code, e.g. `-- CAI --terminal=T3`.");
  }
  const airport = (catalogAirports as CatalogAirport[]).find(
    (entry) => entry.iata === iata,
  );
  if (airport?.latitude == null || airport.longitude == null) {
    throw new Error(`No verified coordinates for ${iata} in @avi/catalog.`);
  }
  const config = loadConfig();
  if (!config.SUPABASE_URL || !config.SUPABASE_SECRET_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
  }

  const query = `[out:json][timeout:60];
(
  node["amenity"~"toilets|charging_station|drinking_water|lounge|restaurant|cafe|first_aid"](around:${radius},${airport.latitude},${airport.longitude});
  node["aeroway"="gate"](around:${radius},${airport.latitude},${airport.longitude});
  node["barrier"="immigration"](around:${radius},${airport.latitude},${airport.longitude});
  way["aeroway"="gate"](around:${radius},${airport.latitude},${airport.longitude});
  way["indoor"](around:${radius},${airport.latitude},${airport.longitude});
  way["shop"="duty_free"](around:${radius},${airport.latitude},${airport.longitude});
  node["railway"="station"](around:${radius},${airport.latitude},${airport.longitude});
);
out center tags;`;
  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ data: query }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) {
    throw new Error(`Overpass returned HTTP ${response.status}`);
  }
  const payload = (await response.json()) as { elements?: OverpassElement[] };
  const elements = (payload.elements ?? []).filter((element) => {
    const lat = element.lat ?? element.center?.lat;
    const lon = element.lon ?? element.center?.lon;
    return lat != null && lon != null && element.tags;
  });
  if (!elements.length) {
    throw new Error("Overpass returned no tagged indoor elements in that radius.");
  }

  const latSpan = radius / 111_320;
  const lonSpan = radius / (111_320 * Math.max(0.2, Math.cos((airport.latitude * Math.PI) / 180)));
  const minLat = airport.latitude - latSpan;
  const maxLat = airport.latitude + latSpan;
  const minLon = airport.longitude - lonSpan;
  const maxLon = airport.longitude + lonSpan;
  const clamp = (value: number) => Math.min(0.98, Math.max(0.02, value));

  const rawNodes = elements.map((element) => {
    const lat = element.lat ?? element.center!.lat!;
    const lon = element.lon ?? element.center!.lon!;
    const tags = element.tags ?? {};
    const { category, kind } = categoryFor(tags);
    return {
      id: `OSM-${element.type}-${element.id}`,
      lat,
      lon,
      tags,
      category,
      kind,
      label:
        tags.name ??
        tags.ref ??
        (tags.aeroway === "gate" ? `Gate ${tags.ref ?? ""}`.trim() : undefined) ??
        category,
    };
  });

  const nodes: GraphNode[] = rawNodes.map((node) => ({
    id: node.id,
    level: 1,
    kind: node.kind,
    point: {
      x: clamp((node.lon - minLon) / (maxLon - minLon)),
      y: clamp((maxLat - node.lat) / (maxLat - minLat)),
    },
    ...(node.label ? { label: node.label } : {}),
    amenityId: node.id,
  }));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const maxEdgeMeters = 450;
  for (const source of rawNodes) {
    const nearest = rawNodes
      .filter((candidate) => candidate.id !== source.id)
      .map((candidate) => ({
        candidate,
        distance: haversineMeters(
          { lat: source.lat, lon: source.lon },
          { lat: candidate.lat, lon: candidate.lon },
        ),
      }))
      .filter((entry) => entry.distance <= maxEdgeMeters)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3);
    for (const { candidate, distance } of nearest) {
      const first = source.id < candidate.id ? source.id : candidate.id;
      const second = source.id < candidate.id ? candidate.id : source.id;
      const key = `${first}|${second}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const nodeA = nodeById.get(source.id);
      const nodeB = nodeById.get(candidate.id);
      if (!nodeA || !nodeB) continue;
      edges.push({
        id: `${first}->${second}:corridor`,
        from: first,
        to: second,
        kind: "corridor",
        distanceMeters: Math.round(distance * 10) / 10,
        speedMps: 1.25,
        bidirectional: true,
        accessible: true,
      });
    }
  }

  const graph = {
    airportCode: iata,
    terminalId: terminal,
    nodes,
    edges,
    source: "osm_indoor" as const,
    updatedAt: new Date().toISOString(),
  };

  const url = `${config.SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/terminal_graphs?on_conflict=airport_code,terminal_id`;
  const write = await fetch(url, {
    method: "POST",
    headers: {
      apikey: config.SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${config.SUPABASE_SECRET_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal,resolution=merge-duplicates",
    },
    body: JSON.stringify({
      airport_code: iata,
      terminal_id: terminal,
      graph,
      source: "osm_indoor",
      fetched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!write.ok) {
    throw new Error(`terminal_graphs upsert failed with HTTP ${write.status}`);
  }
  console.log(
    `indoor graph written: ${iata} ${terminal} · ${nodes.length} nodes · ${edges.length} edges · source=osm_indoor`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
