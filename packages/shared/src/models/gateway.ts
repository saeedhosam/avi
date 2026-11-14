import { z } from "zod";
import {
  aircraftCabinLayoutSchema,
  type AircraftCabinLayout,
} from "./cabin.js";
import {
  terminalSpatialGraphSchema,
  type TerminalSpatialGraph,
} from "./terminalMap.js";
import {
  flightSchema,
  type AircraftInfo,
  type Airport,
  type AirportWeather,
  type Flight,
  type FlightStatus,
  type FlightTelemetry,
  type FlightTimelineEvent,
} from "./flight.js";
import {
  directFlightConnectionSchema,
  type AirportNode,
  type DirectFlightConnection,
  type OperatingCarrierRoute,
  type RouteRegion,
} from "./routeConnection.js";

// ── Gateway envelope / provenance ────────────────────────────────────────────

export interface GatewayProvenance {
  source: "AERODATABOX" | "OPEN_METEO" | "CACHE" | "SUPABASE";
  attribution: string;
  fetchedAt: string;
  cached: boolean;
  stale: boolean;
  cacheAgeSeconds: number;
  ttlSeconds: number;
}

export const gatewayProvenanceSchema: z.ZodType<GatewayProvenance> = z.object({
  source: z.enum(["AERODATABOX", "OPEN_METEO", "CACHE", "SUPABASE"]),
  attribution: z.string(),
  fetchedAt: z.string(),
  cached: z.boolean(),
  stale: z.boolean(),
  cacheAgeSeconds: z.number().nonnegative(),
  ttlSeconds: z.number().nonnegative(),
});

export interface GatewayError {
  error: string;
  message: string;
  retryAfterSeconds?: number;
}

export const gatewayErrorSchema: z.ZodType<GatewayError> = z.object({
  error: z.string(),
  message: z.string(),
  retryAfterSeconds: z.number().positive().optional(),
});

// ── AeroDataBox console DTOs (same JSON consumed by the previous clients) ────

export interface ConsoleAirportWeatherDto {
  tempC: number;
  tempF: number;
  condition: string;
  wind: string;
  visibility: string;
  humidity: number;
}

export const consoleAirportWeatherDtoSchema: z.ZodType<ConsoleAirportWeatherDto> =
  z.object({
    tempC: z.number(),
    tempF: z.number(),
    condition: z.string(),
    wind: z.string(),
    visibility: z.string(),
    humidity: z.number(),
  });

export interface ConsoleAirportDto {
  code: string;
  name: string;
  city: string;
  country: string;
  timezone: string;
  latitude: number;
  longitude: number;
  weather: ConsoleAirportWeatherDto | null;
  weatherReported: boolean;
}

export const consoleAirportDtoSchema: z.ZodType<ConsoleAirportDto> = z.object({
  code: z.string(),
  name: z.string(),
  city: z.string(),
  country: z.string(),
  timezone: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  weather: consoleAirportWeatherDtoSchema.nullable(),
  weatherReported: z.boolean(),
});

export interface ConsoleAircraftDto {
  model: string;
  registration: string;
  age: string | null;
  wifiAvailable: boolean | null;
  powerOutlets: boolean | null;
  seatLayout: string | null;
}

export const consoleAircraftDtoSchema: z.ZodType<ConsoleAircraftDto> = z.object({
  model: z.string(),
  registration: z.string(),
  age: z.string().nullable(),
  wifiAvailable: z.boolean().nullable(),
  powerOutlets: z.boolean().nullable(),
  seatLayout: z.string().nullable(),
});

export interface ConsoleTelemetryDto {
  hasLiveLocation: boolean;
  currentLatitude: number;
  currentLongitude: number;
  altitudeFeet: number;
  groundSpeedKnots: number;
  headingDegrees: number;
  verticalSpeedFpm: number;
  mach: number;
  progressPercent: number;
  distanceCoveredNm: number;
  distanceRemainingNm: number;
  etaMinutesRemaining: number;
}

export const consoleTelemetryDtoSchema: z.ZodType<ConsoleTelemetryDto> =
  z.object({
    hasLiveLocation: z.boolean(),
    currentLatitude: z.number(),
    currentLongitude: z.number(),
    altitudeFeet: z.number(),
    groundSpeedKnots: z.number(),
    headingDegrees: z.number(),
    verticalSpeedFpm: z.number(),
    mach: z.number(),
    progressPercent: z.number(),
    distanceCoveredNm: z.number(),
    distanceRemainingNm: z.number(),
    etaMinutesRemaining: z.number(),
  });

export interface ConsoleTimelineDto {
  title: string;
  time: string;
  isCompleted: boolean;
  isCurrent: boolean;
  description: string;
}

export const consoleTimelineDtoSchema: z.ZodType<ConsoleTimelineDto> = z.object({
  title: z.string(),
  time: z.string(),
  isCompleted: z.boolean(),
  isCurrent: z.boolean(),
  description: z.string(),
});

export interface ConsoleFlightDto {
  id: string;
  flightDate: string | null;
  flightNumber: string;
  airline: string;
  airlineCode: string;
  origin: ConsoleAirportDto | null;
  destination: ConsoleAirportDto | null;
  departureTimeScheduled: string;
  departureTimeEstimated: string;
  departureTimeActual: string | null;
  arrivalTimeScheduled: string;
  arrivalTimeEstimated: string;
  arrivalTimeActual: string | null;
  status: string;
  statusReported: boolean;
  statusRaw: string;
  statusNote: string;
  delayMinutes: number;
  delayReported: boolean;
  delaySource: string;
  delayReason: string | null;
  terminalDeparture: string;
  gateDeparture: string;
  checkInCounter: string;
  terminalArrival: string;
  gateArrival: string;
  baggageCarousel: string;
  aircraft: ConsoleAircraftDto | null;
  telemetry: ConsoleTelemetryDto | null;
  timeline: ConsoleTimelineDto[];
  customNotes: string;
  source: string | null;
  fetchedAt: string | null;
}

export const consoleFlightDtoSchema: z.ZodType<ConsoleFlightDto> = z.object({
  id: z.string(),
  flightDate: z.string().nullable(),
  flightNumber: z.string(),
  airline: z.string(),
  airlineCode: z.string(),
  origin: consoleAirportDtoSchema.nullable(),
  destination: consoleAirportDtoSchema.nullable(),
  departureTimeScheduled: z.string(),
  departureTimeEstimated: z.string(),
  departureTimeActual: z.string().nullable(),
  arrivalTimeScheduled: z.string(),
  arrivalTimeEstimated: z.string(),
  arrivalTimeActual: z.string().nullable(),
  status: z.string(),
  statusReported: z.boolean(),
  statusRaw: z.string(),
  statusNote: z.string(),
  delayMinutes: z.number(),
  delayReported: z.boolean(),
  delaySource: z.string(),
  delayReason: z.string().nullable(),
  terminalDeparture: z.string(),
  gateDeparture: z.string(),
  checkInCounter: z.string(),
  terminalArrival: z.string(),
  gateArrival: z.string(),
  baggageCarousel: z.string(),
  aircraft: consoleAircraftDtoSchema.nullable(),
  telemetry: consoleTelemetryDtoSchema.nullable(),
  timeline: z.array(consoleTimelineDtoSchema),
  customNotes: z.string(),
  source: z.string().nullable(),
  fetchedAt: z.string().nullable(),
});

export interface ConsoleAirportNode {
  iata: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  region: string;
  latitude: number;
  longitude: number;
  timezone: string;
  hubAirlines: string[];
}

export const consoleAirportNodeSchema: z.ZodType<ConsoleAirportNode> = z.object({
  iata: z.string(),
  icao: z.string(),
  name: z.string(),
  city: z.string(),
  country: z.string(),
  region: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string(),
  hubAirlines: z.array(z.string()),
});

export interface ConsoleRouteOperator {
  code: string;
  name: string;
}

export const consoleRouteOperatorSchema: z.ZodType<ConsoleRouteOperator> =
  z.object({ code: z.string(), name: z.string() });

export interface ConsoleRouteStat {
  destination: string;
  destinationName: string | null;
  city: string | null;
  country: string | null;
  icao: string | null;
  timezone: string | null;
  latitude: number;
  longitude: number;
  dailyFlights: number | null;
  operators: ConsoleRouteOperator[];
}

export const consoleRouteStatSchema: z.ZodType<ConsoleRouteStat> = z.object({
  destination: z.string(),
  destinationName: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  icao: z.string().nullable(),
  timezone: z.string().nullable(),
  latitude: z.number(),
  longitude: z.number(),
  dailyFlights: z.number().nullable(),
  operators: z.array(consoleRouteOperatorSchema),
});

// ── Gateway responses ────────────────────────────────────────────────────────

export interface GatewayFlightsResponse {
  mode: string;
  flights: Flight[];
  provenance: GatewayProvenance;
}

export const gatewayFlightsResponseSchema: z.ZodType<GatewayFlightsResponse> =
  z.object({
    mode: z.string(),
    flights: z.array(flightSchema),
    provenance: gatewayProvenanceSchema,
  });

export interface GatewayRoutesResponse {
  mode: string;
  routes: DirectFlightConnection[];
  provenance: GatewayProvenance;
}

export const gatewayRoutesResponseSchema: z.ZodType<GatewayRoutesResponse> =
  z.object({
    mode: z.string(),
    routes: z.array(directFlightConnectionSchema),
    provenance: gatewayProvenanceSchema,
  });

export interface GatewayBoardFlight {
  flight: Flight;
  direction: "DEPARTURE" | "ARRIVAL";
}

export interface GatewayBoardWeather {
  code: string;
  source: "OPEN_METEO";
  tempC: number;
  condition: string;
  wind: string;
  humidity: number;
  fetchedAt: string;
}

export const gatewayBoardWeatherSchema: z.ZodType<GatewayBoardWeather> =
  z.object({
    code: z.string().length(3),
    source: z.literal("OPEN_METEO"),
    tempC: z.number(),
    condition: z.string(),
    wind: z.string(),
    humidity: z.number(),
    fetchedAt: z.string(),
  });

export interface GatewayBoardResponse {
  mode: string;
  airportCode: string;
  flights: GatewayBoardFlight[];
  weather: GatewayBoardWeather | null;
  provenance: GatewayProvenance;
}

export const gatewayBoardResponseSchema: z.ZodType<GatewayBoardResponse> =
  z.object({
    mode: z.string(),
    airportCode: z.string().length(3),
    flights: z.array(
      z.object({
        flight: flightSchema,
        direction: z.enum(["DEPARTURE", "ARRIVAL"]),
      }),
    ),
    weather: gatewayBoardWeatherSchema.nullable(),
    provenance: gatewayProvenanceSchema,
  });

export interface GatewayAircraftCabinSummary {
  registration: string;
  icaoCode: string | null;
  iataType: string | null;
  model: string | null;
  numSeats: number | null;
  ageYears: number | null;
  cabinLayoutKey: string | null;
  cabinLayoutCached: boolean;
}

export interface GatewayAircraftResponse {
  aircraft: GatewayAircraftCabinSummary;
  /** Resolved parametric/cached cabin layout, when an airframe type is known. */
  layout: AircraftCabinLayout | null;
  provenance: GatewayProvenance;
}

export interface GatewayTerminalGraphResponse {
  airportCode: string;
  terminalId: string;
  graph: TerminalSpatialGraph;
  source: "osm_indoor" | "curated" | "parametric";
  fetchedAt: string;
}

export const gatewayTerminalGraphResponseSchema: z.ZodType<GatewayTerminalGraphResponse> =
  z.object({
    airportCode: z.string().length(3),
    terminalId: z.string(),
    graph: terminalSpatialGraphSchema,
    source: z.enum(["osm_indoor", "curated", "parametric"]),
    fetchedAt: z.string(),
  });

export const gatewayAircraftResponseSchema: z.ZodType<GatewayAircraftResponse> =
  z.object({
    aircraft: z.object({
      registration: z.string(),
      icaoCode: z.string().nullable(),
      iataType: z.string().nullable(),
      model: z.string().nullable(),
      numSeats: z.number().nullable(),
      ageYears: z.number().nullable(),
      cabinLayoutKey: z.string().nullable(),
      cabinLayoutCached: z.boolean(),
    }),
    layout: aircraftCabinLayoutSchema.nullable(),
    provenance: gatewayProvenanceSchema,
  });

// ── Console DTO -> domain mappers ────────────────────────────────────────────

export function mapConsoleStatus(raw: string): FlightStatus {
  const value = raw.trim().toUpperCase();
  if (
    value === "SCHEDULED" ||
    value === "BOARDING" ||
    value === "DEPARTED" ||
    value === "DELAYED" ||
    value === "LANDED" ||
    value === "CANCELLED"
  ) {
    return value;
  }
  return "SCHEDULED";
}

function normalizeNullableText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function consoleAirportDtoToDomainAirport(
  dto: ConsoleAirportDto,
): Airport {
  const weather: AirportWeather = {
    tempC: dto.weather?.tempC ?? 0,
    tempF: dto.weather?.tempF ?? 32,
    condition: dto.weather?.condition ?? "",
    wind: dto.weather?.wind ?? "",
    visibility: dto.weather?.visibility ?? "",
    humidity: dto.weather?.humidity ?? 0,
  };
  return {
    code: dto.code.trim().toUpperCase(),
    name: dto.name.trim() || dto.code.trim().toUpperCase(),
    city: dto.city,
    country: dto.country,
    timezone: dto.timezone,
    latitude: dto.latitude,
    longitude: dto.longitude,
    weather,
    weatherReported: dto.weatherReported && dto.weather != null,
  };
}

export function consoleAircraftDtoToDomainAircraft(
  dto: ConsoleAircraftDto | null,
): AircraftInfo {
  return {
    model: normalizeNullableText(dto?.model) ?? "Not reported",
    registration: normalizeNullableText(dto?.registration) ?? "Not reported",
    age: normalizeNullableText(dto?.age),
    wifiAvailable: dto?.wifiAvailable ?? null,
    powerOutlets: dto?.powerOutlets ?? null,
    seatLayout: normalizeNullableText(dto?.seatLayout),
  };
}

export function consoleTelemetryDtoToDomainTelemetry(
  dto: ConsoleTelemetryDto | null,
): FlightTelemetry {
  return {
    hasLiveLocation: dto?.hasLiveLocation ?? false,
    currentLatitude: dto?.currentLatitude ?? 0,
    currentLongitude: dto?.currentLongitude ?? 0,
    altitudeFeet: dto?.altitudeFeet ?? 0,
    groundSpeedKnots: dto?.groundSpeedKnots ?? 0,
    headingDegrees: dto?.headingDegrees ?? 0,
    verticalSpeedFpm: dto?.verticalSpeedFpm ?? 0,
    mach: dto?.mach ?? 0,
    progressPercent: dto?.progressPercent ?? 0,
    distanceCoveredNm: dto?.distanceCoveredNm ?? 0,
    distanceRemainingNm: dto?.distanceRemainingNm ?? 0,
    etaMinutesRemaining: dto?.etaMinutesRemaining ?? 0,
    waypoints: [],
  };
}

export function consoleTimelineDtoToDomainTimeline(
  dto: ConsoleTimelineDto,
): FlightTimelineEvent {
  return {
    title: dto.title,
    time: dto.time,
    isCompleted: dto.isCompleted,
    isCurrent: dto.isCurrent,
    description: dto.description,
  };
}

/** Returns null when either endpoint is missing: an unplotable flight is not trackable. */
export function consoleFlightDtoToDomainFlight(
  dto: ConsoleFlightDto,
): Flight | null {
  if (!dto.origin || !dto.destination) return null;
  const delaySource =
    dto.delaySource === "provider" || dto.delaySource === "derived"
      ? dto.delaySource
      : "unknown";
  return {
    id: dto.id.trim() || dto.flightNumber.replace(/\s+/g, "").toUpperCase(),
    flightDate: dto.flightDate ?? undefined,
    flightNumber: dto.flightNumber,
    airline: dto.airline,
    airlineCode: dto.airlineCode,
    origin: consoleAirportDtoToDomainAirport(dto.origin),
    destination: consoleAirportDtoToDomainAirport(dto.destination),
    departureTimeScheduled: dto.departureTimeScheduled,
    departureTimeEstimated: dto.departureTimeEstimated,
    departureTimeActual: dto.departureTimeActual,
    arrivalTimeScheduled: dto.arrivalTimeScheduled,
    arrivalTimeEstimated: dto.arrivalTimeEstimated,
    arrivalTimeActual: dto.arrivalTimeActual,
    status: mapConsoleStatus(dto.status),
    statusReported: dto.statusReported,
    statusRaw: dto.statusRaw,
    statusNote: dto.statusNote,
    delayMinutes: dto.delayMinutes,
    delayReported: dto.delayReported,
    delaySource,
    delayReason: dto.delayReason,
    terminalDeparture: dto.terminalDeparture,
    gateDeparture: dto.gateDeparture,
    checkInCounter: dto.checkInCounter,
    terminalArrival: dto.terminalArrival,
    gateArrival: dto.gateArrival,
    baggageCarousel: dto.baggageCarousel,
    aircraft: consoleAircraftDtoToDomainAircraft(dto.aircraft),
    telemetry: consoleTelemetryDtoToDomainTelemetry(dto.telemetry),
    timeline: dto.timeline.map(consoleTimelineDtoToDomainTimeline),
    isWatchlisted: false,
    customNotes: dto.customNotes,
    source: dto.source ?? undefined,
    fetchedAt: dto.fetchedAt ?? undefined,
  };
}

export function consoleAirportNodeToRouteNode(
  node: ConsoleAirportNode,
): AirportNode {
  const allowed: RouteRegion[] = [
    "ALL",
    "MENA",
    "EUROPE",
    "AFRICA",
    "ASIA_PACIFIC",
    "AMERICAS",
  ];
  const region = allowed.includes(node.region as RouteRegion)
    ? (node.region as RouteRegion)
    : "ALL";
  return {
    iata: node.iata.toUpperCase(),
    icao: node.icao,
    name: node.name,
    city: node.city,
    country: node.country,
    region,
    latitude: node.latitude,
    longitude: node.longitude,
    timezone: node.timezone,
    hubAirlines: node.hubAirlines,
  };
}

export function consoleRouteOperatorsToDomain(
  operators: ConsoleRouteOperator[],
): OperatingCarrierRoute[] {
  return operators
    .filter((operator) => operator.code || operator.name)
    .map((operator) => ({
      airlineCode: operator.code.toUpperCase(),
      airlineName: operator.name || operator.code,
      flightNumbers: [],
      dailyFrequencies: null,
      aircraftTypes: [],
    }));
}
