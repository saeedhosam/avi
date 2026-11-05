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
  telemetry: FlightTelemetry;
  source: "aerodatabox";
  updatedAt: string;
}

export interface ProviderMeta {
  source: "live" | "cached" | "not_configured" | "quota_fallback";
  fetchedAt: string;
  cached: boolean;
  attribution: string;
}

export interface FlightSearchResult {
  flights: FlightSummary[];
  meta: ProviderMeta;
}
