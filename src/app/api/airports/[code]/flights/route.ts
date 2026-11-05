import { NextResponse } from "next/server";
import {
  fetchAeroJson,
  mapAeroFids,
  type AeroFidsResponseDto,
} from "@/lib/aerodatabox";


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
