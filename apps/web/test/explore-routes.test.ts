import { describe, expect, it } from "vitest";
import {
  gatewayRoutesUrl,
  parseGatewayRoutesPayload,
} from "../src/lib/explore-routes";

const airport = (iata: string, city: string) => ({
  iata,
  icao: `H${iata}`,
  name: `${city} International`,
  city,
  country: "EG",
  region: "MENA" as const,
  latitude: 30.1,
  longitude: 31.4,
  timezone: "Africa/Cairo",
  hubAirlines: [],
});

const validPayload = {
  mode: "LIVE",
  routes: [
    {
      id: "CAI-JED",
      origin: airport("CAI", "Cairo"),
      destination: airport("JED", "Jeddah"),
      distanceKm: 1215.7,
      distanceNm: 656.4,
      estimatedDurationMinutes: 120,
      durationFormatted: "2h 00m",
      durationEstimated: true,
      haulCategory: "SHORT_HAUL" as const,
      dailyFlightsCount: 4.5,
      hasDepartures: true,
      hasArrivals: true,
      operatingCarriers: [
        {
          airlineCode: "MS",
          airlineName: "EgyptAir",
          flightNumbers: [],
          dailyFrequencies: null,
          aircraftTypes: [],
        },
      ],
      isLiveVerified: true,
      dataSource: "AERODATABOX" as const,
    },
  ],
  provenance: {
    source: "AERODATABOX" as const,
    attribution: "AeroDataBox",
    fetchedAt: "2026-11-14T10:00:00.000Z",
    cached: true,
    stale: false,
    cacheAgeSeconds: 30,
    ttlSeconds: 604_800,
  },
};

describe("explore route helpers", () => {
  describe("gatewayRoutesUrl", () => {
    it("normalises the base URL and airport code", () => {
      expect(gatewayRoutesUrl(" https://api.example.com/// ", " cai ")).toBe(
        "https://api.example.com/api/gateway/airports/CAI/routes",
      );
    });
  });

  describe("parseGatewayRoutesPayload", () => {
    it("accepts a schema-valid gateway route network", () => {
      const routes = parseGatewayRoutesPayload(validPayload);
      expect(routes).toHaveLength(1);
      expect(routes?.[0]?.id).toBe("CAI-JED");
      expect(routes?.[0]?.operatingCarriers[0]?.airlineCode).toBe("MS");
    });

    it("accepts a valid empty network as a reported result", () => {
      expect(
        parseGatewayRoutesPayload({ ...validPayload, routes: [] }),
      ).toEqual([]);
    });

    it("rejects missing, error, and malformed payloads", () => {
      expect(parseGatewayRoutesPayload(null)).toBeNull();
      expect(parseGatewayRoutesPayload({})).toBeNull();
      expect(
        parseGatewayRoutesPayload({ error: "gateway_unreachable" }),
      ).toBeNull();
      expect(
        parseGatewayRoutesPayload({ ...validPayload, routes: [{}] }),
      ).toBeNull();
      expect(
        parseGatewayRoutesPayload({
          ...validPayload,
          provenance: { ...validPayload.provenance, source: "STATIC" },
        }),
      ).toBeNull();
    });
  });
});
