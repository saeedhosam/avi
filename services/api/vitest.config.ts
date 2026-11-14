import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Billing/webhook tests build a full Fastify app and sign payloads; under a
    // parallel turbo run they can exceed the default 5 s budget.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
