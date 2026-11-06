import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { ProviderError } from "../providers/aerodatabox.js";
import type { ConsoleFlightProvider } from "../providers/console-flights.js";
import {
  consoleSearchResponseSchema,
  errorResponseSchema,
} from "../domain/console-schema.js";

const FLIGHT_NUMBER_PATTERN = /^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const lookupQuery = z.object({
  number: z.string().trim().min(2).max(12),
  date: z.string().optional(),
});

interface ConsoleFlightOptions {
  consoleFlights: ConsoleFlightProvider;
}

/**
 * Console-shaped flight lookup — the endpoint the web app uses. Mirrors
 * /api/flights/search without leaking provider details to clients.
 */
export const consoleFlightRoutes: FastifyPluginAsyncZod<ConsoleFlightOptions> =
  async (app, options) => {
    app.get(
      "/v1/flights/lookup",
      {
        schema: {
          tags: ["flights"],
          summary: "Search live flights as console Flight objects",
          querystring: lookupQuery,
          response: {
            200: consoleSearchResponseSchema,
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
        const date = request.query.date?.trim();

        if (!FLIGHT_NUMBER_PATTERN.test(cleaned)) {
          return reply.code(400).send({
            error: "invalid_flight_number",
            message: "Use an airline code and flight number, for example BA117.",
          });
        }
        if (date && !DATE_PATTERN.test(date)) {
          return reply.code(400).send({
            error: "invalid_departure_date",
            message: "Use an ISO date, for example 2026-03-13.",
          });
        }

        try {
          const outcome = await options.consoleFlights.lookupFlight(cleaned, date || undefined);
          // Fail honestly when the provider is down/invalid — the previous
          // web behavior hid outages as HTTP 200 with `flights: []`.
          if (outcome.mode === "ERROR" || (outcome.mode === "NOT_CONFIGURED" && outcome.status === 0)) {
            if (outcome.mode === "ERROR") {
              return reply.code(502).send({
                error: "provider_unreachable",
                message: "The live flight provider is temporarily unreachable.",
              });
            }
          }
          reply.header(
            "Cache-Control",
            "public, max-age=30, stale-while-revalidate=120",
          );
          return outcome;
        } catch (error) {
          if (error instanceof ProviderError) {
            request.log.warn({ err: error }, "console flight lookup failed");
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
