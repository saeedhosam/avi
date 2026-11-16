import { z } from "zod";

export const AVI_FEATURES = [
  "DIRECT_ROUTE_EXPLORER",
  "BASIC_FLIGHT_LOOKUP",
  "TERMINAL_MAP_2D",
  "PUSH_GATE_ALERTS",
  "CABIN_VIEWER_3D",
  "SPRINT_MODE",
  "OFFLINE_INFLIGHT_HUD",
  "FOG_OF_WAR",
  "AR_BAG_SIZER",
] as const;

export type AviFeature = (typeof AVI_FEATURES)[number];

export const AVI_PRODUCTS = [
  "FREE",
  "PLUS_MONTHLY",
  "PRO_MONTHLY",
  "TRIP_PASS_4_99",
] as const;
export type AviProduct = (typeof AVI_PRODUCTS)[number];

export interface EntitlementContext {
  plan: string;
  /** ISO timestamp; a trip pass is active until this instant. */
  tripPassExpiresAt?: string | null;
  now?: string;
}

export const entitlementContextSchema: z.ZodType<EntitlementContext> = z.object({
  plan: z.string(),
  tripPassExpiresAt: z.string().nullable().optional(),
  now: z.string().optional(),
});

export interface EntitlementDecision {
  feature: AviFeature;
  allowed: boolean;
  reason: "PLAN" | "TRIP_PASS" | "FREE_TIER" | "PAYWALLED" | "EXPIRED";
  product: AviProduct;
  upgradePrompt: string | null;
}

export const entitlementDecisionSchema: z.ZodType<EntitlementDecision> =
  z.object({
    feature: z.enum(AVI_FEATURES),
    allowed: z.boolean(),
    reason: z.enum(["PLAN", "TRIP_PASS", "FREE_TIER", "PAYWALLED", "EXPIRED"]),
    product: z.enum(AVI_PRODUCTS),
    upgradePrompt: z.string().nullable(),
  });

export const FREE_FEATURES: readonly AviFeature[] = [
  "DIRECT_ROUTE_EXPLORER",
  "BASIC_FLIGHT_LOOKUP",
  "TERMINAL_MAP_2D",
];

export const PRO_FEATURES: readonly AviFeature[] = [
  ...FREE_FEATURES,
  "PUSH_GATE_ALERTS",
  "CABIN_VIEWER_3D",
  "SPRINT_MODE",
  "OFFLINE_INFLIGHT_HUD",
  "FOG_OF_WAR",
  "AR_BAG_SIZER",
];

export const TRIP_PASS_FEATURES: readonly AviFeature[] = [
  "PUSH_GATE_ALERTS",
  "CABIN_VIEWER_3D",
  "SPRINT_MODE",
  "OFFLINE_INFLIGHT_HUD",
  "AR_BAG_SIZER",
];
