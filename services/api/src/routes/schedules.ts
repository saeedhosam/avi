import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { UsageTracker } from "../lib/usage.js";
import type { UserQuotaService } from "../lib/user-quota.js";
import type { ScheduleService } from "../providers/schedule.js";
import {
  errorResponseSchema,
  routeScheduleResponseSchema,
} from "../domain/console-schema.js";
import {
  reserveProviderQuota,
  refundProviderQuota,
} from "../lib/quota-request.js";

const IATA_PATTERN = /^[A-Z]{3}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const scheduleParams = z.object({
  origin: z.string().trim().min(1).max(4),
  destination: z.string().trim().min(1).max(4),
});

const scheduleQuery = z.object({
  /** First operating date (UTC). Defaults to today. */
  date: z.string().regex(DATE_PATTERN).optional(),
  /** Number of days; clamped by SCHEDULE_MAX_DAYS. */
  days: z.coerce.number().int().min(1).max(21).optional(),
});

interface ScheduleOptions {
  schedule: ScheduleService;
  usage: UsageTracker;
  userQuota: UserQuotaService;
  config: AppConfig;
}

const PROVIDER_RATE_LIMIT = {
  rateLimit: { max: 30, timeWindow: "1 minute" },
  providerAuth: true,
} as const;

const BUDGET_EXHAUSTED = {
  error: "unit_budget_exhausted",
  message: "Live flight updates are paused until the monthly data budget resets.",
};

/**
 * Forward schedule endpoint.
 *
 * The response always states `verified | partial | unavailable`. There is no
 * fallback to trailing route statistics, hash-derived operating days, or an
 * empty list presented as a verified schedule.
 */
export const scheduleRoutes: FastifyPluginAsyncZod<ScheduleOptions> = async (
  app,
  options,
) => {
  app.get(
    "/v1/routes/:origin/:destination/schedule",
    {
      schema: {
        tags: ["airports"],
        summary: "Published forward schedule for a route",
        params: scheduleParams,
        querystring: scheduleQuery,
        response: {
          200: routeScheduleResponseSchema,
          400: errorResponseSchema,
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
      const origin = request.params.origin.trim().toUpperCase();
      const destination = request.params.destination.trim().toUpperCase();
      if (!IATA_PATTERN.test(origin) || !IATA_PATTERN.test(destination)) {
        return reply.code(400).send({
          error: "invalid_iata_code",
          message: "Use 3-letter IATA codes for both origin and destination.",
        });
      }
      const days = request.query.days ?? options.config.SCHEDULE_MAX_DAYS;
      const units = options.config.AERODATABOX_UNITS_PER_ROUTE;
      if (!(await reserveProviderQuota(request, reply, options.userQuota, units))) {
        return;
      }

      try {
        const outcome = await options.schedule.lookup({
          origin,
          destination,
          date: request.query.date,
          days,
        });
        if (outcome.status === "unavailable") {
          // No provider data was purchased; do not charge the caller's quota.
          await refundProviderQuota(request, options.userQuota, units);
          reply.header("Cache-Control", "no-store");
          return outcome;
        }
        reply.header(
          "Cache-Control",
          "public, max-age=300, stale-while-revalidate=600",
        );
        return outcome;
      } catch (error) {
        await refundProviderQuota(request, options.userQuota, units);
        request.log.warn({ err: error }, "route schedule lookup failed");
        return reply.code(502).send({
          error: "provider_failure",
          message: "Forward schedule data is temporarily unavailable.",
        });
      }
    },
  );
};
