import { NextResponse } from "next/server";
import { gatewayAuthorized } from "@/lib/gateway";

interface CheckoutResult {
  url?: string;
  provider?: string;
  message?: string;
}

/**
 * Billing checkout bridge: browser posts its access token + target plan, the
 * gateway validates the token and returns a Lemon Squeezy checkout URL (Pago
 * handled in the checkout page — no card data touches AeroQuest).
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    accessToken?: string;
    target?: string;
  } | null;
  const accessToken = body?.accessToken?.trim();
  const target = body?.target === "PRO" ? "PRO" : "PLUS";
  if (!accessToken) {
    return NextResponse.json(
      { error: "unauthorized", message: "Access token required." },
      { status: 400 },
    );
  }
  const { ok, body: result } = await gatewayAuthorized<CheckoutResult>(
    "/v1/billing/checkout",
    accessToken,
    "POST",
    { target },
  );
  if (!ok || !result?.url) {
    return NextResponse.json(
      {
        error: "checkout_unavailable",
        message:
          result?.message ?? "Checkout isn't available right now. Try again shortly.",
      },
      { status: 503 },
    );
  }
  return NextResponse.json({ url: result.url, provider: result.provider ?? "lemon_squeezy" });
}
