import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { FlightSummary } from "../domain/flight.js";
import { UsageTracker, UserMeter } from "../lib/usage.js";
import type { SupabaseWatchRow } from "../lib/supabase-server.js";
import { SupabaseServer } from "../lib/supabase-server.js";
import type { AeroDataBoxProvider } from "../providers/aerodatabox.js";
import { concurrencyLimitFor } from "./plans.js";
import {
  alertKey,
  diffAlerts,
  evaluateDue,
  isWatchSnapshot,
  matchesJob,
  mergeSnapshot,
  type WatchJob,
} from "./snapshot.js";
import { PushDelivery, type PushDeliveryStats } from "./push-delivery.js";

export interface EngineStats {
  enabled: boolean;
  lastTickAt: string | null;
  lastSwept: number;
  backlog: number;
  error: string | null;
  units: {
    unitsUsed: number;
    unitsBudget: number;
    overBudget: boolean;
  };
  supabaseReady: boolean;
  metered: number;
  push: {
    enabled: boolean;
    lastDelivered: number;
    lastError: string | null;
  } | null;
}

/**
 * Server-side watch engine.
 *
 * Spends provider units on the operational windows of watched flights instead
 * of on client tabs. Multiple users watching the same flight share one lookup
 * because every user's snapshot is refreshed from a single provider response.
 * Change alerts are written server-side so Realtime delivers them with no
 * browser open.
 */
export class WatchEngine {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastTickAt: number | null = null;
  // Daily purge of stale flight payloads (AeroDataBox 7-day cache term).
  private lastPruneAt: number | null = null;
  private lastSwept = 0;
  private backlog = 0;
  private lastError: string | null = null;
  private readonly lastRefresh = new Map<string, number>();
  private readonly seenAlerts = new Set<string>();
  private readonly meter = new UserMeter();
  private lastPushStats: PushDeliveryStats | null = null;
  // Warn once per threshold per month (budget alerting).
  private monthlyKeySeen = "";
  private warnedThreshold = { t80: false, t95: false };

  constructor(
    private readonly config: AppConfig,
    private readonly provider: {
      searchFlight: (
        number: string,
      ) => ReturnType<AeroDataBoxProvider["searchFlight"]>;
      lookupFids?: (
        code: string,
      ) => Promise<{
        meta: { source: "live" | "cached" | "quota_fallback" | "not_configured" | "error" };
        summaries: FlightSummary[];
      }>;
      configured: boolean;
    },
    private readonly supabase: SupabaseServer,
    private readonly usage: UsageTracker,
    private readonly log: FastifyBaseLogger,
    private readonly pushDelivery?: PushDelivery,
  ) {}

  /** Schedules the first tick after the app is ready and stops on close. */
  register(app: FastifyInstance): void {
    app.addHook("onReady", async () => {
      if (!this.provider.configured) {
        this.log.warn("watch engine disabled: AeroDataBox key missing");
        return;
      }
      try {
        const seeded = await this.supabase.recentAlertKeys();
        for (const key of seeded) this.seenAlerts.add(key);
        this.log.debug({ count: seeded.length }, "watch engine seeded recent alerts");
      } catch (error) {
        this.log.warn({ err: error }, "watch engine could not seed recent alerts");
      }
      this.scheduleNext(this.config.WATCH_ENGINE_STARTUP_DELAY_MS);
      this.log.info(
        {
          tickMs: this.config.WATCH_ENGINE_TICK_MS,
          sweepsPerTick: this.config.WATCH_ENGINE_SWEEPS_PER_TICK,
          budget: this.config.UNIT_BUDGET_PER_MONTH,
        },
        "watch engine scheduled",
      );
    });
    app.addHook("onClose", async () => {
      await this.stop();
    });
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext(delayMs: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.tick(), delayMs);
  }

  /** Logs budget crossings once per month so exhaustion is never a surprise. */
  private checkBudgetThresholds(): void {
    const snapshot = this.usage.snapshot();
    if (snapshot.monthKey !== this.monthlyKeySeen) {
      this.monthlyKeySeen = snapshot.monthKey;
      this.warnedThreshold = { t80: false, t95: false };
    }
    if (snapshot.unitsBudget <= 0) return;
    const ratio = snapshot.unitsUsed / snapshot.unitsBudget;
    if (!this.warnedThreshold.t80 && ratio >= 0.8) {
      this.warnedThreshold.t80 = true;
      this.log.warn(
        { unitsUsed: snapshot.unitsUsed, unitsBudget: snapshot.unitsBudget },
        "unit budget at 80% — consider the provider plan upgrade decision rule",
      );
    }
    if (!this.warnedThreshold.t95 && ratio >= 0.95) {
      this.warnedThreshold.t95 = true;
      this.log.warn(
        { unitsUsed: snapshot.unitsUsed, unitsBudget: snapshot.unitsBudget },
        "unit budget at 95% — live tracking will pause at the cap",
      );
    }
  }

  stats(): EngineStats {
    const units = this.usage.snapshot();
    return {
      enabled: true,
      lastTickAt: this.lastTickAt ? new Date(this.lastTickAt).toISOString() : null,
      lastSwept: this.lastSwept,
      backlog: this.backlog,
      error: this.lastError,
      units: {
        unitsUsed: units.unitsUsed,
        unitsBudget: units.unitsBudget,
        overBudget: units.overBudget,
      },
      supabaseReady: this.supabase.ready,
      metered: this.meter.users(),
      push: this.pushDelivery
        ? {
            enabled: this.lastPushStats?.enabled ?? false,
            lastDelivered: this.lastPushStats?.delivered ?? 0,
            lastError: this.lastPushStats?.error ?? null,
          }
        : null,
    };
  }

  async tick(): Promise<EngineStats> {
    if (this.running) return this.stats();
    this.running = true;
    try {
      await this.runTick();
      this.lastError = null;
      this.checkBudgetThresholds();
      if (this.lastPruneAt == null || Date.now() - this.lastPruneAt >= 86_400_000) {
        try {
          const purged = await this.supabase.pruneStaleFlightSnapshots(7);
          this.lastPruneAt = Date.now();
          if (purged) {
            this.log.info(
              { purged },
              "watch engine purged stale flight snapshots (7d cache term)",
            );
          }
        } catch (pruneError) {
          this.log.warn({ err: pruneError }, "watch engine snapshot prune failed");
        }
      }
      this.checkBudgetThresholds();
      if (this.pushDelivery) {
        this.lastPushStats = await this.pushDelivery.deliver();
        if (this.lastPushStats.delivered) {
          this.log.info({ delivered: this.lastPushStats.delivered }, "push delivery sent notifications");
        }
      }
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.log.error({ err: error }, "watch engine tick failed");
    } finally {
      this.running = false;
      this.lastTickAt = Date.now();
      this.scheduleNext(this.config.WATCH_ENGINE_TICK_MS);
    }
    return this.stats();
  }

  private async runTick(): Promise<void> {
    const rows = (await this.supabase.listWatchlist(this.config.WATCH_ENGINE_MAX_ROWS_PER_POLL)).filter(
      (row) => Boolean(row.flight_number?.trim()),
    );
    if (!rows.length) {
      this.backlog = 0;
      this.lastSwept = 0;
      return;
    }
    const now = Date.now();
    const jobs = this.collectDue(rows, now);
    this.backlog = jobs.length;

    // Plan enforcement (P1 Track A): a refresh only goes out for users who
    // have a live slot available on their plan. Users at their limit keep
    // their row in the deduped group but are skipped, so watching stays
    // unlimited while tracking depth is what plans buy.
    const plans = jobs.length
      ? await this.supabase.listUserPlans([...new Set(rows.map((row) => row.user_id))])
      : new Map<string, string>();
    const allowedRowsFor = (job: WatchJob) =>
      job.rows.filter((row) =>
        this.meter.hasCapacity(
          row.user_id,
          job.key,
          concurrencyLimitFor(plans.get(row.user_id)),
          this.config.WATCH_ENGINE_ACTIVE_WINDOW_MS,
          now,
        ),
      );
    const allowedFor = (job: WatchJob) => {
      const allowed = allowedRowsFor(job);
      if (!allowed.length) {
        this.log.debug(
          { flight: job.flightNumber, users: job.rows.length },
          "watch engine skipped: all watchers at plan limit",
        );
      }
      return allowed;
    };

    const pending = new Map(jobs.map((job) => [job.key, job]));
    let providerCalls = 0;
    let refreshed = 0;
    const overCallBudget = () => {
      if (this.usage.overBudget) {
        this.log.warn(
          { unitsUsed: this.usage.unitsUsed, budget: this.usage.snapshot().unitsBudget },
          "watch engine paused: unit budget reached",
        );
        return true;
      }
      return providerCalls >= this.config.WATCH_ENGINE_SWEEPS_PER_TICK;
    };

    // FIDS-by-airport pre-pass (G6): one board call refreshes every watched
    // flight departing that airport, replacing N × 2-unit per-flight calls.
    if (this.config.WATCH_ENGINE_FIDS_ENABLED && this.provider.lookupFids) {
      const groups = new Map<string, WatchJob[]>();
      for (const job of pending.values()) {
        const origin = job.rows
          .map((row) => (isWatchSnapshot(row.snapshot) ? row.snapshot.origin?.code : undefined))
          .find((code) => typeof code === "string" && code.length === 3)
          ?.toUpperCase();
        if (!origin) continue;
        const group = groups.get(origin) ?? [];
        group.push(job);
        groups.set(origin, group);
      }
      for (const [origin, group] of groups) {
        if (overCallBudget()) break;
        if (group.length < this.config.WATCH_ENGINE_FIDS_MIN_GROUP) continue;
        try {
          const board = await this.provider.lookupFids(origin);
          providerCalls += 1;
          if (board.meta.source === "live") {
            this.usage.add(this.config.AERODATABOX_UNITS_PER_FLIGHT);
          }
          if (!board.summaries.length) continue;
          const matchedJobs = group
            .map((job) => ({
              job,
              summary: board.summaries.find(
                (flight) => flight.origin.code === origin && matchesJob(flight, job),
              ),
            }))
            .filter((entry): entry is { job: WatchJob; summary: FlightSummary } =>
              Boolean(entry.summary),
            );
          if (!matchedJobs.length) continue;
          // The board charges 2 units for the whole group; the share each job
          // attributes to its watchers splits that across the matched jobs.
          const perJobShare =
            board.meta.source === "live"
              ? this.config.AERODATABOX_UNITS_PER_FLIGHT / matchedJobs.length
              : 0;
          for (const { job, summary } of matchedJobs) {
            const allowed = allowedFor(job);
            refreshed += await this.applySummary(job, summary, allowed, now, perJobShare);
            pending.delete(job.key);
          }
          this.log.debug(
            { origin, jobs: matchedJobs.length },
            "watch engine refreshed via airport board",
          );
        } catch (error) {
          this.log.warn({ err: error, origin }, "watch engine board refresh failed");
        }
      }
    }

    // Per-flight pass for everything the boards did not cover.
    for (const job of pending.values()) {
      if (overCallBudget()) break;
      try {
        const allowed = allowedFor(job);
        const result = await this.provider.searchFlight(job.flightNumber);
        providerCalls += 1;
        if (result.meta.source === "not_configured") break;
        if (result.meta.source === "quota_fallback") continue;
        if (result.meta.source === "live") {
          this.usage.add(this.config.AERODATABOX_UNITS_PER_FLIGHT);
        }
        if (!result.flights.length) continue;
        const summary = result.flights.find((flight) => matchesJob(flight, job));
        if (!summary) continue;
        refreshed += await this.applySummary(
          job,
          summary,
          allowed,
          now,
          result.meta.source === "live"
            ? this.config.AERODATABOX_UNITS_PER_FLIGHT / Math.max(1, allowed.length)
            : 0,
        );
      } catch (error) {
        this.log.warn({ err: error, flight: job.flightNumber }, "watch engine flight refresh failed");
      }
    }
    this.lastSwept = refreshed;
    if (this.lastRefresh.size > 10_000) {
      const oldest = this.lastRefresh.keys().next().value;
      if (oldest) this.lastRefresh.delete(oldest);
    }
  }

  /**
   * Writes a refreshed summary into every allowed watcher's snapshot, emits
   * change alerts, and meters the shared cost. Returns rows applied.
   */
  private async applySummary(
    job: WatchJob,
    summary: FlightSummary,
    allowed: SupabaseWatchRow[],
    nowMs: number,
    unitsPerRowShare: number,
  ): Promise<number> {
    let applied = 0;
    for (const row of allowed) {
      if (!isWatchSnapshot(row.snapshot)) continue;
      const previous = row.snapshot;
      const merged = mergeSnapshot(previous, summary, nowMs);
      const drafts = diffAlerts(previous, merged, job.flightNumber).filter(
        (draft) => !this.seenAlerts.has(alertKey(job.flightNumber, draft)),
      );
      if (drafts.length) {
        this.log.info(
          { flight: job.flightNumber, types: drafts.map((draft) => draft.type) },
          "watch engine detected flight changes",
        );
      }
      const write = await this.supabase.write(
        { user_id: row.user_id, flight_id: row.flight_id },
        {
          snapshot: merged,
          status: merged.status ?? null,
          alerts: drafts.map((draft) => ({
            user_id: row.user_id,
            flight_number: job.flightNumber,
            alert_type: draft.type,
            title: draft.title,
            message: draft.message,
            is_read: false,
          })),
        },
      );
      if (write.alertFailures) {
        this.log.warn(
          { flight: job.flightNumber, alertFailures: write.alertFailures },
          "watch engine: alert insert failures",
        );
      }
      for (const draft of drafts) this.seenAlerts.add(alertKey(job.flightNumber, draft));
      this.lastRefresh.set(job.key, nowMs);
      this.meter.track(row.user_id, job.key, nowMs, unitsPerRowShare);
      applied += 1;
    }
    return applied;
  }

  /** Groups watchlist rows by flight number + date, keeping the ones due now. */
  private collectDue(rows: SupabaseWatchRow[], nowMs: number): WatchJob[] {
    const jobs = new Map<string, WatchJob>();
    for (const row of rows) {
      const flightNumber = row.flight_number.trim().toUpperCase();
      const key = `${flightNumber}|${row.flight_date ?? "any"}`;
      if (!isWatchSnapshot(row.snapshot)) continue;
      const decision = evaluateDue(row.snapshot, this.lastRefresh.get(key) ?? 0, nowMs);
      if (!decision.due) continue;
      const job = jobs.get(key) ?? {
        key,
        flightNumber,
        flightDate: row.flight_date,
        rows: [],
        priority: decision.priority,
        deltaMs: decision.deltaMs,
      };
      job.rows.push(row);
      if (decision.priority < job.priority) job.priority = decision.priority;
      jobs.set(key, job);
    }
    return [...jobs.values()].sort(
      (first, second) => first.priority - second.priority || first.deltaMs - second.deltaMs,
    );
  }
}
