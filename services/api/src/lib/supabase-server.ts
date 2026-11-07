import type { AppConfig } from "../config.js";

export interface SupabaseWatchRow {
  user_id: string;
  flight_id: string;
  flight_number: string;
  flight_date: string | null;
  status: string | null;
  origin_code?: string | null;
  notes: string | null;
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

export interface WatchRowPatchTarget {
  user_id: string;
  flight_id: string;
}

export interface SupabaseAlertBody {
  user_id: string;
  flight_number: string;
  alert_type: string;
  title: string;
  message: string;
  is_read: boolean;
}

export interface WatchlistWrite {
  snapshot: unknown;
  status: string | null;
  alerts: SupabaseAlertBody[];
}

/**
 * Minimal PostgREST client for the server-owned trigger of the watch engine.
 * Uses the Supabase secret key, which must never reach a client bundle.
 */
export class SupabaseServer {
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

  /** Resolves a Supabase access token to a user id (server-side validation). */
  async authUserId(token: string): Promise<string | null> {
    if (!this.ready) return null;
    const response = await fetch(`${this.base()}/auth/v1/user`, {
      headers: {
        apikey: this.config.SUPABASE_SECRET_KEY ?? "",
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    const user = (await response.json()) as { id?: string };
    return typeof user.id === "string" ? user.id : null;
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

  async listWatchlist(limit: number): Promise<SupabaseWatchRow[]> {
    const url = `${this.base()}/rest/v1/watchlist_items?select=user_id,flight_id,flight_number,flight_date,status,origin_code,snapshot&order=updated_at.asc&limit=${limit}`;
    const response = await fetch(url, { headers: this.headers(), signal: AbortSignal.timeout(15_000) });
    if (!response.ok) {
      throw new Error(`watchlist fetch failed with HTTP ${response.status}`);
    }
    const rows = (await response.json()) as SupabaseWatchRow[];
    return Array.isArray(rows) ? rows : [];
  }

  /** Recent alert dedup keys, scoped per user so one watcher never blocks another. */
  async recentAlertKeys(): Promise<string[]> {
    const url = `${this.base()}/rest/v1/flight_alerts?select=user_id,flight_number,alert_type,message&order=created_at.desc&limit=300`;
    const response = await fetch(url, { headers: this.headers("text/plain"), signal: AbortSignal.timeout(15_000) });
    if (!response.ok) {
      throw new Error(`recent alerts fetch failed with HTTP ${response.status}`);
    }
    const rows = (await response.json()) as Array<SupabaseAlertBody & { user_id: string }>;
    return (Array.isArray(rows) ? rows : []).map(
      (row) => `${row.user_id}|${row.flight_number}|${row.alert_type}|${row.message}`,
    );
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

  /** Inserts a batch of alerts in one PostgREST request. */
  async insertAlerts(alerts: SupabaseAlertBody[]): Promise<void> {
    if (!alerts.length) return;
    const response = await fetch(`${this.base()}/rest/v1/flight_alerts`, {
      method: "POST",
      headers: this.headers(),
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
    const cutoff = new Date(
      Date.now() - retentionDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    const search = new URLSearchParams({
      "updated_at": `lt.${cutoff}`,
      "snapshot": "not.is.null",
    });
    const response = await fetch(
      `${this.base()}/rest/v1/watchlist_items?${search.toString()}`,
      {
        method: "PATCH",
        headers: this.headers(),
        body: JSON.stringify({ snapshot: null }),
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (!response.ok) {
      throw new Error(`stale snapshot prune failed with HTTP ${response.status}`);
    }
    // Prefer: return=minimal gives us no count; the 204 means "purge ran".
    return 1;
  }
}
