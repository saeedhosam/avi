import { z } from "zod";

const ConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  PUBLIC_WEB_URL: z.string().default("http://localhost:3000"),
  AERODATABOX_API_KEY: z.string().optional(),
  AERODATABOX_API_HOST: z.string().default("api.aerodatabox.com"),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SECRET_KEY: z.string().optional(),
  REDIS_URL: z.string().optional(),
  // Watch engine: server-side lifecycle polling for watchlist items.
  WATCH_ENGINE_ENABLED: z
    .string()
    .default("true")
    .transform((value) => !["false", "0", "no"].includes(value.trim().toLowerCase())),
  // Web Push delivery for engine-written alerts (P1 Track C).
  PUSH_DELIVERY_ENABLED: z
    .string()
    .default("true")
    .transform((value) => !["false", "0", "no"].includes(value.trim().toLowerCase())),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:alerts@avi.app"),
  PUSH_BATCH_SIZE: z.coerce.number().int().min(1).default(100),
  WATCH_ENGINE_TICK_MS: z.coerce.number().int().min(5_000).default(30_000),
  WATCH_ENGINE_SWEEPS_PER_TICK: z.coerce.number().int().min(1).max(64).default(8),
  WATCH_ENGINE_STARTUP_DELAY_MS: z.coerce.number().int().min(0).default(5_000),
  WATCH_ENGINE_MAX_ROWS_PER_POLL: z.coerce.number().int().min(1).default(2_000),
  // A tracked flight keeps occupying one of the user's plan slots this long.
  WATCH_ENGINE_ACTIVE_WINDOW_MS: z.coerce.number().int().min(60_000).default(172_800_000),
  // FIDS-by-airport consolidation: one board call refreshes every watched
  // flight sharing that origin (N × 2-unit calls become one 2-unit call).
  WATCH_ENGINE_FIDS_ENABLED: z
    .string()
    .default("true")
    .transform((value) => !["false", "0", "no"].includes(value.trim().toLowerCase())),
  WATCH_ENGINE_FIDS_MIN_GROUP: z.coerce.number().int().min(2).max(32).default(2),
  AERODATABOX_UNITS_PER_FLIGHT: z.coerce.number().int().min(1).default(2),
  UNIT_BUDGET_PER_MONTH: z.coerce.number().int().min(0).default(32_000),
  // ── Billing (Track M) ─────────────────────────────────────────────
  // "manual" = plans set by SQL; "lemon_squeezy" = webhooks assign plans and
  // the checkout API sells them. Stripe slots into the same surface later.
  BILLING_PROVIDER: z.enum(["manual", "lemon_squeezy"]).default("manual"),
  LEMONSQUEEZY_API_KEY: z.string().optional(),
  LEMONSQUEEZY_STORE_ID: z.string().optional(),
  LEMONSQUEEZY_VARIANT_PLUS: z.string().optional(),
  LEMONSQUEEZY_VARIANT_PRO: z.string().optional(),
  LEMONSQUEEZY_WEBHOOK_SECRET: z.string().optional(),
});

export type AppConfig = z.infer<typeof ConfigSchema> & {
  corsOrigins: string[];
};

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = ConfigSchema.parse(source);
  return {
    ...parsed,
    corsOrigins: parsed.CORS_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
}

export function hasValidAeroDataBoxKey(key: string | undefined): boolean {
  if (!key) return false;
  const value = key.trim();
  return (
    value.length >= 16 &&
    !value.startsWith("DEFAULT_") &&
    !["null", "YOUR_AERODATABOX_KEY", "REPLACE_WITH_YOUR_KEY"].includes(value)
  );
}
