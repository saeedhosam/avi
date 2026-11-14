import type { FastifyBaseLogger, FastifyReply } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  gatewayAircraftResponseSchema,
  gatewayBoardResponseSchema,
  gatewayFlightsResponseSchema,
  gatewayRoutesResponseSchema,
} from "@avi/shared";
import type { AppConfig } from "../config.js";
import { errorResponseSchema } from "../domain/console-schema.js";
import type { UsageTracker } from "../lib/usage.js";
import type { UserQuotaService } from "../lib/user-quota.js";
import {
  refundProviderQuota,
  reserveProviderQuota,
} from "../lib/quota-request.js";
import {
  GatewayServiceError,
  gatewayTerminalGraphResponseSchema,
  type GatewayService,
} from "../gateway/gateway-service.js";

const flightParams = z.object({
  flightNumber: z.string().trim().min(2).max(12),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const airportParams = z.object({
  iata: z.string().trim().length(3),
});

const aircraftParams = z.object({
  regOrIcao: z.string().trim().min(3).max(12),
});

const terminalGraphQuery = z.object({
  terminal: z.string().trim().min(1).max(32),
});

const BUDGET_EXHAUSTED = {
  error: "unit_budget_exhausted",
  message: "Live flight updates are paused until the monthly data budget resets.",
};

const PROVIDER_RATE_LIMIT = {
  rateLimit: { max: 60, timeWindow: "1 minute" },
  providerAuth: true,
} as const;

interface GatewayRouteOptions {
  gateway: GatewayService;
  usage: UsageTracker;
  userQuota: UserQuotaService;
  config: AppConfig;
}

function sendError(
  reply: FastifyReply,
  error: unknown,
  log: FastifyBaseLogger,
) {
  if (error instanceof GatewayServiceError) {
    return reply.code(error.statusCode).send({
      error: error.code,
      message: error.message,
      ...(error.retryAfterSeconds
        ? { retryAfterSeconds: error.retryAfterSeconds }
        : {}),
    });
  }
  log.warn({ err: error }, "gateway request failed");
  return reply.code(502).send({
    error: "gateway_failure",
    message: "The AeroQuest gateway could not complete that request.",
  });
}

/**
 * AeroDataBox Starter-safe caching gateway.
 *
 * These exact paths are consumed by web and mobile; clients never hold a
 * provider key. Provider calls are coalesced by the shared cache, and the
 * response advertises cache provenance so the UI can label stale data.
 */
export const gatewayRoutes: FastifyPluginAsyncZod<GatewayRouteOptions> = async (
  app,
  options,
) => {
  app.get(
    "/api/gateway/flights/:flightNumber/:date",
    {
      schema: {
        tags: ["gateway"],
        summary: "Cached flight status with gate/terminal/baggage alerts",
        params: flightParams,
        response: {
          200: gatewayFlightsResponseSchema,
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
      const units = options.config.AERODATABOX_UNITS_PER_FLIGHT;
      if (!(await reserveProviderQuota(request, reply, options.userQuota, units))) {
        return;
      }
      try {
        const result = await options.gateway.getFlight(
          request.params.flightNumber,
          request.params.date,
        );
        if (result.provenance.cached) {
          await refundProviderQuota(request, options.userQuota, units);
        } else {
          options.usage.add(units);
        }
        reply.header(
          "Cache-Control",
          "public, max-age=30, stale-while-revalidate=120",
        );
        reply.header("X-AeroQuest-Cache", result.provenance.cached ? "HIT" : "MISS");
        return result;
      } catch (error) {
        await refundProviderQuota(request, options.userQuota, units);
        return sendError(reply, error, request.log);
      }
    },
  );

  app.get(
    "/api/gateway/airports/:iata/routes",
    {
      schema: {
        tags: ["gateway"],
        summary: "Direct route network for the explorer (7-day cache)",
        params: airportParams,
        response: {
          200: gatewayRoutesResponseSchema,
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
      const units = options.config.AERODATABOX_UNITS_PER_ROUTE;
      if (!(await reserveProviderQuota(request, reply, options.userQuota, units))) {
        return;
      }
      try {
        const result = await options.gateway.getRoutes(request.params.iata);
        if (result.provenance.cached) {
          await refundProviderQuota(request, options.userQuota, units);
        } else {
          options.usage.add(units);
        }
        reply.header(
          "Cache-Control",
          "public, max-age=3600, stale-while-revalidate=86400",
        );
        reply.header("X-AeroQuest-Cache", result.provenance.cached ? "HIT" : "MISS");
        return result;
      } catch (error) {
        await refundProviderQuota(request, options.userQuota, units);
        return sendError(reply, error, request.log);
      }
    },
  );

  app.get(
    "/api/gateway/airports/:iata/terminal-graph",
    {
      schema: {
        tags: ["gateway"],
        summary: "Ingested indoor navigation graph for one terminal",
        params: airportParams,
        querystring: terminalGraphQuery,
        response: {
          200: gatewayTerminalGraphResponseSchema,
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
      try {
        const result = await options.gateway.getTerminalGraph(
          request.params.iata,
          request.query.terminal,
        );
        // Ingested graphs change rarely; the curated catalog remains the
        // client-side fallback rather than a server fabrication.
        reply.header(
          "Cache-Control",
          "public, max-age=3600, stale-while-revalidate=86400",
        );
        return result;
      } catch (error) {
        return sendError(reply, error, request.log);
      }
    },
  );

  app.get(
    "/api/gateway/airports/:iata/board",
    {
      schema: {
        tags: ["gateway"],
        summary: "FIDS departures/arrivals merged with Open-Meteo weather",
        params: airportParams,
        response: {
          200: gatewayBoardResponseSchema,
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
      const units = options.config.AERODATABOX_UNITS_PER_FLIGHT;
      if (!(await reserveProviderQuota(request, reply, options.userQuota, units))) {
        return;
      }
      try {
        const result = await options.gateway.getBoard(request.params.iata);
        if (result.provenance.cached) {
          await refundProviderQuota(request, options.userQuota, units);
        } else {
          options.usage.add(units);
        }
        reply.header(
          "Cache-Control",
          "public, max-age=60, stale-while-revalidate=300",
        );
        reply.header("X-AeroQuest-Cache", result.provenance.cached ? "HIT" : "MISS");
        return result;
      } catch (error) {
        await refundProviderQuota(request, options.userQuota, units);
        return sendError(reply, error, request.log);
      }
    },
  );

  app.get(
    "/api/gateway/aircraft/:regOrIcao",
    {
      schema: {
        tags: ["gateway"],
        summary: "Aircraft metadata + cached parametric cabin layout",
        params: aircraftParams,
        response: {
          200: gatewayAircraftResponseSchema,
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
      const units = options.config.AERODATABOX_UNITS_PER_FLIGHT;
      if (!(await reserveProviderQuota(request, reply, options.userQuota, units))) {
        return;
      }
      try {
        const result = await options.gateway.getAircraft(
          request.params.regOrIcao,
        );
        if (result.provenance.cached) {
          await refundProviderQuota(request, options.userQuota, units);
        } else {
          options.usage.add(units);
        }
        reply.header(
          "Cache-Control",
          "public, max-age=86400, stale-while-revalidate=2592000",
        );
        reply.header("X-AeroQuest-Cache", result.provenance.cached ? "HIT" : "MISS");
        return result;
      } catch (error) {
        await refundProviderQuota(request, options.userQuota, units);
        return sendError(reply, error, request.log);
      }
    },
  );
};
