import { NextResponse } from "next/server";
import {
  fetchAeroJson,
  mapAeroFlight,
  type AeroFlightDto,
} from "@/lib/aerodatabox";
import { gatewayConfigured, gatewayFetchJson } from "@/lib/gateway";
import type { Flight } from "@/lib/types";


/**
 * Small in-process cache for flight-number lookups. The watch engine covers
 * watchlist traffic, but this blunts unauthenticated search bursts so a
 * single bad actor cannot drain the provider quota through repeated queries.
 */
const SEARCH_CACHE_TTL_MS = 30_000;
const SEARCH_CACHE_MAX = 500;
const searchCache = new Map<string, { expiresAt: number; body: string }>();

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
  const cacheKey = `${cleaned}|${rawDate}`;
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return new NextResponse(cached.body, {
      status: 200,
      headers: { "content-type": "application/json", "x-cache": "hit" },
    });
  }

  const datePath = rawDate
    ? `/v1/flights/lookup?number=${cleaned}&date=${rawDate}`
    : `/v1/flights/lookup?number=${cleaned}`;

  // Gateway-first: the shared backend keeps the canonical mapping, cache, and
  // quota accounting. Falls back to the direct provider when unreachable.
  const gatewayResult = await gatewayFetchJson<{
    mode: string;
    flights: Flight[];
  }>(datePath, request.headers.get("authorization"));
  if (gatewayResult) {
    if (
      gatewayResult.mode === "LIVE_AERODATABOX" ||
      gatewayResult.mode === "QUOTA_FALLBACK"
    ) {
      if (searchCache.size >= SEARCH_CACHE_MAX) {
        const oldest = searchCache.keys().next().value;
        if (oldest) searchCache.delete(oldest);
      }
      searchCache.set(cacheKey, {
        expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
        body: JSON.stringify(gatewayResult),
      });
    }
    return NextResponse.json(gatewayResult);
  }

  // In production the gateway is the only provider seam. Falling back to a
  // second direct-provider key would bypass its cache, rate limits, and unit
  // accounting. Direct lookups remain available only for local development.
  if (gatewayConfigured()) {
    return NextResponse.json(
      {
        mode: "NOT_CONFIGURED",
        flights: [],
        error: "Live flight data is temporarily unavailable.",
      },
      { status: 503 },
    );
  }

  // Date-scoped lookups use the specific-date endpoint (departure date only).
  const path = rawDate
    ? `/flights/number/${cleaned}/${rawDate}?dateLocalRole=Departure&withAircraftImage=false&withLocation=true`
    : `/flights/number/${cleaned}?withAircraftImage=false&withLocation=true`;
  const { data, status, mode } = await fetchAeroJson<AeroFlightDto[]>(path);

  if (!data) {
    // `ERROR` (bad gateway / timeout) previously returned 200 with no
    // flights, which the UI reported as "No live flights found". Make the
    // failure explicit so the error banner tells the truth.
    const unreachable = mode === "ERROR" || (status === 0 && mode !== "NOT_CONFIGURED");
    return NextResponse.json(
      {
        mode,
        status,
        flights: [],
        ...(unreachable
          ? { error: "The live flight provider is temporarily unreachable." }
          : {}),
      },
      { status: unreachable ? 502 : 200 },
    );
  }

  const flights = data
    .map((dto) => mapAeroFlight(dto))
    .filter((flight): flight is Flight => Boolean(flight))
    .filter((flight) => !rawDate || flight.flightDate === rawDate);

  // Only cache durable outcomes: live data and quota fallback. Errors and
  // "not configured" stay uncached so configuration changes apply at once.
  if (mode === "LIVE_AERODATABOX" || mode === "QUOTA_FALLBACK") {
    if (searchCache.size >= SEARCH_CACHE_MAX) {
      const oldest = searchCache.keys().next().value;
      if (oldest) searchCache.delete(oldest);
    }
    searchCache.set(cacheKey, {
      expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
      body: JSON.stringify({ mode, flights }),
    });
  }

  return NextResponse.json({ mode, flights });
}
