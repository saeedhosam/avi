import { createHmac, timingSafeEqual } from "node:crypto";
import type { AppConfig } from "../config.js";

// ── Lemon Squeezy adapter (P1 Track M, Track M of Pass 4) ──────────────────
// Merchant of Record: the seller (Avi) gets paid out without needing a
// US/UK entity, worldwide tax is LS's problem, and the same checkout/webhook
// surface can be re-implemented for Stripe by adding a "stripe" branch.

export type BillingPlanTier = "FREE" | "PLUS" | "PRO";

export type BillingProvider = "manual" | "lemon_squeezy" | "polar";

/** Self-serve checkout is live for every provider except manual assignment. */
export function billingUpgradeEnabled(provider: string | null | undefined): boolean {
  const value = (provider ?? "manual").trim().toLowerCase();
  return value === "lemon_squeezy" || value === "polar";
}

export interface BillingStatusPatch {
  plan: BillingPlanTier;
  billingCustomerId: string | null;
}

export function validPlan(plan: string | null | undefined): BillingPlanTier {
  const key = (plan ?? "FREE").trim().toUpperCase();
  return key === "PLUS" || key === "PRO" ? (key as BillingPlanTier) : "FREE";
}

/**
 * LS signs webhooks with HMAC-SHA256 over `<X-Signature-Timestamp>.<body>` and
 * sends the hex digest in `X-Signature`.
 */
export function verifyLemonSqueezySignature(
  secret: string,
  rawBody: string,
  signatureHeader: string | undefined,
  timestampHeader: string | undefined,
): boolean {
  if (!secret || !signatureHeader || typeof rawBody !== "string") return false;
  const signedPayload = timestampHeader
    ? `${timestampHeader}.${rawBody}`
    : rawBody;
  const expected = createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signatureHeader.trim(), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

interface LsSubscriptionEvent {
  data?: {
    attributes?: {
      status?: string;
      variant_id?: number;
      first_subscription_item?: { variant_id?: number };
      customer_id?: number;
      user_email?: string;
    };
    id?: string | number;
  };
  meta?: {
    custom_data?: { user_id?: string };
    event_name?: string;
  };
}

/**
 * Maps an LS webhook payload to the profile patch it should produce, or null
 * when the event does not change plan state.
 */
export function planPatchFromWebhook(
  payload: LsSubscriptionEvent,
  config: AppConfig,
): BillingStatusPatch | null {
  const eventName = (payload.meta?.event_name ?? "").toLowerCase();
  const attributes = payload.data?.attributes ?? {};
  const customerId =
    attributes.customer_id != null ? String(attributes.customer_id) : null;

  // Subscription lifecycle is authoritative in either direction.
  if (eventName.startsWith("subscription_")) {
    const status = (attributes.status ?? "").toLowerCase();
    if (["cancelled", "expired", "unpaid", "on_pause"].includes(status)) {
      return { plan: "FREE", billingCustomerId: customerId ?? null };
    }
    const variantPlan = variantToPlan(attributes, config);
    if (!variantPlan) return null;
    return { plan: variantPlan, billingCustomerId: customerId ?? null };
  }

  // One-time orders (checkout completed without a subscription row).
  if (eventName === "order_created") {
    const plan = variantToPlan(attributes, config);
    if (!plan) return null;
    return { plan, billingCustomerId: customerId ?? null };
  }

  return null;
}

function variantToPlan(
  attributes: {
    variant_id?: number;
    first_subscription_item?: { variant_id?: number };
  },
  config: AppConfig,
): BillingPlanTier | null {
  const variant = String(
    attributes?.first_subscription_item?.variant_id ?? attributes?.variant_id ?? "",
  );
  if (!variant || variant === "null") return null;
  // Variants are comma-separated lists so a plan can span billing intervals
  // (e.g., "41,44" = Plus monthly + Plus yearly).
  const tierVariant = (ids: string | undefined): boolean =>
    Boolean(ids && ids.split(",").map((id) => id.trim()).includes(variant));
  if (tierVariant(config.LEMONSQUEEZY_VARIANT_PRO)) return "PRO";
  if (tierVariant(config.LEMONSQUEEZY_VARIANT_PLUS)) return "PLUS";
  return null;
}

const LS_API = "https://api.lemonsqueezy.com/v1";

/** Prices handled in the checkout page (LS), so no price data lives here. */
export async function createLemonSqueezyCheckout(
  config: AppConfig,
  uid: string,
  webOrigin: string,
  target: "PLUS" | "PRO",
): Promise<string | null> {
  const variantId =
    target === "PRO" ? config.LEMONSQUEEZY_VARIANT_PRO : config.LEMONSQUEEZY_VARIANT_PLUS;
  if (
    config.BILLING_PROVIDER !== "lemon_squeezy" ||
    !config.LEMONSQUEEZY_API_KEY ||
    !config.LEMONSQUEEZY_STORE_ID ||
    !variantId
  ) {
    return null;
  }
  const response = await fetch(`${LS_API}/checkouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.LEMONSQUEEZY_API_KEY}`,
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
    },
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          custom: { user_id: uid },
          product_options: {
            enabled_variants: [Number(variantId)],
            redirect_url: `${webOrigin.replace(/\/+$/, "")}/`,
          },
          checkout_options: { embed: false, dark: false },
        },
        relationships: {
          store: { data: { type: "stores", id: String(config.LEMONSQUEEZY_STORE_ID) } },
        },
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    data?: { attributes?: { url?: string } };
  };
  return payload.data?.attributes?.url ?? null;
}

// ── Polar.sh (Merchant of Record, confirmed Egypt payout route) ────────────

const POLAR_API = "https://api.polar.sh/v1";

/** Creates a hosted Polar checkout for the target tier. */
export async function createPolarCheckout(
  config: AppConfig,
  uid: string,
  webOrigin: string,
  target: "PLUS" | "PRO",
): Promise<string | null> {
  const productId =
    target === "PRO" ? config.POLAR_PRICE_PRO : config.POLAR_PRICE_PLUS;
  if (
    config.BILLING_PROVIDER !== "polar" ||
    !config.POLAR_API_KEY ||
    !productId
  ) {
    return null;
  }
  // The first id of a comma-separated list is the default (monthly); annual
  // variants still unlock the tier via webhook regardless of entry point.
  const products = productId.split(",").map((id) => id.trim()).filter(Boolean);
  if (!products.length) return null;
  const response = await fetch(`${POLAR_API}/checkouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.POLAR_API_KEY}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      products,
      metadata: { user_id: uid },
      success_url: `${webOrigin.replace(/\/+$/, "")}/?upgraded=1`,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { url?: string };
  return payload.url ?? null;
}

/**
 * Polar webhooks sign the raw body with HMAC-SHA256 (hex, base64 by default
 * per the `Polar-Webhook-Signature` header).
 */
export function verifyPolarSignature(
  secret: string,
  rawBody: string,
  signatureHeader: string | undefined,
): boolean {
  if (!secret || !signatureHeader || typeof rawBody !== "string") return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signatureHeader.trim(), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface PolarWebhookEvent {
  type?: string;
  data?: {
    id?: string | number;
    customer_id?: string;
    external_customer_id?: string | null;
    product_id?: string;
    price_id?: string;
    metadata?: { user_id?: string } | null;
    status?: string;
    customer_email?: string;
  };
}

/**
 * Maps a Polar webhook payload to a profile patch — the tier comes from
 * product/price id membership in the comma-separated tier lists.
 */
export function planPatchFromPolarWebhook(
  payload: PolarWebhookEvent,
  config: AppConfig,
): BillingStatusPatch | null {
  const type = (payload.type ?? "").toLowerCase();
  const data = payload.data ?? {};
  const productId = data.product_id ?? "";
  const priceId = data.price_id ?? "";

  const matchesTier = (ids: string | undefined): "PLUS" | "PRO" | null => {
    if (!ids) return null;
    const list = ids.split(",").map((id) => id.trim()).filter(Boolean);
    if (list.includes(productId) || (priceId && list.includes(priceId))) {
      return productId && list.includes(productId)
        ? ids === config.POLAR_PRICE_PRO
          ? "PRO"
          : "PLUS"
        : ids === config.POLAR_PRICE_PRO
          ? "PRO"
          : "PLUS";
    }
    return null;
  };
  const variantToPlan = (tier: "PLUS" | "PRO" | null): BillingPlanTier =>
    tier ?? "FREE";

  // Terminal lifecycle states downgrade regardless of product id.
  if (type === "subscription.canceled" || type === "subscription.revoked") {
    return {
      plan: "FREE",
      billingCustomerId: data.customer_id ?? null,
    };
  }

  // Active subscriptions and orders set the tier if their product matches.
  if (
    type === "subscription.created" ||
    type === "subscription.updated" ||
    type === "subscription.active" ||
    type === "order.created"
  ) {
    const tier =
      matchesTier(config.POLAR_PRICE_PRO) ?? matchesTier(config.POLAR_PRICE_PLUS);
    if (!tier) return null;
    return {
      plan: variantToPlan(tier) as BillingPlanTier,
      billingCustomerId: data.customer_id ?? null,
    };
  }

  return null;
}
