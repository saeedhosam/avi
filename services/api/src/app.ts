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
        version: "1.0.0",
      },
      tags: [
        { name: "system", description: "Health and configuration" },
        { name: "flights", description: "Live flight data" },
      ],
    },
    transform: jsonSchemaTransform,
  });

  const provider = new AeroDataBoxProvider(config);

  await app.register(healthRoutes);
  await app.register(statusRoutes, { config, provider });
  await app.register(flightRoutes, { provider });

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
