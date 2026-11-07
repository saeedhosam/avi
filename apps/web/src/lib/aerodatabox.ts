/**
 * Server-side fallback path to the AeroDataBox direct API.
 *
 * Used only by the web's own `/api/*` handlers **when the gateway is not
 * configured** (local dev without `AVI_API_BASE_URL`, or a dev outage). The
 * AerodataBox -> console `Flight` mapping itself lives in `@avi/contracts`,
 * shared with the gateway so both paths produce identical flights; this file
 * keeps the key checks and the HTTP helper.
 */
import { createConsoleMapper } from "@avi/contracts";
import { findAirportNode } from "./data";

/** The console mapper bound to the web's bundled airport reference data. */
const consoleMapper = createConsoleMapper({ lookupAirportNode: findAirportNode });

/** Console `Flight` mapper. */
export const mapAeroFlight: typeof consoleMapper.mapFlight = consoleMapper.mapFlight;

/** Console FIDS mapper. */
export const mapAeroFids: typeof consoleMapper.mapFids = consoleMapper.mapFids;

export type {
  AeroAirportDto,
  AeroFidsResponseDto,
  AeroFlightDto,
} from "@avi/contracts";

/** True when the server-side fallback has a usable provider key. */
export function hasValidAeroKey(): boolean {
  const key = process.env.AERODATABOX_API_KEY?.trim();
  if (!key) return false;
  return (
    key.length >= 16 &&
    !key.startsWith("DEFAULT_") &&
    !["null", "YOUR_AERODATABOX_KEY", "REPLACE_WITH_YOUR_KEY"].includes(key)
  );
}

export function aeroHost(): string {
  const host = process.env.AERODATABOX_API_HOST?.trim();
  if (!host || host === "null") {
    return "api.aerodatabox.com";
  }
  return host.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function aeroAuthHeaders(host: string): Record<string, string> {
  const key = process.env.AERODATABOX_API_KEY ?? "";
  if (host.includes("rapidapi.com")) {
    return {
      "X-RapidAPI-Key": key,
      "X-RapidAPI-Host": host,
    };
  }
  return { "X-Api-Key": key };
}

export async function fetchAeroJson<T>(
  path: string,
): Promise<{
  data: T | null;
  status: number;
  mode: "LIVE_AERODATABOX" | "QUOTA_FALLBACK" | "NOT_CONFIGURED" | "ERROR";
}> {
  if (!hasValidAeroKey()) {
    return { data: null, status: 0, mode: "NOT_CONFIGURED" };
  }
  const host = aeroHost();
  try {
    const response = await fetch(`https://${host}${path}`, {
      headers: {
        Accept: "application/json",
        ...aeroAuthHeaders(host),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    if (response.status === 204) {
      return { data: null, status: 204, mode: "LIVE_AERODATABOX" };
    }
    if (response.status === 401 || response.status === 403) {
      return { data: null, status: response.status, mode: "ERROR" };
    }
    if (response.status === 429) {
      return { data: null, status: 429, mode: "QUOTA_FALLBACK" };
    }
    if (!response.ok) {
      return { data: null, status: response.status, mode: "ERROR" };
    }
    const data = (await response.json()) as T;
    return { data, status: response.status, mode: "LIVE_AERODATABOX" };
  } catch {
    return { data: null, status: 0, mode: "ERROR" };
  }
}
