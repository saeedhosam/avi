import { NextResponse } from "next/server";
import { fetchAeroJson } from "@/lib/aerodatabox";


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

export async function GET(
  _request: Request,
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

  const { data, status, mode } = await fetchAeroJson<{ routes?: AeroRouteStat[] }>(
    `/airports/iata/${code}/stats/routes/daily`,
  );

  return NextResponse.json({
    mode,
    status,
    routes: (data?.routes ?? [])
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
            code: operator.iata ?? operator.name?.slice(0, 2).toUpperCase(),
            name: operator.name ?? operator.iata,
          })),
      })),
  });
}
