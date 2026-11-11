import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { UsageTracker } from "../lib/usage.js";
import type { UserQuotaService } from "../lib/user-quota.js";
import { ProviderError } from "../providers/aerodatabox.js";
import type { ConsoleFlightProvider } from "../providers/console-flights.js";
import {
  consoleAircraftResponseSchema,
  consoleFlightDatesResponseSchema,
  consoleFlightDelaysResponseSchema,
  consoleSearchResponseSchema,
  errorResponseSchema,
} from "../domain/console-schema.js";
import { sendProviderOutcomeError } from "../lib/provider-outcome.js";
import {
  reserveProviderQuota,
  refundProviderQuota,
} from "../lib/quota-request.js";

const FLIGHT_NUMBER_PATTERN = /^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const lookupQuery = z.object({
  number: z.string().trim().min(2).max(12),
  date: z.string().optional(),
});

interface ConsoleFlightOptions {
  consoleFlights: ConsoleFlightProvider;
  usage: UsageTracker;
  userQuota: UserQuotaService;
  config: AppConfig;
}

const PROVIDER_RATE_LIMIT = {
  rateLimit: { max: 30, timeWindow: "1 minute" },
  providerAuth: true,
} as const;

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
          return reply.code(429).send({
            error: "unit_budget_exhausted",
            message: "Live flight updates are paused until the monthly data budget resets.",
          });
        }
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

        // Per-identity quota check. Consumed before the call to prevent burst
        // overspend; refunded below when the provider did not charge a unit.
        const units = options.config.AERODATABOX_UNITS_PER_FLIGHT;
        if (!(await reserveProviderQuota(request, reply, options.userQuota, units))) {
          return;
        }

        try {
          const outcome = await options.consoleFlights.lookupFlight(cleaned, date || undefined);
          if (outcome.mode === "LIVE_AERODATABOX" && !outcome.cached) {
            options.usage.add(options.config.AERODATABOX_UNITS_PER_FLIGHT);
          } else {
            // Nothing was charged to the provider; give the caller their quota back.
            await refundProviderQuota(request, options.userQuota, units);
          }
          // Fail honestly when the provider is down, unconfigured, or out of
          // quota. Returning HTTP 200 with an empty list would be
          // indistinguishable from a verified "no flights" result.
          if (outcome.mode === "NOT_FOUND") {
            return reply.code(404).send({
              error: "flight_not_found",
              message: "The provider has no flight matching that number and date.",
            });
          }
          if (outcome.mode === "INVALID_REQUEST") {
            return reply.code(400).send({
              error: "invalid_provider_request",
              message: "The provider rejected that flight query.",
            });
          }
          if (outcome.mode === "NOT_CONFIGURED") {
            return reply.code(503).send({
              error: "provider_not_configured",
              message: "Live flight data is not configured.",
            });
          }
          if (outcome.mode === "QUOTA_FALLBACK") {
            return reply.code(429).send({
              error: "provider_quota_exhausted",
              message:
                "Live flight lookups are paused until the provider quota resets.",
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
          await refundProviderQuota(request, options.userQuota, units);
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

    app.get(
      "/v1/flights/dates",
      {
        schema: {
          tags: ["flights"],
          summary: "Published operating dates for a flight number",
          querystring: lookupQuery.pick({ number: true }),
          response: {
            200: consoleFlightDatesResponseSchema,
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

        const units = options.config.AERODATABOX_UNITS_PER_FLIGHT;
        if (!(await reserveProviderQuota(request, reply, options.userQuota, units))) {
          return;
        }
        try {
          const outcome = await options.consoleFlights.lookupFlightDates(cleaned);
          if (options.consoleFlights.charged(outcome)) {
            options.usage.add(options.config.AERODATABOX_UNITS_PER_FLIGHT);
          } else {
            await refundProviderQuota(request, options.userQuota, units);
          }
          if (outcome.status === 204) {
            return reply.code(503).send({
              error: "flight_dates_unavailable",
              message:
                "The provider returned no operating-date data. This is not evidence that the flight does not operate.",
            });
          }
          if (sendProviderOutcomeError(reply, outcome.mode, "flight_dates")) return;
          reply.header("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
          return outcome;
        } catch (error) {
          await refundProviderQuota(request, options.userQuota, units);
          request.log.warn({ err: error }, "flight operating dates lookup failed");
          return reply.code(502).send({
            error: "provider_failure",
            message: "Flight operating dates are temporarily unavailable.",
          });
        }
      },
    );

    app.get(
      "/v1/flights/:number/delays",
      {
        schema: {
          tags: ["flights"],
          summary: "Historical delay statistics for a flight number",
          params: z.object({ number: z.string().trim().min(2).max(12) }),
          response: {
            200: consoleFlightDelaysResponseSchema,
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
          return reply.code(429).send({
            error: "unit_budget_exhausted",
            message: "Live flight updates are paused until the monthly data budget resets.",
          });
        }
        const cleaned = request.params.number
          .replace(/\s+/g, "")
          .replace(/-/g, "")
          .toUpperCase();
        if (!FLIGHT_NUMBER_PATTERN.test(cleaned)) {
          return reply.code(400).send({
            error: "invalid_flight_number",
            message: "Use an airline code and flight number, for example BA117.",
          });
        }

        const units = options.config.AERODATABOX_UNITS_PER_FLIGHT;
        if (!(await reserveProviderQuota(request, reply, options.userQuota, units))) {
          return;
        }
        try {
          const outcome = await options.consoleFlights.lookupFlightDelays(cleaned);
          if (options.consoleFlights.charged(outcome)) {
            options.usage.add(options.config.AERODATABOX_UNITS_PER_FLIGHT);
          } else {
            await refundProviderQuota(request, options.userQuota, units);
          }
          if (outcome.status === 204) {
            return reply.code(503).send({
              error: "flight_delays_unavailable",
              message:
                "The provider returned no delay statistics. This is not evidence of an on-time flight.",
            });
          }
          if (sendProviderOutcomeError(reply, outcome.mode, "flight_delays")) return;
          reply.header("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
          return outcome;
        } catch (error) {
          await refundProviderQuota(request, options.userQuota, units);
          request.log.warn({ err: error }, "flight delay statistics lookup failed");
          return reply.code(502).send({
            error: "provider_failure",
            message: "Flight delay statistics are temporarily unavailable.",
          });
        }
      },
    );

    app.get(
      "/v1/aircraft/:reg",
      {
        schema: {
          tags: ["airports"],
          summary: "Aircraft reference data by registration",
          params: z.object({ reg: z.string().trim().min(2).max(12) }),
          response: {
            200: consoleAircraftResponseSchema,
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
          return reply.code(429).send({
            error: "unit_budget_exhausted",
            message: "Live flight updates are paused until the monthly data budget resets.",
          });
        }
        const reg = request.params.reg.replace(/[\s-]/g, "").toUpperCase();
        if (!/^[A-Z0-9]{2,12}$/.test(reg)) {
          return reply.code(400).send({
            error: "invalid_registration",
            message: "Use an aircraft registration such as G-XLEA.",
          });
        }

        const units = options.config.AERODATABOX_UNITS_PER_FLIGHT;
        if (!(await reserveProviderQuota(request, reply, options.userQuota, units))) {
          return;
        }
        try {
          const outcome = await options.consoleFlights.lookupAircraft(reg);
          if (options.consoleFlights.charged(outcome)) {
            options.usage.add(options.config.AERODATABOX_UNITS_PER_FLIGHT);
          } else {
            await refundProviderQuota(request, options.userQuota, units);
          }
          if (outcome.status === 204) {
            return reply.code(404).send({
              error: "aircraft_not_found",
              message: "The provider returned no aircraft for that registration.",
            });
          }
          if (sendProviderOutcomeError(reply, outcome.mode, "aircraft")) return;
          if (!outcome.aircraft) {
            return reply.code(404).send({
              error: "aircraft_not_found",
              message: "No aircraft reference data is available for that registration.",
            });
          }
          reply.header("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
          return outcome;
        } catch (error) {
          await refundProviderQuota(request, options.userQuota, units);
          request.log.warn({ err: error }, "aircraft lookup failed");
          return reply.code(502).send({
            error: "provider_failure",
            message: "Aircraft reference data is temporarily unavailable.",
          });
        }
      },
    );
  };
