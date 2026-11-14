import { NextResponse } from "next/server";

function hasValidKey(value: string | undefined) {
  if (!value) return false;
  const key = value.trim();
  return (
    key.length >= 16 &&
    !key.startsWith("DEFAULT_") &&
    !["null", "YOUR_AERODATABOX_KEY", "REPLACE_WITH_YOUR_KEY"].includes(key)
  );
}

interface GatewayStatus {
  providers?: { aerodatabox?: "configured" | "not_configured" };
  watchEngine?: {
    enabled?: boolean;
    units?: { unitsBudget?: number; unitsUsed?: number; overBudget?: boolean };
  } | null;
}

interface GatewayProbe {
  aeroDataBoxConfigured: boolean;
  watchEngine: {
    enabled: boolean;
    unitsBudget: number | null;
    unitsUsed: number | null;
  } | null;
}

/**
 * Probes the AeroQuest gateway so the web client knows whether live provider data is
 * maintained by the shared backend and server watch engine. Best effort: if
 * the gateway is not reachable, the client falls back to the local key (dev)
 * or reports provider data unavailable (production).
 */
async function probeGateway(): Promise<GatewayProbe | null> {
  const base = process.env.AVI_API_BASE_URL?.trim().replace(/\/+$/, "");
  if (!base) return null;
  try {
    const response = await fetch(`${base}/v1/status`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as GatewayStatus;
    return {
      aeroDataBoxConfigured: payload.providers?.aerodatabox === "configured",
      watchEngine: payload.watchEngine
        ? {
            enabled: Boolean(payload.watchEngine.enabled),
            unitsBudget: payload.watchEngine.units?.unitsBudget ?? null,
            unitsUsed: payload.watchEngine.units?.unitsUsed ?? null,
          }
        : null,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const gateway = await probeGateway();
  const localKeyConfigured = hasValidKey(process.env.AERODATABOX_API_KEY);
  return NextResponse.json({
    aeroDataBoxConfigured: gateway?.aeroDataBoxConfigured ?? localKeyConfigured,
    supabaseConfigured: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
    weatherProvider: "open-meteo",
    watchEngine: gateway?.watchEngine ?? null,
    timestamp: new Date().toISOString(),
  });
}
