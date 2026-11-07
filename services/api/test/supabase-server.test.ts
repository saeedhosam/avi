import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { SupabaseServer } from "../src/lib/supabase-server.js";

function server(): SupabaseServer {
  return new SupabaseServer(
    loadConfig({
      NODE_ENV: "test",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SECRET_KEY: "sb_secret_test",
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SupabaseServer push subscriptions", () => {
  it("filters by user_id, not the subscription id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            user_id: "u1",
            endpoint: "https://push.example/1",
            p256dh: "p",
            auth: "a",
          },
        ]),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await server().listSubscriptions(["u1", "u2"]);

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("push_subscriptions");
    expect(url).toContain("user_id=in.");
    expect(url).not.toContain("&id=in.");
    expect(result.get("u1")).toHaveLength(1);
  });
});

describe("SupabaseServer billing identity lookup", () => {
  it("rejects an ambiguous email match instead of granting to an arbitrary profile", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ id: "u1" }, { id: "u2" }]), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(server().findProfileIdByEmail("someone@example.com")).resolves.toBeNull();
  });

  it("returns the single matching profile", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ id: "u1" }]), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(server().findProfileIdByEmail("someone@example.com")).resolves.toBe("u1");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("limit=2");
  });
});
