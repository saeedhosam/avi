import { z } from "zod";

export const flightStatusSchema = z.enum([
  "SCHEDULED",
  "BOARDING",
  "DEPARTED",
  "DELAYED",
  "LANDED",
  "CANCELLED",
]);

export const flightEndpointSchema = z.object({
  code: z.string(),
  name: z.string(),
  city: z.string(),
  country: z.string(),
  timezone: z.string(),
  latitude: z.number(),
  longitude: z.number(),
});

export const flightTelemetrySchema = z.object({
  hasLiveLocation: z.boolean(),
  latitude: z.number(),
  longitude: z.number(),
  altitudeFeet: z.number(),
  groundSpeedKnots: z.number(),
  headingDegrees: z.number(),
  updatedAt: z.string().nullable(),
});

export const flightSummarySchema = z.object({
  id: z.string(),
  flightNumber: z.string(),
  airline: z.string(),
  airlineCode: z.string(),
  status: flightStatusSchema,
  statusNote: z.string(),
  origin: flightEndpointSchema,
  destination: flightEndpointSchema,
  scheduledDeparture: z.string(),
  estimatedDeparture: z.string(),
  scheduledArrival: z.string(),
  estimatedArrival: z.string(),
  terminalDeparture: z.string(),
  gateDeparture: z.string(),
  terminalArrival: z.string(),
  gateArrival: z.string(),
  baggageCarousel: z.string(),
  aircraft: z.object({
    model: z.string(),
    registration: z.string(),
  }),
  delayMinutes: z.number(),
  telemetry: flightTelemetrySchema,
  source: z.literal("aerodatabox"),
  updatedAt: z.string(),
});

export const providerMetaSchema = z.object({
  source: z.enum(["live", "cached", "not_configured", "quota_fallback"]),
  fetchedAt: z.string(),
  cached: z.boolean(),
  attribution: z.string(),
});

export const flightSearchResponseSchema = z.object({
  flights: z.array(flightSummarySchema),
  meta: providerMetaSchema,
});

export const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});
