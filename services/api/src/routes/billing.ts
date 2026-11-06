import type { FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { SupabaseServer } from "../lib/supabase-server.js";
import {
  createLemonSqueezyCheckout,
  createPolarCheckout,
  planPatchFromPolarWebhook,
  planPatchFromWebhook,
  verifyLemonSqueezySignature,
  verifyPolarSignature,
  type PolarWebhookEvent,
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
  provider: z.enum(["lemon_squeezy", "polar"]),
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
  if (config.BILLING_PROVIDER === "lemon_squeezy") {
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
  }

  // ── Polar.sh webhooks (Merchant of Record; Egypt payout verified) ─────────
  if (config.BILLING_PROVIDER === "polar") {
    app.addContentTypeParser(
      ["application/json"],
      { parseAs: "buffer" },
      (_request, body, done) => done(null, body),
    );

    app.post(
      "/v1/webhooks/polar",
      { schema: { hide: true, response: { 200: z.void(), 401: z.object({ error: z.string() }) } } },
      async (request, reply) => {
        const raw = (request as RawBodyRequest).rawBody ?? (request as { body?: unknown }).body;
        const requestBody =
          Buffer.isBuffer(raw)
            ? raw.toString("utf8")
            : typeof raw === "string"
              ? raw
              : JSON.stringify(request.body ?? {});
        if (
          !verifyPolarSignature(
            config.POLAR_WEBHOOK_SECRET ?? "",
            requestBody,
            request.headers["polar-webhook-signature"] as string | undefined,
          )
        ) {
          return reply.code(401).send({ error: "invalid_signature" });
        }

        let payload: unknown;
        try {
          payload = JSON.parse(requestBody) as unknown;
        } catch {
          return reply.code(200).send();
        }

        const patch = planPatchFromPolarWebhook(payload as PolarWebhookEvent, config);
        if (!patch) {
          return reply.code(200).send();
        }

        const polarData = (payload as PolarWebhookEvent).data ?? undefined;
        const uid =
          polarData?.metadata?.user_id ??
          polarData?.external_customer_id ??
          (await supabaseServer.findProfileIdByEmail(
            (polarData as { customer_email?: string } | undefined)?.customer_email,
          ));
        if (!uid) {
          request.log.warn(
            { type: (payload as PolarWebhookEvent).type },
            "polar webhook: no matching profile",
          );
          return reply.code(200).send();
        }

        const applied = await applyPlanPatch(uid, patch);
        if (!applied) {
          return reply.code(200).send();
        }
        request.log.info(
          { uid: uid.slice(0, 8), plan: patch.plan, type: (payload as PolarWebhookEvent).type },
          "polar webhook updated plan",
        );
        return reply.code(200).send();
      },
    );
  }

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
      const provider = config.BILLING_PROVIDER as "lemon_squeezy" | "polar";
      const url =
        provider === "polar"
          ? await createPolarCheckout(
              config,
              uid,
              config.PUBLIC_WEB_URL,
              request.body.target,
            )
          : await createLemonSqueezyCheckout(
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
      return { url, provider };
    },
  );
};
