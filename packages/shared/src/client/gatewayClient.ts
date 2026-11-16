import {
  gatewayAircraftResponseSchema,
  gatewayBoardResponseSchema,
  gatewayFlightsResponseSchema,
  gatewayRoutesResponseSchema,
  gatewayTerminalGraphResponseSchema,
  type GatewayAircraftResponse,
  type GatewayBoardResponse,
  type GatewayFlightsResponse,
  type GatewayRoutesResponse,
  type GatewayTerminalGraphResponse,
} from "../models/gateway.js";

export interface GatewayClientOptions {
  /** Hetzner gateway origin, e.g. `https://api.codestep.org`. */
  baseUrl: string;
  /** Supabase access token for per-user quota/entitlements. */
  accessToken?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class GatewayClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "GatewayClientError";
  }
}

interface RequestOptions {
  signal?: AbortSignal;
}

/**
 * Typed client for the Hetzner caching gateway.
 *
 * Mobile and web clients must use this SDK rather than AeroDataBox directly.
 * Every response is validated; a malformed gateway payload fails loudly instead
 * of entering the UI as trusted flight data.
 */
export class AviGatewayClient {
  private readonly baseUrl: string;
  private readonly accessToken: string | null;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: GatewayClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    if (!this.baseUrl) {
      throw new Error("AviGatewayClient requires a gateway base URL");
    }
    this.accessToken = options.accessToken ?? null;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  private async request<T>(
    path: string,
    schema: { parse(value: unknown): T },
    options: RequestOptions = {},
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(this.accessToken
            ? { Authorization: `Bearer ${this.accessToken}` }
            : {}),
        },
        signal: controller.signal,
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const errorBody =
          body && typeof body === "object"
            ? (body as {
                error?: unknown;
                message?: unknown;
                retryAfterSeconds?: unknown;
              })
            : null;
        const retryAfter =
          typeof errorBody?.retryAfterSeconds === "number"
            ? errorBody.retryAfterSeconds
            : Number(response.headers.get("retry-after")) || undefined;
        throw new GatewayClientError(
          typeof errorBody?.message === "string"
            ? errorBody.message
            : `Gateway request failed (HTTP ${response.status})`,
          response.status,
          typeof errorBody?.error === "string" ? errorBody.error : "unknown_error",
          retryAfter,
        );
      }
      try {
        return schema.parse(body);
      } catch (error) {
        throw new GatewayClientError(
          `Gateway returned an invalid payload: ${error instanceof Error ? error.message : String(error)}`,
          502,
          "invalid_gateway_payload",
        );
      }
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    }
  }

  getFlight(
    flightNumber: string,
    date: string,
    options?: RequestOptions,
  ): Promise<GatewayFlightsResponse> {
    const number = flightNumber.replace(/\s+/g, "").toUpperCase();
    return this.request(
      `/api/gateway/flights/${encodeURIComponent(number)}/${encodeURIComponent(date)}`,
      gatewayFlightsResponseSchema,
      options,
    );
  }

  getAirportRoutes(
    iata: string,
    options?: RequestOptions,
  ): Promise<GatewayRoutesResponse> {
    return this.request(
      `/api/gateway/airports/${encodeURIComponent(iata.toUpperCase())}/routes`,
      gatewayRoutesResponseSchema,
      options,
    );
  }

  getAirportBoard(
    iata: string,
    options?: RequestOptions,
  ): Promise<GatewayBoardResponse> {
    return this.request(
      `/api/gateway/airports/${encodeURIComponent(iata.toUpperCase())}/board`,
      gatewayBoardResponseSchema,
      options,
    );
  }

  getAircraft(
    regOrIcao: string,
    options?: RequestOptions,
  ): Promise<GatewayAircraftResponse> {
    return this.request(
      `/api/gateway/aircraft/${encodeURIComponent(regOrIcao.trim().toUpperCase())}`,
      gatewayAircraftResponseSchema,
      options,
    );
  }

  getTerminalGraph(
    iata: string,
    terminalId: string,
    options?: RequestOptions,
  ): Promise<GatewayTerminalGraphResponse> {
    const query = new URLSearchParams({ terminal: terminalId.trim() });
    return this.request(
      `/api/gateway/airports/${encodeURIComponent(iata.toUpperCase())}/terminal-graph?${query.toString()}`,
      gatewayTerminalGraphResponseSchema,
      options,
    );
  }

  /** Convenience for the boarding-pass flow: scan BCBP, then fetch status. */
  getBoardingPassFlight(
    pass: { airlineCode: string; flightNumber: string; flightDate: string | null },
    options?: RequestOptions,
  ): Promise<GatewayFlightsResponse> {
    const flightNumber = `${pass.airlineCode}${pass.flightNumber}`.replace(/\s+/g, "");
    return this.getFlight(
      flightNumber,
      pass.flightDate ?? new Date().toISOString().slice(0, 10),
      options,
    );
  }
}

export function createGatewayClient(
  options: GatewayClientOptions,
): AviGatewayClient {
  return new AviGatewayClient(options);
}
