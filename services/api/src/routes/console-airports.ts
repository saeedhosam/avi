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
            404: errorResponseSchema,
            429: errorResponseSchema,
            502: errorResponseSchema,
            503: errorResponseSchema,
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
          if (outcome.status === 204) {
            return reply.code(503).send({
              error: "board_data_unavailable",
              message:
                "The provider returned no board data. This is not evidence that no flights operate.",
            });
          }
          if (outcome.mode === "NOT_FOUND") {
            return reply.code(404).send({
              error: "airport_not_found",
              message: "The provider has no airport board for that code.",
            });
          }
          if (outcome.mode === "INVALID_REQUEST") {
            return reply.code(400).send({
              error: "invalid_provider_request",
              message: "The provider rejected that airport board query.",
            });
          }
          if (outcome.mode === "NOT_CONFIGURED") {
            return reply.code(503).send({
              error: "provider_not_configured",
              message: "Live airport board data is not configured.",
            });
          }
          if (outcome.mode === "QUOTA_FALLBACK") {
            return reply.code(429).send({
              error: "provider_quota_exhausted",
              message:
                "Live airport board data is paused until the provider quota resets.",
            });
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
            404: errorResponseSchema,
            429: errorResponseSchema,
            502: errorResponseSchema,
            503: errorResponseSchema,
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
          if (outcome.status === 204) {
            return reply.code(503).send({
              error: "route_data_unavailable",
              message:
                "The provider returned no route data. This is not evidence that no routes exist.",
            });
          }
          if (outcome.mode === "NOT_FOUND") {
            return reply.code(404).send({
              error: "airport_not_found",
              message: "The provider has no route statistics for that airport.",
            });
          }
          if (outcome.mode === "INVALID_REQUEST") {
            return reply.code(400).send({
              error: "invalid_provider_request",
              message: "The provider rejected that route-statistics query.",
            });
          }
          if (outcome.mode === "NOT_CONFIGURED") {
            return reply.code(503).send({
              error: "provider_not_configured",
              message: "Live route statistics are not configured.",
            });
          }
          if (outcome.mode === "QUOTA_FALLBACK") {
            return reply.code(429).send({
              error: "provider_quota_exhausted",
              message:
                "Live route statistics are paused until the provider quota resets.",
            });
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
            404: errorResponseSchema,
            429: errorResponseSchema,
            502: errorResponseSchema,
            503: errorResponseSchema,
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
            mode: "IDLE",
            status: 0,
            airports: [],
            source: "AERODATABOX",
            fetchedAt: new Date().toISOString(),
            attribution: "AeroDataBox",
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
          if (outcome.mode === "NOT_FOUND") {
            return reply.code(404).send({
              error: "airport_not_found",
              message: "The provider returned no airport search results.",
            });
          }
          if (outcome.mode === "INVALID_REQUEST") {
            return reply.code(400).send({
              error: "invalid_provider_request",
              message: "The provider rejected that airport search query.",
            });
          }
          if (outcome.mode === "NOT_CONFIGURED") {
            return reply.code(503).send({
              error: "provider_not_configured",
              message: "Airport search is not configured.",
            });
          }
          if (outcome.mode === "QUOTA_FALLBACK") {
            return reply.code(429).send({
              error: "provider_quota_exhausted",
              message:
                "Airport search is paused until the provider quota resets.",
            });
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
