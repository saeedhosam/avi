import { NextResponse } from "next/server";
import {
  fetchAeroJson,
  mapAeroFids,
  type AeroFidsResponseDto,
} from "@/lib/aerodatabox";
import { gatewayConfigured, gatewayFetchJson } from "@/lib/gateway";
import type { Flight } from "@/lib/types";

const BOARD_OFFSET_MINUTES = -120;
const BOARD_DURATION_MINUTES = 720;

function boardWindow() {
  const now = Date.now();
  return {
    from: new Date(now + BOARD_OFFSET_MINUTES * 60_000).toISOString(),
    to: new Date(
      now + (BOARD_OFFSET_MINUTES + BOARD_DURATION_MINUTES) * 60_000,
    ).toISOString(),
  };
}

function provenance(fetchedAt = new Date().toISOString()) {
  return {
    source: "AERODATABOX" as const,
    fetchedAt,
    attribution: "AeroDataBox" as const,
  };
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
        flights: [],
        error: "Invalid IATA code",
        ...provenance(),
      },
      { status: 400 },
    );
  }

  if (gatewayConfigured()) {
    const gatewayResult = await gatewayFetchJson<{
      mode: string;
      status?: number;
      flights?: unknown;
      source?: string;
      fetchedAt?: string;
      attribution?: string;
      window?: { from: string; to: string } | null;
      error?: string;
    }>(`/v1/airports/${code}/flights`, request.headers.get("authorization"));

    if (!gatewayResult || !Array.isArray(gatewayResult.flights)) {
      return NextResponse.json(
        {
          mode: "NOT_CONFIGURED",
          flights: [],
          error: "Live airport board data is temporarily unavailable.",
          ...provenance(),
          window: boardWindow(),
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ...gatewayResult,
      ...provenance(gatewayResult.fetchedAt),
      window: gatewayResult.window ?? boardWindow(),
    });
  }

  const { data, status, mode } = await fetchAeroJson<AeroFidsResponseDto>(
    `/flights/airports/iata/${code}?offsetMinutes=${BOARD_OFFSET_MINUTES}&durationMinutes=${BOARD_DURATION_MINUTES}&direction=Both&withLeg=true&withCancelled=true&withCodeshared=false`,
  );

  if (mode === "QUOTA_FALLBACK") {
    return NextResponse.json(
      {
        mode,
        status,
        flights: [],
        error: "Live airport board data is paused until the provider quota resets.",
        ...provenance(),
        window: boardWindow(),
      },
      { status: 429 },
    );
  }
  if (mode === "NOT_CONFIGURED") {
    return NextResponse.json(
      {
        mode,
        status,
        flights: [],
        error: "Live airport board data is not configured.",
        ...provenance(),
        window: boardWindow(),
      },
      { status: 503 },
    );
  }
  if (mode === "ERROR" || status === 0) {
    return NextResponse.json(
      {
        mode,
        status,
        flights: [],
        error: "The live airport board provider is temporarily unreachable.",
        ...provenance(),
        window: boardWindow(),
      },
      { status: 502 },
    );
  }
  if (status === 204) {
    return NextResponse.json(
      {
        mode: "NO_DATA",
        status,
        flights: [],
        error:
          "AeroDataBox returned no board data for this airport. This is not evidence that no flights operate.",
        ...provenance(),
        window: boardWindow(),
      },
      { status: 503 },
    );
  }
  if (status === 400 || status === 404) {
    return NextResponse.json(
      {
        mode,
        status,
        flights: [],
        error: "AeroDataBox has no live board for this airport.",
        ...provenance(),
        window: boardWindow(),
      },
      { status: 404 },
    );
  }
  if (
    data != null &&
    (typeof data !== "object" ||
      (!Array.isArray(data.departures) && !Array.isArray(data.arrivals)))
  ) {
    return NextResponse.json(
      {
        mode: "ERROR",
        status,
        flights: [],
        error: "AeroDataBox returned an unexpected airport board payload.",
        ...provenance(),
        window: boardWindow(),
      },
      { status: 502 },
    );
  }

  const fetchedAt = new Date().toISOString();
  const mapped = mapAeroFids(code, data ?? { departures: [], arrivals: [] });
  const departures = mapped
    .filter((flight: Flight) => flight.origin.code === code)
    .slice(0, 100);
  const arrivals = mapped
    .filter((flight: Flight) => flight.destination.code === code)
    .slice(0, 100);

  return NextResponse.json({
    mode,
    status,
    flights: [...departures, ...arrivals].map((flight) => ({
      ...flight,
      source: "aerodatabox",
      fetchedAt,
    })),
    ...provenance(fetchedAt),
    window: boardWindow(),
  });
}
