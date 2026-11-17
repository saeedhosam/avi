import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import globalAirportsJson from "@/data/global-airports.json";
import terminalLayoutsJson from "@/data/terminal-layouts.json";
import type { AirportNode, AirportTerminalLayout, RouteRegion } from "./types";

export type GlobalAirportNode = AirportNode & {
  /**
   * Active route count from `apps/web/public/airports-routes.csv`. This is the
   * operator-maintained reference count used by the map, not a live schedule.
   */
  destCount?: number;
  /** True for airports that no longer accept commercial traffic. */
  historical?: boolean;
};

interface ReferenceAirportRecord {
  iata: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  region?: RouteRegion;
  latitude: number;
  longitude: number;
  hubAirlines?: string[];
}

/**
 * The CSV is the source of truth for which airports appear on the map and for
 * their active route counts. It has no coordinates, so each row is joined to
 * the bundled reference catalogue by IATA (preferred) or ICAO. Rows that resolve
 * to neither are intentionally omitted.
 *
 * `global-airports.json` is coordinate/identity reference data only. It is no
 * longer the map's membership list.
 */
function readAirportRoutesCsv(): string {
  const candidates = [
    // `next dev`, `next build`, and vitest run from apps/web.
    join(process.cwd(), "public", "airports-routes.csv"),
    // The standalone Docker runtime runs from the repo root.
    join(process.cwd(), "apps", "web", "public", "airports-routes.csv"),
  ];
  for (const candidate of candidates) {
    // `public` is always deployed alongside the app, so Turbopack does not need
    // to trace this runtime lookup into the server bundle.
    if (existsSync(/* turbopackIgnore: true */ candidate)) {
      return readFileSync(/* turbopackIgnore: true */ candidate, "utf8");
    }
  }
  throw new Error(
    `Unable to find airports-routes.csv (looked in ${candidates.join(", ")}).`,
  );
}

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF or LF. */
function parseCsv(text: string): string[][] {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (inQuotes) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') {
      inQuotes = true;
      continue;
    }
    if (character === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (character === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      continue;
    }
    if (character !== "\r") field += character;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const referenceAirports =
  globalAirportsJson as unknown as ReferenceAirportRecord[];
const referenceByIata = new Map<string, ReferenceAirportRecord>();
const referenceByIcao = new Map<string, ReferenceAirportRecord>();
for (const airport of referenceAirports) {
  if (airport.iata) referenceByIata.set(airport.iata.toUpperCase(), airport);
  if (airport.icao) referenceByIcao.set(airport.icao.toUpperCase(), airport);
}

const csvRows = parseCsv(readAirportRoutesCsv());
const header = (csvRows.shift() ?? []).map((cell) => cell.trim());
const columnIndex = (name: string) => header.indexOf(name);
const iataIndex = columnIndex("IATA");
const icaoIndex = columnIndex("ICAO");
const nameIndex = columnIndex("Airport Name");
const cityIndex = columnIndex("City");
const countryIndex = columnIndex("Country");
const routeCountIndex = columnIndex("Active Route Count");
for (const [name, index] of Object.entries({
  IATA: iataIndex,
  ICAO: icaoIndex,
  "Airport Name": nameIndex,
  City: cityIndex,
  Country: countryIndex,
  "Active Route Count": routeCountIndex,
})) {
  if (index < 0) {
    throw new Error(`airports-routes.csv is missing the "${name}" column.`);
  }
}

const airportsByIata = new Map<string, GlobalAirportNode>();
for (const cells of csvRows) {
  if (!cells.length || cells.every((cell) => !cell.trim())) continue;

  const csvIata = (cells[iataIndex] ?? "").trim().toUpperCase();
  const csvIcao = (cells[icaoIndex] ?? "").trim().toUpperCase();
  const activeRouteCount = Number.parseInt(
    (cells[routeCountIndex] ?? "").trim(),
    10,
  );
  if (!Number.isFinite(activeRouteCount) || activeRouteCount <= 0) continue;

  const reference =
    (csvIata && referenceByIata.get(csvIata)) ||
    (csvIcao && referenceByIcao.get(csvIcao)) ||
    null;
  if (!reference) continue;

  const latitude = Number(reference.latitude);
  const longitude = Number(reference.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

  // One CSV row (MRAO) has no IATA; keep the reference code so it remains
  // addressable on the map.
  const iata = csvIata || reference.iata.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(iata) || airportsByIata.has(iata)) continue;

  airportsByIata.set(iata, {
    iata,
    icao: csvIcao || reference.icao,
    name: (cells[nameIndex] ?? "").trim() || reference.name,
    city: (cells[cityIndex] ?? "").trim() || reference.city,
    country: (cells[countryIndex] ?? "").trim() || reference.country,
    region: reference.region ?? inferRegionFromCoords(latitude, longitude),
    latitude,
    longitude,
    // Provider-reported IANA zones are the only timezones shown as fact.
    timezone: "",
    hubAirlines: Array.isArray(reference.hubAirlines)
      ? reference.hubAirlines
      : [],
    destCount: activeRouteCount,
    historical: false,
  });
}

export const routeAirports: GlobalAirportNode[] = Array.from(
  airportsByIata.values(),
).sort(
  (left, right) =>
    (right.destCount ?? 0) - (left.destCount ?? 0) ||
    left.iata.localeCompare(right.iata),
);

export const terminalLayouts =
  terminalLayoutsJson as unknown as AirportTerminalLayout[];

export const airportNodeByIata = new Map(
  routeAirports.map((airport) => [airport.iata, airport]),
);

export function findAirportNode(iata: string): GlobalAirportNode | undefined {
  return airportNodeByIata.get(iata.trim().toUpperCase());
}

export function searchAirportNodes(query: string): GlobalAirportNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return routeAirports.slice(0, 40);
  const matched = routeAirports.filter(
    (node) =>
      node.iata.toLowerCase().includes(q) ||
      node.icao.toLowerCase().includes(q) ||
      node.city.toLowerCase().includes(q) ||
      node.name.toLowerCase().includes(q) ||
      node.country.toLowerCase().includes(q),
  );
  return matched.slice(0, 50);
}

export function inferRegionFromCoords(
  latitude: number,
  longitude: number,
): RouteRegion {
  if (longitude < -25) return "AMERICAS";
  if (latitude >= 15 && latitude <= 38 && longitude >= -18 && longitude <= 60) {
    return "MENA";
  }
  if (latitude < 15 && longitude >= -20 && longitude <= 55) return "AFRICA";
  if (longitude > 60) return "ASIA_PACIFIC";
  return "EUROPE";
}

export const AIRPORT_TERMINAL_LAYOUTS = new Map(
  terminalLayouts.map((layout) => [layout.airportCode, layout]),
);

export const REFERENCE_AIRPORT_CODES = routeAirports.map(
  (airport) => airport.iata,
);

export const QUICK_HUBS = [
  "CAI",
  "DXB",
  "LHR",
  "IST",
  "JFK",
  "DOH",
  "FRA",
  "CDG",
  "JED",
  "SIN",
  "HND",
  "SFO",
];
