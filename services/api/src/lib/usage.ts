/**
 * Tracks AeroDataBox API-unit consumption for the current month against a hard
 * budget. Provider lookups are the only thing that spends units; cache hits and
 * quota fallbacks are free. When the budget is exhausted the watch engine
 * pauses instead of hammering the provider (HTTP 429 fallback would still be
 * honest to clients, but polling a provider we know is dry wastes nothing and
 * gains nothing).
 */
export interface UsageSnapshot {
  monthKey: string;
  unitsUsed: number;
  unitsBudget: number;
  overBudget: boolean;
}

export class UsageTracker {
  private units = 0;
  private monthKey = this.currentMonthKey();

  constructor(private readonly monthlyBudget: number) {}

  private currentMonthKey(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}`;
  }

  private rollover(): void {
    const key = this.currentMonthKey();
    if (key !== this.monthKey) {
      this.monthKey = key;
      this.units = 0;
    }
  }

  add(units: number): void {
    if (!Number.isFinite(units) || units <= 0) return;
    this.rollover();
    this.units += units;
  }

  get unitsUsed(): number {
    this.rollover();
    return this.units;
  }

  get overBudget(): boolean {
    return this.unitsUsed >= this.monthlyBudget;
  }

  snapshot(): UsageSnapshot {
    return {
      monthKey: this.monthKey,
      unitsUsed: this.unitsUsed,
      unitsBudget: this.monthlyBudget,
      overBudget: this.overBudget,
    };
  }
}

/**
 * Per-user attribution for the watch engine.
 *
 * Engine refreshes are shared (one provider call covers every user watching
 * that flight), so a user's metered cost is their share of each job. Limits
 * are counted over an *active window*, not a month: "concurrently tracked"
 * means flights the user watched recently enough that tracking is meaningful.
 */
export class UserMeter {
  /** uid -> (flight key -> last attributed refresh ms). */
  private readonly active = new Map<string, Map<string, number>>();
  private readonly units = new Map<string, { monthKey: string; units: number }>();

  private monthKey(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}`;
  }

  private rollUnits(uid: string): { monthKey: string; units: number } {
    const key = this.monthKey();
    const entry = this.units.get(uid);
    if (entry && entry.monthKey === key) return entry;
    const fresh = { monthKey: key, units: 0 };
    this.units.set(uid, fresh);
    return fresh;
  }

  private activeKeys(uid: string, windowMs: number, nowMs: number): Map<string, number> {
    const tracked = this.active.get(uid);
    const stillActive = new Map<string, number>();
    if (!tracked) return stillActive;
    for (const [key, lastActiveMs] of tracked) {
      if (nowMs - lastActiveMs <= windowMs) {
        stillActive.set(key, lastActiveMs);
      } else {
        tracked.delete(key);
      }
    }
    if (tracked.size === 0) this.active.delete(uid);
    return stillActive;
  }

  /**
   * A user has capacity when they are under their plan's concurrent-tracked
   * limit, or when the flight in question is already one of their live slots
   * (re-polling an active slot does not consume a new one).
   */
  hasCapacity(
    uid: string,
    key: string,
    limit: number,
    windowMs: number,
    nowMs: number,
  ): boolean {
    const active = this.activeKeys(uid, windowMs, nowMs);
    if (active.has(key)) return true;
    return active.size < limit;
  }

  /** Attributes a (share of a) refresh to the user and keeps the slot alive. */
  track(uid: string, key: string, nowMs: number, units: number): void {
    const tracked = this.active.get(uid) ?? new Map<string, number>();
    tracked.set(key, nowMs);
    this.active.set(uid, tracked);
    const unitsEntry = this.rollUnits(uid);
    if (Number.isFinite(units) && units > 0) unitsEntry.units += units;
  }

  users(): number {
    return this.active.size;
  }
}
