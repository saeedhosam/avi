import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { SupabaseAuthIdentity, SupabaseServer } from "../lib/supabase-server.js";
import type { UsageTracker } from "../lib/usage.js";
import { billingUpgradeEnabled } from "../lib/billing.js";
import type { UserQuotaService } from "../lib/user-quota.js";
import { PLAN_LIMITS, type PlanTier } from "../engine/plans.js";

interface MeOptions {
  supabaseServer: SupabaseServer;
  usage: UsageTracker;
  userQuota: UserQuotaService;
  billingProvider: "manual" | "lemon_squeezy" | "polar";
}

const validPlan = (plan: string): PlanTier =>
  (plan.toUpperCase() in PLAN_LIMITS ? (plan.toUpperCase() as PlanTier) : "FREE");

const meResponse = z.object({
  plan: z.enum(["FREE", "PLUS", "PRO"]),
  planLimits: z.object({
    concurrentTracked: z.number(),
  }),
  watchlistCount: z.number(),
  units: z.object({
    unitsUsed: z.number(),
    unitsBudget: z.number(),
  }),
  providerQuota: z.object({
    used: z.number(),
    limit: z.number(),
    resetsAt: z.number(),
  }),
  billing: z.object({
    provider: z.enum(["manual", "lemon_squeezy", "polar"]),
    upgradeEnabled: z.boolean(),
  }),
});

const meErrorSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
});

/**
 * Account-scoped beat: plan tier, its engine limit, watchlist size, and the
 * month-to-date fleet unit usage, backed by the Supabase access token sent by
 * the client. The access token is validated server-side against Supabase —
 * this endpoint never trusts the client's own claims.
 */
export const meRoutes: FastifyPluginAsyncZod<MeOptions> = async (
  app,
  options,
) => {
  const { supabaseServer } = options;

  const requireUser = async (authorization: string): Promise<SupabaseAuthIdentity | null> => {
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    return token.length > 20 ? supabaseServer.authIdentity(token) : null;
  };

  app.get(
    "/v1/me",
    {
      schema: {
        hide: true,
        response: {
          200: meResponse,
          401: meErrorSchema,
          503: meErrorSchema,
        },
      },
    },
    async (request, reply) => {
      if (!supabaseServer.ready) {
        return reply.code(503).send({ error: "me_unavailable" });
      }
      const identity = await requireUser(request.headers.authorization ?? "");
      if (!identity) {
        return reply.code(401).send({
          error: "unauthorized",
          message: "Valid Supabase access token required.",
        });
      }
      const plan = validPlan((await supabaseServer.listUserPlans([identity.id])).get(identity.id) ?? "FREE");
      const watchlistCount = await supabaseServer.countWatchlistRows(identity.id);
      const usage = options.usage.snapshot();
      const providerQuota = await options.userQuota.snapshot(
        identity.id,
        identity.isAnonymous,
      );
      return {
        plan,
        planLimits: { concurrentTracked: PLAN_LIMITS[plan] },
        watchlistCount,
        units: { unitsUsed: usage.unitsUsed, unitsBudget: usage.unitsBudget },
        providerQuota,
        billing: {
          provider: options.billingProvider,
          upgradeEnabled: billingUpgradeEnabled(options.billingProvider),
        },
      };
    },
  );

  app.delete(
    "/v1/me",
    {
      schema: {
        hide: true,
        response: {
          204: z.void(),
          401: meErrorSchema,
          503: meErrorSchema,
        },
      },
    },
    async (request, reply) => {
      if (!supabaseServer.ready) {
        return reply.code(503).send({ error: "me_unavailable" });
      }
      const identity = await requireUser(request.headers.authorization ?? "");
      if (!identity) {
        return reply.code(401).send({
          error: "unauthorized",
          message: "Valid Supabase access token required.",
        });
      }
      // Foreign keys cascade: profile, watchlist, alerts, subscriptions are
      // removed with the auth user. The client clears its local cache itself.
      await supabaseServer.deleteUser(identity.id);
      return reply.code(204).send();
    },
  );
};
