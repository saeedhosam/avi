import { NextResponse } from "next/server";
import {
  fetchAeroJson,
  mapAeroFlight,
  type AeroFlightDto,
} from "@/lib/aerodatabox";


export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get("flight") ?? "").trim();
  const cleaned = raw.replace(/\s+/g, "").replace(/-/g, "").toUpperCase();
  if (!/^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/.test(cleaned)) {
    return NextResponse.json(
      { mode: "DEMO_CACHE_NO_KEY", flights: [], error: "Invalid flight number" },
      { status: 400 },
    );
  }

  const { data, status, mode } = await fetchAeroJson<AeroFlightDto[]>(
    `/flights/number/${cleaned}?withAircraftImage=false&withLocation=true`,
  );

  if (!data) {
    return NextResponse.json({
      mode,
      status,
      flights: [],
    });
  }

  const flights = data
    .map((dto) => mapAeroFlight(dto))
    .filter((flight) => Boolean(flight));

  return NextResponse.json({ mode, flights });
}
