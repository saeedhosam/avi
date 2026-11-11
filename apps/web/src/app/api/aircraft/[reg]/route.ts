import { NextResponse } from "next/server";
import { fetchAeroJson } from "@/lib/aerodatabox";
import { gatewayConfigured, gatewayFetchJson } from "@/lib/gateway";

interface AeroAircraft {
  reg?: string;
  active?: boolean;
  airlineName?: string;
  iataType?: string;
  icaoCode?: string;
  model?: string;
  numSeats?: number | null;
  ageYears?: number | null;
  firstFlightDate?: string;
  deliveryDate?: string;
  engineType?: string;
  numEngines?: number | null;
  isFreighter?: boolean;
  image?: {
    url?: string;
    webUrl?: string | null;
    author?: string | null;
    license?: string;
    htmlAttributions?: string[] | null;
  };
}

function mapAircraft(data: AeroAircraft | null) {
  if (!data?.reg) return null;
  return {
    reg: data.reg,
    active: data.active,
    airlineName: data.airlineName,
    iataType: data.iataType,
    icaoCode: data.icaoCode,
    model: data.model,
    numSeats: data.numSeats ?? undefined,
    ageYears: data.ageYears ?? undefined,
    firstFlightDate: data.firstFlightDate,
    deliveryDate: data.deliveryDate,
    engineType: data.engineType,
    numEngines: data.numEngines ?? undefined,
    isFreighter: data.isFreighter,
    image: data.image?.url
      ? {
          url: data.image.url,
          webUrl: data.image.webUrl ?? undefined,
          author: data.image.author ?? undefined,
          license: data.image.license,
          attributions: data.image.htmlAttributions ?? undefined,
        }
      : undefined,
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ reg: string }> },
) {
  const { reg: rawReg } = await context.params;
  const reg = rawReg.replace(/[\s-]/g, "").toUpperCase();
  if (!/^[A-Z0-9]{2,12}$/.test(reg)) {
    return NextResponse.json(
      { mode: "NOT_CONFIGURED", status: 0, aircraft: null, error: "Invalid registration" },
      { status: 400 },
    );
  }

  const gatewayResult = await gatewayFetchJson<{
    mode: string;
    status: number;
    aircraft: ReturnType<typeof mapAircraft>;
  }>(`/v1/aircraft/${encodeURIComponent(reg)}`, request.headers.get("authorization"));
  if (gatewayResult) {
    return NextResponse.json(gatewayResult);
  }
  if (gatewayConfigured()) {
    return NextResponse.json(
      {
        mode: "NOT_CONFIGURED",
        status: 0,
        aircraft: null,
        error: "Aircraft details are temporarily unavailable.",
      },
      { status: 503 },
    );
  }

  const detail = await fetchAeroJson<AeroAircraft>(
    `/aircrafts/reg/${encodeURIComponent(reg)}`,
  );
  if (detail.mode === "NOT_CONFIGURED") {
    return NextResponse.json(
      {
        mode: detail.mode,
        status: detail.status,
        aircraft: null,
        error: "Aircraft details are not configured.",
      },
      { status: 503 },
    );
  }
  if (detail.mode === "QUOTA_FALLBACK") {
    return NextResponse.json(
      {
        mode: detail.mode,
        status: detail.status,
        aircraft: null,
        error: "Aircraft details are paused until the provider quota resets.",
      },
      { status: 429 },
    );
  }
  if (detail.mode === "ERROR") {
    return NextResponse.json(
      {
        mode: detail.mode,
        status: detail.status,
        aircraft: null,
        error: "The live provider is temporarily unreachable.",
      },
      { status: 502 },
    );
  }
  if (detail.status === 204 || detail.status === 400 || detail.status === 404) {
    return NextResponse.json(
      {
        mode: "NOT_FOUND",
        status: detail.status,
        aircraft: null,
        error: "The provider has no aircraft for that registration.",
      },
      { status: 404 },
    );
  }
  let data = detail.data;
  if (detail.mode === "LIVE_AERODATABOX" && data?.reg && !data.image?.url) {
    const image = await fetchAeroJson<{
      url?: string;
      webUrl?: string | null;
      author?: string | null;
      license?: string;
      htmlAttributions?: string[] | null;
    }>(`/aircrafts/reg/${encodeURIComponent(reg)}/image/beta`);
    if (image.mode === "LIVE_AERODATABOX" && image.data?.url) {
      data = { ...data, image: image.data };
    }
  }
  const aircraft = mapAircraft(data ?? null);
  if (data != null && aircraft == null) {
    return NextResponse.json(
      {
        mode: "ERROR",
        status: detail.status,
        aircraft: null,
        error: "The provider returned an unexpected aircraft payload.",
      },
      { status: 502 },
    );
  }
  return NextResponse.json({
    mode: detail.mode,
    status: detail.status,
    aircraft,
  });
}
