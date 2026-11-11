import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { ProviderCache } from "../lib/provider-cache.js";
import type { ScheduleService } from "../providers/schedule.js";

const healthResponse = z.object({
  status: z.literal("ok"),
  service: z.literal("avi-api"),
  version: z.string(),
  uptimeSeconds: z.number(),
  timestamp: z.string(),
});

const readinessResponse = z.object({
  status: z.enum(["ready", "degraded"]),
  service: z.literal("avi-api"),
  version: z.string(),
  checks: z.object({
    provider: z.object({
      configured: z.boolean(),
      required: z.boolean(),
      ok: z.boolean(),
    }),
    supabase: z.object({
      configured: z.boolean(),
      required: z.boolean(),
      ok: z.boolean(),
    }),
    cache: z.object({
      backend: z.enum(["redis", "process"]),
      shared: z.boolean(),
      ok: z.boolean(),
      error: z.string().optional(),
    }),
    schedule: z.object({
      provider: z.string(),
      configured: z.boolean(),
    }),
  }),
  timestamp: z.string(),
});

interface HealthOptions {
  config: AppConfig;
  cache: ProviderCache;
  provider: { configured: boolean };
  supabaseServer: { ready: boolean };
  schedule: ScheduleService;
}

export const healthRoutes: FastifyPluginAsyncZod<HealthOptions> = async (
  app,
  options,
) => {
  app.get(
    "/healthz",
    {
      schema: {
        tags: ["system"],
        summary: "Liveness probe",
        response: { 200: healthResponse },
      },
    },
    async () => ({
      status: "ok" as const,
      service: "avi-api" as const,
      version: process.env.npm_package_version ?? "0.1.0",
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    }),
  );

  app.get(
    "/readyz",
    {
      schema: {
        tags: ["system"],
        summary: "Readiness probe (provider, Supabase, and cache reachability)",
        response: { 200: readinessResponse, 503: readinessResponse },
      },
    },
    async (_request, reply) => {
      const cache = await options.cache.health();
      // In production the gateway is useless without a provider key and a
      // Supabase connection. In development those are optional, but the cache
      // backend must still answer.
      const required = options.config.NODE_ENV === "production";
      const providerOk = options.provider.configured;
      const supabaseOk = options.supabaseServer.ready;
      const ready =
        cache.ok &&
        (!required || providerOk) &&
        (!required || supabaseOk);

      const body = {
        status: ready ? ("ready" as const) : ("degraded" as const),
        service: "avi-api" as const,
        version: process.env.npm_package_version ?? "0.1.0",
        checks: {
          provider: {
            configured: providerOk,
            required,
            ok: providerOk,
          },
          supabase: {
            configured: supabaseOk,
            required,
            ok: supabaseOk,
          },
          cache: {
            backend: cache.backend,
            shared: cache.shared,
            ok: cache.ok,
            ...(cache.error ? { error: cache.error } : {}),
          },
          schedule: {
            provider: options.schedule.id,
            configured: options.schedule.configured,
          },
        },
        timestamp: new Date().toISOString(),
      };
      return reply.code(ready ? 200 : 503).send(body);
    },
  );
};
