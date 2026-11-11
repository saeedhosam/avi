import globalAirportsJson from "@/data/global-airports.json";
import terminalLayoutsJson from "@/data/terminal-layouts.json";
import type {
  AirportNode,
  AirportTerminalLayout,
  RouteRegion,
} from "./types";

export type GlobalAirportNode = AirportNode & {
  /**
   * Reference count from the bundled catalog. This is not a live route count
   * and must not be presented as one.
   */
  destCount?: number;
  /** True for airports that no longer accept commercial traffic. */
  historical?: boolean;
};

/**
 * Global reference data covering worldwide commercial airports. This is
 * reference data only: live route and schedule data always comes from the
 * provider.
 *
 * The bundled catalog no longer stores timezone abbreviations such as
 * "CEST (UTC+2)": those become wrong across DST boundaries and are not IANA
 * identifiers. Timezones are omitted (empty string) and only provider-reported
 * IANA zones are shown as fact.
 */
const referenceAirports = globalAirportsJson as unknown as Array<
  Omit<GlobalAirportNode, "timezone"> & { timezone?: string }
>;
export const routeAirports: GlobalAirportNode[] = referenceAirports.map(
  (airport) => ({
    ...airport,
    timezone: airport.timezone ?? "",
  }),
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
