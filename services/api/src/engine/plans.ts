export const PLAN_LIMITS = {
  FREE: 3,
  PLUS: 15,
  PRO: 50,
} as const;

export type PlanTier = keyof typeof PLAN_LIMITS;

/** How long a tracked flight keeps occupying one of the user's live slots. */
export const DEFAULT_ACTIVE_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * The number of concurrently live-tracked flight-days a plan may carry.
 * Watchlist saving is unlimited on every plan; only the engine's refresh
 * cadence and slot count differ (see docs on the P1 tiering model).
 */
export function concurrencyLimitFor(plan: string | null | undefined): number {
  const key = (plan ?? "FREE").trim().toUpperCase();
  return key in PLAN_LIMITS ? PLAN_LIMITS[key as PlanTier] : PLAN_LIMITS.FREE;
}
