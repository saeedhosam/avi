import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import type { AppConfig } from "./config.js";
import { SupabaseServer } from "./lib/supabase-server.js";
import { UsageTracker } from "./lib/usage.js";
import { EngineStatusStore } from "./lib/engine-status.js";
import { UserQuotaService } from "./lib/user-quota.js";
import { registerProviderAuth } from "./plugins/provider-auth.js";
import { WatchEngine } from "./engine/watch-engine.js";
import { PushDelivery } from "./engine/push-delivery.js";
import { ConsoleFlightProvider } from "./providers/console-flights.js";
import { consoleFlightRoutes } from "./routes/console-flights.js";
import { consoleAirportRoutes } from "./routes/console-airports.js";
import { meRoutes } from "./routes/me.js";
import { billingRoutes } from "./routes/billing.js";
import { AeroDataBoxProvider } from "./providers/aerodatabox.js";
import { AeroDataBoxClient } from "./providers/aero-client.js";
import { createScheduleProvider, ScheduleService } from "./providers/schedule.js";
import { providerCacheFor } from "./lib/provider-cache.js";
import { healthRoutes } from "./routes/health.js";
import { flightRoutes } from "./routes/flights.js";
import { statusRoutes } from "./routes/status.js";
import { scheduleRoutes } from "./routes/schedules.js";

export async function buildApp(config: AppConfig) {
  const app = Fastify({
    logger: { level: config.LOG_LEVEL },
    trustProxy: true,
    requestIdHeader: "x-request-id",
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: false,
  });
  await app.register(cors, {
    origin: config.corsOrigins,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["content-type", "authorization", "x-request-id"],
    maxAge: 86400,
  });
  const isUnmeteredPath = (url: string | undefined) => {
    // Health probes and status reads aren't abuse; the engine worker's cold
    // start burst from the gateway otherwise trips the shared limiter.
    const path = (url ?? "").split("?")[0];
    return path === "" || path === "/healthz" || path === "/v1/status" || path === "/openapi.json";
  };
  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
    allowList: (request) => isUnmeteredPath(request.raw.url),
  });
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Avi API",
        description:
          "Provider gateway for live flights, airports, weather, maps, and alerts.",
        version: "1.1.0",
      },
      tags: [
        { name: "system", description: "Health and configuration" },
        { name: "flights", description: "Live flight data" },
        { name: "airports", description: "Airport boards, routes, and search" },
      ],
    },
    transform: jsonSchemaTransform,
  });

  const cache = providerCacheFor(config);
  const provider = new AeroDataBoxProvider(
    config,
    new AeroDataBoxClient(config, cache),
  );
  const consoleFlights = new ConsoleFlightProvider(
    config,
    new AeroDataBoxClient(config, cache),
  );
  const schedule = new ScheduleService(
    createScheduleProvider(config, cache, {
      warn: (message) => app.log.warn(message),
    }),
  );
  const supabaseServer = new SupabaseServer(config);
  const usage = new UsageTracker(config.UNIT_BUDGET_PER_MONTH);
  const userQuota = new UserQuotaService(
    config.REDIS_URL,
    (uids) => supabaseServer.listUserPlans(uids),
    {
      debug: (message: string) => app.log.debug(message),
      warn: (message: string) => app.log.warn(message),
    },
  );
  const engineStatus = new EngineStatusStore(config.REDIS_URL, {
    warn: (message) => app.log.warn(message),
  });

  registerProviderAuth(app, {
    supabaseServer,
    userQuota,
    mode: config.PROVIDER_AUTH_MODE,
  });
  const engine =
    config.WATCH_ENGINE_ENABLED && supabaseServer.ready && provider.configured
      ? new WatchEngine(
          config,
          provider,
          supabaseServer,
          usage,
          app.log,
          new PushDelivery(config, supabaseServer, app.log),
          engineStatus,
        )
      : null;
  if (engine) {
    engine.register(app);
  }

  await app.register(healthRoutes, {
    config,
    cache,
    provider,
    supabaseServer,
    schedule,
  });
  await app.register(statusRoutes, {
    config,
    provider,
    engine,
    engineStatus,
    cache,
    schedule,
  });
  await app.register(flightRoutes, { provider, usage, userQuota, config });
  await app.register(consoleFlightRoutes, { consoleFlights, usage, userQuota, config });
  await app.register(consoleAirportRoutes, { consoleFlights, usage, userQuota, config });
  await app.register(scheduleRoutes, { schedule, usage, userQuota, config });
  if (supabaseServer.ready) {
    await app.register(meRoutes, { supabaseServer, usage, userQuota, billingProvider: config.BILLING_PROVIDER });
  }
  await app.register(billingRoutes, { config, supabaseServer });

  app.get(
    "/",
    {
      schema: {
        hide: true,
      },
    },
    async () => ({
      service: "avi-api",
      documentation: "/openapi.json",
      health: "/healthz",
    }),
  );

  app.get(
    "/openapi.json",
    {
      schema: {
        hide: true,
      },
    },
    async (_request, reply) => {
      reply.type("application/json");
      return app.swagger();
    },
  );

  app.setNotFoundHandler(async (_request, reply) => {
    return reply.code(404).send({
      error: "not_found",
      message: "Route not found.",
    });
  });

  app.setErrorHandler(async (error, request, reply) => {
    request.log.error({ err: error }, "unhandled request error");
    if (reply.sent) return;
    const statusCode =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : 500;
    return reply.code(statusCode).send({
      error: "internal_error",
      message:
        config.NODE_ENV === "production"
          ? "An unexpected error occurred."
          : error instanceof Error
            ? error.message
            : "An unexpected error occurred.",
    });
  });

  return app;
}
