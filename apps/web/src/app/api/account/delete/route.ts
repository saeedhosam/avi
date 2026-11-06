import { NextResponse } from "next/server";
import { gatewayAuthorized } from "@/lib/gateway";

/**
 * Account deletion proxy. The Supabase access token is validated by the
 * gateway; the auth user is removed so FK cascades wipe the profile,
 * watchlist, alerts, and push subscriptions. Irreversible.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { accessToken?: string } | null;
  const accessToken = body?.accessToken?.trim();
  if (!accessToken) {
    return NextResponse.json(
      { error: "unauthorized", message: "Ingress token required." },
      { status: 400 },
    );
  }
  const { ok, status } = await gatewayAuthorized("/v1/me", accessToken, "DELETE");
  if (!ok) {
    return NextResponse.json(
      { error: "delete_failed", message: "Account deletion could not be completed.", status },
      { status: status >= 400 && status < 500 ? status : 503 },
    );
  }
  return NextResponse.json({ deleted: true });
}
