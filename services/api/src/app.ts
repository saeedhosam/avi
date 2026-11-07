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
import { WatchEngine } from "./engine/watch-engine.js";
import { PushDelivery } from "./engine/push-delivery.js";
import { ConsoleFlightProvider } from "./providers/console-flights.js";
import { consoleFlightRoutes } from "./routes/console-flights.js";
import { consoleAirportRoutes } from "./routes/console-airports.js";
import { meRoutes } from "./routes/me.js";
import { billingRoutes } from "./routes/billing.js";
import { AeroDataBoxProvider } from "./providers/aerodatabox.js";
import { healthRoutes } from "./routes/health.js";
import { flightRoutes } from "./routes/flights.js";
import { statusRoutes } from "./routes/status.js";

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
  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
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

  const provider = new AeroDataBoxProvider(config);
  const consoleFlights = new ConsoleFlightProvider(config);
  const supabaseServer = new SupabaseServer(config);
  const usage = new UsageTracker(config.UNIT_BUDGET_PER_MONTH);

  const engine =
    config.WATCH_ENGINE_ENABLED && supabaseServer.ready && provider.configured
      ? new WatchEngine(
          config,
          provider,
          supabaseServer,
          usage,
          app.log,
          new PushDelivery(config, supabaseServer, app.log),
        )
      : null;
  if (engine) {
    engine.register(app);
  }

  await app.register(healthRoutes);
  await app.register(statusRoutes, { config, provider, engine });
  await app.register(flightRoutes, { provider, usage, config });
  await app.register(consoleFlightRoutes, { consoleFlights, usage, config });
  await app.register(consoleAirportRoutes, { consoleFlights, usage, config });
  if (supabaseServer.ready) {
    await app.register(meRoutes, { supabaseServer, usage, billingProvider: config.BILLING_PROVIDER });
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
