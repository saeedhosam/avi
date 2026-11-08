import globalAirportsJson from "@/data/global-airports.json";
import terminalLayoutsJson from "@/data/terminal-layouts.json";
import type {
  AirportNode,
  AirportTerminalLayout,
  RouteRegion,
} from "./types";

export type GlobalAirportNode = AirportNode & {
  destCount?: number;
};

const EXTRA_AIRPORTS: GlobalAirportNode[] = [
  {
    iata: "HMB",
    icao: "HESG",
    name: "Sohag International Airport",
    city: "Sohag",
    country: "Egypt",
    region: "MENA",
    latitude: 26.3328,
    longitude: 31.7371,
    timezone: "EEST (UTC+3)",
    hubAirlines: ["Air Cairo"],
    destCount: 12,
  },
  {
    iata: "MED",
    icao: "OEMA",
    name: "Prince Mohammad bin Abdulaziz International Airport",
    city: "Medina",
    country: "Saudi Arabia",
    region: "MENA",
    latitude: 24.5534,
    longitude: 39.7051,
    timezone: "AST (UTC+3)",
    hubAirlines: ["Saudia", "Flynas", "Air Cairo"],
    destCount: 42,
  },
];

/**
 * Global reference data covering worldwide commercial airports.
 */
export const routeAirports = [
  ...EXTRA_AIRPORTS,
  ...(globalAirportsJson as GlobalAirportNode[]),
];
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
