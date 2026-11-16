import { NextResponse } from "next/server";

/**
 * Same-origin proxy for the Avi caching gateway.
 *
 * The browser never holds an AeroDataBox key and never calls AeroDataBox. This
 * route forwards only `/api/gateway/*` to the Hetzner gateway, preserving the
 * caller's Supabase bearer token when present.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const base = process.env.AVI_API_BASE_URL?.trim().replace(/\/+$/, "");
  if (!base) {
    return NextResponse.json(
      {
        error: "gateway_not_configured",
        message: "The Avi caching gateway is not configured.",
      },
      { status: 503 },
    );
  }

  const { path } = await context.params;
  const incoming = new URL(request.url);
  const target = `${base}/api/gateway/${path.map(encodeURIComponent).join("/")}${incoming.search}`;
  const authorization = request.headers.get("authorization");

  try {
    const response = await fetch(target, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(authorization ? { Authorization: authorization } : {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("content-type") ?? "application/json",
        "Cache-Control": response.headers.get("cache-control") ?? "no-store",
        ...(response.headers.get("x-avi-cache")
          ? { "X-Avi-Cache": response.headers.get("x-avi-cache")! }
          : {}),
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: "gateway_unreachable",
        message: "The Avi caching gateway is temporarily unreachable.",
      },
      { status: 502 },
    );
  }
}
