import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../src/app/api/billing/trip-pass/route";

const originalBase = process.env.AVI_API_BASE_URL;

function request(accessToken?: string) {
  return new Request("https://web.example/api/billing/trip-pass", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(accessToken ? { accessToken } : {}),
  });
}

describe("single-trip-pass proxy POST", () => {
  beforeEach(() => {
    process.env.AVI_API_BASE_URL = "https://gateway.example";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalBase === undefined) delete process.env.AVI_API_BASE_URL;
    else process.env.AVI_API_BASE_URL = originalBase;
  });

  it("requires an access token before contacting the gateway", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "unauthorized" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the hosted checkout URL on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          url: "https://checkout.example/trip-pass",
          provider: "polar",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request("test-token"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      url: "https://checkout.example/trip-pass",
      provider: "polar",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://gateway.example/v1/billing/trip-pass");
    expect(init).toMatchObject({
      method: "POST",
      body: "{}",
      headers: {
        Authorization: "Bearer test-token",
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
  });

  it("turns an upstream 503 into a graceful trip_pass_unavailable response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: "billing_unavailable",
            message: "Single-Trip Pass checkout is not active yet.",
          }),
          {
            status: 503,
            headers: { "content-type": "application/json" },
          },
        ),
      ),
    );

    const response = await POST(request("test-token"));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "trip_pass_unavailable",
      message:
        "The Single-Trip Pass checkout is not available right now. Nothing was charged.",
    });
  });

  it("never reports success when the gateway omits a checkout URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ provider: "polar" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const response = await POST(request("test-token"));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: "trip_pass_unavailable",
    });
  });
});
