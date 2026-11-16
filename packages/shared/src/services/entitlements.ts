import {
  AVI_FEATURES,
  FREE_FEATURES,
  PRO_FEATURES,
  TRIP_PASS_FEATURES,
  type AviFeature,
  type AviProduct,
  type EntitlementContext,
  type EntitlementDecision,
} from "../models/entitlements.js";

const PLUS_LIKE = new Set(["PLUS", "PRO", "PREMIUM", "AVI_PRO"]);

function nowMs(context: EntitlementContext): number {
  const parsed = context.now ? Date.parse(context.now) : Date.now();
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export function activeTripPass(
  context: EntitlementContext,
): boolean {
  if (!context.tripPassExpiresAt) return false;
  const expiry = Date.parse(context.tripPassExpiresAt);
  return Number.isFinite(expiry) && expiry > nowMs(context);
}

export function resolveProduct(context: EntitlementContext): AviProduct {
  if (activeTripPass(context)) return "TRIP_PASS_4_99";
  const plan = context.plan.trim().toUpperCase();
  if (plan === "PRO" || plan === "AVI_PRO") return "PRO_MONTHLY";
  if (plan === "PLUS" || plan === "PREMIUM") return "PLUS_MONTHLY";
  return "FREE";
}

export function canUseFeature(
  feature: AviFeature,
  context: EntitlementContext,
): EntitlementDecision {
  const product = resolveProduct(context);
  const plan = context.plan.trim().toUpperCase();
  const tripPass = activeTripPass(context);

  if (FREE_FEATURES.includes(feature)) {
    return {
      feature,
      allowed: true,
      reason: "FREE_TIER",
      product,
      upgradePrompt: null,
    };
  }
  if (tripPass && TRIP_PASS_FEATURES.includes(feature)) {
    return {
      feature,
      allowed: true,
      reason: "TRIP_PASS",
      product,
      upgradePrompt: null,
    };
  }
  if (PLUS_LIKE.has(plan) && PRO_FEATURES.includes(feature)) {
    return {
      feature,
      allowed: true,
      reason: "PLAN",
      product,
      upgradePrompt: null,
    };
  }
  const expired = Boolean(context.tripPassExpiresAt) && !tripPass;
  return {
    feature,
    allowed: false,
    reason: expired ? "EXPIRED" : "PAYWALLED",
    product,
    upgradePrompt: upgradePromptFor(feature),
  };
}

export function entitlementsFor(
  context: EntitlementContext,
): Record<AviFeature, EntitlementDecision> {
  return Object.fromEntries(
    AVI_FEATURES.map((feature) => [feature, canUseFeature(feature, context)]),
  ) as Record<AviFeature, EntitlementDecision>;
}

export function upgradePromptFor(feature: AviFeature): string {
  switch (feature) {
    case "CABIN_VIEWER_3D":
      return "Unlock the 3D Cabin & Seat Twin with Avi Pro or a $4.99 Single-Trip Pass.";
    case "SPRINT_MODE":
      return "Tight connection? Unlock Sprint Mode with Avi Pro or a $4.99 Single-Trip Pass.";
    case "PUSH_GATE_ALERTS":
      return "Get instant gate, terminal, and baggage alerts with Avi Pro.";
    case "OFFLINE_INFLIGHT_HUD":
      return "Unlock the offline in-flight barometer HUD with Avi Pro or a $4.99 Single-Trip Pass.";
    case "AR_BAG_SIZER":
      return "Check your carry-on against the overhead bin with Avi Pro or a $4.99 Single-Trip Pass.";
    case "FOG_OF_WAR":
      return "Clear terminal fog and collect passport badges with Avi Pro.";
    default:
      return "This feature is included in Avi Pro.";
  }
}

/**
 * Maps RevenueCat entitlement identifiers or Stripe price IDs to the plan model.
 * Kept as pure data so the client can use it without a billing SDK installed.
 */
export function planFromProductId(productId: string | null | undefined): string {
  const value = (productId ?? "").trim().toLowerCase();
  if (!value) return "FREE";
  if (value.includes("trip_pass") || value.includes("single_trip")) return "TRIP_PASS";
  if (value.includes("pro")) return "PRO";
  if (value.includes("plus")) return "PLUS";
  return "FREE";
}

export function entitlementContextFromProfile(
  profile: { plan?: string | null; trip_pass_expires_at?: string | null },
  now?: string,
): EntitlementContext {
  return {
    plan: profile.plan ?? "FREE",
    tripPassExpiresAt: profile.trip_pass_expires_at ?? null,
    now,
  };
}
