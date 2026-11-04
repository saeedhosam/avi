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
      { mode: "DEMO_CACHE_NO_KEY", flights: [], error: "Invalid IATA code" },
      { status: 400 },
    );
  }

  const { data, status, mode } = await fetchAeroJson<AeroFidsResponseDto>(
    `/airports/iata/${code}/flights?direction=Both&withLeg=true&withCancelled=true&withCodeshared=false`,
  );

  if (!data) {
    return NextResponse.json({ mode, status, flights: [] });
  }

  return NextResponse.json({ mode, flights: mapAeroFids(code, data) });
}
