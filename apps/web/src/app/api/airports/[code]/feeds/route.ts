import { NextResponse } from "next/server";
import { fetchAeroJson } from "@/lib/aerodatabox";
import { gatewayConfigured, gatewayFetchJson } from "@/lib/gateway";
import { findAirportNode } from "@/lib/data";

type FeedStatus =
  | "Down"
  | "Degraded"
  | "OKPartial"
  | "OK"
  | "Unknown"
  | "Unavailable";

interface AirportCoverage {
  iata: string;
  icao: string;
  schedules: FeedStatus;
  liveUpdates: FeedStatus;
  adsb: FeedStatus;
}

function feedStatus(value: string | undefined): FeedStatus {
  switch (value) {
    case "Down":
    case "Degraded":
    case "OKPartial":
    case "OK":
    case "Unavailable":
      return value;
    default:
      return "Unknown";
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code: rawCode } = await context.params;
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    return NextResponse.json(
      { mode: "NOT_CONFIGURED", status: 0, coverage: null, error: "Invalid IATA code" },
      { status: 400 },
    );
  }

  const gatewayResult = await gatewayFetchJson<{
    mode: string;
    status: number;
    coverage: AirportCoverage | null;
  }>(`/v1/airports/${code}/coverage`, request.headers.get("authorization"));
  if (gatewayResult) {
    return NextResponse.json(gatewayResult);
  }
  if (gatewayConfigured()) {
    return NextResponse.json(
      {
        mode: "NOT_CONFIGURED",
        status: 0,
        coverage: null,
        error: "Airport coverage is temporarily unavailable.",
      },
      { status: 503 },
    );
  }

  const node = findAirportNode(code);
  if (!node?.icao) {
    return NextResponse.json({ mode: "NOT_FOUND", status: 0, coverage: null });
  }

  const { data, status, mode } = await fetchAeroJson<{
    flightSchedulesFeed?: { status?: string };
    liveFlightUpdatesFeed?: { status?: string };
    adsbUpdatesFeed?: { status?: string };
  }>(`/health/services/airports/${encodeURIComponent(node.icao)}/feeds`);

  if (mode === "NOT_CONFIGURED") {
    return NextResponse.json(
      { mode, status, coverage: null, error: "Airport coverage is not configured." },
      { status: 503 },
    );
  }
  if (mode === "QUOTA_FALLBACK") {
    return NextResponse.json(
      {
        mode,
        status,
        coverage: null,
        error: "Airport coverage is paused until the provider quota resets.",
      },
      { status: 429 },
    );
  }
  if (mode === "ERROR") {
    return NextResponse.json(
      {
        mode,
        status,
        coverage: null,
        error: "The live provider is temporarily unreachable.",
      },
      { status: 502 },
    );
  }
  if (status === 204 || status === 400 || status === 404 || !data) {
    return NextResponse.json(
      {
        mode: "NOT_FOUND",
        status,
        coverage: null,
        error: "The provider has no feed coverage for that airport.",
      },
      { status: status === 204 ? 503 : 404 },
    );
  }

  const coverage: AirportCoverage = {
    iata: code,
    icao: node.icao,
    schedules: feedStatus(data.flightSchedulesFeed?.status),
    liveUpdates: feedStatus(data.liveFlightUpdatesFeed?.status),
    adsb: feedStatus(data.adsbUpdatesFeed?.status),
  };

  return NextResponse.json({ mode, status, coverage });
}
