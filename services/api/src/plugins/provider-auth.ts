import type { FastifyInstance } from "fastify";
import type { SupabaseAuthIdentity } from "../lib/supabase-server.js";
import { SupabaseServer } from "../lib/supabase-server.js";
import type { UserQuotaService } from "../lib/user-quota.js";

declare module "fastify" {
  // Augment request objects once so every provider route can read the caller.
  interface FastifyRequest {
    providerUid?: string | null;
    providerAnonymous?: boolean;
  }
}

export interface ProviderAuthOptions {
  supabaseServer: SupabaseServer;
  userQuota: UserQuotaService;
  /** "log" records unauthenticated requests; "enforce" rejects them. */
  mode: "log" | "enforce";
}

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const token = header.replace(/^Bearer\s+/i, "").trim();
  return token.length > 20 ? token : null;
}

/**
 * Provider-route auth gate.
 *
 * Routes opt in via `config.providerAuth = true`. A valid Supabase access
 * token attaches the caller's identity for per-user quota accounting; an
 * invalid or missing one is rejected in `enforce` mode and only logged in
 * `log` mode so rollout does not require a hard cutover.
 */
export function registerProviderAuth(
  app: FastifyInstance,
  options: ProviderAuthOptions,
): void {
  // A root-level hook (not a sub-plugin) so later `app.register(...)` route
  // groups inherit it via Fastify's hook inheritance.
  app.addHook("preHandler", async (request, reply) => {
    const routeConfig = request.routeOptions.config as { providerAuth?: boolean } | undefined;
    if (!routeConfig?.providerAuth) return;

    const token = extractBearer(request.headers.authorization);
    let identity: SupabaseAuthIdentity | null = null;
    if (token) {
      identity = await options.supabaseServer.authIdentity(token);
    }

    if (identity) {
      request.providerUid = identity.id;
      request.providerAnonymous = identity.isAnonymous;
      return;
    }

    request.providerUid = null;
    request.providerAnonymous = false;
    if (options.mode === "enforce") {
      request.log.warn({ path: request.url }, "provider auth: rejected unauthenticated request");
      return reply.code(401).send({
        error: "unauthorized",
        message: "A valid Supabase access token is required for live data.",
      });
    }
    request.log.info({ path: request.url }, "provider auth: unauthenticated request (log mode)");
  });
};
