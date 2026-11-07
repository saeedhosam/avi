/**
 * Domain types for Avi web.
 *
 * The console `Flight` contract (and its dependent airport/telemetry shapes)
 * is the *shared* `@avi/contracts` type set, re-exported here so every page
 * and component keeps importing from `@/lib/types`. Web-only surfaces stay in
 * this file.
 */
import type {
  Airport,
  AircraftInfo,
  AirportNode,
  Flight,
  FlightStatus,
  FlightTelemetry,
  FlightTimelineEvent,
  AirportWeather,
  RouteRegion,
  Waypoint,
} from "@avi/contracts";

export type {
  FlightStatus,
  AirportWeather,
  Airport,
  AircraftInfo,
  Waypoint,
  FlightTelemetry,
  FlightTimelineEvent,
  Flight,
  RouteRegion,
  AirportNode,
};

export type AlertType =
  | "GATE_CHANGE"
  | "DELAY"
  | "BOARDING"
  | "CANCELLATION"
  | "BAGGAGE";

export type ThemeMode = "SYSTEM" | "LIGHT" | "DARK";

export interface FlightAlert {
  id: string;
  flightNumber: string;
  flightDate?: string;
  type: AlertType;
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
}

export interface RecentSearch {
  flightNumber: string;
  flightDate?: string;
  airline: string;
  originCode: string;
  originCity: string;
  destCode: string;
  destCity: string;
  status: FlightStatus;
  searchTimestamp: number;
}

export interface UserAccount {
  name: string;
  email: string;
  avatarInitial: string;
  photoUrl?: string | null;
  isSignedIn: boolean;
  isOfflineMode: boolean;
  lastSyncTime: string;
  uid?: string | null;
  provider?: string;
}

export interface OperatingCarrierRoute {
  airlineCode: string;
  airlineName: string;
  flightNumbers: string[];
  dailyFrequencies: number;
  aircraftTypes: string[];
}

export interface DirectFlightConnection {
  id: string;
  origin: AirportNode;
  destination: AirportNode;
  distanceKm: number;
  distanceNm: number;
  estimatedDurationMinutes: number;
  durationFormatted: string;
  haulCategory: HaulCategory;
  dailyFlightsCount: number;
  hasDepartures: boolean;
  hasArrivals: boolean;
  operatingCarriers: OperatingCarrierRoute[];
  isLiveVerified: boolean;
}

export interface AirlineFilterChipItem {
  code: string;
  name: string;
  destinationCount: number;
}

export interface AirportRouteNetworkSummary {
  originAirport: AirportNode | null;
  connections: DirectFlightConnection[];
  totalDirectDestinations: number;
  totalCountriesServed: number;
  totalOperatingAirlines: number;
  totalDailyFlights: number;
  availableAirlines: AirlineFilterChipItem[];
}

export type FlightCategory = "VFR" | "MVFR" | "IFR";

export interface RealtimeAirportWeather {
  tempC: number;
  tempF: number;
  condition: string;
  wind: string;
  visibility: string;
  humidity: number;
  pressureInHg: number;
  metarRaw: string;
  flightCategory: FlightCategory;
}

export interface RealtimeAirportInfo {
  code: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  region: string;
  timezone: string;
  latitude: number;
  longitude: number;
  elevationFeet: number;
  operationalStatus: string;
  isDelayed: boolean;
  delayMinutes: number;
  delayReason: string | null;
  onTimePercentage: number;
  activeDeparturesCount: number;
  activeArrivalsCount: number;
  activeRunways: string[];
  terminalCount: number;
  weather: RealtimeAirportWeather;
  hubAirlines: string[];
}

export interface HourlyForecast {
  time: string;
  tempC: number;
  tempF: number;
  condition: string;
  precipProbabilityPercent: number;
  windSpeedKnots: number;
  isArrivalTarget: boolean;
}

export interface DailyForecast {
  dayName: string;
  dateString: string;
  tempHighC: number;
  tempHighF: number;
  tempLowC: number;
  tempLowF: number;
  condition: string;
  precipProbabilityPercent: number;
  packingTip: string;
}

export interface ArrivalAviationAdvisory {
  flightCategory: string;
  crosswindKnots: number;
  crosswindRisk: string;
  runwayVisualRange: string;
  arrivalNotice: string;
}

export interface DestinationArrivalForecast {
  airportCode: string;
  airportName: string;
  airportCity: string;
  arrivalTime: string;
  arrivalTempC: number;
  arrivalTempF: number;
  arrivalCondition: string;
  precipitationChance: number;
  windCondition: string;
  visibility: string;
  humidity: number;
  hourlyForecast: HourlyForecast[];
  dailyForecast: DailyForecast[];
  advisory: ArrivalAviationAdvisory;
  packingAdvice: string;
  lastUpdated: number;
  /** True when the forecast is a model-less estimate, not live Open-Meteo data. */
  isEstimated?: boolean;
}

export type AmenityCategory =
  | "ALL"
  | "GATE"
  | "LOUNGE"
  | "SECURITY"
  | "DINING"
  | "SHOPPING"
  | "RESTROOM"
  | "TRANSIT";

export interface PointF {
  x: number;
  y: number;
}

export interface TerminalAmenity {
  id: string;
  name: string;
  category: AmenityCategory;
  airportCode: string;
  terminal: string;
  concourse: string;
  level: number;
  locationDescription: string;
  position: PointF;
  gateNumber: string | null;
  openingHours: string;
  accessInfo: string | null;
  waitTimeMinutes: number | null;
  walkTimeFromSecurityMinutes: number;
  walkDistanceMeters: number;
  rating: number | null;
  assignedFlightNumber: string | null;
  features: string[];
}

export interface ConcourseSection {
  id: string;
  name: string;
  start: PointF;
  end: PointF;
  width: number;
  gatesRange: string;
}

export interface ConcourseFloor {
  level: number;
  levelName: string;
  description: string;
  concourseSections: ConcourseSection[];
  centralHubCenter: PointF;
  securityPosition: PointF;
  entrancePosition: PointF;
}

export interface AirportTerminalLayout {
  airportCode: string;
  airportName: string;
  city: string;
  terminalId: string;
  terminalName: string;
  availableLevels: number[];
  floors: Record<string, ConcourseFloor>;
  amenities: TerminalAmenity[];
}

export type HaulCategory = "ALL" | "SHORT_HAUL" | "MEDIUM_HAUL" | "LONG_HAUL";

export type ConnectionDirection = "ALL" | "DEPARTURES" | "ARRIVALS";

export interface RouteSpec {
  origin: string;
  destination: string;
  dailyFlights: number;
  carriers: OperatingCarrierRoute[];
}

export type CabinClass = "FIRST" | "BUSINESS" | "PREMIUM_ECONOMY" | "ECONOMY";

export type SeatFeature =
  | "EXTRA_LEGROOM"
  | "LIE_FLAT"
  | "DIRECT_AISLE"
  | "POWER_OUTLET"
  | "USB_C"
  | "BASSINET"
  | "EXIT_ROW"
  | "WING_VIEW"
  | "QUIET_ZONE"
  | "LIMITED_RECLINE";

export interface SeatInfo {
  id: string; // e.g. "12A"
  row: number;
  letter: string;
  cabin: CabinClass;
  isWindow: boolean;
  isAisle: boolean;
  isMiddle: boolean;
  isExitRow?: boolean;
  isBulkhead?: boolean;
  status: "AVAILABLE" | "OCCUPIED" | "SELECTED" | "BLOCKED";
  pitchInches: number;
  widthInches: number;
  reclineInches: number;
  features: SeatFeature[];
  review?: {
    rating: "GOOD" | "STANDARD" | "CAUTION";
    notes: string;
  };
}

export interface AircraftCabinSpec {
  id: string;
  airlineCode: string;
  airlineName: string;
  aircraftModel: string;
  manufacturer: "Airbus" | "Boeing";
  tailNumberSample: string;
  totalSeats: number;
  wingsRowRange: [number, number];
  exitRows: number[];
  cabins: {
    name: string;
    classType: CabinClass;
    rowStart: number;
    rowEnd: number;
    layout: string;
    aislesAfterLetters: string[];
    letters: string[];
    pitchInches: number;
    widthInches: number;
  }[];
  amenities: {
    wifi: string;
    power: string;
    ife: string;
    usb: string;
    overheadBins: string;
  };
  rows: {
    rowNumber: number;
    cabin: CabinClass;
    isExitRow?: boolean;
    isBulkhead?: boolean;
    hasLavatoryBehind?: boolean;
    hasGalleyAhead?: boolean;
    seats: SeatInfo[];
  }[];
}
