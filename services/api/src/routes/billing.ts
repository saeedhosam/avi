import type { FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { SupabaseServer } from "../lib/supabase-server.js";
import {
  createLemonSqueezyCheckout,
  planPatchFromWebhook,
  verifyLemonSqueezySignature,
} from "../lib/billing.js";

interface BillingOptions {
  config: AppConfig;
  supabaseServer: SupabaseServer;
}

interface RawBodyRequest extends FastifyRequest {
  rawBody?: unknown;
}

const LS_WEBHOOK_TYPE = "application/vnd.api+json";

const checkoutRequest = z.object({
  target: z.enum(["PLUS", "PRO"]),
});

const checkoutAccepted = z.object({
  url: z.string(),
  provider: z.literal("lemon_squeezy"),
});

const checkoutUnavailable = z.object({
  error: z.string(),
  message: z.string(),
});

/**
 * Billing surface: plans are written only by the billing provider (never by
 * clients — the earlier column-level grant revoke guarantees that). Today:
 * Lemon Squeezy webhook + checkout creation; the "manual" default keeps plan
 * assignment in SQL until LS is configured.
 */
export const billingRoutes: FastifyPluginAsyncZod<BillingOptions> = async (
  app,
  options,
) => {
  const { config, supabaseServer } = options;

  const applyPlanPatch = async (
    uid: string,
    patch: { plan: "FREE" | "PLUS" | "PRO"; billingCustomerId: string | null },
  ): Promise<boolean> => {
    const search = new URLSearchParams({ id: `eq.${uid}` });
    const response = await fetch(
      `${supabaseServer.baseUrl()}/rest/v1/profiles?${search.toString()}`,
      {
        method: "PATCH",
        headers: supabaseServer.serviceHeaders(),
        body: JSON.stringify({
          plan: patch.plan,
          billing_customer_id: patch.billingCustomerId,
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    return response.ok;
  };

  if (config.BILLING_PROVIDER === "manual") {
    // Advertised as unavailable so the UI can say "contact support" cleanly.
    app.post(
      "/v1/billing/checkout",
      {
        schema: { hide: true, response: { 503: checkoutUnavailable } },
      },
      async (_request, reply) =>
        reply.code(503).send({
          error: "billing_unavailable",
          message: "Self-serve billing isn't active yet. Plans are assigned manually.",
        }),
    );
    app.log.info("billing provider: manual (webhook + checkout disabled)");
    return;
  }

  // ── Lemon Squeezy webhooks ────────────────────────────────────────────────
  // Encapsulated content parser: this scope parses JSON as a raw buffer so the
  // signature can be computed over the exact bytes LS signed.
  app.addContentTypeParser(
    ["application/json", LS_WEBHOOK_TYPE],
    { parseAs: "buffer" },
    (_request, body, done) => done(null, body),
  );

  app.post(
    "/v1/webhooks/lemon-squeezy",
    { schema: { hide: true, response: { 200: z.void(), 401: z.object({ error: z.string() }) } } },
    async (request, reply) => {
      const raw = (request as RawBodyRequest).rawBody ?? (request as { body?: unknown }).body;
      const requestBody =
        Buffer.isBuffer(raw)
          ? raw.toString("utf8")
          : typeof raw === "string"
            ? raw
            : JSON.stringify(request.body ?? {});
      const signature = request.headers["x-signature"];
      const timestamp = request.headers["x-signature-timestamp"];
      const secret = config.LEMONSQUEEZY_WEBHOOK_SECRET ?? "";
      if (
        !verifyLemonSqueezySignature(
          secret,
          requestBody,
          typeof signature === "string" ? signature : undefined,
          typeof timestamp === "string" ? timestamp : undefined,
        )
      ) {
        return reply.code(401).send({ error: "invalid_signature" });
      }

      const payload = (typeof requestBody === "string" ? JSON.parse(requestBody) : request.body ?? {}) as {
        meta?: { event_name?: string; custom_data?: { user_id?: string } };
        data?: { attributes?: { user_email?: string } };
      };
      const patch = planPatchFromWebhook(payload, config);
      if (!patch) {
        return reply.code(200).send();
      }

      const uid =
        payload.meta?.custom_data?.user_id ??
        (await supabaseServer.findProfileIdByEmail(payload.data?.attributes?.user_email));
      if (!uid) {
        request.log.warn({ event: payload.meta?.event_name }, "billing webhook: no matching profile");
        return reply.code(200).send();
      }

      const applied = await applyPlanPatch(uid, patch);
      if (!applied) {
        return reply.code(200).send();
      }
      request.log.info(
        { uid: uid.slice(0, 8), plan: patch.plan },
        "billing webhook updated plan",
      );
      return reply.code(200).send();
    },
  );

  // ── Checkout creation ─────────────────────────────────────────────────────
  app.post(
    "/v1/billing/checkout",
    {
      schema: {
        hide: true,
        body: checkoutRequest,
        response: {
          200: checkoutAccepted,
          401: checkoutUnavailable,
          502: checkoutUnavailable,
        },
      },
    },
    async (request, reply) => {
      const authorization = request.headers.authorization ?? "";
      const token = authorization.replace(/^Bearer\s+/i, "").trim();
      const uid = token.length > 20 ? await supabaseServer.authUserId(token) : null;
      if (!uid) {
        return reply.code(401).send({
          error: "unauthorized",
          message: "Valid Supabase access token required.",
        });
      }
      const url = await createLemonSqueezyCheckout(
        config,
        uid,
        config.PUBLIC_WEB_URL,
        request.body.target,
      );
      if (!url) {
        return reply.code(502).send({
          error: "billing_unavailable",
          message: "Checkout could not be created. Try again shortly.",
        });
      }
      return { url, provider: "lemon_squeezy" as const };
    },
  );
};
