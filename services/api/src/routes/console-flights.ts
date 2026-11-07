import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { UsageTracker } from "../lib/usage.js";
import type { UserQuotaService } from "../lib/user-quota.js";
import { ProviderError } from "../providers/aerodatabox.js";
import type { ConsoleFlightProvider } from "../providers/console-flights.js";
import {
  consoleSearchResponseSchema,
  errorResponseSchema,
} from "../domain/console-schema.js";
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
            429: errorResponseSchema,
            502: errorResponseSchema,
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
  };
