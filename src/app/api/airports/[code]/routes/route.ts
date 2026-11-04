import { NextResponse } from "next/server";
import { fetchAeroJson } from "@/lib/aerodatabox";


interface AeroRouteStat {
  destination?: {
    iata?: string;
    icao?: string;
    name?: string;
    municipalityName?: string;
    countryCode?: string;
    location?: { lat?: number; lon?: number };
  };
  averageDailyFlights?: number;
  operators?: Array<{ iata?: string; name?: string }>;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code: rawCode } = await context.params;
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    return NextResponse.json(
      { mode: "DEMO_CACHE_NO_KEY", routes: [], error: "Invalid IATA code" },
      { status: 400 },
    );
  }

  const { data, status, mode } = await fetchAeroJson<{ routes?: AeroRouteStat[] }>(
    `/airports/iata/${code}/stats/routes/daily`,
  );

  return NextResponse.json({
    mode,
    status,
    routes: (data?.routes ?? []).map((route) => ({
      destination: route.destination?.iata,
      destinationName: route.destination?.name,
      city: route.destination?.municipalityName,
      country: route.destination?.countryCode,
      latitude: route.destination?.location?.lat,
      longitude: route.destination?.location?.lon,
      dailyFlights: Math.max(1, Math.round(route.averageDailyFlights ?? 1)),
      operators: (route.operators ?? []).map((operator) => ({
        code: operator.iata,
        name: operator.name,
      })),
    })),
  });
}
