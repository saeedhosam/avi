export type FlightStatus =
  | "SCHEDULED"
  | "BOARDING"
  | "DEPARTED"
  | "DELAYED"
  | "LANDED"
  | "CANCELLED";

export interface FlightEndpoint {
  code: string;
  name: string;
  city: string;
  country: string;
  timezone: string;
  latitude: number;
  longitude: number;
}

export interface FlightTelemetry {
  hasLiveLocation: boolean;
  latitude: number;
  longitude: number;
  altitudeFeet: number;
  groundSpeedKnots: number;
  headingDegrees: number;
  updatedAt: string | null;
}

export interface FlightSummary {
  id: string;
  flightNumber: string;
  airline: string;
  airlineCode: string;
  status: FlightStatus;
  statusReported: boolean;
  statusRaw: string;
  statusNote: string;
  origin: FlightEndpoint;
  destination: FlightEndpoint;
  scheduledDeparture: string;
  estimatedDeparture: string;
  scheduledArrival: string;
  estimatedArrival: string;
  terminalDeparture: string;
  gateDeparture: string;
  terminalArrival: string;
  gateArrival: string;
  baggageCarousel: string;
  aircraft: {
    model: string;
    registration: string;
  };
  delayMinutes: number;
  delayReported: boolean;
  delaySource: "provider" | "derived" | "unknown";
  telemetry: FlightTelemetry;
  source: "aerodatabox";
  updatedAt: string;
}

export interface ProviderMeta {
  source: "live" | "cached" | "not_configured" | "quota_fallback";
  fetchedAt: string;
  cached: boolean;
  /** True when a cached response is past its fresh window. */
  stale?: boolean;
  /** Age of the cached payload in whole seconds. */
  cacheAgeSeconds?: number;
  attribution: string;
}

export interface FlightSearchResult {
  flights: FlightSummary[];
  meta: ProviderMeta;
}
