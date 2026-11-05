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
