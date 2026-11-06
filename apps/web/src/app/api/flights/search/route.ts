import { NextResponse } from "next/server";
import {
  fetchAeroJson,
  mapAeroFlight,
  type AeroFlightDto,
} from "@/lib/aerodatabox";
import type { Flight } from "@/lib/types";


export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get("flight") ?? "").trim();
  const cleaned = raw.replace(/\s+/g, "").replace(/-/g, "").toUpperCase();
  if (!/^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/.test(cleaned)) {
    return NextResponse.json(
      { mode: "NOT_CONFIGURED", flights: [], error: "Invalid flight number" },
      { status: 400 },
    );
  }
  const rawDate = (searchParams.get("date") ?? "").trim();
  if (rawDate && !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    return NextResponse.json(
      { mode: "NOT_CONFIGURED", flights: [], error: "Invalid departure date" },
      { status: 400 },
    );
  }

  // Date-scoped lookups use the specific-date endpoint (departure date only).
  const path = rawDate
    ? `/flights/number/${cleaned}/${rawDate}?dateLocalRole=Departure&withAircraftImage=false&withLocation=true`
    : `/flights/number/${cleaned}?withAircraftImage=false&withLocation=true`;
  const { data, status, mode } = await fetchAeroJson<AeroFlightDto[]>(path);

  if (!data) {
    return NextResponse.json({
      mode,
      status,
      flights: [],
    });
  }

  const flights = data
    .map((dto) => mapAeroFlight(dto))
    .filter((flight): flight is Flight => Boolean(flight))
    .filter((flight) => !rawDate || flight.flightDate === rawDate);

  return NextResponse.json({ mode, flights });
}
