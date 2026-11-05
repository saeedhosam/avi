import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
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
          502: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
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
