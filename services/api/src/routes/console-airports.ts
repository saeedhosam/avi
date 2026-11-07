import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { UsageTracker } from "../lib/usage.js";
import type { UserQuotaService } from "../lib/user-quota.js";
import type { ConsoleFlightProvider } from "../providers/console-flights.js";
import {
  consoleAirportSearchResponseSchema,
  consoleFidsResponseSchema,
  consoleRoutesResponseSchema,
  errorResponseSchema,
} from "../domain/console-schema.js";
import {
  reserveProviderQuota,
  refundProviderQuota,
} from "../lib/quota-request.js";

const IATA_PATTERN = /^[A-Z]{3}$/;

interface ConsoleAirportOptions {
  consoleFlights: ConsoleFlightProvider;
  usage: UsageTracker;
  userQuota: UserQuotaService;
  config: AppConfig;
}

const fidsParams = z.object({ code: z.string().trim().min(3).max(3) });
const searchQuery = z.object({ q: z.string().trim().min(2).max(64) });

const PROVIDER_RATE_LIMIT = {
  rateLimit: { max: 30, timeWindow: "1 minute" },
  providerAuth: true,
} as const;

const BUDGET_EXHAUSTED = {
  error: "unit_budget_exhausted",
  message: "Live flight updates are paused until the monthly data budget resets.",
};

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
            429: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
        config: PROVIDER_RATE_LIMIT,
      },
      async (request, reply) => {
        if (options.usage.overBudget) {
          return reply.code(429).send(BUDGET_EXHAUSTED);
        }
        const code = request.params.code.trim().toUpperCase();
        if (!IATA_PATTERN.test(code)) {
          return reply.code(400).send({
            error: "invalid_iata_code",
            message: "Use a 3-letter IATA airport code.",
          });
        }
        try {
          if (
            !(await reserveProviderQuota(
              request,
              reply,
              options.userQuota,
              options.config.AERODATABOX_UNITS_PER_FLIGHT,
            ))
          ) {
            return;
          }
          const outcome = await options.consoleFlights.lookupAirportFids(code);
          if (outcome.mode === "LIVE_AERODATABOX" && !outcome.cached) {
            options.usage.add(options.config.AERODATABOX_UNITS_PER_FLIGHT);
          } else {
            await refundProviderQuota(
              request,
              options.userQuota,
              options.config.AERODATABOX_UNITS_PER_FLIGHT,
            );
          }
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
          await refundProviderQuota(
            request,
            options.userQuota,
            options.config.AERODATABOX_UNITS_PER_FLIGHT,
          );
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
            429: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
        config: PROVIDER_RATE_LIMIT,
      },
      async (request, reply) => {
        if (options.usage.overBudget) {
          return reply.code(429).send(BUDGET_EXHAUSTED);
        }
        const code = request.params.code.trim().toUpperCase();
        if (!IATA_PATTERN.test(code)) {
          return reply.code(400).send({
            error: "invalid_iata_code",
            message: "Use a 3-letter IATA airport code.",
          });
        }
        try {
          if (
            !(await reserveProviderQuota(
              request,
              reply,
              options.userQuota,
              options.config.AERODATABOX_UNITS_PER_ROUTE,
            ))
          ) {
            return;
          }
          const outcome = await options.consoleFlights.lookupAirportRoutes(code);
          if (outcome.mode === "LIVE_AERODATABOX" && !outcome.cached) {
            options.usage.add(options.config.AERODATABOX_UNITS_PER_ROUTE);
          } else {
            await refundProviderQuota(
              request,
              options.userQuota,
              options.config.AERODATABOX_UNITS_PER_ROUTE,
            );
          }
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
          await refundProviderQuota(
            request,
            options.userQuota,
            options.config.AERODATABOX_UNITS_PER_ROUTE,
          );
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
            429: errorResponseSchema,
            502: errorResponseSchema,
          },
        },
        config: PROVIDER_RATE_LIMIT,
      },
      async (request, reply) => {
        if (options.usage.overBudget) {
          return reply.code(429).send(BUDGET_EXHAUSTED);
        }
        const q = request.query.q.trim();
        if (q.length < 2) {
          return reply.code(200).send({
            mode: "LIVE_AERODATABOX",
            status: 0,
            airports: [],
          });
        }
        try {
          if (
            !(await reserveProviderQuota(
              request,
              reply,
              options.userQuota,
              options.config.AERODATABOX_UNITS_PER_FLIGHT,
            ))
          ) {
            return;
          }
          const outcome = await options.consoleFlights.searchAirports(q);
          if (outcome.mode === "LIVE_AERODATABOX" && !outcome.cached) {
            options.usage.add(options.config.AERODATABOX_UNITS_PER_FLIGHT);
          } else {
            await refundProviderQuota(
              request,
              options.userQuota,
              options.config.AERODATABOX_UNITS_PER_FLIGHT,
            );
          }
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
          await refundProviderQuota(
            request,
            options.userQuota,
            options.config.AERODATABOX_UNITS_PER_FLIGHT,
          );
          request.log.warn({ err: error }, "airport search failed");
          return reply.code(502).send({
            error: "provider_failure",
            message: "Airport search is temporarily unavailable.",
          });
        }
      },
    );
  };
