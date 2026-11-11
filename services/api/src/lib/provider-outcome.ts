import type { FastifyReply } from "fastify";
import type { FlightDataMode } from "../providers/console-flights.js";

export interface ProviderErrorBody {
  statusCode: number;
  error: string;
  message: string;
}

/**
 * Maps a provider outcome to the HTTP error the client must see.
 *
 * Every non-live mode becomes an explicit error. In particular a provider
 * 400/404/204 must never be serialized as a successful empty list: that is
 * indistinguishable from a verified "nothing exists" answer.
 */
export function providerOutcomeError(
  mode: FlightDataMode,
  subject: string,
): ProviderErrorBody | null {
  switch (mode) {
    case "LIVE_AERODATABOX":
      return null;
    case "NOT_FOUND":
      return {
        statusCode: 404,
        error: `${subject}_not_found`,
        message: `The provider has no ${subject.replace(/_/g, " ")} for that query.`,
      };
    case "INVALID_REQUEST":
      return {
        statusCode: 400,
        error: "invalid_provider_request",
        message: "The provider rejected that query.",
      };
    case "NOT_CONFIGURED":
      return {
        statusCode: 503,
        error: "provider_not_configured",
        message: "This data source is not configured.",
      };
    case "QUOTA_FALLBACK":
      return {
        statusCode: 429,
        error: "provider_quota_exhausted",
        message: "The provider quota is exhausted; the request was paused.",
      };
    case "ERROR":
      return {
        statusCode: 502,
        error: "provider_unreachable",
        message: "The provider is temporarily unavailable.",
      };
    default:
      return null;
  }
}

/** Sends a mapped provider error, returning true when a reply was sent. */
export function sendProviderOutcomeError(
  reply: FastifyReply,
  mode: FlightDataMode,
  subject: string,
): boolean {
  const body = providerOutcomeError(mode, subject);
  if (!body) return false;
  reply.code(body.statusCode).send({ error: body.error, message: body.message });
  return true;
}
