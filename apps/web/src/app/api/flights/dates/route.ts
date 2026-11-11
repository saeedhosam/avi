import { NextResponse } from "next/server";
import { fetchAeroJson } from "@/lib/aerodatabox";
import { gatewayConfigured, gatewayFetchJson } from "@/lib/gateway";

/**
 * Operating departure dates for a flight number. Used by the search form to
 * validate a date before spending a flight-status lookup.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get("flight") ?? "").trim();
  const cleaned = raw.replace(/\s+/g, "").replace(/-/g, "").toUpperCase();
  if (!/^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/.test(cleaned)) {
    return NextResponse.json(
      { mode: "NOT_CONFIGURED", status: 0, dates: [], error: "Invalid flight number" },
      { status: 400 },
    );
  }

  const gatewayResult = await gatewayFetchJson<{
    mode: string;
    status: number;
    dates: string[];
  }>(`/v1/flights/dates?number=${cleaned}`, request.headers.get("authorization"));
  if (gatewayResult) {
    return NextResponse.json(gatewayResult);
  }
  if (gatewayConfigured()) {
    return NextResponse.json(
      {
        mode: "NOT_CONFIGURED",
        status: 0,
        dates: [],
        error: "Flight operating dates are temporarily unavailable.",
      },
      { status: 503 },
    );
  }

  const { data, status, mode } = await fetchAeroJson<string[]>(
    `/flights/number/${encodeURIComponent(cleaned)}/dates`,
  );
  if (mode === "NOT_CONFIGURED") {
    return NextResponse.json(
      {
        mode,
        status,
        dates: [],
        error: "Flight operating dates are not configured.",
      },
      { status: 503 },
    );
  }
  if (mode === "QUOTA_FALLBACK") {
    return NextResponse.json(
      {
        mode,
        status,
        dates: [],
        error: "Flight operating dates are paused until the provider quota resets.",
      },
      { status: 429 },
    );
  }
  if (mode === "ERROR") {
    return NextResponse.json(
      {
        mode,
        status,
        dates: [],
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
        dates: [],
        error:
          "The provider returned no operating-date data. This is not evidence that the flight does not operate.",
      },
      { status: 503 },
    );
  }
  if (status === 400 || status === 404) {
    return NextResponse.json(
      {
        mode: "NOT_FOUND",
        status,
        dates: [],
        error: "The provider has no operating-date data for that flight number.",
      },
      { status: 404 },
    );
  }
  if (!Array.isArray(data)) {
    return NextResponse.json(
      {
        mode: "ERROR",
        status,
        dates: [],
        error: "The provider returned an unexpected operating-date payload.",
      },
      { status: 502 },
    );
  }
  const dates = data.filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
  return NextResponse.json({ mode, status, dates });
}
