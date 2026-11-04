import airportsJson from "@/data/airports.json";
import flightsJson from "@/data/flights.json";
import routesJson from "@/data/routes.json";
import alertsJson from "@/data/alerts.json";
import mockAirportsJson from "@/data/mock-airports.json";
import realtimeAirportsJson from "@/data/realtime-airports.json";
import terminalLayoutsJson from "@/data/terminal-layouts.json";
import type {
  Airport,
  AirportNode,
  AirportRouteNetworkSummary,
  AirlineFilterChipItem,
  DirectFlightConnection,
  Flight,
  FlightAlert,
  OperatingCarrierRoute,
  RealtimeAirportInfo,
  RouteSpec,
  AirportTerminalLayout,
} from "./types";
import {
  classifyHaul,
  estimateDurationMinutes,
  formatDuration,
  geodesicDistanceKm,
  kmToNm,
} from "./utils";

export const routeAirports = airportsJson as AirportNode[];
export const routeSpecs = routesJson as RouteSpec[];
export const mockAirports = mockAirportsJson as Airport[];
export const initialFlights = flightsJson as unknown as Flight[];
export const sampleAlerts = alertsJson as FlightAlert[];
export const realtimeAirports = realtimeAirportsJson as RealtimeAirportInfo[];
export const terminalLayouts = terminalLayoutsJson as unknown as AirportTerminalLayout[];

export const airportNodeByIata = new Map(
  routeAirports.map((airport) => [airport.iata, airport]),
);

export const mockAirportByCode = new Map(
  mockAirports.map((airport) => [airport.code, airport]),
);

export function getAirportNode(iata: string): AirportNode {
  return (
    airportNodeByIata.get(iata.trim().toUpperCase()) ??
    routeAirports[0]
  );
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

export function getRealtimeAirport(code: string): RealtimeAirportInfo | undefined {
  return realtimeAirports.find(
    (airport) => airport.code.toUpperCase() === code.toUpperCase(),
  );
}

export function routeAirportToAirport(node: AirportNode): Airport {
  const known = mockAirportByCode.get(node.iata);
  return (
    known ?? {
      code: node.iata,
      name: node.name,
      city: node.city,
      country: node.country,
      timezone: node.timezone,
      latitude: node.latitude,
      longitude: node.longitude,
      weather: {
        tempC: 20,
        tempF: 68,
        condition: "Partly Cloudy",
        wind: "10 kt NW",
        visibility: "10+ mi",
        humidity: 58,
      },
    }
  );
}

function buildConnection(
  origin: AirportNode,
  destination: AirportNode,
  dailyFlights: number,
  carriers: OperatingCarrierRoute[],
): DirectFlightConnection {
  const distanceKm = geodesicDistanceKm(
    origin.latitude,
    origin.longitude,
    destination.latitude,
    destination.longitude,
  );
  const duration = estimateDurationMinutes(distanceKm);
  return {
    id: `${origin.iata}-${destination.iata}`,
    origin,
    destination,
    distanceKm,
    distanceNm: kmToNm(distanceKm),
    estimatedDurationMinutes: duration,
    durationFormatted: formatDuration(duration),
    haulCategory: classifyHaul(distanceKm),
    dailyFlightsCount: dailyFlights,
    hasDepartures: true,
    hasArrivals: true,
    operatingCarriers: carriers,
    isLiveVerified: false,
  };
}

const FALLBACK_HUBS = [
  "CAI",
  "LHR",
  "DXB",
  "IST",
  "FRA",
  "CDG",
  "DOH",
  "JFK",
  "SIN",
  "AMS",
  "MAD",
  "ATH",
];

function fallbackCarrier(origin: AirportNode, hub: AirportNode): OperatingCarrierRoute {
  const airlineName =
    origin.hubAirlines[0] ?? hub.hubAirlines[0] ?? "Global Airways";
  const code = airlineName.slice(0, 2).toUpperCase();
  let hash = 0;
  for (const char of `${origin.iata}${hub.iata}`) hash = (hash * 31 + char.charCodeAt(0)) & 0xff;
  return {
    airlineCode: code,
    airlineName,
    flightNumbers: [`${code} ${200 + hash}`],
    dailyFrequencies: 2,
    aircraftTypes: ["Boeing 787-9"],
  };
}

export function getConnectionsForOrigin(originIata: string): DirectFlightConnection[] {
  const origin = getAirportNode(originIata);
  const code = origin.iata;
  const matches: Array<{
    destination: AirportNode;
    dailyFlights: number;
    carriers: OperatingCarrierRoute[];
  }> = [];

  for (const spec of routeSpecs) {
    if (spec.origin === code) {
      matches.push({
        destination: getAirportNode(spec.destination),
        dailyFlights: spec.dailyFlights,
        carriers: spec.carriers,
      });
    } else if (spec.destination === code) {
      matches.push({
        destination: getAirportNode(spec.origin),
        dailyFlights: spec.dailyFlights,
        carriers: spec.carriers,
      });
    }
  }

  const seen = new Set(matches.map((match) => match.destination.iata));
  seen.add(code);

  if (matches.length < 8) {
    for (const hubCode of FALLBACK_HUBS) {
      if (seen.has(hubCode)) continue;
      const hub = getAirportNode(hubCode);
      matches.push({
        destination: hub,
        dailyFlights: 2,
        carriers: [fallbackCarrier(origin, hub)],
      });
      seen.add(hubCode);
      if (matches.length >= 12) break;
    }
  }

  const unique = new Map<string, (typeof matches)[number]>();
  for (const match of matches) {
    if (!unique.has(match.destination.iata)) unique.set(match.destination.iata, match);
  }

  return [...unique.values()]
    .map((match) =>
      buildConnection(origin, match.destination, match.dailyFlights, match.carriers),
    )
    .sort((a, b) => b.dailyFlightsCount - a.dailyFlightsCount);
}

export function getAllUniqueConnections(): DirectFlightConnection[] {
  return routeSpecs
    .map((spec) =>
      buildConnection(
        getAirportNode(spec.origin),
        getAirportNode(spec.destination),
        spec.dailyFlights,
        spec.carriers,
      ),
    )
    .sort((a, b) => b.dailyFlightsCount - a.dailyFlightsCount);
}

export function buildNetworkSummary(
  originIata?: string | null,
): AirportRouteNetworkSummary {
  const origin = originIata ? getAirportNode(originIata) : null;
  const connections = origin
    ? getConnectionsForOrigin(origin.iata)
    : getAllUniqueConnections();

  const countries = new Set(connections.map((conn) => conn.destination.country)).size;
  const airlineMap = new Map<string, AirlineFilterChipItem>();
  for (const conn of connections) {
    for (const carrier of conn.operatingCarriers) {
      const current = airlineMap.get(carrier.airlineCode);
      if (current) {
        current.destinationCount += 1;
      } else {
        airlineMap.set(carrier.airlineCode, {
          code: carrier.airlineCode,
          name: carrier.airlineName,
          destinationCount: 1,
        });
      }
    }
  }

  const availableAirlines = [...airlineMap.values()].sort(
    (a, b) => b.destinationCount - a.destinationCount,
  );

  return {
    originAirport: origin,
    connections,
    totalDirectDestinations: connections.length,
    totalCountriesServed: countries,
    totalOperatingAirlines: availableAirlines.length,
    totalDailyFlights: connections.reduce(
      (sum, conn) => sum + conn.dailyFlightsCount,
      0,
    ),
    availableAirlines,
  };
}

export const QUICK_FLIGHTS = [
  "AA 100",
  "BA 178",
  "DL 404",
  "EK 201",
  "UA 875",
  "SQ 22",
  "AF 006",
  "NH 106",
];

export const POPULAR_ROUTES: Array<[string, string]> = [
  ["JFK", "LHR"],
  ["SFO", "HND"],
  ["DXB", "CDG"],
  ["ORD", "SFO"],
  ["SIN", "HND"],
  ["LHR", "DXB"],
];

export const AIRPORT_TERMINAL_LAYOUTS = new Map(
  terminalLayouts.map((layout) => [layout.airportCode, layout]),
);
