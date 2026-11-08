import { NextResponse } from "next/server";
import { fetchAeroJson } from "@/lib/aerodatabox";
import { gatewayFetchJson } from "@/lib/gateway";
import globalRoutesJson from "@/data/global-routes.json";
import airlineNamesJson from "@/data/airline-names.json";
import { findAirportNode } from "@/lib/data";

interface AeroRouteStat {
  destination?: {
    iata?: string;
    icao?: string;
    name?: string;
    municipalityName?: string;
    countryCode?: string;
    timeZone?: string;
    location?: { lat?: number; lon?: number };
  };
  averageDailyFlights?: number;
  operators?: Array<{ iata?: string; name?: string }>;
}

const airlineNames = airlineNamesJson as Record<string, string>;
const AIRLINE_OVERRIDES: Record<string, string> = {
  SM: "Air Cairo",
  XY: "Flynas",
  MS: "EgyptAir",
  SV: "Saudia",
  J9: "Jazeera Airways",
  KU: "Kuwait Airways",
};

const EXTRA_ROUTES: Record<string, Array<{ dest: string; airlines: string[] }>> = {
  HMB: [
    { dest: "MED", airlines: ["SM"] },
    { dest: "JED", airlines: ["SM", "XY"] },
    { dest: "RUH", airlines: ["SM", "XY"] },
    { dest: "KWI", airlines: ["J9", "KU"] },
    { dest: "CAI", airlines: ["MS"] },
  ],
  MED: [
    { dest: "HMB", airlines: ["SM"] },
    { dest: "CAI", airlines: ["MS", "SM", "SV"] },
    { dest: "JED", airlines: ["SV"] },
    { dest: "RUH", airlines: ["SV", "XY"] },
    { dest: "DMM", airlines: ["SV", "XY"] },
    { dest: "KWI", airlines: ["KU", "J9"] },
    { dest: "DXB", airlines: ["FZ"] },
  ],
};

const globalRoutes = globalRoutesJson as Record<string, Array<{ dest: string; airlines: string[] }>>;

function getFallbackRoutes(code: string) {
  const routes = EXTRA_ROUTES[code] ?? globalRoutes[code] ?? [];
  return routes
    .map((r) => {
      const node = findAirportNode(r.dest);
      if (!node) return null;
      return {
        destination: node.iata,
        destinationName: node.name,
        city: node.city,
        country: node.country,
        icao: node.icao,
        timezone: node.timezone,
        latitude: node.latitude,
        longitude: node.longitude,
        dailyFlights: Math.max(1, r.airlines.length),
        operators: r.airlines.map((aCode) => ({
          code: aCode,
          name: AIRLINE_OVERRIDES[aCode] ?? airlineNames[aCode] ?? aCode,
        })),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code: rawCode } = await context.params;
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    return NextResponse.json(
      { mode: "NOT_CONFIGURED", routes: [], error: "Invalid IATA code" },
      { status: 400 },
    );
  }

  // 1. Gateway-first
  const gatewayResult = await gatewayFetchJson<{
    mode: string;
    status: number;
    routes: Array<{
      destination: string;
      destinationName?: string;
      city?: string;
      country?: string;
      icao?: string;
      timezone?: string;
      latitude: number;
      longitude: number;
      dailyFlights: number;
      operators: Array<{ code: string; name: string }>;
    }>;
  }>(`/v1/airports/${code}/routes`, request.headers.get("authorization"));
  
  if (gatewayResult && Array.isArray(gatewayResult.routes)) {
    return NextResponse.json(gatewayResult);
  }

  // 2. Direct AeroDataBox lookup if configured
  const { data, status, mode } = await fetchAeroJson<{ routes?: AeroRouteStat[] }>(
    `/airports/iata/${code}/stats/routes/daily`,
  );

  const liveRoutes = (data?.routes ?? [])
    .filter(
      (route) =>
        route.destination?.iata &&
        route.destination.location?.lat != null &&
        route.destination.location?.lon != null,
    )
    .map((route) => ({
      destination: route.destination?.iata,
      destinationName: route.destination?.name,
      city: route.destination?.municipalityName,
      country: route.destination?.countryCode,
      icao: route.destination?.icao,
      timezone: route.destination?.timeZone,
      latitude: route.destination?.location?.lat,
      longitude: route.destination?.location?.lon,
      dailyFlights: Math.max(1, Math.round(route.averageDailyFlights ?? 1)),
      operators: (route.operators ?? [])
        .filter((operator) => operator.iata || operator.name)
        .map((operator) => ({
          code: operator.iata ?? operator.name?.slice(0, 2).toUpperCase() ?? "",
          name: operator.name ?? airlineNames[operator.iata ?? ""] ?? operator.iata ?? "",
        })),
    }));

  if (liveRoutes.length > 0) {
    return NextResponse.json({
      mode,
      status,
      routes: liveRoutes,
    });
  }

  // 3. Fallback to global route dataset
  const fallback = getFallbackRoutes(code);
  const fallbackMode =
    mode === "LIVE_AERODATABOX"
      ? "LIVE_AERODATABOX"
      : mode === "QUOTA_FALLBACK"
        ? "QUOTA_FALLBACK"
        : "STATIC_FALLBACK";

  return NextResponse.json({
    mode: fallbackMode,
    status: 200,
    routes: fallback,
  });
}
