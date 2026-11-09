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

describe("SupabaseServer watchlist due rows", () => {
  type WatchRowStub = {
    user_id: string;
    flight_id: string;
    flight_number: string;
    flight_date: string | null;
    status: string | null;
    notes: string;
    next_poll_at: string | null;
    poll_priority: number | null;
    snapshot: unknown;
  };

  /** Minimal PostgREST filter emulation for the two listWatchlist shapes. */
  function fetchStub(rows: WatchRowStub[]) {
    return vi.fn().mockImplementation(async (input: unknown) => {
      const url = new URL(String(input));
      const nextPollAt = url.searchParams.get("next_poll_at");
      const pollPriority = url.searchParams.get("poll_priority");
      const matched = rows.filter((row) => {
        if (nextPollAt === "is.null") {
          if (row.next_poll_at != null) return false;
          // Adoption must also require a row the engine never touched.
          return pollPriority !== "is.null" || row.poll_priority == null;
        }
        if (nextPollAt?.startsWith("lte.")) {
          return (
            row.next_poll_at != null &&
            Date.parse(row.next_poll_at) <= Date.parse(nextPollAt.slice("lte.".length))
          );
        }
        return false;
      });
      return new Response(JSON.stringify(matched), { status: 200 });
    });
  }

  function watchRow(overrides: Partial<WatchRowStub>): WatchRowStub {
    return {
      user_id: "u1",
      flight_id: "BA117-2026-11-08",
      flight_number: "BA 117",
      flight_date: "2026-11-08",
      status: "SCHEDULED",
      notes: "",
      next_poll_at: null,
      poll_priority: null,
      snapshot: {},
      ...overrides,
    };
  }

  it("does not treat a settled row (null next_poll_at, non-null priority) as due", async () => {
    const settled = watchRow({
      status: "LANDED",
      next_poll_at: null,
      poll_priority: 3,
    });
    const fetchMock = fetchStub([settled]);
    vi.stubGlobal("fetch", fetchMock);

    const rows = await server().listWatchlist(1000);

    expect(rows).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const adoptionUrl = String(fetchMock.mock.calls[1]?.[0]);
    expect(adoptionUrl).toContain("next_poll_at=is.null");
    expect(adoptionUrl).toContain("poll_priority=is.null");
  });

  it("still adopts legacy rows the engine never touched", async () => {
    const legacy = watchRow({ flight_id: "AA100-2026-11-08", flight_number: "AA 100" });
    const settled = watchRow({ status: "CANCELLED", poll_priority: 3 });
    const fetchMock = fetchStub([legacy, settled]);
    vi.stubGlobal("fetch", fetchMock);

    const rows = await server().listWatchlist(1000);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.flight_id).toBe("AA100-2026-11-08");
  });

  it("still returns rows whose next poll is due", async () => {
    const due = watchRow({
      flight_id: "UA200-2026-11-08",
      flight_number: "UA 200",
      next_poll_at: "2020-01-01T00:00:00.000Z",
      poll_priority: 5,
    });
    const fetchMock = fetchStub([due]);
    vi.stubGlobal("fetch", fetchMock);

    const rows = await server().listWatchlist(1000);

    expect(rows.map((row) => row.flight_id)).toEqual(["UA200-2026-11-08"]);
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
