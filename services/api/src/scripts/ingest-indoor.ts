/**
 * OSM indoor graph ingestion (Overpass → Supabase `terminal_graphs`).
 *
 * Usage:
 *   pnpm --filter @avi/api ingest:indoor -- CAI --terminal=T3 --radius=2500
 *
 * The graph is built by the shared `buildOsmIndoorGraph` helper from OSM way
 * geometry. It is explicitly `source: "osm_indoor"` and is not a certified
 * indoor survey. The curated catalog remains the deterministic fallback.
 */
import "dotenv/config";
import catalogAirports from "@avi/catalog/airports.json" with { type: "json" };
import { buildOsmIndoorGraph } from "@avi/shared";
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
  nodes?: number[];
  tags?: Record<string, string>;
}

function parseArgs(argv: string[]) {
  const positionals = argv.filter((arg) => !arg.startsWith("--"));
  const iata = positionals[0]?.trim().toUpperCase();
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

  // `out body` returns the selected ways with their ordered node refs; the
  // recursion then returns every geometry node needed to build corridor edges.
  const query = `[out:json][timeout:60];
(
  node["amenity"~"toilets|charging_station|drinking_water|lounge|restaurant|cafe|food_court|fast_food|first_aid"](around:${radius},${airport.latitude},${airport.longitude});
  node["aeroway"="gate"](around:${radius},${airport.latitude},${airport.longitude});
  node["barrier"="immigration"](around:${radius},${airport.latitude},${airport.longitude});
  node["railway"="station"](around:${radius},${airport.latitude},${airport.longitude});
  way["aeroway"="gate"](around:${radius},${airport.latitude},${airport.longitude});
  way["indoor"](around:${radius},${airport.latitude},${airport.longitude});
  way["shop"="duty_free"](around:${radius},${airport.latitude},${airport.longitude});
  way["highway"~"corridor|footway|path|pedestrian|steps|elevator|escalator|moving_walkway"](around:${radius},${airport.latitude},${airport.longitude});
);
out body;
>;
out skel qt;`;
  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": "Avi-Indoor-Ingest/1.0 (ops@avi.local)",
    },
    body: new URLSearchParams({ data: query }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Overpass returned HTTP ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`,
    );
  }
  const payload = (await response.json()) as { elements?: OverpassElement[] };
  const elements = payload.elements ?? [];
  if (!elements.length) {
    throw new Error("Overpass returned no indoor elements in that radius.");
  }

  const graph = buildOsmIndoorGraph(elements, {
    airportCode: iata,
    terminalId: terminal,
    defaultLevel: 1,
  });
  if (!graph.nodes.length) {
    throw new Error(
      "OSM elements were returned but none had usable indoor geometry or tags.",
    );
  }

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
    `indoor graph written: ${iata} ${terminal} · ${graph.nodes.length} nodes · ${graph.edges.length} edges · source=osm_indoor`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
