import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { ConsoleFlightProvider } from "../providers/console-flights.js";
import {
  consoleAirportSearchResponseSchema,
  consoleFidsResponseSchema,
  consoleRoutesResponseSchema,
  errorResponseSchema,
} from "../domain/console-schema.js";

const IATA_PATTERN = /^[A-Z]{3}$/;

interface ConsoleAirportOptions {
  consoleFlights: ConsoleFlightProvider;
}

const fidsParams = z.object({ code: z.string().trim().min(3).max(3) });
const searchQuery = z.object({ q: z.string().trim().min(2).max(64) });

/**
 * Console-shaped airport data: FIDS boards, daily route stats, and live
 * airport search. Shapes mirror the previous Next.js handlers so the web can
 * proxy straight through.
 */
export const consoleAirportRoutes: FastifyPluginAsyncZod<ConsoleAirportOptions> =
  async (app, options) => {
    app.get(
      "/v1/airports/:code/flights",
      {
        schema: {
          tags: ["airports"],
          summary: "Live departures + arrivals board (console Flight shape)",
          params: fidsParams,
          response: {
            200: consoleFidsResponseSchema,
            400: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const code = request.params.code.trim().toUpperCase();
        if (!IATA_PATTERN.test(code)) {
          return reply.code(400).send({
            error: "invalid_iata_code",
            message: "Use a 3-letter IATA airport code.",
          });
        }
        try {
          const outcome = await options.consoleFlights.lookupAirportFids(code);
          if (outcome.mode === "ERROR") {
            return reply.code(502).send({
              error: "provider_unreachable",
              message: "The live flight provider is temporarily unreachable.",
            });
          }
          reply.header(
            "Cache-Control",
            "public, max-age=30, stale-while-revalidate=120",
          );
          return outcome;
        } catch (error) {
          request.log.warn({ err: error }, "airport board lookup failed");
          return reply.code(502).send({
            error: "provider_failure",
            message: "Live airport board data is temporarily unavailable.",
          });
        }
      },
    );

    app.get(
      "/v1/airports/:code/routes",
      {
        schema: {
          tags: ["airports"],
          summary: "Daily route stats from the origin airport",
          params: fidsParams,
          response: {
            200: consoleRoutesResponseSchema,
            400: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const code = request.params.code.trim().toUpperCase();
        if (!IATA_PATTERN.test(code)) {
          return reply.code(400).send({
            error: "invalid_iata_code",
            message: "Use a 3-letter IATA airport code.",
          });
        }
        try {
          const outcome = await options.consoleFlights.lookupAirportRoutes(code);
          if (outcome.mode === "ERROR") {
            return reply.code(502).send({
              error: "provider_unreachable",
              message: "The live flight provider is temporarily unreachable.",
            });
          }
          reply.header(
            "Cache-Control",
            "public, max-age=300, stale-while-revalidate=600",
          );
          return outcome;
        } catch (error) {
          request.log.warn({ err: error }, "airport routes lookup failed");
          return reply.code(502).send({
            error: "provider_failure",
            message: "Live route data is temporarily unavailable.",
          });
        }
      },
    );

    app.get(
      "/v1/airports/search",
      {
        schema: {
          tags: ["airports"],
          summary: "Search airports worldwide by code or name",
          querystring: searchQuery,
          response: {
            200: consoleAirportSearchResponseSchema,
            400: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const q = request.query.q.trim();
        if (q.length < 2) {
          return reply.code(200).send({
            mode: "LIVE_AERODATABOX",
            status: 0,
            airports: [],
          });
        }
        try {
          const outcome = await options.consoleFlights.searchAirports(q);
          if (outcome.mode === "ERROR") {
            return reply.code(502).send({
              error: "provider_unreachable",
              message: "The live flight provider is temporarily unreachable.",
            });
          }
          reply.header(
            "Cache-Control",
            "public, max-age=120, stale-while-revalidate=600",
          );
          return outcome;
        } catch (error) {
          request.log.warn({ err: error }, "airport search failed");
          return reply.code(502).send({
            error: "provider_failure",
            message: "Airport search is temporarily unavailable.",
          });
        }
      },
    );
  };
