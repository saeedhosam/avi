import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { EngineStats, WatchEngine } from "../engine/watch-engine.js";
import { AeroDataBoxProvider } from "../providers/aerodatabox.js";
import { EngineStatusStore } from "../lib/engine-status.js";
import type { ProviderCache } from "../lib/provider-cache.js";
import type { ScheduleService } from "../providers/schedule.js";

interface StatusOptions {
  config: AppConfig;
  provider: AeroDataBoxProvider;
  engine?: WatchEngine | null;
  engineStatus?: EngineStatusStore | null;
  cache?: ProviderCache | null;
  schedule?: ScheduleService | null;
}

const cacheStatsSchema = z.object({
  backend: z.enum(["redis", "process"]),
  enabled: z.boolean(),
  shared: z.boolean(),
  hits: z.number(),
  staleHits: z.number(),
  misses: z.number(),
  sharedHits: z.number(),
  stores: z.number(),
  errors: z.number(),
  entries: z.number(),
});

const statusResponse = z.object({
  service: z.literal("avi-api"),
  version: z.string(),
  environment: z.string(),
  providers: z.object({
    aerodatabox: z.enum(["configured", "not_configured"]),
    weather: z.literal("open-meteo"),
    supabase: z.enum(["configured", "not_configured"]),
    schedule: z.object({
      provider: z.string(),
      configured: z.boolean(),
    }),
  }),
  cache: cacheStatsSchema,
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

      const cacheStats = options.cache?.stats();
      const schedule = options.schedule;

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
          schedule: {
            provider: schedule?.id ?? "none",
            configured: schedule?.configured ?? false,
          },
        },
        cache: {
          backend: cacheStats?.backend ?? "process",
          enabled: cacheStats?.enabled ?? false,
          shared: cacheStats?.backend === "redis",
          hits: cacheStats?.hits ?? 0,
          staleHits: cacheStats?.staleHits ?? 0,
          misses: cacheStats?.misses ?? 0,
          sharedHits: cacheStats?.sharedHits ?? 0,
          stores: cacheStats?.stores ?? 0,
          errors: cacheStats?.errors ?? 0,
          entries: cacheStats?.entries ?? 0,
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
