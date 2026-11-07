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

/** Reject replayed webhooks older than this, in seconds. */
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

function timestampIsFresh(raw: string | undefined): boolean {
  if (!raw) return false;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return false;
  // Lemon Squeezy uses seconds; tolerate a millisecond variant defensively.
  const seconds = parsed > 1e12 ? parsed / 1000 : parsed;
  return Math.abs(Date.now() / 1000 - seconds) <= WEBHOOK_TOLERANCE_SECONDS;
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
  if (timestampHeader && !timestampIsFresh(timestampHeader)) return false;
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
      // Stable identity link. Polar echoes this on orders/subscriptions; the
      // webhook must never rely on a user-writable profile email.
      external_customer_id: uid,
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
 * Polar webhooks follow the Standard Webhooks specification.
 *
 * Headers: `webhook-id`, `webhook-timestamp`, `webhook-signature`.
 * Signed content: `${id}.${timestamp}.${body}`.
 * Signature: comma-separated `v1,<base64-hmac>` values (space-separated when
 * multiple signatures are present).
 *
 * Secrets created on/after 2026-09-08 are `whsec_<base64>` where the key is
 * the base64-decoded remainder. Older secrets use the UTF-8 bytes of the full
 * `whsec_…` string, so we accept either key derivation.
 */
export interface StandardWebhookHeaders {
  id: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
}

function webhookKeys(secret: string): Buffer[] {
  const trimmed = secret.trim();
  if (!trimmed) return [];
  const keys: Buffer[] = [Buffer.from(trimmed, "utf8")];
  const encoded = trimmed.startsWith("whsec_")
    ? trimmed.slice("whsec_".length)
    : trimmed;
  try {
    const decoded = Buffer.from(encoded, "base64");
    if (decoded.length >= 16) keys.unshift(decoded);
  } catch {
    // Not base64; the UTF-8 key above is the legacy path.
  }
  return keys;
}

function safeEqualBase64(expected: string, candidate: string): boolean {
  try {
    const a = Buffer.from(expected, "base64");
    const b = Buffer.from(candidate, "base64");
    return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function verifyStandardWebhookSignature(
  secret: string,
  rawBody: string,
  headers: StandardWebhookHeaders,
): boolean {
  if (
    !secret ||
    typeof rawBody !== "string" ||
    !headers.id ||
    !headers.timestamp ||
    !headers.signature ||
    !timestampIsFresh(headers.timestamp)
  ) {
    return false;
  }

  const signedContent = `${headers.id}.${headers.timestamp}.${rawBody}`;
  const candidates = headers.signature
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf(",");
      if (separator < 0) return null;
      const version = part.slice(0, separator);
      const value = part.slice(separator + 1);
      return version === "v1" && value ? value : null;
    })
    .filter((value): value is string => Boolean(value));

  if (!candidates.length) return false;

  return webhookKeys(secret).some((key) => {
    const expected = createHmac("sha256", key)
      .update(signedContent)
      .digest("base64");
    return candidates.some((candidate) => safeEqualBase64(expected, candidate));
  });
}

/** Backwards-compatible wrapper for callers that already use the name. */
export function verifyPolarSignature(
  secret: string,
  rawBody: string,
  headers: StandardWebhookHeaders,
): boolean {
  return verifyStandardWebhookSignature(secret, rawBody, headers);
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

  const matchesTier = (
    ids: string | undefined,
    tier: "PLUS" | "PRO",
  ): "PLUS" | "PRO" | null => {
    if (!ids) return null;
    const list = ids.split(",").map((id) => id.trim()).filter(Boolean);
    const productMatch = productId ? list.includes(productId) : false;
    const priceMatch = priceId ? list.includes(priceId) : false;
    return productMatch || priceMatch ? tier : null;
  };

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
    // `subscription.updated` is also how Polar reports terminal transitions.
    const status = (data.status ?? "").toLowerCase();
    if (["canceled", "revoked", "unpaid", "incomplete_expired"].includes(status)) {
      return {
        plan: "FREE",
        billingCustomerId: data.customer_id ?? null,
      };
    }
    const tier =
      matchesTier(config.POLAR_PRICE_PRO, "PRO") ??
      matchesTier(config.POLAR_PRICE_PLUS, "PLUS");
    if (!tier) return null;
    return {
      plan: tier,
      billingCustomerId: data.customer_id ?? null,
    };
  }

  return null;
}
