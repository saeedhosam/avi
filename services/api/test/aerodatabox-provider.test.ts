import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { AeroDataBoxProvider } from "../src/providers/aerodatabox.js";

const DIRECT_KEY = "direct-aerodatabox-key-1234567890";

function createProvider(
  overrides: Partial<Record<string, string>> = {},
): AeroDataBoxProvider {
  return new AeroDataBoxProvider(
    loadConfig({
      NODE_ENV: "test",
      AERODATABOX_API_KEY: DIRECT_KEY,
      AERODATABOX_API_HOST: "api.aerodatabox.com",
      ...overrides,
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AeroDataBoxProvider gateway", () => {
  it("uses the direct gateway and X-Api-Key header by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createProvider().searchFlight("BA117");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://api.aerodatabox.com/flights/number/BA117?withAircraftImage=false&withLocation=true",
    );
    expect(init.headers).toMatchObject({ "X-Api-Key": DIRECT_KEY });
    expect(init.headers).not.toHaveProperty("X-RapidAPI-Key");
    expect(init.headers).not.toHaveProperty("X-RapidAPI-Host");
    expect(result.meta).toMatchObject({
      source: "live",
      cached: false,
      attribution: "AeroDataBox",
    });
  });

  it("keeps RapidAPI headers available as an explicit rollback override", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createProvider({
      AERODATABOX_API_HOST: "aerodatabox.p.rapidapi.com",
    }).searchFlight("BA117");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://aerodatabox.p.rapidapi.com/flights/number/BA117?withAircraftImage=false&withLocation=true",
    );
    expect(init.headers).toMatchObject({
      "X-RapidAPI-Key": DIRECT_KEY,
      "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com",
    });
    expect(init.headers).not.toHaveProperty("X-Api-Key");
  });

  it("treats an empty 204 response as a live empty result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );

    const result = await createProvider().searchFlight("BA117");

    expect(result.flights).toEqual([]);
    expect(result.meta.source).toBe("live");
  });

  it("maps invalid credentials to a provider error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "Invalid or inactive API key" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(createProvider().searchFlight("BA117")).rejects.toMatchObject({
      name: "ProviderError",
      statusCode: 502,
    });
  });

  it("keeps the quota fallback behavior for HTTP 429", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 429 })),
    );

    const result = await createProvider().searchFlight("BA117");

    expect(result.flights).toEqual([]);
    expect(result.meta.source).toBe("quota_fallback");
  });
});
