import { NextResponse } from "next/server";
import { gatewayAuthorized } from "@/lib/gateway";

interface TripPassCheckoutResult {
  url?: string;
  provider?: string;
  durationDays?: number;
  message?: string;
  error?: string;
}

/**
 * Single-Trip Pass checkout proxy.
 *
 * The gateway owns provider selection, receipt verification, and the
 * `profiles.trip_pass_expires_at` write. This route only forwards the caller's
 * Supabase access token. A missing token, an unshipped backend endpoint, a
 * manual billing provider, or an unreachable gateway all return an explicit
 * non-success response — never a fabricated purchase.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    accessToken?: string;
  } | null;
  const accessToken = body?.accessToken?.trim();
  if (!accessToken) {
    return NextResponse.json(
      {
        error: "unauthorized",
        message: "Sign in to buy a Single-Trip Pass.",
      },
      { status: 401 },
    );
  }

  const { ok, status, body: result } = await gatewayAuthorized<TripPassCheckoutResult>(
    "/v1/billing/trip-pass",
    accessToken,
    "POST",
    {},
  );

  if (ok && result?.url) {
    return NextResponse.json({
      url: result.url,
      ...(result.provider ? { provider: result.provider } : {}),
      ...(typeof result.durationDays === "number"
        ? { durationDays: result.durationDays }
        : {}),
    });
  }

  if (status === 401 || status === 403) {
    return NextResponse.json(
      {
        error: "unauthorized",
        message:
          result?.message ?? "Your session expired. Sign in again before checkout.",
      },
      { status: 401 },
    );
  }

  // Preserve genuine client errors (for example, a pass already active) so the
  // pricing UI can explain them instead of flattening everything to "down".
  if (status >= 400 && status < 500 && status !== 404) {
    return NextResponse.json(
      {
        error: result?.error ?? "trip_pass_rejected",
        message:
          result?.message ??
          "The Single-Trip Pass checkout could not be started. Nothing was charged.",
      },
      { status },
    );
  }

  // status 0 = gateway not configured/unreachable; 404 = the backend endpoint
  // has not shipped yet; 5xx = billing provider unavailable. All are graceful
  // "not available" responses.
  return NextResponse.json(
    {
      error: "trip_pass_unavailable",
      // Do not forward developer-facing backend setup messages (for example
      // "set TRIP_PASS_CHECKOUT_URL") to the checkout UI.
      message:
        status === 0
          ? "The Single-Trip Pass checkout is temporarily unreachable. Nothing was charged."
          : "The Single-Trip Pass checkout is not available right now. Nothing was charged.",
    },
    { status: 503 },
  );
}
