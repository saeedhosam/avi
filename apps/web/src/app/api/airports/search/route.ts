import { NextResponse } from "next/server";
import {
  fetchAeroJson,
  type AeroAirportDto,
} from "@/lib/aerodatabox";
import { gatewayConfigured, gatewayFetchJson } from "@/lib/gateway";
import { inferRegionFromCoords } from "@/lib/data";
import type { AirportNode } from "@/lib/types";

interface AeroAirportSearchResponse {
  items?: AeroAirportDto[];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ mode: "LIVE_AERODATABOX", airports: [] });
  }

  const gatewayResult = await gatewayFetchJson<{
    mode: string;
    status: number;
    airports: AirportNode[];
  }>(`/v1/airports/search?q=${encodeURIComponent(q)}`, request.headers.get("authorization"));
  if (gatewayResult) {
    return NextResponse.json(gatewayResult);
  }
  if (gatewayConfigured()) {
    return NextResponse.json(
      {
        mode: "NOT_CONFIGURED",
        status: 0,
        airports: [],
        error: "Airport search is temporarily unavailable.",
      },
      { status: 503 },
    );
  }

  const { data, status, mode } = await fetchAeroJson<AeroAirportSearchResponse>(
    `/airports/search/term?q=${encodeURIComponent(q)}&limit=20`,
  );

  const airports: AirportNode[] = (data?.items ?? [])
    .filter(
      (item) =>
        item.iata &&
        item.location?.lat != null &&
        item.location?.lon != null,
    )
    .map((item) => ({
      iata: item.iata!.toUpperCase(),
      icao: item.icao ?? "",
      name: item.name ?? item.shortName ?? item.iata!,
      city: item.municipalityName ?? "",
      country: item.countryCode ?? "",
      region: inferRegionFromCoords(
        item.location!.lat!,
        item.location!.lon!,
      ),
      latitude: item.location!.lat!,
      longitude: item.location!.lon!,
      timezone: item.timeZone ?? "UTC",
      hubAirlines: [],
    }));

  return NextResponse.json({ mode, status, airports });
}
