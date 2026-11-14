import { z } from "zod";

export const PLAN_TIERS = ["FREE", "PLUS", "PRO", "TRIP_PASS"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export interface CloudUserProfile {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  photoUrl: string;
  homeAirport: string;
}

export const cloudUserProfileSchema: z.ZodType<CloudUserProfile> = z.object({
  id: z.string(),
  userId: z.string(),
  displayName: z.string(),
  email: z.string(),
  photoUrl: z.string(),
  homeAirport: z.string(),
});

export interface CloudTrackedFlight {
  id: string;
  userId: string;
  flightNumber: string;
  flightDate?: string | null;
  airline: string;
  originCode: string;
  destCode: string;
  status: string;
  customNotes: string;
  isFavorite: boolean;
}

export const cloudTrackedFlightSchema: z.ZodType<CloudTrackedFlight> = z.object({
  id: z.string(),
  userId: z.string(),
  flightNumber: z.string(),
  flightDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  airline: z.string(),
  originCode: z.string(),
  destCode: z.string(),
  status: z.string(),
  customNotes: z.string(),
  isFavorite: z.boolean(),
});

/**
 * Date-scoped watchlist identity matching the web client:
 * `"<COMPACT>-<YYYY-MM-DD>"`, so the same flight number on two operating dates
 * occupies two independent rows. The flight number is always the source of the
 * compact identity so the date is appended exactly once.
 */
export function cloudWatchRowId(input: {
  id?: string;
  flightNumber: string;
  flightDate?: string | null;
}): string {
  const compact = (input.flightNumber || input.id || "")
    .replace(/\s+/g, "")
    .toUpperCase();
  const date = input.flightDate?.trim();
  return date ? `${compact}-${date}` : compact;
}

export interface CloudAlert {
  id: string;
  userId: string;
  flightNumber: string;
  alertType: string;
  title: string;
  message: string;
  isRead: boolean;
  timestamp: string;
}

export const cloudAlertSchema: z.ZodType<CloudAlert> = z.object({
  id: z.string(),
  userId: z.string(),
  flightNumber: z.string(),
  alertType: z.string(),
  title: z.string(),
  message: z.string(),
  isRead: z.boolean(),
  timestamp: z.string(),
});

/** Plan tier + concurrent-tracked limit, mirroring gateway engine limits. */
export interface CloudPlanState {
  plan: string;
  concurrentLimit: number;
}

export const cloudPlanStateSchema: z.ZodType<CloudPlanState> = z.object({
  plan: z.string(),
  concurrentLimit: z.number().int().nonnegative(),
});

export function isFreePlan(plan: string): boolean {
  return plan.trim().toUpperCase() === "FREE";
}
