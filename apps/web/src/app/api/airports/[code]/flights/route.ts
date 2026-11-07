import { NextResponse } from "next/server";
import {
  fetchAeroJson,
  mapAeroFids,
  type AeroFidsResponseDto,
} from "@/lib/aerodatabox";
import { gatewayConfigured, gatewayFetchJson } from "@/lib/gateway";
import type { Flight } from "@/lib/types";

export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code: rawCode } = await context.params;
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    return NextResponse.json(
      { mode: "NOT_CONFIGURED", flights: [], error: "Invalid IATA code" },
      { status: 400 },
    );
  }

  // Gateway-first parity with the shared backend; direct fallback otherwise.
  const gatewayResult = await gatewayFetchJson<{
    mode: string;
    status?: number;
    flights: Flight[];
  }>(`/v1/airports/${code}/flights`);
  if (gatewayResult) {
    return NextResponse.json(gatewayResult);
  }
  if (gatewayConfigured()) {
    return NextResponse.json(
      {
        mode: "NOT_CONFIGURED",
        status: 0,
        flights: [],
        error: "Live airport board data is temporarily unavailable.",
      },
      { status: 503 },
    );
  }

  const { data, status, mode } = await fetchAeroJson<AeroFidsResponseDto>(
    `/flights/airports/iata/${code}?direction=Both&withLeg=true&withCancelled=true&withCodeshared=false`,
  );

  if (!data) {
    return NextResponse.json({ mode, status, flights: [] });
  }

  const mapped = mapAeroFids(code, data);
  const departures = mapped
    .filter((flight) => flight.origin.code === code)
    .slice(0, 100);
  const arrivals = mapped
    .filter((flight) => flight.destination.code === code)
    .slice(0, 100);
  return NextResponse.json({ mode, flights: [...departures, ...arrivals] });
}
