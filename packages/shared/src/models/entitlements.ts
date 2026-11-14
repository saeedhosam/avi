import { z } from "zod";

export const AEROQUEST_FEATURES = [
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

export type AeroQuestFeature = (typeof AEROQUEST_FEATURES)[number];

export const AEROQUEST_PRODUCTS = [
  "FREE",
  "PLUS_MONTHLY",
  "PRO_MONTHLY",
  "TRIP_PASS_4_99",
] as const;
export type AeroQuestProduct = (typeof AEROQUEST_PRODUCTS)[number];

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
  feature: AeroQuestFeature;
  allowed: boolean;
  reason: "PLAN" | "TRIP_PASS" | "FREE_TIER" | "PAYWALLED" | "EXPIRED";
  product: AeroQuestProduct;
  upgradePrompt: string | null;
}

export const entitlementDecisionSchema: z.ZodType<EntitlementDecision> =
  z.object({
    feature: z.enum(AEROQUEST_FEATURES),
    allowed: z.boolean(),
    reason: z.enum(["PLAN", "TRIP_PASS", "FREE_TIER", "PAYWALLED", "EXPIRED"]),
    product: z.enum(AEROQUEST_PRODUCTS),
    upgradePrompt: z.string().nullable(),
  });

export const FREE_FEATURES: readonly AeroQuestFeature[] = [
  "DIRECT_ROUTE_EXPLORER",
  "BASIC_FLIGHT_LOOKUP",
  "TERMINAL_MAP_2D",
];

export const PRO_FEATURES: readonly AeroQuestFeature[] = [
  ...FREE_FEATURES,
  "PUSH_GATE_ALERTS",
  "CABIN_VIEWER_3D",
  "SPRINT_MODE",
  "OFFLINE_INFLIGHT_HUD",
  "FOG_OF_WAR",
  "AR_BAG_SIZER",
];

export const TRIP_PASS_FEATURES: readonly AeroQuestFeature[] = [
  "PUSH_GATE_ALERTS",
  "CABIN_VIEWER_3D",
  "SPRINT_MODE",
  "OFFLINE_INFLIGHT_HUD",
  "AR_BAG_SIZER",
];
