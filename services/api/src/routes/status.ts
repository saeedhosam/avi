import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { EngineStats, WatchEngine } from "../engine/watch-engine.js";
import { AeroDataBoxProvider } from "../providers/aerodatabox.js";
import { EngineStatusStore, engineStatusStoreFor } from "../lib/engine-status.js";

interface StatusOptions {
  config: AppConfig;
  provider: AeroDataBoxProvider;
  engine?: WatchEngine | null;
  engineStatus?: EngineStatusStore | null;
}

const statusResponse = z.object({
  service: z.literal("avi-api"),
  version: z.string(),
  environment: z.string(),
  providers: z.object({
    aerodatabox: z.enum(["configured", "not_configured"]),
    weather: z.literal("open-meteo"),
    supabase: z.enum(["configured", "not_configured"]),
  }),
  map: z.object({
    style: z.literal("positron"),
    tileProvider: z.literal("openfreemap"),
  }),
  watchEngine: z
    .object({
      enabled: z.boolean(),
      lastTickAt: z.string().nullable(),
      lastSwept: z.number(),
      backlog: z.number(),
      error: z.string().nullable(),
      units: z.object({
        unitsUsed: z.number(),
        unitsBudget: z.number(),
        overBudget: z.boolean(),
      }),
      supabaseReady: z.boolean(),
      metered: z.number(),
      push: z
        .object({
          enabled: z.boolean(),
          lastDelivered: z.number(),
          lastError: z.string().nullable(),
        })
        .nullable(),
    })
    .nullable(),
  timestamp: z.string(),
});

type StatusPayload = z.infer<typeof statusResponse>;

export const statusRoutes: FastifyPluginAsyncZod<StatusOptions> = async (
  app,
  options,
) => {
  app.get(
    "/v1/status",
    {
      schema: {
        tags: ["system"],
        summary: "Service and provider configuration status",
        response: { 200: statusResponse },
      },
    },
    async () => {
      // In the API container the engine lives elsewhere: read the latest tick
      // snapshot from Redis (`avi:engine:status`, TTL 90 s). A dead worker
      // expires the key, so the gateway reports stats as null instead of a
      // stale "healthy" front.
      const workerStats = options.engine
        ? options.engine.stats()
        : options.engineStatus
          ? await options.engineStatus.read()
          : null;

      return {
        service: "avi-api" as const,
        version: process.env.npm_package_version ?? "0.1.0",
        environment: options.config.NODE_ENV,
        providers: {
          aerodatabox: options.provider.configured
            ? ("configured" as const)
            : ("not_configured" as const),
          weather: "open-meteo" as const,
          supabase:
            options.config.SUPABASE_URL && options.config.SUPABASE_SECRET_KEY
              ? ("configured" as const)
              : ("not_configured" as const),
        },
        map: {
          style: "positron" as const,
          tileProvider: "openfreemap" as const,
        },
        watchEngine: workerStats,
        timestamp: new Date().toISOString(),
      } as StatusPayload;
    },
  );
};
