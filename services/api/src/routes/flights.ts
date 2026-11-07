import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { UsageTracker } from "../lib/usage.js";
import {
  errorResponseSchema,
  flightSearchResponseSchema,
} from "../domain/schemas.js";
import {
  AeroDataBoxProvider,
  ProviderError,
} from "../providers/aerodatabox.js";

interface FlightOptions {
  provider: AeroDataBoxProvider;
  usage: UsageTracker;
  config: AppConfig;
}

const flightQuery = z.object({
  number: z.string().trim().min(2).max(12),
});

const FLIGHT_NUMBER_PATTERN = /^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/;

export const flightRoutes: FastifyPluginAsyncZod<FlightOptions> = async (
  app,
  options,
) => {
  app.get(
    "/v1/flights/search",
    {
      schema: {
        tags: ["flights"],
        summary: "Search live flights by flight number",
        querystring: flightQuery,
        response: {
          200: flightSearchResponseSchema,
          400: errorResponseSchema,
          429: errorResponseSchema,
          502: errorResponseSchema,
        },
      },
      config: {
        rateLimit: { max: 30, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
      if (options.usage.overBudget) {
        return reply.code(429).send({
          error: "unit_budget_exhausted",
          message: "Live flight updates are paused until the monthly data budget resets.",
        });
      }
      const cleaned = request.query.number
        .replace(/\s+/g, "")
        .replace(/-/g, "")
        .toUpperCase();

      if (!FLIGHT_NUMBER_PATTERN.test(cleaned)) {
        return reply.code(400).send({
          error: "invalid_flight_number",
          message: "Use an airline code and flight number, for example BA117.",
        });
      }

      try {
        const result = await options.provider.searchFlight(cleaned);
        if (result.meta.source === "live") {
          options.usage.add(options.config.AERODATABOX_UNITS_PER_FLIGHT);
        }
        reply.header(
          "Cache-Control",
          "public, max-age=30, stale-while-revalidate=120",
        );
        return result;
      } catch (error) {
        if (error instanceof ProviderError) {
          request.log.warn({ err: error }, "flight provider failed");
          return reply.code(502).send({
            error: "provider_failure",
            message: "Live flight data is temporarily unavailable.",
          });
        }
        throw error;
      }
    },
  );
};
