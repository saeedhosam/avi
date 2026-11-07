import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { WatchEngine } from "../engine/watch-engine.js";
import { AeroDataBoxProvider } from "../providers/aerodatabox.js";
import type { EngineStats } from "../engine/watch-engine.js";

interface StatusOptions {
  config: AppConfig;
  provider: AeroDataBoxProvider;
  engine?: WatchEngine | null;
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

/** Best-effort worker stats; cached briefly so the gateway never hammers it. */
async function fetchRemoteEngineStats(
  log: { info: (msg: string) => void },
  config: AppConfig,
): Promise<EngineStats | null> {
  const base = config.ENGINE_API_BASE_URL?.trim().replace(/\/+$/, "");
  if (!base) return null;
  try {
    const response = await fetch(`${base}/v1/status`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) {
      log.info(`engine stats probe failed: HTTP ${response.status}`);
      return null;
    }
    const payload = (await response.json()) as Partial<StatusPayload>;
    log.info(`engine stats probe ok: ${payload.watchEngine ? "stats" : "null"}`);
    return payload.watchEngine ?? null;
  } catch (error) {
    log.info(`engine stats probe error: ${String(error)}`);
    return null;
  }
}

export const statusRoutes: FastifyPluginAsyncZod<StatusOptions> = async (
  app,
  options,
) => {
  let cached: { value: EngineStats | null; at: number } | null = null;
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
      if (!cached || Date.now() - cached.at > 5_000) {
        cached = {
          value: await fetchRemoteEngineStats(app.log, options.config),
          at: Date.now(),
        };
      }
      const workerStats = options.engine ? options.engine.stats() : cached?.value ?? null;

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
