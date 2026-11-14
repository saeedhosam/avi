import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../src/app/api/gateway/[...path]/route";

const originalBase = process.env.AVI_API_BASE_URL;

function context(path: string[]) {
  return { params: Promise.resolve({ path }) };
}

describe("gateway proxy GET", () => {
  beforeEach(() => {
    process.env.AVI_API_BASE_URL = "https://gateway.example";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalBase === undefined) delete process.env.AVI_API_BASE_URL;
    else process.env.AVI_API_BASE_URL = originalBase;
  });

  it("forwards the path, query, and bearer token to the gateway", async () => {
    const payload = { mode: "LIVE", routes: [] };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "public, max-age=3600",
          "x-aeroquest-cache": "HIT",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request(
        "https://web.example/api/gateway/airports/CAI/routes?days=7",
        { headers: { authorization: "Bearer test-token" } },
      ),
      context(["airports", "CAI", "routes"]),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(payload);
    expect(response.headers.get("x-aeroquest-cache")).toBe("HIT");
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://gateway.example/api/gateway/airports/CAI/routes?days=7",
    );
    expect(init).toMatchObject({
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: "Bearer test-token",
      },
    });
  });

  it("returns an explicit 502 when the gateway is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")),
    );

    const response = await GET(
      new Request("https://web.example/api/gateway/airports/CAI/routes"),
      context(["airports", "CAI", "routes"]),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      error: "gateway_unreachable",
      message: "The AeroQuest caching gateway is temporarily unreachable.",
    });
  });

  it("returns 503 without calling fetch when the gateway is not configured", async () => {
    delete process.env.AVI_API_BASE_URL;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request("https://web.example/api/gateway/airports/CAI/routes"),
      context(["airports", "CAI", "routes"]),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: "gateway_not_configured",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
