import "dotenv/config";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";

/**
 * Dedicated watch-engine worker.
 *
 * Builds the same app as the HTTP gateway but with `WATCH_ENGINE_ENABLED=true`
 * exposed only on an internal port. Running it separately keeps provider
 * polling, push fan-out, snapshot writes, and unit budgeting on a stable,
 * restart-safe process so flaky web traffic can't stall alert delivery.
 *
 * `WATCH_ENGINE_ENABLED=false` on `avi-api` (compose env override) keeps the
 * HTTP gateway engine-free, so exactly one container drives the poll ladder.
 */
const config = loadConfig({
  ...process.env,
  WATCH_ENGINE_ENABLED: "true",
});
const app = await buildApp(config);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "engine worker shutting down");
  await app.close();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

const listenPort = Number(process.env.ENGINE_PORT ?? 8090);
try {
  await app.listen({ host: "0.0.0.0", port: listenPort });
  app.log.info(
    {
      port: listenPort,
      tickMs: config.WATCH_ENGINE_TICK_MS,
      sweepsPerTick: config.WATCH_ENGINE_SWEEPS_PER_TICK,
      budget: config.UNIT_BUDGET_PER_MONTH,
    },
    "avi watch engine worker ready",
  );
} catch (error) {
  app.log.fatal({ err: error }, "avi watch engine worker failed to start");
  process.exit(1);
}
