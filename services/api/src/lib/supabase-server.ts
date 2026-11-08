import { createHash } from "node:crypto";
import type { AppConfig } from "../config.js";

export interface SupabaseWatchRow {
  user_id: string;
  flight_id: string;
  flight_number: string;
  flight_date: string | null;
  status: string | null;
  origin_code?: string | null;
  notes: string | null;
  next_poll_at?: string | null;
  poll_priority?: number | null;
  snapshot: unknown;
}

export interface UndeliveredAlert {
  id: string;
  user_id: string;
  flight_number: string;
  title: string;
  message: string;
}

export interface WebPushRow {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface SupabaseAuthIdentity {
  id: string;
  isAnonymous: boolean;
}

interface AuthIdentityCacheEntry {
  identity: SupabaseAuthIdentity | null;
  expiresAt: number;
}

export interface WatchRowPatchTarget {
  user_id: string;
  flight_id: string;
}

export interface SupabaseAlertBody {
  user_id: string;
  flight_number: string;
  flight_date?: string | null;
  alert_type: string;
  title: string;
  message: string;
  is_read: boolean;
}

export interface WatchlistWrite {
  snapshot: unknown;
  status: string | null;
  alerts: SupabaseAlertBody[];
  /** Epoch ms of the next engine poll; null = settled, no further polls. */
  nextPollAt: number | null;
  /** Engine priority band matching `next_poll_at`. */
  pollPriority: number | null;
}

/**
 * Minimal PostgREST client for the server-owned trigger of the watch engine.
 * Uses the Supabase secret key, which must never reach a client bundle.
 */
export class SupabaseServer {
  /** Longer-lived lookups avoid an auth round-trip on every provider call. */
  private static readonly AUTH_CACHE_TTL_MS = 60_000;
  private static readonly AUTH_CACHE_MAX = 5_000;
  private readonly authCache = new Map<string, AuthIdentityCacheEntry>();
  private readonly inFlightAuth = new Map<string, Promise<SupabaseAuthIdentity | null>>();

  constructor(private readonly config: AppConfig) {}

  get ready(): boolean {
    return Boolean(this.config.SUPABASE_URL && this.config.SUPABASE_SECRET_KEY);
  }

  private base(): string {
    return (this.config.SUPABASE_URL ?? "").replace(/\/+$/, "");
  }

  private headers(contentType: "application/json" | "text/plain" = "application/json"): Record<string, string> {
    return {
      apikey: this.config.SUPABASE_SECRET_KEY ?? "",
      Authorization: `Bearer ${this.config.SUPABASE_SECRET_KEY ?? ""}`,
      Accept: "application/json",
      "Content-Type": contentType,
      Prefer: "return=minimal",
    };
  }

  /**
   * Cache-backed identity lookup for a Supabase access token. Only the token
   * digest is used as the cache key; the token itself is never written.
   * Concurrent requests for the same token are joined on an in-flight promise
   * to eliminate duplicate network traffic and cache stampedes.
   */
  async authIdentity(token: string): Promise<SupabaseAuthIdentity | null> {
    if (!this.ready || !token) return null;
    const digest = this.authCacheKey(token);
    const now = Date.now();
    const cached = this.authCache.get(digest);
    if (cached && cached.expiresAt > now) {
      return cached.identity;
    }

    const inFlight = this.inFlightAuth.get(digest);
    if (inFlight) return inFlight;

    const promise = (async () => {
      try {
        const identity = await this.fetchUserIdentity(token);
        const writeNow = Date.now();
        if (this.authCache.size > SupabaseServer.AUTH_CACHE_MAX) {
          for (const [k, v] of this.authCache) {
            if (v.expiresAt <= writeNow) this.authCache.delete(k);
          }
          if (this.authCache.size > SupabaseServer.AUTH_CACHE_MAX) {
            let toDrop = this.authCache.size - 4_000;
            for (const k of this.authCache.keys()) {
              this.authCache.delete(k);
              if (--toDrop <= 0) break;
            }
          }
        }
        this.authCache.set(digest, {
          identity,
          expiresAt: writeNow + SupabaseServer.AUTH_CACHE_TTL_MS,
        });
        return identity;
      } finally {
        this.inFlightAuth.delete(digest);
      }
    })();

    this.inFlightAuth.set(digest, promise);
    return promise;
  }

  /** Stable, cryptographic cache key; avoids storing the raw token anywhere. */
  private authCacheKey(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private async fetchUserIdentity(
    token: string,
  ): Promise<SupabaseAuthIdentity | null> {
    const response = await fetch(`${this.base()}/auth/v1/user`, {
      headers: {
        apikey: this.config.SUPABASE_SECRET_KEY ?? "",
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    const user = (await response.json()) as {
      id?: unknown;
      is_anonymous?: unknown;
    };
    if (typeof user.id !== "string") return null;
    return {
      id: user.id,
      isAnonymous: user.is_anonymous === true,
    };
  }

  /** Resolves a Supabase access token to a user id (server-side validation). */
  async authUserId(token: string): Promise<string | null> {
    return (await this.authIdentity(token))?.id ?? null;
  }

  /** Total rows in the user's watchlist (Content-Range count, no payload). */
  async countWatchlistRows(uid: string): Promise<number> {
    if (!this.ready) return 0;
    const search = new URLSearchParams({
      select: "flight_id",
      user_id: `eq.${uid}`,
      limit: "1",
    });
    const response = await fetch(`${this.base()}/rest/v1/watchlist_items?${search.toString()}`, {
      headers: {
        apikey: this.config.SUPABASE_SECRET_KEY ?? "",
        Authorization: `Bearer ${this.config.SUPABASE_SECRET_KEY ?? ""}`,
        Accept: "application/json",
        Prefer: "count=exact",
      },
      signal: AbortSignal.timeout(15_000),
    });
    const range = response.headers.get("content-range");
    const total = Number(range?.split("/")[1] ?? "0");
    return Number.isFinite(total) ? total : 0;
  }

  /** Irreversibly deletes the auth user; FK cascades wipe their data. */
  async deleteUser(uid: string): Promise<void> {
    if (!this.ready) throw new Error("supabase not configured");
    const response = await fetch(`${this.base()}/auth/v1/admin/users/${encodeURIComponent(uid)}`, {
      method: "DELETE",
      headers: this.headers("text/plain"),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`user delete failed with HTTP ${response.status}`);
    }
  }

  // ── Billing helpers (Track M) ─────────────────────────────────────────────

  /** Public REST base for shipping raw Supabase writes out of band. */
  baseUrl(): string {
    return this.base();
  }

  /** Service-role headers for callers outside this class. */
  serviceHeaders(contentType: "application/json" | "text/plain" = "application/json"): Record<string, string> {
    return this.headers(contentType);
  }

  /** Resolves a profile id by email (webhook fallback when LS drops custom data). */
  async findProfileIdByEmail(email: string | undefined): Promise<string | null> {
    if (!this.ready || !email) return null;
    const search = new URLSearchParams({
      select: "id",
      email: `eq.${email.trim().toLowerCase()}`,
      order: "created_at.asc",
      // Ask for two so an ambiguous email (more than one profile) is rejected
      // instead of silently granting a plan to an arbitrary account.
      limit: "2",
    });
    const response = await fetch(`${this.base()}/rest/v1/profiles?${search.toString()}`, {
      headers: this.headers("text/plain"),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    const rows = (await response.json()) as Array<{ id: string }>;
    if (!Array.isArray(rows) || rows.length !== 1) return null;
    return rows[0]?.id ?? null;
  }

  /** True when this provider event has already been applied. */
  async hasWebhookEvent(provider: string, eventId: string): Promise<boolean> {
    if (!this.ready || !eventId) return false;
    const search = new URLSearchParams({
      select: "event_id",
      provider: `eq.${provider}`,
      event_id: `eq.${eventId}`,
      limit: "1",
    });
    const response = await fetch(`${this.base()}/rest/v1/billing_events?${search.toString()}`, {
      headers: this.headers("text/plain"),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return false;
    const rows = (await response.json()) as unknown[];
    return Array.isArray(rows) && rows.length > 0;
  }

  /** Records a processed provider event. A concurrent duplicate is harmless. */
  async recordWebhookEvent(provider: string, eventId: string): Promise<void> {
    if (!this.ready || !eventId) return;
    const response = await fetch(`${this.base()}/rest/v1/billing_events`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ provider, event_id: eventId }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok && response.status !== 409) {
      throw new Error(`billing event insert failed with HTTP ${response.status}`);
    }
  }

  /**
   * Rows the engine is due to poll right now. `next_poll_at is null` is an
   * adoption case (row written before the engine state migration). We fetch
   * both shapes with two plain requests instead of a PostgREST `or=(...)`
   * filter, and pre-encode the timestamp values: PostgREST rejects unescaped
   * `:` in filter values (`unexpected "l" expecting operator`).
   */
  async listWatchlist(limit: number): Promise<SupabaseWatchRow[]> {
    const nowIso = encodeURIComponent(new Date().toISOString());
    const rows: SupabaseWatchRow[] = [];
    const seen = new Set<string>();
    for (const filter of [
      `next_poll_at=lte.${nowIso}`,
      "next_poll_at=is.null",
    ] as const) {
      const query = [
        filter,
        "select=user_id,flight_id,flight_number,flight_date,status,origin_code,snapshot,next_poll_at,poll_priority",
        "order=next_poll_at.asc.nullsfirst",
        `limit=${limit}`,
      ].join("&");
      const url = `${this.base()}/rest/v1/watchlist_items?${query}`;
      const response = await fetch(url, {
        headers: this.headers(),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        throw new Error(`watchlist fetch failed with HTTP ${response.status}`);
      }
      const payload = (await response.json()) as SupabaseWatchRow[];
      for (const row of Array.isArray(payload) ? payload : []) {
        const key = `${row.user_id}|${row.flight_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(row);
      }
      if (rows.length >= limit) return rows.slice(0, limit);
    }
    return rows;
  }

  /**
   * Advances the engine poll ladder for a row the last pass saw (signal only:
   * no snapshot write). Keeps the row fair across ticks even when the provider
   * had nothing for it.
   */
  async patchPollSchedule(
    row: WatchRowPatchTarget,
    nextPollAtMs: number | null,
    priority: number | null,
  ): Promise<void> {
    const search = new URLSearchParams({
      user_id: `eq.${row.user_id}`,
      flight_id: `eq.${row.flight_id}`,
    });
    const body: Record<string, unknown> = {
      next_poll_at: nextPollAtMs == null ? null : new Date(nextPollAtMs).toISOString(),
      poll_priority: priority,
    };
    const response = await fetch(`${this.base()}/rest/v1/watchlist_items?${search.toString()}`, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`watchlist poll schedule patch failed with HTTP ${response.status}`);
    }
  }

  /** Plan tiers of the given users (service-key read, bypasses RLS). */
  async listUserPlans(userIds: string[]): Promise<Map<string, string>> {
    if (!userIds.length) return new Map();
    const plans = new Map<string, string>();
    // Keep request URLs short; PostgREST/Cloudflare reject very long in.(...)
    // lists, and the engine can see thousands of users in one tick.
    for (let index = 0; index < userIds.length; index += 200) {
      const chunk = userIds.slice(index, index + 200);
      const list = chunk.map((id) => `"${id}"`).join(",");
      const url = `${this.base()}/rest/v1/profiles?select=id,plan&id=in.(${list})&limit=${chunk.length}`;
      const response = await fetch(url, { headers: this.headers("text/plain"), signal: AbortSignal.timeout(15_000) });
      if (!response.ok) {
        throw new Error(`plan fetch failed with HTTP ${response.status}`);
      }
      const rows = (await response.json()) as Array<{ id: string; plan: string | null }>;
      for (const row of rows) {
        plans.set(row.id, row.plan ?? "FREE");
      }
    }
    return plans;
  }

  // ── Push delivery (P1 Track C) ─────────────────────────────────────────

  /** Alerts the engine wrote that no push delivery has claimed yet. */
  async listUndeliveredAlerts(limit: number): Promise<UndeliveredAlert[]> {
    const url = `${this.base()}/rest/v1/flight_alerts?select=id,user_id,flight_number,title,message&delivered_at=is.null&order=created_at.asc&limit=${limit}`;
    const response = await fetch(url, { headers: this.headers("text/plain"), signal: AbortSignal.timeout(15_000) });
    if (!response.ok) {
      throw new Error(`undelivered alerts fetch failed with HTTP ${response.status}`);
    }
    const rows = (await response.json()) as UndeliveredAlert[];
    return Array.isArray(rows) ? rows : [];
  }

  /** Active web-push endpoints for the given users, keyed by user id. */
  async listSubscriptions(userIds: string[]): Promise<Map<string, WebPushRow[]>> {
    if (!userIds.length) return new Map();
    const list = userIds.map((id) => `"${id}"`).join(",");
    const url = `${this.base()}/rest/v1/push_subscriptions?select=user_id,endpoint,p256dh,auth&platform=eq.web&user_id=in.(${list})&limit=2000`;
    const response = await fetch(url, { headers: this.headers("text/plain"), signal: AbortSignal.timeout(15_000) });
    if (!response.ok) {
      throw new Error(`push subscription fetch failed with HTTP ${response.status}`);
    }
    const rows = (await response.json()) as WebPushRow[];
    const byUser = new Map<string, WebPushRow[]>();
    for (const row of Array.isArray(rows) ? rows : []) {
      const entries = byUser.get(row.user_id) ?? [];
      entries.push(row);
      byUser.set(row.user_id, entries);
    }
    return byUser;
  }

  /** Removes an endpoint the push service reported as gone (404/410). */
  async deleteSubscription(endpoint: string): Promise<void> {
    const search = new URLSearchParams({ endpoint: `eq.${endpoint}` });
    const response = await fetch(`${this.base()}/rest/v1/push_subscriptions?${search.toString()}`, {
      method: "DELETE",
      headers: this.headers(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`push subscription delete failed with HTTP ${response.status}`);
    }
  }

  /** Marks a batch of alerts as delivered so they are never re-sent. */
  async markAlertsDelivered(ids: string[]): Promise<void> {
    if (!ids.length) return;
    const search = new URLSearchParams({ id: `in.(${ids.map((id) => `"${id}"`).join(",")})` });
    const response = await fetch(`${this.base()}/rest/v1/flight_alerts?${search.toString()}`, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify({ delivered_at: new Date().toISOString() }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`alert delivery mark failed with HTTP ${response.status}`);
    }
  }

  async write(row: WatchRowPatchTarget, payload: WatchlistWrite): Promise<{ alertFailures: number }> {
    const search = new URLSearchParams({
      user_id: `eq.${row.user_id}`,
      flight_id: `eq.${row.flight_id}`,
    });
    const response = await fetch(`${this.base()}/rest/v1/watchlist_items?${search.toString()}`, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify({
        snapshot: payload.snapshot,
        status: payload.status ?? "",
        next_poll_at: payload.nextPollAt == null ? null : new Date(payload.nextPollAt).toISOString(),
        poll_priority: payload.pollPriority,
        updated_at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`watchlist patch failed with HTTP ${response.status}`);
    }
    // The snapshot is the primary write; alert delivery failures must never
    // abort it (the client still diffs snapshots and the push loop reads the
    // delivered_at watermark only for successfully inserted alerts).
    let alertFailures = 0;
    if (payload.alerts.length) {
      try {
        await this.insertAlerts(payload.alerts);
      } catch (error) {
        alertFailures = payload.alerts.length;
        console.warn?.(`avi watch engine: alert insert failed (${String(error)})`);
      }
    }
    return { alertFailures };
  }

  /** Inserts a batch of alerts in one PostgREST request, deduping per index. */
  async insertAlerts(alerts: SupabaseAlertBody[]): Promise<void> {
    if (!alerts.length) return;
    const response = await fetch(`${this.base()}/rest/v1/flight_alerts`, {
      method: "POST",
      headers: { ...this.headers(), Prefer: "return=minimal,resolution=ignore-duplicates" },
      body: JSON.stringify(alerts),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`alert insert failed with HTTP ${response.status}`);
    }
  }

  /**
   * Clears stale flight snapshots from watchlist rows (AeroDataBox Starter
   * plan Caching Terms cap retention at 7 days). Row identity is kept — the
   * customer's watchlist entry survives — but cached flight contents are
   * dropped; they are re-fetched live by the engine (for active flights) or
   * live lookup on the web when the user re-activates the entry.
   */
  async pruneStaleFlightSnapshots(retentionDays: number): Promise<number> {
    if (!this.ready) return 0;
    const cutoff = encodeURIComponent(
      new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString(),
    );
    const url = `${this.base()}/rest/v1/watchlist_items?updated_at=lte.${cutoff}&snapshot=not.is.null`;
    const response = await fetch(url, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify({ snapshot: null }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      throw new Error(`stale snapshot prune failed with HTTP ${response.status}`);
    }

    // Also run alert retention cleanup to keep flight_alerts table bounded
    try {
      await fetch(`${this.base()}/rest/v1/rpc/prune_stale_alerts`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ days_retention: 30 }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      // Non-critical background retention cleanup
    }
    return 1;
  }
}
