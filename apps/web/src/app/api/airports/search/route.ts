import { NextResponse } from "next/server";
import { fetchAeroJson, type AeroAirportDto } from "@/lib/aerodatabox";
import { gatewayConfigured, gatewayFetchJson } from "@/lib/gateway";
import { inferRegionFromCoords } from "@/lib/data";
import type { AirportNode } from "@/lib/types";

interface AeroAirportSearchResponse {
  items?: AeroAirportDto[];
}

function provenance(fetchedAt = new Date().toISOString()) {
  return {
    source: "AERODATABOX" as const,
    fetchedAt,
    attribution: "AeroDataBox" as const,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({
      mode: "IDLE",
      status: 0,
      airports: [],
      ...provenance(),
    });
  }

  if (gatewayConfigured()) {
    const gatewayResult = await gatewayFetchJson<{
      mode: string;
      status: number;
      airports?: unknown;
      source?: string;
      fetchedAt?: string;
      attribution?: string;
      error?: string;
    }>(`/v1/airports/search?q=${encodeURIComponent(q)}`, request.headers.get("authorization"));

    if (!gatewayResult || !Array.isArray(gatewayResult.airports)) {
      return NextResponse.json(
        {
          mode: "NOT_CONFIGURED",
          status: 0,
          airports: [],
          error: "Airport search is temporarily unavailable.",
          ...provenance(),
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ...gatewayResult,
      ...provenance(gatewayResult.fetchedAt),
    });
  }

  const { data, status, mode } = await fetchAeroJson<AeroAirportSearchResponse>(
    `/airports/search/term?q=${encodeURIComponent(q)}&limit=20`,
  );

  if (mode === "QUOTA_FALLBACK") {
    return NextResponse.json(
      {
        mode,
        status,
        airports: [],
        error: "Airport search is paused until the provider quota resets.",
        ...provenance(),
      },
      { status: 429 },
    );
  }
  if (mode === "NOT_CONFIGURED") {
    return NextResponse.json(
      {
        mode,
        status,
        airports: [],
        error: "Airport search is not configured.",
        ...provenance(),
      },
      { status: 503 },
    );
  }
  if (mode === "ERROR" || status === 0) {
    return NextResponse.json(
      {
        mode,
        status,
        airports: [],
        error: "The live airport search provider is temporarily unreachable.",
        ...provenance(),
      },
      { status: 502 },
    );
  }
  if (data != null && !Array.isArray(data.items)) {
    return NextResponse.json(
      {
        mode: "ERROR",
        status,
        airports: [],
        error: "AeroDataBox returned an unexpected airport search payload.",
        ...provenance(),
      },
      { status: 502 },
    );
  }

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
      // The IATA code is the only verified fallback. Missing names are left
      // empty rather than synthesized from the code.
      name: item.name ?? item.shortName ?? item.iata!,
      city: item.municipalityName ?? "",
      country: item.countryCode ?? "",
      region: inferRegionFromCoords(
        item.location!.lat!,
        item.location!.lon!,
      ),
      latitude: item.location!.lat!,
      longitude: item.location!.lon!,
      timezone: item.timeZone ?? "",
      hubAirlines: [],
    }));

  return NextResponse.json({
    mode,
    status,
    airports,
    ...provenance(),
  });
}
