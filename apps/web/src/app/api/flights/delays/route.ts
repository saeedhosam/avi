import { NextResponse } from "next/server";
import { fetchAeroJson } from "@/lib/aerodatabox";
import { gatewayConfigured, gatewayFetchJson } from "@/lib/gateway";

interface AeroDelayStat {
  airportIcao?: string;
  class?: string;
  scheduledHourUtc?: number | null;
  medianDelay?: string;
  delayIndex?: number | null;
  numConsideredFlights?: number;
  numFlightsDelayedBrackets?: Array<{
    delayedFrom?: string | null;
    delayedTo?: string | null;
    num?: number;
    percentage?: number | null;
  }>;
  delayPercentiles?: Array<{ percentile?: number; delay?: string }>;
  fromUtc?: string;
  toUtc?: string;
}

function mapDelayStat(raw: AeroDelayStat) {
  return {
    airportIcao: raw.airportIcao ?? "",
    class: raw.class ?? "Unknown",
    scheduledHourUtc: raw.scheduledHourUtc ?? undefined,
    medianDelay: raw.medianDelay ?? "00:00:00",
    delayIndex: raw.delayIndex ?? undefined,
    numConsideredFlights: raw.numConsideredFlights ?? 0,
    numFlightsDelayedBrackets: (raw.numFlightsDelayedBrackets ?? []).map(
      (bracket) => ({
        delayedFrom: bracket.delayedFrom ?? undefined,
        delayedTo: bracket.delayedTo ?? undefined,
        num: bracket.num ?? 0,
        percentage: bracket.percentage ?? undefined,
      }),
    ),
    delayPercentiles: (raw.delayPercentiles ?? [])
      .filter((entry) => entry.percentile != null && entry.delay)
      .map((entry) => ({
        percentile: entry.percentile!,
        delay: entry.delay!,
      })),
    fromUtc: raw.fromUtc ?? "",
    toUtc: raw.toUtc ?? "",
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get("flight") ?? "").trim();
  const cleaned = raw.replace(/\s+/g, "").replace(/-/g, "").toUpperCase();
  if (!/^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/.test(cleaned)) {
    return NextResponse.json(
      { mode: "NOT_CONFIGURED", status: 0, delays: null, error: "Invalid flight number" },
      { status: 400 },
    );
  }

  const gatewayResult = await gatewayFetchJson<{
    mode: string;
    status: number;
    delays: unknown;
  }>(`/v1/flights/${encodeURIComponent(cleaned)}/delays`, request.headers.get("authorization"));
  if (gatewayResult) {
    return NextResponse.json(gatewayResult);
  }
  if (gatewayConfigured()) {
    return NextResponse.json(
      {
        mode: "NOT_CONFIGURED",
        status: 0,
        delays: null,
        error: "Flight delay statistics are temporarily unavailable.",
      },
      { status: 503 },
    );
  }

  const { data, status, mode } = await fetchAeroJson<{
    number?: string;
    origins?: AeroDelayStat[];
    destinations?: AeroDelayStat[];
  }>(`/flights/${encodeURIComponent(cleaned)}/delays`);

  if (mode === "NOT_CONFIGURED") {
    return NextResponse.json(
      {
        mode,
        status,
        delays: null,
        error: "Flight delay statistics are not configured.",
      },
      { status: 503 },
    );
  }
  if (mode === "QUOTA_FALLBACK") {
    return NextResponse.json(
      {
        mode,
        status,
        delays: null,
        error: "Flight delay statistics are paused until the provider quota resets.",
      },
      { status: 429 },
    );
  }
  if (mode === "ERROR") {
    return NextResponse.json(
      {
        mode,
        status,
        delays: null,
        error: "The live provider is temporarily unreachable.",
      },
      { status: 502 },
    );
  }
  if (status === 204) {
    return NextResponse.json(
      {
        mode: "NO_DATA",
        status,
        delays: null,
        error:
          "The provider returned no delay statistics. This is not evidence of an on-time flight.",
      },
      { status: 503 },
    );
  }
  if (status === 400 || status === 404) {
    return NextResponse.json(
      {
        mode: "NOT_FOUND",
        status,
        delays: null,
        error: "The provider has no delay statistics for that flight number.",
      },
      { status: 404 },
    );
  }

  const delays =
    data?.number && (Array.isArray(data.origins) || Array.isArray(data.destinations))
      ? {
          number: data.number,
          origins: (data.origins ?? []).map(mapDelayStat),
          destinations: (data.destinations ?? []).map(mapDelayStat),
        }
      : null;

  if (!delays) {
    return NextResponse.json(
      {
        mode: "ERROR",
        status,
        delays: null,
        error: "The provider returned an unexpected delay-statistics payload.",
      },
      { status: 502 },
    );
  }
  return NextResponse.json({ mode, status, delays });
}
