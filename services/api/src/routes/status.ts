import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import { AeroDataBoxProvider } from "../providers/aerodatabox.js";

interface StatusOptions {
  config: AppConfig;
  provider: AeroDataBoxProvider;
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
  timestamp: z.string(),
});

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
    async () => ({
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
      timestamp: new Date().toISOString(),
    }),
  );
};
