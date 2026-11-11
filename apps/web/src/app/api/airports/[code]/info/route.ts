import { NextResponse } from "next/server";
import { fetchAeroJson } from "@/lib/aerodatabox";
import { gatewayConfigured, gatewayFetchJson } from "@/lib/gateway";

interface AeroAirportInfo {
  iata?: string;
  icao?: string;
  fullName?: string;
  shortName?: string;
  municipalityName?: string;
  country?: { code?: string; name?: string };
  continent?: { name?: string };
  timeZone?: string;
  location?: { lat?: number; lon?: number };
  elevation?: { feet?: number };
  currentTime?: { local?: string; utc?: string };
  urls?: Record<string, string | undefined>;
  runways?: Array<{
    name?: string;
    trueHdg?: number;
    length?: { feet?: number };
    width?: { feet?: number };
    surface?: string;
    isClosed?: boolean;
    hasLighting?: boolean;
  }>;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code: rawCode } = await context.params;
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    return NextResponse.json(
      { mode: "NOT_CONFIGURED", status: 0, airport: null, error: "Invalid IATA code" },
      { status: 400 },
    );
  }

  const gatewayResult = await gatewayFetchJson<{
    mode: string;
    status: number;
    airport: unknown;
  }>(`/v1/airports/${code}/info`, request.headers.get("authorization"));
  if (gatewayResult) {
    return NextResponse.json(gatewayResult);
  }
  if (gatewayConfigured()) {
    return NextResponse.json(
      {
        mode: "NOT_CONFIGURED",
        status: 0,
        airport: null,
        error: "Airport details are temporarily unavailable.",
      },
      { status: 503 },
    );
  }

  const { data, status, mode } = await fetchAeroJson<AeroAirportInfo>(
    `/airports/iata/${encodeURIComponent(code)}?withRunways=true&withTime=true`,
  );
  if (mode === "NOT_CONFIGURED" || mode === "ERROR") {
    return NextResponse.json(
      {
        mode,
        status,
        airport: null,
        error: "Airport details are temporarily unavailable.",
      },
      { status: mode === "NOT_CONFIGURED" ? 503 : 502 },
    );
  }
  if (status === 400 || status === 404 || status === 204) {
    return NextResponse.json(
      {
        mode: "NOT_FOUND",
        status,
        airport: null,
        error: "The provider has no airport reference data for that code.",
      },
      { status: 404 },
    );
  }

  const airport =
    data?.location?.lat != null && data.location.lon != null
      ? {
          iata: data.iata?.toUpperCase() ?? code,
          icao: data.icao?.toUpperCase() ?? "",
          name: data.fullName ?? data.shortName ?? data.iata ?? code,
          city: data.municipalityName ?? "",
          country: data.country?.code ?? "",
          countryName: data.country?.name,
          continent: data.continent?.name,
          // Never claim UTC when the provider did not report a timezone.
          timezone: data.timeZone ?? "",
          latitude: data.location.lat,
          longitude: data.location.lon,
          elevationFeet:
            data.elevation?.feet != null ? Math.round(data.elevation.feet) : undefined,
          localTime: data.currentTime?.local,
          urls: data.urls,
          runways: (data.runways ?? []).map((runway) => ({
            name: runway.name ?? "",
            trueHdg: runway.trueHdg ?? null,
            lengthFeet:
              runway.length?.feet != null ? Math.round(runway.length.feet) : null,
            widthFeet:
              runway.width?.feet != null ? Math.round(runway.width.feet) : null,
            surface: runway.surface ?? null,
            isClosed: runway.isClosed ?? null,
            hasLighting: runway.hasLighting ?? null,
          })),
        }
      : null;

  if (!airport) {
    return NextResponse.json(
      {
        mode: "NOT_FOUND",
        status,
        airport: null,
        error: "The provider returned an unusable airport payload.",
      },
      { status: 404 },
    );
  }

  return NextResponse.json({ mode, status, airport });
}
