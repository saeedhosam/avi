/**
 * Server-side call helper for the AeroQuest gateway (`services/api`).
 *
 * When `AVI_API_BASE_URL` is configured, Next routes prefer the gateway so
 * AeroDataBox mapping/caching/quota accounting happen in one place. If the
 * gateway is unreachable (dev without the API running, or a transient
 * outage), routes transparently fall back to their previous direct-provider
 * behavior.
 */
const gatewayBase = () =>
  process.env.AVI_API_BASE_URL?.trim().replace(/\/+$/, "");

/** True when the gateway answered (any status) — null means unreachable. */
export async function gatewayFetchJson<T>(
  path: string,
  token?: string | null,
): Promise<T | null> {
  const base = gatewayBase();
  if (!base) return null;
  try {
    const response = await fetch(`${base}${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok) {
      // Gateway-level failures (bad deploy, down instance) fall back; a
      // 502 body that parses is a deliberate provider error and is returned.
      if ([500, 502, 503, 504].includes(response.status)) {
        const body = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        if (body?.error === "provider_unreachable") return null;
      }
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function gatewayConfigured(): boolean {
  return Boolean(gatewayBase());
}

/** Authorized variant for account-scoped endpoints (/v1/me, /v1/billing/checkout). */
export async function gatewayAuthorized<T>(
  path: string,
  accessToken: string,
  method: "GET" | "DELETE" | "POST" = "GET",
  body?: unknown,
): Promise<{ ok: boolean; status: number; body: T | null }> {
  const base = gatewayBase();
  if (!base) return { ok: false, status: 0, body: null };
  try {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      cache: "no-store",
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await response.json().catch(() => null)) as T | null;
    return { ok: response.ok, status: response.status, body: json };
  } catch {
    return { ok: false, status: 0, body: null };
  }
}
