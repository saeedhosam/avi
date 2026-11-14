import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

const fetchedAt = "2026-11-14T10:00:00.000Z";

function graphFor(airportCode: string, terminalId: string) {
  return {
    airportCode,
    terminalId,
    nodes: [
      {
        id: "n1",
        level: 1,
        kind: "entrance",
        point: { x: 0.1, y: 0.1 },
      },
      {
        id: "n2",
        level: 1,
        kind: "gate",
        point: { x: 0.8, y: 0.75 },
        label: "Gate B14",
      },
    ],
    edges: [
      {
        id: "e1",
        from: "n1",
        to: "n2",
        kind: "corridor",
        distanceMeters: 140,
        speedMps: 1.25,
        bidirectional: true,
        accessible: true,
      },
    ],
    source: "osm_indoor",
    updatedAt: fetchedAt,
  };
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(
    loadConfig({
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SECRET_KEY: "sb_secret_test",
    }),
  );
});

afterAll(async () => {
  await app.close();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("terminal graph gateway route", () => {
  it("returns the stored graph for exactly the requested airport/terminal", async () => {
    const rows = [
      {
        graph: graphFor("CAI", "T3"),
        source: "osm_indoor",
        fetched_at: fetchedAt,
        updated_at: fetchedAt,
      },
      {
        graph: graphFor("DXB", "T3"),
        source: "osm_indoor",
        fetched_at: fetchedAt,
        updated_at: fetchedAt,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = new URL(String(input));
        const airport = url.searchParams
          .get("airport_code")
          ?.replace(/^eq\./, "");
        const terminal = url.searchParams
          .get("terminal_id")
          ?.replace(/^eq\./, "");
        return json(
          rows.filter(
            (row) =>
              airport === row.graph.airportCode &&
              terminal === row.graph.terminalId,
          ),
        );
      }),
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/gateway/airports/CAI/terminal-graph?terminal=T3",
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      airportCode: "CAI",
      terminalId: "T3",
      source: "osm_indoor",
      fetchedAt,
    });
    expect(body.graph.airportCode).toBe("CAI");
    expect(body.graph.terminalId).toBe("T3");
    expect(body.graph.nodes).toHaveLength(2);
    expect(body.graph.edges[0]).toMatchObject({
      kind: "corridor",
      accessible: true,
    });
    expect(response.headers["cache-control"]).toContain("max-age=3600");
  });

  it("404s instead of falling back to another airport or terminal", async () => {
    const rows = [
      {
        graph: graphFor("DXB", "T3"),
        source: "osm_indoor",
        fetched_at: fetchedAt,
        updated_at: fetchedAt,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = new URL(String(input));
        const airport = url.searchParams
          .get("airport_code")
          ?.replace(/^eq\./, "");
        const terminal = url.searchParams
          .get("terminal_id")
          ?.replace(/^eq\./, "");
        return json(
          rows.filter(
            (row) =>
              airport === row.graph.airportCode &&
              terminal === row.graph.terminalId,
          ),
        );
      }),
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/gateway/airports/CAI/terminal-graph?terminal=T3",
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("terminal_graph_not_found");
  });

  it("requires an explicit terminal and rejects a mismatched stored graph", async () => {
    const missing = await app.inject({
      method: "GET",
      url: "/api/gateway/airports/CAI/terminal-graph",
    });
    expect(missing.statusCode).toBe(400);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json([
          {
            // The row claims CAI/T3 but the graph inside belongs to DXB/T1.
            graph: graphFor("DXB", "T1"),
            source: "osm_indoor",
            fetched_at: fetchedAt,
            updated_at: fetchedAt,
          },
        ]),
      ),
    );
    const mismatched = await app.inject({
      method: "GET",
      url: "/api/gateway/airports/CAI/terminal-graph?terminal=T3",
    });
    expect(mismatched.statusCode).toBe(502);
    expect(mismatched.json().error).toBe("terminal_graph_invalid");
  });

  it("returns 502 when the graph store fails, not a fabricated 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("db error", { status: 500 })),
    );
    const response = await app.inject({
      method: "GET",
      url: "/api/gateway/airports/CAI/terminal-graph?terminal=T3",
    });
    expect(response.statusCode).toBe(502);
    expect(response.json().error).toBe("terminal_graph_unavailable");
  });

  it("returns 503 when Supabase is not configured", async () => {
    const unconfigured = await buildApp(
      loadConfig({
        NODE_ENV: "test",
        LOG_LEVEL: "silent",
        AERODATABOX_API_KEY: "",
      }),
    );
    try {
      const response = await unconfigured.inject({
        method: "GET",
        url: "/api/gateway/airports/CAI/terminal-graph?terminal=T3",
      });
      expect(response.statusCode).toBe(503);
      expect(response.json().error).toBe("terminal_graph_unavailable");
    } finally {
      await unconfigured.close();
    }
  });
});
