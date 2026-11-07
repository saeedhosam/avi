import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { FlightSummary } from "../domain/flight.js";
import type { WatchSnapshot } from "./snapshot.js";
import { UsageTracker, UserMeter } from "../lib/usage.js";
import type { SupabaseWatchRow } from "../lib/supabase-server.js";
import { SupabaseServer } from "../lib/supabase-server.js";
import type { AeroDataBoxProvider } from "../providers/aerodatabox.js";
import { concurrencyLimitFor } from "./plans.js";
import {
  diffAlerts,
  isWatchSnapshot,
  matchesJob,
  mergeSnapshot,
  scheduleNextPoll,
  snapshotFromRow,
  type WatchJob,
} from "./snapshot.js";import { PushDelivery, type PushDeliveryStats } from "./push-delivery.js";
import { EngineStatusStore } from "../lib/engine-status.js";

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
 *
 * State lives in Postgres, not in this process: `watchlist_items.next_poll_at`
 * is the poll ladder, and `flight_alerts` dedupes on a unique index. The
 * engine is restart- and concurrency-safe; an engine container provides the
 * single writer via a PostgREST advisory lock.
 */
export class WatchEngine {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;
  private lastTickAt: number | null = null;
  // Daily purge of stale flight payloads (AeroDataBox 7-day cache term).
  private lastPruneAt: number | null = null;
  private lastSwept = 0;
  private backlog = 0;
  private lastError: string | null = null;
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
    private readonly statusStore?: EngineStatusStore,
  ) {}

  /** Schedules the first tick after the app is ready and stops on close. */
  register(app: FastifyInstance): void {
    app.addHook("onReady", async () => {
      this.stopped = false;
      if (!this.provider.configured) {
        this.log.warn("watch engine disabled: AeroDataBox key missing");
        return;
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
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext(delayMs: number): void {
    if (this.stopped) return;
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
      if (this.statusStore) {
        try {
          await this.statusStore.write(this.stats());
        } catch (statusError) {
          this.log.warn({ err: statusError }, "watch engine status store write failed");
        }
      }
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

    // Every row Postgres handed back is due now; group them by flight + date
    // so one provider call covers the shared lookups. Rows are ordered by
    // next_poll_at, so operational windows still win the tick.
    const jobs = this.collectJobs(rows);
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
          Date.now(),
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

    let providerCalls = 0;
    let pendingJobs = 0;
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
    const fidsCovered = new Set<WatchJob>();
    if (this.config.WATCH_ENGINE_FIDS_ENABLED && this.provider.lookupFids) {
      const groups = new Map<string, WatchJob[]>();
      for (const job of jobs) {
        // Only group jobs whose rows still have a snapshot-origin. Rows
        // without one fall into the per-flight pass.
        const origin = job.rows
          .map((row) =>
            isWatchSnapshot(row.snapshot)
              ? row.snapshot.origin?.code
              : row.origin_code ?? undefined,
          )
          .find((code) => typeof code === "string" && code.length === 3)
          ?.toUpperCase();
        if (!origin) continue;
        const group = groups.get(origin) ?? [];
        group.push(job);
        groups.set(origin, group);
      }
      for (const [origin, group] of groups) {
        if (overCallBudget()) {
          pendingJobs += group.length;
          continue;
        }
        if (group.length < this.config.WATCH_ENGINE_FIDS_MIN_GROUP) continue;
        const pending = group.slice(0);
        try {
          const board = await this.provider.lookupFids(origin);
          providerCalls += 1;
          if (board.meta.source === "live") {
            this.usage.add(this.config.AERODATABOX_UNITS_PER_FLIGHT);
          }
          if (board.summaries.length) {
            const matchedJobs = pending
              .map((job) => ({
                job,
                summary: board.summaries.find(
                  (flight) => flight.origin.code === origin && matchesJob(flight, job),
                ),
              }))
              .filter((entry): entry is { job: WatchJob; summary: FlightSummary } =>
                Boolean(entry.summary),
              );
            if (matchedJobs.length) {
              // The board charges 2 units for the whole group; the share each
              // job attributes to its watchers splits that across the matched
              // jobs' watcher set.
              const perJobShare =
                board.meta.source === "live"
                  ? this.config.AERODATABOX_UNITS_PER_FLIGHT / matchedJobs.length
                  : 0;
              for (const { job, summary } of matchedJobs) {
                const allowed = allowedFor(job);
                refreshed += await this.applySummary(job, summary, allowed, perJobShare);
                pending.splice(pending.indexOf(job), 1);
              }
            }
          }
          // Anything not matched still needs its next poll schedule persist
          // (misses must progress on the ladder too).
          await this.persistSchedule(
            pending.flatMap((job) => job.rows),
          );
          // Jobs handled by the board never re-enter the per-flight pass.
          for (const job of group) fidsCovered.add(job);
          this.log.debug(
            { origin, jobs: pending.length },
            "watch engine refreshed via airport board",
          );
        } catch (error) {
          pendingJobs += pending.length;
          this.log.warn({ err: error, origin }, "watch engine board refresh failed");
        }
      }
    }

    // Per-flight pass for everything the boards did not cover.
    for (const job of jobs) {
      if (fidsCovered.has(job)) continue;
      if (overCallBudget()) {
        pendingJobs += 1;
        continue;
      }
      try {
        const allowed = allowedFor(job);
        const result = await this.provider.searchFlight(job.flightNumber);
        providerCalls += 1;
        if (result.meta.source === "not_configured") {
          await this.persistSchedule(job.rows);
          pendingJobs += 1;
          continue;
        }
        if (result.meta.source === "quota_fallback") {
          await this.persistSchedule(job.rows);
          pendingJobs += 1;
          continue;
        }
        if (result.meta.source === "live") {
          this.usage.add(this.config.AERODATABOX_UNITS_PER_FLIGHT);
        }
        if (!result.flights.length) {
          await this.persistSchedule(job.rows);
          continue;
        }
        const summary = result.flights.find((flight) => matchesJob(flight, job));
        if (!summary) {
          await this.persistSchedule(job.rows);
          continue;
        }
        refreshed += await this.applySummary(
          job,
          summary,
          allowed,
          result.meta.source === "live"
            ? this.config.AERODATABOX_UNITS_PER_FLIGHT / Math.max(1, allowed.length || 1)
            : 0,
        );
      } catch (error) {
        pendingJobs += 1;
        try {
          await this.persistSchedule(job.rows);
        } catch (scheduleError) {
          this.log.warn({ err: scheduleError, flight: job.flightNumber }, "watch engine poll schedule patch failed");
        }
        this.log.warn({ err: error, flight: job.flightNumber }, "watch engine flight refresh failed");
      }
    }
    this.lastSwept = refreshed;
    this.backlog = Math.max(0, jobs.length - refreshed) + pendingJobs;
  }

  /**
   * Writes a refreshed summary into every allowed watcher's snapshot, emits
   * change alerts (the DB dedupes replays), meters shared cost, and advances
   * the persisted poll ladder. Returns rows applied.
   */
  private async applySummary(
    job: WatchJob,
    summary: FlightSummary,
    allowed: SupabaseWatchRow[],
    unitsPerRowShare: number,
  ): Promise<number> {
    const nowMs = Date.now();
    let applied = 0;
    for (const row of allowed) {
      const previous = snapshotFromRow(row);
      const merged = mergeSnapshot(previous, summary, nowMs);
      const drafts = diffAlerts(previous, merged, job.flightNumber);
      if (drafts.length) {
        this.log.info(
          { flight: job.flightNumber, types: drafts.map((draft) => draft.type) },
          "watch engine detected flight changes",
        );
      }
      const schedule = scheduleNextPoll(merged, nowMs);
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
          nextPollAt: schedule.atMs,
          pollPriority: schedule.priority,
        },
      );
      if (write.alertFailures) {
        this.log.warn(
          { flight: job.flightNumber, alertFailures: write.alertFailures },
          "watch engine: alert insert failures",
        );
      }
      this.meter.track(row.user_id, job.key, nowMs, unitsPerRowShare);
      applied += 1;
    }

    // Rows in the same job but outside their plan limit still need to advance
    // the ladder; otherwise they spin every tick and starve other flights.
    await this.persistSchedule(job.rows.filter((row) => !allowed.includes(row)));
    return applied;
  }

  /**
   * Persists the next poll instant for rows the last pass did not refresh
   * (provider returned nothing, job was out of plan capacity, or the pass
   * failed). Ladder input is the stored snapshot, so misses still move.
   */
  private async persistSchedule(rows: SupabaseWatchRow[]): Promise<void> {
    if (!rows.length) return;
    const nowMs = Date.now();
    const updates = await Promise.all(
      rows.map(async (row) => {
        const schedule = scheduleNextPoll(snapshotFromRow(row), nowMs);
        return this.supabase
          .patchPollSchedule(
            { user_id: row.user_id, flight_id: row.flight_id },
            schedule.atMs,
            schedule.priority,
          )
          .catch((error) => {
            this.log.warn(
              { err: error, flight: row.flight_number },
              "watch engine poll schedule patch failed",
            );
          });
      }),
    );
    void updates;
  }

  /**
   * Groups due rows by `${compactFlightNumber}|${flightDate}`; the engine
   * shares one provider lookup per job. Priority bands and the tick order
   * come from Postgres (`order by next_poll_at`), so a restart does not
   * reshuffle the budget.
   */
  private collectJobs(rows: SupabaseWatchRow[]): WatchJob[] {
    const jobs = new Map<string, WatchJob>();
    for (const row of rows) {
      const flightNumber = row.flight_number.trim().toUpperCase();
      const key = `${flightNumber}|${row.flight_date ?? "any"}`;
      const job = jobs.get(key) ?? {
        key,
        flightNumber,
        flightDate: row.flight_date ?? null,
        rows: [],
        priority: row.poll_priority ?? 5,
        deltaMs: 0,
      };
      job.rows.push(row);
      if (typeof row.poll_priority === "number" && row.poll_priority < job.priority) {
        job.priority = row.poll_priority;
      }
      jobs.set(key, job);
    }
    // Queue order is whatever Postgres handed back (`next_poll_at asc`), so
    // operational windows still win the tick.
    return [...jobs.values()];
  }
}
