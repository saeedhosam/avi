import { NextResponse } from "next/server";
import { fetchAeroJson } from "@/lib/aerodatabox";
import { gatewayConfigured, gatewayFetchJson } from "@/lib/gateway";

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

const NOTE =
  "AeroDataBox daily route statistics cover the previous 7 days. They are not a forward schedule.";

function provenance(fetchedAt = new Date().toISOString()) {
  return {
    source: "AERODATABOX" as const,
    fetchedAt,
    attribution: "AeroDataBox" as const,
    statisticsWindowDays: 7 as const,
    note: NOTE,
  };
}

function mapRoutes(routes: AeroRouteStat[]) {
  return routes
    .filter(
      (route) =>
        route.destination?.iata &&
        route.destination.location?.lat != null &&
        route.destination.location?.lon != null,
    )
    .map((route) => {
      const daily = route.averageDailyFlights;
      return {
        destination: route.destination!.iata!,
        destinationName: route.destination?.name,
        city: route.destination?.municipalityName,
        country: route.destination?.countryCode,
        icao: route.destination?.icao,
        timezone: route.destination?.timeZone,
        latitude: route.destination!.location!.lat!,
        longitude: route.destination!.location!.lon!,
        // Missing averages stay missing. Do not substitute "1 flight/day".
        dailyFlights:
          typeof daily === "number" && Number.isFinite(daily) && daily > 0
            ? Math.round(daily * 10) / 10
            : null,
        operators: (route.operators ?? [])
          .filter((operator) => operator.iata || operator.name)
          .map((operator) => ({
            code: operator.iata ?? "",
            name: operator.name ?? operator.iata ?? "",
          })),
      };
    });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code: rawCode } = await context.params;
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    return NextResponse.json(
      {
        mode: "NOT_CONFIGURED",
        routes: [],
        error: "Invalid IATA code",
        ...provenance(),
      },
      { status: 400 },
    );
  }

  // The gateway is the provider seam in production. If it is configured but
  // unreachable, fail explicitly instead of silently bypassing its cache,
  // quota accounting, and error reporting.
  if (gatewayConfigured()) {
    const gatewayResult = await gatewayFetchJson<{
      mode: string;
      status?: number;
      routes?: unknown;
      source?: string;
      fetchedAt?: string;
      attribution?: string;
      statisticsWindowDays?: number;
      note?: string;
      error?: string;
    }>(`/v1/airports/${code}/routes`, request.headers.get("authorization"));

    if (!gatewayResult || !Array.isArray(gatewayResult.routes)) {
      return NextResponse.json(
        {
          mode: "NOT_CONFIGURED",
          routes: [],
          error: "Live route data is temporarily unavailable.",
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

  // Local/development configuration without the gateway: call the same
  // provider directly. There is no static-dataset fallback.
  const { data, status, mode } = await fetchAeroJson<{
    routes?: AeroRouteStat[];
  }>(`/airports/iata/${code}/stats/routes/daily`);

  if (mode === "QUOTA_FALLBACK") {
    return NextResponse.json(
      {
        mode,
        status,
        routes: [],
        error:
          "Live route statistics are paused until the provider quota resets.",
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
        routes: [],
        error: "Live route statistics are not configured.",
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
        routes: [],
        error: "The live route provider is temporarily unreachable.",
        ...provenance(),
      },
      { status: 502 },
    );
  }
  if (status === 400 || status === 404) {
    return NextResponse.json(
      {
        mode,
        status,
        routes: [],
        error: "AeroDataBox has no route statistics for this airport.",
        ...provenance(),
      },
      { status: 404 },
    );
  }
  if (status === 204) {
    return NextResponse.json(
      {
        mode: "NO_DATA",
        status,
        routes: [],
        error:
          "AeroDataBox returned no route data for this airport. This is not evidence that no routes exist.",
        ...provenance(),
      },
      { status: 503 },
    );
  }
  if (data != null && !Array.isArray(data.routes)) {
    return NextResponse.json(
      {
        mode: "ERROR",
        status,
        routes: [],
        error: "AeroDataBox returned an unexpected route payload.",
        ...provenance(),
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    mode,
    status,
    routes: mapRoutes(data?.routes ?? []),
    ...provenance(),
  });
}
