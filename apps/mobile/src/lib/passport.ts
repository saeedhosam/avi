import { GATEWAY_URL } from "./config";
import { supabase } from "./supabase";

export interface PassportVisitInput {
  airportCode: string;
  terminalId: string;
  level: number;
  aircraftType?: string | null;
}

/**
 * Persists a fog-of-war terminal visit for the signed-in user. Fire-and-forget:
 * a network failure must never block the map. The local session still renders
 * the visit for the current session.
 */
export async function recordPassportVisit(
  input: PassportVisitInput,
): Promise<boolean> {
  if (!supabase) return false;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(`${GATEWAY_URL}/v1/me/passport`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        airportCode: input.airportCode.toUpperCase(),
        terminalId: input.terminalId,
        level: input.level,
        aircraftType: input.aircraftType ?? undefined,
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    return response.ok;
  } catch {
    return false;
  }
}
