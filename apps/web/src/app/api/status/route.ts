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
  watchEngine?: {
    enabled?: boolean;
    units?: { unitsBudget?: number; unitsUsed?: number; overBudget?: boolean };
  } | null;
}

/**
 * Probes the Avi gateway so the web client knows whether flight status is
 * maintained by a server watch engine. Best effort: if the gateway is not
 * reachable, the client falls back to its own (slower) polling.
 */
async function probeWatchEngine(): Promise<{
  enabled: boolean;
  unitsBudget: number | null;
  unitsUsed: number | null;
} | null> {
  const base = process.env.AVI_API_BASE_URL?.trim().replace(/\/+$/, "");
  if (!base) return null;
  try {
    const response = await fetch(`${base}/v1/status`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as GatewayStatus;
    if (!payload.watchEngine) return null;
    return {
      enabled: Boolean(payload.watchEngine.enabled),
      unitsBudget: payload.watchEngine.units?.unitsBudget ?? null,
      unitsUsed: payload.watchEngine.units?.unitsUsed ?? null,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const watchEngine = await probeWatchEngine();
  return NextResponse.json({
    aeroDataBoxConfigured: hasValidKey(process.env.AERODATABOX_API_KEY),
    supabaseConfigured: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
    weatherProvider: "open-meteo",
    watchEngine,
    timestamp: new Date().toISOString(),
  });
}
