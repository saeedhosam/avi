import { createHmac, timingSafeEqual } from "node:crypto";
import type { AppConfig } from "../config.js";

// ── Lemon Squeezy adapter (P1 Track M, Track M of Pass 4) ──────────────────
// Merchant of Record: the seller (Avi) gets paid out without needing a
// US/UK entity, worldwide tax is LS's problem, and the same checkout/webhook
// surface can be re-implemented for Stripe by adding a "stripe" branch.

export type BillingPlanTier = "FREE" | "PLUS" | "PRO";

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
  if (config.LEMONSQUEEZY_VARIANT_PRO && variant === config.LEMONSQUEEZY_VARIANT_PRO) return "PRO";
  if (config.LEMONSQUEEZY_VARIANT_PLUS && variant === config.LEMONSQUEEZY_VARIANT_PLUS) return "PLUS";
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
