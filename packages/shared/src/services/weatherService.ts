import type { Airport } from "../models/flight.js";
import type { FlightCategory } from "../models/realtimeAirport.js";
import type {
  DestinationArrivalForecast,
  DailyForecast,
  HourlyForecast,
} from "../models/weatherForecast.js";

// ── Raw Open-Meteo DTOs (free API, no key) ───────────────────────────────────

export interface OpenMeteoCurrentDto {
  time?: string;
  temperature_2m?: number;
  relative_humidity_2m?: number;
  precipitation?: number;
  weather_code?: number;
  wind_speed_10m?: number;
  wind_direction_10m?: number;
  surface_pressure?: number;
  visibility?: number;
}

export interface OpenMeteoHourlyDto {
  time?: string[];
  temperature_2m?: number[];
  precipitation_probability?: number[];
  weather_code?: number[];
  wind_speed_10m?: number[];
}

export interface OpenMeteoDailyDto {
  time?: string[];
  weather_code?: number[];
  temperature_2m_max?: number[];
  temperature_2m_min?: number[];
  precipitation_probability_max?: number[];
}

export interface OpenMeteoResponseDto {
  latitude?: number;
  longitude?: number;
  timezone?: string;
  current?: OpenMeteoCurrentDto;
  hourly?: OpenMeteoHourlyDto;
  daily?: OpenMeteoDailyDto;
}

export class IncompleteOpenMeteoDataError extends Error {
  constructor(message = "Open-Meteo returned an incomplete current observation") {
    super(message);
    this.name = "IncompleteOpenMeteoDataError";
  }
}

// ── Pure code conversions ────────────────────────────────────────────────────

export function mapWmoCodeToCondition(wmoCode: number | undefined | null): string {
  switch (wmoCode ?? 0) {
    case 0:
      return "Clear Sky";
    case 1:
      return "Mainly Clear";
    case 2:
      return "Partly Cloudy";
    case 3:
      return "Overcast";
    case 45:
    case 48:
      return "Fog / Low Visibility";
    case 51:
    case 53:
    case 55:
      return "Light Drizzle";
    case 56:
    case 57:
      return "Freezing Drizzle";
    case 61:
    case 63:
      return "Rain Showers";
    case 65:
    case 82:
      return "Heavy Rain";
    case 66:
    case 67:
      return "Freezing Rain";
    case 71:
    case 73:
    case 75:
    case 77:
    case 85:
    case 86:
      return "Snow / Flurries";
    case 80:
    case 81:
      return "Scattered Showers";
    case 95:
    case 96:
    case 99:
      return "Thunderstorms";
    default:
      return "Fair / Clear";
  }
}

export function determineFlightCategory(
  visibilityMeters: number | undefined,
  wmoCode: number | undefined,
): FlightCategory {
  const visMiles = (visibilityMeters ?? 16_000) / 1609.34;
  const code = wmoCode ?? 0;
  if (
    visMiles < 3 ||
    [45, 48, 65, 95, 96, 99].includes(code)
  ) {
    return "IFR";
  }
  if (
    visMiles < 5 ||
    [51, 53, 55, 61, 63, 71, 73, 80, 81].includes(code)
  ) {
    return "MVFR";
  }
  return "VFR";
}

export function degreesToCardinal(degrees: number | undefined): string {
  const d = (((degrees ?? 270) % 360) + 360) % 360;
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
  const index = Math.round(d / 45) % 8;
  return directions[index] ?? "W";
}

const CELSIUS_TO_FAHRENHEIT = (celsius: number) => Math.round((celsius * 9) / 5 + 32);

function assertCurrent(
  current: OpenMeteoCurrentDto | undefined,
): asserts current is OpenMeteoCurrentDto &
  Required<
    Pick<
      OpenMeteoCurrentDto,
      | "temperature_2m"
      | "relative_humidity_2m"
      | "weather_code"
      | "wind_speed_10m"
      | "wind_direction_10m"
      | "surface_pressure"
      | "visibility"
    >
  > {
  if (
    !current ||
    typeof current.temperature_2m !== "number" ||
    typeof current.relative_humidity_2m !== "number" ||
    typeof current.weather_code !== "number" ||
    typeof current.wind_speed_10m !== "number" ||
    typeof current.wind_direction_10m !== "number" ||
    typeof current.surface_pressure !== "number" ||
    typeof current.visibility !== "number"
  ) {
    throw new IncompleteOpenMeteoDataError();
  }
}

export interface RealtimeWeatherMapping {
  tempC: number;
  tempF: number;
  condition: string;
  wind: string;
  visibility: string;
  humidity: number;
  pressureInHg: number;
  metarRaw: string;
  flightCategory: FlightCategory;
  reported: boolean;
  reportTime?: string;
}

export function mapToRealtimeAirportWeather(
  _icao: string,
  dto: OpenMeteoResponseDto,
): RealtimeWeatherMapping {
  assertCurrent(dto.current);
  const current = dto.current;
  const tempC = Math.round(current.temperature_2m);
  const windKnots = Math.round(current.wind_speed_10m);
  const windDir = degreesToCardinal(current.wind_direction_10m);
  const visMiles = Math.round(current.visibility / 1609.34);
  return {
    tempC,
    tempF: CELSIUS_TO_FAHRENHEIT(tempC),
    condition: mapWmoCodeToCondition(current.weather_code),
    wind: `${windKnots} kt ${windDir}`,
    visibility: visMiles >= 10 ? "10+ mi" : `${Math.max(1, visMiles)} mi`,
    humidity: Math.round(current.relative_humidity_2m),
    pressureInHg:
      Math.round(current.surface_pressure * 0.02953 * 100) / 100,
    // Open-Meteo is a model forecast, not a METAR observation. Never synthesize
    // an observation string.
    metarRaw: "",
    flightCategory: determineFlightCategory(current.visibility, current.weather_code),
    reported: true,
    reportTime: current.time,
  };
}

function parseArrivalHour(value: string): number {
  const iso = value.match(/T(\d{2}):/);
  if (iso) return Math.min(23, Math.max(0, Number(iso[1])));
  const hhmm = value.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) return Math.min(23, Math.max(0, Number(hhmm[1])));
  return 14;
}

function arrivalHourLabel(value: string): string {
  const hhmm = value.match(/(\d{2}:\d{2})/);
  return hhmm?.[1] ?? value;
}

function dayLabels(index: number): string {
  if (index === 0) return "Arrival Day";
  return `Day ${index + 1}`;
}

function packingAdvice(tempC: number, precipitationChance: number): string {
  if (tempC < 10) {
    return `Cold arrival (${tempC}°C). Pack a warm coat and thermal layers.`;
  }
  if (precipitationChance >= 50) {
    return `Rain likely at arrival (${precipitationChance}% chance). Keep an umbrella or raincoat accessible.`;
  }
  if (tempC > 28) {
    return `Warm arrival (${tempC}°C). Light breathable clothing and sunglasses advised.`;
  }
  return `Comfortable arrival conditions (${tempC}°C). Light jacket recommended for airport transit.`;
}

/**
 * Maps Open-Meteo model data to an arrival forecast.
 *
 * Throws `IncompleteOpenMeteoDataError` when the mandatory current block is
 * incomplete. Callers must render "forecast unavailable"; synthesizing values
 * from an airport placeholder is forbidden.
 */
export function mapToDestinationForecast(
  airport: Pick<Airport, "code" | "name" | "city">,
  arrivalTime: string,
  dto: OpenMeteoResponseDto,
): DestinationArrivalForecast {
  assertCurrent(dto.current);
  const current = dto.current;
  const tempC = Math.round(current.temperature_2m);
  const condition = mapWmoCodeToCondition(current.weather_code);
  const windKnots = Math.round(current.wind_speed_10m);
  const windDir = degreesToCardinal(current.wind_direction_10m);
  const visMiles = Math.round(current.visibility / 1609.34);

  const hourlyTimes = dto.hourly?.time ?? [];
  const hourlyTemps = dto.hourly?.temperature_2m ?? [];
  const hourlyPrecip = dto.hourly?.precipitation_probability ?? [];
  const hourlyCodes = dto.hourly?.weather_code ?? [];
  const hourlyWinds = dto.hourly?.wind_speed_10m ?? [];
  const targetHour = parseArrivalHour(arrivalTime);
  const hourlyForecast: HourlyForecast[] = [];

  if (hourlyTimes.length > 0 && hourlyTemps.length === hourlyTimes.length) {
    let startIndex = hourlyTimes.findIndex((time) => {
      const hour = Number(time.slice(11, 13));
      return Number.isFinite(hour) && hour === targetHour;
    });
    if (startIndex < 0) startIndex = 0;
    startIndex = Math.max(0, startIndex - 2);
    const end = Math.min(hourlyTimes.length, startIndex + 7);
    for (let index = startIndex; index < end; index += 1) {
      const temp = hourlyTemps[index];
      const time = hourlyTimes[index];
      if (typeof temp !== "number" || typeof time !== "string") continue;
      const code = hourlyCodes[index];
      const precip = hourlyPrecip[index];
      const wind = hourlyWinds[index];
      hourlyForecast.push({
        time: index === startIndex + 2 ? `${arrivalHourLabel(arrivalTime)} (ETA)` : time.slice(11, 16),
        tempC: Math.round(temp),
        tempF: CELSIUS_TO_FAHRENHEIT(Math.round(temp)),
        condition: mapWmoCodeToCondition(code),
        precipProbabilityPercent:
          typeof precip === "number" ? Math.round(precip) : 0,
        windSpeedKnots:
          typeof wind === "number" ? Math.round(wind) : windKnots,
        isArrivalTarget: index === startIndex + 2,
      });
    }
  }

  const target = hourlyForecast.find((hour) => hour.isArrivalTarget);
  const precipitationChance =
    target?.precipProbabilityPercent ??
    dto.daily?.precipitation_probability_max?.[0] ??
    (condition.toLowerCase().includes("rain") ? 70 : 10);

  const dailyTimes = dto.daily?.time ?? [];
  const dailyHighs = dto.daily?.temperature_2m_max ?? [];
  const dailyLows = dto.daily?.temperature_2m_min ?? [];
  const dailyCodes = dto.daily?.weather_code ?? [];
  const dailyPrecip = dto.daily?.precipitation_probability_max ?? [];
  const dailyForecast: DailyForecast[] = [];
  const dailyCount = Math.min(3, dailyTimes.length, dailyHighs.length, dailyLows.length);
  for (let index = 0; index < dailyCount; index += 1) {
    const high = dailyHighs[index];
    const low = dailyLows[index];
    const time = dailyTimes[index];
    if (typeof high !== "number" || typeof low !== "number" || typeof time !== "string") {
      continue;
    }
    const precip = dailyPrecip[index];
    const precipValue = typeof precip === "number" ? Math.round(precip) : precipitationChance;
    dailyForecast.push({
      dayName: dayLabels(index),
      dateString: time,
      tempHighC: Math.round(high),
      tempHighF: CELSIUS_TO_FAHRENHEIT(Math.round(high)),
      tempLowC: Math.round(low),
      tempLowF: CELSIUS_TO_FAHRENHEIT(Math.round(low)),
      condition: mapWmoCodeToCondition(dailyCodes[index]),
      precipProbabilityPercent: precipValue,
      packingTip:
        precipValue >= 50
          ? "Bring rain protection for outdoor transit."
          : "Ideal conditions for city travel.",
    });
  }

  const category = determineFlightCategory(current.visibility, current.weather_code);
  const categoryLabel =
    category === "IFR"
      ? "IFR (Instrument Flight Rules)"
      : category === "MVFR"
        ? "MVFR (Marginal VFR)"
        : "VFR (Visual Flight Rules)";

  return {
    airportCode: airport.code.toUpperCase(),
    airportName: airport.name,
    airportCity: airport.city,
    arrivalTime,
    arrivalTempC: tempC,
    arrivalTempF: CELSIUS_TO_FAHRENHEIT(tempC),
    arrivalCondition: condition,
    precipitationChance,
    windCondition: `${windKnots} kt ${windDir}`,
    visibility: visMiles >= 10 ? "10+ mi" : `${Math.max(1, visMiles)} mi`,
    humidity: Math.round(current.relative_humidity_2m),
    hourlyForecast,
    dailyForecast,
    advisory: {
      flightCategory: categoryLabel,
      // Open-Meteo does not report runway heading, crosswind components, RVR,
      // or operational notices. These stay explicitly unavailable.
      crosswindKnots: 0,
      crosswindRisk: "Not reported",
      runwayVisualRange: "Not reported",
      arrivalNotice: "Open-Meteo model forecast; not an operational observation.",
    },
    packingAdvice: packingAdvice(tempC, precipitationChance),
    lastUpdated: Date.now(),
    dataAvailable: true,
    source: "OPEN_METEO",
  };
}

export function unavailableForecast(
  airport: Pick<Airport, "code" | "name" | "city">,
  arrivalTime: string,
  message = "Forecast unavailable. No estimated weather was generated.",
): DestinationArrivalForecast {
  return {
    airportCode: airport.code.toUpperCase(),
    airportName: airport.name,
    airportCity: airport.city,
    arrivalTime,
    arrivalTempC: 0,
    arrivalTempF: 32,
    arrivalCondition: "Not reported",
    precipitationChance: 0,
    windCondition: "Not reported",
    visibility: "Not reported",
    humidity: 0,
    hourlyForecast: [],
    dailyForecast: [],
    advisory: {
      flightCategory: "Not reported",
      crosswindKnots: 0,
      crosswindRisk: "Not reported",
      runwayVisualRange: "Not reported",
      arrivalNotice: "Not reported",
    },
    packingAdvice: message,
    lastUpdated: Date.now(),
    dataAvailable: false,
    source: "NONE",
  };
}

// ── Fetching + cache ─────────────────────────────────────────────────────────

export interface WeatherCacheEntry {
  forecast: DestinationArrivalForecast;
  cachedAt: number;
}

export interface WeatherCache {
  get(key: string): Promise<WeatherCacheEntry | null> | WeatherCacheEntry | null;
  set(key: string, entry: WeatherCacheEntry): Promise<void> | void;
}

export class InMemoryWeatherCache implements WeatherCache {
  private readonly entries = new Map<string, WeatherCacheEntry>();
  constructor(private readonly maxEntries = 500) {}

  get(key: string): WeatherCacheEntry | null {
    return this.entries.get(key) ?? null;
  }

  set(key: string, entry: WeatherCacheEntry): void {
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest) this.entries.delete(oldest);
    }
    this.entries.set(key, entry);
  }
}

export interface OpenMeteoServiceOptions {
  fetchImpl?: typeof fetch;
  cache?: WeatherCache;
  now?: () => number;
  ttlMs?: number;
  baseUrl?: string;
  timeoutMs?: number;
}

export interface DestinationForecastOptions {
  forceRefresh?: boolean;
  signal?: AbortSignal;
}

const OPEN_METEO_PARAMS = {
  current:
    "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,visibility",
  hourly: "temperature_2m,precipitation_probability,weather_code,wind_speed_10m",
  daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
  wind_speed_unit: "kn",
  timezone: "auto",
  forecast_days: "4",
} as const;

/**
 * Open-Meteo arrival-weather client with a 15-minute cache and explicit
 * offline fallback. It never reaches AeroDataBox and requires no API key.
 */
export class OpenMeteoWeatherService {
  private readonly fetchImpl: typeof fetch;
  private readonly cache: WeatherCache;
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: OpenMeteoServiceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.cache = options.cache ?? new InMemoryWeatherCache();
    this.now = options.now ?? (() => Date.now());
    this.ttlMs = options.ttlMs ?? 15 * 60_000;
    this.baseUrl = (options.baseUrl ?? "https://api.open-meteo.com").replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async fetchRaw(
    latitude: number,
    longitude: number,
    signal?: AbortSignal,
  ): Promise<OpenMeteoResponseDto> {
    const url = new URL(`${this.baseUrl}/v1/forecast`);
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));
    for (const [key, value] of Object.entries(OPEN_METEO_PARAMS)) {
      url.searchParams.set(key, value);
    }
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const response = await this.fetchImpl(url, {
      headers: { Accept: "application/json" },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!response.ok) {
      throw new Error(`Open-Meteo returned HTTP ${response.status}`);
    }
    return (await response.json()) as OpenMeteoResponseDto;
  }

  async getDestinationForecast(
    airport: Pick<Airport, "code" | "name" | "city" | "latitude" | "longitude">,
    arrivalTime: string,
    options: DestinationForecastOptions = {},
  ): Promise<DestinationArrivalForecast> {
    const key = `${airport.code.toUpperCase()}:${arrivalTime}:${airport.latitude.toFixed(3)}:${airport.longitude.toFixed(3)}`;
    const cached = await this.cache.get(key);
    const now = this.now();
    if (!options.forceRefresh && cached && now - cached.cachedAt < this.ttlMs) {
      return cached.forecast;
    }

    try {
      const dto = await this.fetchRaw(airport.latitude, airport.longitude, options.signal);
      const forecast = mapToDestinationForecast(airport, arrivalTime, dto);
      await this.cache.set(key, { forecast, cachedAt: now });
      return forecast;
    } catch {
      if (cached) {
        return {
          ...cached.forecast,
          source: "CACHE",
          lastUpdated: cached.cachedAt,
        };
      }
      return unavailableForecast(airport, arrivalTime);
    }
  }
}
