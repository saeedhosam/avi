import {
  gatewayRoutesResponseSchema,
  type DirectFlightConnection,
} from "@avi/shared";

/** Cache tag prefix for on-demand invalidation of explorer route networks. */
export const EXPLORE_ROUTES_CACHE_TAG = "explore-routes";

/**
 * Build the gateway URL for an airport's direct-route network.
 *
 * Kept pure so the server cache helper and its unit test share one definition.
 * The browser never calls this URL directly — it goes through the same-origin
 * `/api/gateway/*` proxy.
 */
export function gatewayRoutesUrl(baseUrl: string, iata: string): string {
  const base = baseUrl.trim().replace(/\/+$/, "");
  const code = iata.trim().toUpperCase();
  return `${base}/api/gateway/airports/${encodeURIComponent(code)}/routes`;
}

/**
 * Validate a gateway route payload before it reaches the server-rendered
 * explorer shell.
 *
 * Returns `null` for malformed or error-shaped payloads. It must never
 * substitute the bundled reference catalog: route data is only trusted when
 * the gateway supplies a complete, schema-valid response.
 */
export function parseGatewayRoutesPayload(
  payload: unknown,
): DirectFlightConnection[] | null {
  const parsed = gatewayRoutesResponseSchema.safeParse(payload);
  return parsed.success ? parsed.data.routes : null;
}
