import { NextResponse } from "next/server";
import { gatewayAuthorized } from "@/lib/gateway";

interface AccountUsage {
  plan: "FREE" | "PLUS" | "PRO";
  planLimits: { concurrentTracked: number };
  watchlistCount: number;
  units: { unitsUsed: number; unitsBudget: number };
}

/**
 * Account-scoped proxy: the browser posts its Supabase access token; the
 * gateway validates it server-side and answers with the plan's tier, live
 * tracking limit, watchlist size, and the month-to-date unit budget.
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
  const { ok, status, body: usage } = await gatewayAuthorized<AccountUsage>(
    "/v1/me",
    accessToken,
  );
  if (!ok || !usage) {
    return NextResponse.json(
      { error: "me_unavailable", message: "Account usage is temporarily unavailable.", status },
      { status: status >= 400 && status < 500 ? status : 503 },
    );
  }
  return NextResponse.json(usage);
}
