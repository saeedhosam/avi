import { cacheLife, cacheTag } from "next/cache";
import type { DirectFlightConnection } from "@avi/shared";
import {
  EXPLORE_ROUTES_CACHE_TAG,
  gatewayRoutesUrl,
  parseGatewayRoutesPayload,
} from "./explore-routes";

const GATEWAY_TIMEOUT_MS = 6_000;

/**
 * Server-rendered route network for `/explore/[iata]`.
 *
 * Next 16 Cache Components: `use cache` lets the route payload join the
 * prerendered shell (SEO + a populated first paint), while `cacheLife` matches
 * the gateway's 7-day route cache instead of hammering it on every visit.
 *
 * Failures are cached only for the short `minutes` profile so a transient
 * gateway outage does not freeze an empty page for a day. When the gateway is
 * not configured this returns `null` and the client retries through the
 * same-origin proxy; no bundled/static route dataset is ever substituted.
 */
export async function getExploreRoutes(
  iata: string,
): Promise<DirectFlightConnection[] | null> {
  "use cache";

  const code = iata.trim().toUpperCase();
  const base = process.env.AVI_API_BASE_URL?.trim();

  if (!base) {
    cacheLife("minutes");
    return null;
  }

  cacheTag(`${EXPLORE_ROUTES_CACHE_TAG}-${code}`);

  try {
    const response = await fetch(gatewayRoutesUrl(base, code), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
    });
    if (!response.ok) {
      cacheLife("minutes");
      return null;
    }
    const routes = parseGatewayRoutesPayload(
      await response.json().catch(() => null),
    );
    // A successful empty network is a fact and follows the normal 7-day
    // cadence. A rejected/malformed payload is retried shortly.
    if (routes) {
      cacheLife("days");
      return routes;
    }
    cacheLife("minutes");
    return null;
  } catch {
    cacheLife("minutes");
    return null;
  }
}
