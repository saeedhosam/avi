import airportsJson from "@/data/airports.json";
import terminalLayoutsJson from "@/data/terminal-layouts.json";
import type {
  AirportNode,
  AirportTerminalLayout,
  RouteRegion,
} from "./types";

/**
 * Static reference data only.
 *
 * Airports and terminal layouts are geographic/wayfinding reference data.
 * Every operational value (flights, statuses, gates, delays, weather, routes)
 * is fetched live from AeroDataBox / Open-Meteo at runtime.
 */
export const routeAirports = airportsJson as AirportNode[];
export const terminalLayouts =
  terminalLayoutsJson as unknown as AirportTerminalLayout[];

export const airportNodeByIata = new Map(
  routeAirports.map((airport) => [airport.iata, airport]),
);

export function findAirportNode(iata: string): AirportNode | undefined {
  return airportNodeByIata.get(iata.trim().toUpperCase());
}

export function searchAirportNodes(query: string): AirportNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return routeAirports;
  return routeAirports.filter(
    (node) =>
      node.iata.toLowerCase().includes(q) ||
      node.icao.toLowerCase().includes(q) ||
      node.city.toLowerCase().includes(q) ||
      node.name.toLowerCase().includes(q) ||
      node.country.toLowerCase().includes(q),
  );
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
