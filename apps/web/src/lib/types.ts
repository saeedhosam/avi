export type FlightStatus =
  | "SCHEDULED"
  | "BOARDING"
  | "DEPARTED"
  | "DELAYED"
  | "LANDED"
  | "CANCELLED";

export type AlertType =
  | "GATE_CHANGE"
  | "DELAY"
  | "BOARDING"
  | "CANCELLATION"
  | "BAGGAGE";

export type ThemeMode = "SYSTEM" | "LIGHT" | "DARK";

export interface AirportWeather {
  tempC: number;
  tempF: number;
  condition: string;
  wind: string;
  visibility: string;
  humidity: number;
}

export interface Airport {
  code: string;
  name: string;
  city: string;
  country: string;
  timezone: string;
  latitude: number;
  longitude: number;
  weather: AirportWeather;
}

export interface AircraftInfo {
  model: string;
  registration: string;
  age: string;
  wifiAvailable: boolean;
  powerOutlets: boolean;
  seatLayout: string;
}

export interface Waypoint {
  name: string;
  latitude: number;
  longitude: number;
  altitudeFeet: number;
}

export interface FlightTelemetry {
  hasLiveLocation?: boolean;
  locationUpdatedAt?: number;
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
  waypoints: Waypoint[];
}

export interface FlightTimelineEvent {
  title: string;
  time: string;
  isCompleted: boolean;
  isCurrent: boolean;
  description: string;
}

export interface Flight {
  id: string;
  /** Departure date in the flight's local timezone as ISO YYYY-MM-DD, when known. */
  flightDate?: string;
  flightNumber: string;
  airline: string;
  airlineCode: string;
  origin: Airport;
  destination: Airport;
  departureTimeScheduled: string;
  departureTimeEstimated: string;
  departureTimeActual: string | null;
  arrivalTimeScheduled: string;
  arrivalTimeEstimated: string;
  arrivalTimeActual: string | null;
  status: FlightStatus;
  statusNote: string;
  delayMinutes: number;
  delayReason: string | null;
  terminalDeparture: string;
  gateDeparture: string;
  checkInCounter: string;
  terminalArrival: string;
  gateArrival: string;
  baggageCarousel: string;
  aircraft: AircraftInfo;
  telemetry: FlightTelemetry;
  timeline: FlightTimelineEvent[];
  isWatchlisted: boolean;
  customNotes: string;
}

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

export type RouteRegion =
  | "ALL"
  | "MENA"
  | "EUROPE"
  | "AFRICA"
  | "ASIA_PACIFIC"
  | "AMERICAS";

export type HaulCategory = "ALL" | "SHORT_HAUL" | "MEDIUM_HAUL" | "LONG_HAUL";

export type ConnectionDirection = "ALL" | "DEPARTURES" | "ARRIVALS";

export interface AirportNode {
  iata: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  region: RouteRegion;
  latitude: number;
  longitude: number;
  timezone: string;
  hubAirlines: string[];
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

export interface RouteSpec {
  origin: string;
  destination: string;
  dailyFlights: number;
  carriers: OperatingCarrierRoute[];
}
