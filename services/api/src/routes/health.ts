import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

const healthResponse = z.object({
  status: z.literal("ok"),
  service: z.literal("avi-api"),
  version: z.string(),
  uptimeSeconds: z.number(),
  timestamp: z.string(),
});

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/healthz",
    {
      schema: {
        tags: ["system"],
        summary: "Liveness probe",
        response: { 200: healthResponse },
      },
    },
    async () => ({
      status: "ok" as const,
      service: "avi-api" as const,
      version: process.env.npm_package_version ?? "0.1.0",
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    }),
  );
};
