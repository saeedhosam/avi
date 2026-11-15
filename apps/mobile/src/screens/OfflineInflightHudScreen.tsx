import { Barometer } from "expo-sensors";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  CabinPressureTracker,
  buildOfflineInflightState,
  type CabinAltitudeEstimate,
  type Flight,
} from "@avi/shared";
import catalogAirports from "@avi/catalog/airports.json";
import {
  Badge,
  Card,
  Divider,
  EmptyState,
  Label,
  PrimaryButton,
  Row,
  Screen,
  Subtitle,
  Title,
} from "../../src/components/ui";
import { formatDateTime } from "../../src/lib/flightDisplay";
import { COLORS } from "../../src/lib/theme";
import {
  getTrackedFlight,
  operatingDateForFlight,
} from "../../src/lib/trackedFlights";

interface HudParams {
  flightId?: string;
  flightNumber?: string;
  originCode?: string;
  destinationCode?: string;
  originLat?: string;
  originLon?: string;
  destLat?: string;
  destLon?: string;
  takeoffAt?: string;
  landingAt?: string;
}

interface CachedRoute {
  flightNumber: string;
  originCode: string;
  destinationCode: string;
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  takeoffAt: string;
  landingAt: string;
  timeBasis: string;
  snapshotLabel: string;
}

interface RouteResolution {
  route: CachedRoute | null;
  issue: string | null;
}

const LANDMARKS = [
  { name: "Greenland ice sheet", latitude: 72, longitude: -40 },
  { name: "Iceland", latitude: 64.9, longitude: -19 },
  { name: "Irish coast", latitude: 53.4, longitude: -8 },
];

const CATALOG_TIMEZONES = new Map(
  (
    catalogAirports as Array<{ iata?: string; timezone?: string }>
  ).flatMap((airport) =>
    airport.iata && airport.timezone
      ? [[airport.iata.toUpperCase(), airport.timezone] as const]
      : [],
  ),
);

/**
 * Provider timezones are preferred when they carry an IANA zone or UTC offset.
 * Abbreviation-only values (for example `EEST`) fall back to the bundled
 * catalog's reference offset so the HUD can still resolve clock times.
 */
function resolveAirportTimezone(
  airportCode: string,
  timezone: string | null | undefined,
): string | undefined {
  const trimmed = timezone?.trim();
  if (
    trimmed &&
    (trimmed.includes("/") ||
      /UTC\s*[+-]/i.test(trimmed) ||
      /^(UTC|GMT)$/i.test(trimmed))
  ) {
    return trimmed;
  }
  return CATALOG_TIMEZONES.get(airportCode.trim().toUpperCase()) ?? trimmed;
}

function parseCoordinate(
  value: string | number | null | undefined,
  min: number,
  max: number,
): number | null {
  if (value == null) return null;
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max
    ? parsed
    : null;
}

function validTimestamp(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return Number.isFinite(Date.parse(trimmed)) ? trimmed : null;
}

/**
 * Fixed offsets are used when the provider/catalog supplies `UTC+3`-style
 * zones. IANA zones are resolved with Intl at the requested instant.
 */
function timezoneOffsetMinutes(
  timeZone: string | null | undefined,
  instantMs: number,
): number | null {
  const zone = timeZone?.trim();
  if (!zone) return null;
  if (/^(UTC|GMT)$/i.test(zone)) return 0;

  const fixed = /UTC\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?/i.exec(zone);
  if (fixed?.[1] && fixed[2]) {
    const sign = fixed[1] === "-" ? -1 : 1;
    const hours = Number(fixed[2]);
    const minutes = Number(fixed[3] ?? "0");
    if (hours > 18 || minutes > 59) return null;
    return sign * (hours * 60 + minutes);
  }

  if (!zone.includes("/")) return null;
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const values: Record<string, string> = {};
    for (const part of formatter.formatToParts(new Date(instantMs))) {
      if (part.type !== "literal") values[part.type] = part.value;
    }
    const hour = Number(values.hour) === 24 ? 0 : Number(values.hour);
    const asUtc = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      hour,
      Number(values.minute),
      Number(values.second),
    );
    if (!Number.isFinite(asUtc)) return null;
    return Math.round((asUtc - instantMs) / 60_000);
  } catch {
    return null;
  }
}

/**
 * Converts an airport-local provider clock (`HH:mm`) plus operating date and
 * airport timezone into an absolute instant. Full ISO timestamps pass through.
 * Returns null instead of assuming the device timezone when resolution fails.
 */
function clockToInstant(
  dateIso: string | null | undefined,
  clock: string | null | undefined,
  timeZone: string | null | undefined,
): string | null {
  const trimmed = clock?.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(trimmed)) {
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }

  const dateMatch = dateIso?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const clockMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (!dateMatch || !clockMatch) return null;
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(clockMatch[1]);
  const minute = Number(clockMatch[2]);
  const second = Number(clockMatch[3] ?? "0");
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }

  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset = timezoneOffsetMinutes(timeZone, naiveUtc);
  if (offset == null) return null;
  let instant = naiveUtc - offset * 60_000;
  const correctedOffset = timezoneOffsetMinutes(timeZone, instant);
  if (correctedOffset != null) instant = naiveUtc - correctedOffset * 60_000;
  return new Date(instant).toISOString();
}

function addCalendarDays(dateIso: string, days: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso);
  if (!match) return null;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days),
  );
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

/**
 * Arrival clocks have no date of their own. Use the first calendar occurrence
 * after takeoff (departure date, then +1/+2 days) so overnight and date-line
 * flights are represented without inventing a new clock value.
 */
function arrivalInstant(
  departureDate: string | null | undefined,
  clock: string | null | undefined,
  timeZone: string | null | undefined,
  takeoffAt: string,
): string | null {
  const trimmed = clock?.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(trimmed)) {
    return clockToInstant(null, trimmed, timeZone);
  }
  if (!departureDate) return null;
  const takeoffMs = Date.parse(takeoffAt);
  if (!Number.isFinite(takeoffMs)) return null;
  for (let offset = 0; offset <= 2; offset += 1) {
    const date = addCalendarDays(departureDate, offset);
    if (!date) return null;
    const instant = clockToInstant(date, trimmed, timeZone);
    if (instant && Date.parse(instant) > takeoffMs) return instant;
  }
  return null;
}

function routeFromFlight(flight: Flight): RouteResolution {
  const originLat = parseCoordinate(flight.origin.latitude, -90, 90);
  const originLon = parseCoordinate(flight.origin.longitude, -180, 180);
  const destLat = parseCoordinate(flight.destination.latitude, -90, 90);
  const destLon = parseCoordinate(flight.destination.longitude, -180, 180);
  if (originLat == null || originLon == null || destLat == null || destLon == null) {
    return {
      route: null,
      issue:
        "The cached flight is missing valid origin/destination coordinates. The HUD is not drawn from an invented route.",
    };
  }

  const departureDate = operatingDateForFlight(flight);
  const originTimezone = resolveAirportTimezone(
    flight.origin.code,
    flight.origin.timezone,
  );
  const destinationTimezone = resolveAirportTimezone(
    flight.destination.code,
    flight.destination.timezone,
  );
  const departureActualClock = flight.departureTimeActual?.trim() || null;
  const departureEstimatedClock = flight.departureTimeEstimated?.trim() || null;
  const actualTakeoff = departureActualClock
    ? clockToInstant(departureDate, departureActualClock, originTimezone)
    : null;
  const estimatedTakeoff = departureEstimatedClock
    ? clockToInstant(departureDate, departureEstimatedClock, originTimezone)
    : null;
  const takeoffAt = actualTakeoff ?? estimatedTakeoff;
  if (!takeoffAt) {
    const departureClock = departureActualClock ?? departureEstimatedClock;
    if (!departureClock) {
      return {
        route: null,
        issue:
          "The cached flight has no actual or estimated departure time. The HUD cannot interpolate a position.",
      };
    }
    if (
      !departureDate &&
      !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(departureClock)
    ) {
      return {
        route: null,
        issue:
          "The cached flight has no operating date, so its airport-local departure clock cannot be turned into a timestamp.",
      };
    }
    return {
      route: null,
      issue: `The cached departure clock could not be resolved with the origin airport timezone (${originTimezone || "not reported"}). The HUD does not assume the device timezone.`,
    };
  }

  const arrivalActualClock = flight.arrivalTimeActual?.trim() || null;
  const arrivalEstimatedClock = flight.arrivalTimeEstimated?.trim() || null;
  const actualLanding = arrivalActualClock
    ? arrivalInstant(
        departureDate,
        arrivalActualClock,
        destinationTimezone,
        takeoffAt,
      )
    : null;
  const estimatedLanding = arrivalEstimatedClock
    ? arrivalInstant(
        departureDate,
        arrivalEstimatedClock,
        destinationTimezone,
        takeoffAt,
      )
    : null;
  const landingAt = actualLanding ?? estimatedLanding;
  if (!landingAt) {
    const arrivalClock = arrivalActualClock ?? arrivalEstimatedClock;
    if (!arrivalClock) {
      return {
        route: null,
        issue:
          "The cached flight has no actual or estimated arrival time. The HUD cannot interpolate a position.",
      };
    }
    if (
      !departureDate &&
      !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(arrivalClock)
    ) {
      return {
        route: null,
        issue:
          "The cached flight has no operating date, so its airport-local arrival clock cannot be turned into a timestamp.",
      };
    }
    return {
      route: null,
      issue: `The cached arrival clock could not be resolved with the destination airport timezone (${destinationTimezone || "not reported"}). The HUD does not assume the device timezone.`,
    };
  }
  if (Date.parse(landingAt) <= Date.parse(takeoffAt)) {
    return {
      route: null,
      issue:
        "The cached flight's landing time is not after takeoff, so the HUD cannot interpolate a position.",
    };
  }

  return {
    route: {
      flightNumber: flight.flightNumber,
      originCode: flight.origin.code,
      destinationCode: flight.destination.code,
      origin: { latitude: originLat, longitude: originLon },
      destination: { latitude: destLat, longitude: destLon },
      takeoffAt,
      landingAt,
      timeBasis: `${actualTakeoff ? "actual" : "estimated"} takeoff · ${
        actualLanding ? "actual" : "estimated"
      } landing · airport-local clocks`,
      snapshotLabel: flight.fetchedAt
        ? `Cached tracked flight · fetched ${formatDateTime(flight.fetchedAt)}`
        : "Cached tracked flight",
    },
    issue: null,
  };
}

function routeFromParams(params: HudParams): RouteResolution {
  const hasAny = [
    params.originLat,
    params.originLon,
    params.destLat,
    params.destLon,
    params.takeoffAt,
    params.landingAt,
  ].some((value) => value != null && value.trim() !== "");
  if (!hasAny) return { route: null, issue: null };

  const originLat = parseCoordinate(params.originLat, -90, 90);
  const originLon = parseCoordinate(params.originLon, -180, 180);
  const destLat = parseCoordinate(params.destLat, -90, 90);
  const destLon = parseCoordinate(params.destLon, -180, 180);
  const takeoffAt = validTimestamp(params.takeoffAt);
  const landingAt = validTimestamp(params.landingAt);
  if (
    originLat == null ||
    originLon == null ||
    destLat == null ||
    destLon == null ||
    !takeoffAt ||
    !landingAt
  ) {
    return {
      route: null,
      issue:
        "The HUD route parameters are incomplete or invalid. Origin/destination coordinates and valid takeoff/landing timestamps are required.",
    };
  }
  if (Date.parse(landingAt) <= Date.parse(takeoffAt)) {
    return {
      route: null,
      issue:
        "The supplied landing time is not after takeoff, so the HUD cannot interpolate a position.",
    };
  }

  return {
    route: {
      flightNumber: params.flightNumber ?? "UNKNOWN",
      originCode: params.originCode ?? "---",
      destinationCode: params.destinationCode ?? "---",
      origin: { latitude: originLat, longitude: originLon },
      destination: { latitude: destLat, longitude: destLon },
      takeoffAt,
      landingAt,
      timeBasis: "caller-supplied timestamps",
      snapshotLabel: "Route parameters supplied by the caller",
    },
    issue: null,
  };
}

/** Cabin pressure trend in plain language; 0 fpm means the cabin is level. */
function verticalTrend(rate: number | null | undefined): string {
  if (rate == null) return "trend pending";
  if (rate === 0) return "cabin level";
  return rate > 0
    ? `climbing ${Math.abs(rate)} fpm`
    : `descending ${Math.abs(rate)} fpm`;
}

export default function OfflineInflightHudScreen() {
  const router = useRouter();
  const params = useLocalSearchParams() as HudParams;
  const flightId = params.flightId?.trim() ?? "";
  const [now, setNow] = useState(() => new Date().toISOString());
  const [sample, setSample] = useState(false);
  const [sampleAnchor, setSampleAnchor] = useState<number | null>(null);
  const [cachedFlight, setCachedFlight] = useState<Flight | null>(null);
  const [cacheState, setCacheState] = useState<
    "idle" | "loading" | "found" | "missing"
  >("idle");
  const [cacheError, setCacheError] = useState<string | null>(null);
  const [pressure, setPressure] = useState<number | null>(null);
  const [barometerAvailable, setBarometerAvailable] = useState<boolean | null>(
    null,
  );
  const [cabin, setCabin] = useState<CabinAltitudeEstimate | null>(null);
  const tracker = useMemo(() => new CabinPressureTracker(), []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date().toISOString()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!flightId) {
      setCachedFlight(null);
      setCacheState("idle");
      setCacheError(null);
      return;
    }
    let active = true;
    setCachedFlight(null);
    setCacheState("loading");
    setCacheError(null);
    getTrackedFlight(flightId)
      .then((entry) => {
        if (!active) return;
        if (entry) {
          setCachedFlight(entry.flight);
          setCacheState("found");
        } else {
          setCachedFlight(null);
          setCacheState("missing");
        }
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setCachedFlight(null);
        setCacheState("missing");
        setCacheError(
          cause instanceof Error
            ? `Could not read the tracked-flight cache: ${cause.message}`
            : "Could not read the tracked-flight cache.",
        );
      });
    return () => {
      active = false;
    };
  }, [flightId]);

  useEffect(() => {
    let mounted = true;
    Barometer.isAvailableAsync()
      .then((available) => {
        if (mounted) setBarometerAvailable(available);
      })
      .catch(() => {
        if (mounted) setBarometerAvailable(false);
      });
    Barometer.setUpdateInterval(1_000);
    const subscription = Barometer.addListener(({ pressure: next }) => {
      setPressure(next);
      setCabin(tracker.add(next));
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [tracker]);

  const sampleRoute = useMemo<CachedRoute>(() => {
    const anchor = sampleAnchor ?? Date.now();
    return {
      flightNumber: "AEROQUEST DEMO",
      originCode: "JFK",
      destinationCode: "LHR",
      origin: { latitude: 40.6413, longitude: -73.7781 },
      destination: { latitude: 51.47, longitude: -0.4543 },
      takeoffAt: new Date(anchor - 2.5 * 3_600_000).toISOString(),
      landingAt: new Date(anchor + 4 * 3_600_000).toISOString(),
      timeBasis: "fixed demo timestamps",
      snapshotLabel: "Sample route · not live",
    };
  }, [sampleAnchor]);

  const routeResolution = useMemo<RouteResolution>(() => {
    if (sample) return { route: sampleRoute, issue: null };
    if (cachedFlight) return routeFromFlight(cachedFlight);
    return routeFromParams(params);
  }, [cachedFlight, params, sample, sampleRoute]);

  const route = routeResolution.route;

  const state = useMemo(() => {
    if (!route) return null;
    return buildOfflineInflightState({
      flight: {
        id: cachedFlight?.id ?? `${route.flightNumber}-offline`,
        flightNumber: route.flightNumber,
        origin: { code: route.originCode },
        destination: { code: route.destinationCode },
        departureTimeActual: cachedFlight?.departureTimeActual ?? route.takeoffAt,
        arrivalTimeEstimated:
          cachedFlight?.arrivalTimeEstimated ?? route.landingAt,
      },
      origin: route.origin,
      destination: route.destination,
      takeoffAt: route.takeoffAt,
      landingAt: route.landingAt,
      now,
      pressureHpa: pressure,
      landmarks: LANDMARKS,
    });
  }, [cachedFlight, now, pressure, route]);

  if (!route || !state) {
    return (
      <Screen>
        <Badge tone="amber">PRO · OFFLINE</Badge>
        <Title>In-flight HUD</Title>
        <Subtitle>
          This HUD needs a cached route: origin/destination coordinates plus
          actual or estimated takeoff and landing times. Nothing is invented
          when the flight is unknown.
        </Subtitle>

        {cacheState === "loading" ? (
          <Card>
            <ActivityIndicator color={COLORS.radar} />
            <Subtitle>Loading the tracked-flight snapshot…</Subtitle>
          </Card>
        ) : (
          <EmptyState
            title="No cached flight selected"
            detail={
              routeResolution.issue ??
              cacheError ??
              "Open the HUD from a tracked flight, or load the clearly-labelled sample route to preview the display."
            }
          />
        )}

        {cacheState === "missing" && routeResolution.issue == null && !cacheError ? (
          <Text style={styles.note}>
            The requested flight ID is not in the local tracked-flight cache.
            Open Flights, track the flight, then return here.
          </Text>
        ) : null}
        {cacheError ? <Text style={styles.note}>{cacheError}</Text> : null}

        <PrimaryButton
          label="Open tracked flights"
          onPress={() => router.push("/flights")}
        />
        <PrimaryButton
          label="Load sample route (not live)"
          tone="amber"
          onPress={() => {
            setSampleAnchor(Date.now());
            setSample(true);
          }}
        />
        <Card>
          <Label>Barometer</Label>
          <Subtitle>
            {barometerAvailable === false
              ? "This device has no barometer. Cabin altitude will show as unavailable."
              : barometerAvailable == null
                ? "Checking barometer availability…"
                : "Barometer available. Cabin altitude is an estimate from pressure, not the aircraft's altitude."}
          </Subtitle>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Row style={{ justifyContent: "space-between" }}>
        <View style={{ flex: 1 }}>
          <Badge tone={sample ? "amber" : "radar"}>
            {sample
              ? "SAMPLE ROUTE · NOT LIVE"
              : cachedFlight
                ? "TRACKED SNAPSHOT · OFFLINE"
                : "CACHED ROUTE"}
          </Badge>
          <Title>{state.flightNumber}</Title>
          <Subtitle>
            {state.originCode} → {state.destinationCode}
          </Subtitle>
        </View>
        <Badge>{state.cabin.phase.replace("_", " ")}</Badge>
      </Row>

      <Text style={styles.snapshot}>{route.snapshotLabel}</Text>
      {sample ? (
        <Text style={styles.sampleNote}>
          This sample route is not live. It uses a fixed New York–London demo
          path and timestamps only to preview the HUD.
        </Text>
      ) : null}

      <Card style={styles.hud}>
        <View style={styles.hudStats}>
          <HudStat
            label="Cabin altitude"
            value={
              state.cabin.source === "NONE"
                ? "Unavailable"
                : `${state.cabin.cabinAltitudeFeet.toLocaleString()} ft`
            }
          />
          <HudStat
            label="Progress"
            value={`${Math.round(state.position.progress * 100)}%`}
          />
          <HudStat
            label="Remaining"
            value={`${Math.round(state.position.distanceRemainingKm).toLocaleString()} km`}
          />
        </View>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.max(2, state.position.progress * 100)}%` },
            ]}
          />
        </View>
        <Row style={{ justifyContent: "space-between" }}>
          <Text style={styles.note}>{state.originCode}</Text>
          <Text style={styles.note}>
            {state.position.position.latitude.toFixed(2)},{" "}
            {state.position.position.longitude.toFixed(2)}
          </Text>
          <Text style={styles.note}>{state.destinationCode}</Text>
        </Row>
        <Text style={styles.pressure}>
          {state.cabin.source === "NONE"
            ? "No barometer reading. Cabin altitude is not estimated."
            : `Pressure ${state.cabin.pressureHpa.toFixed(1)} hPa · ${verticalTrend(
                state.cabin.verticalRateFpm,
              )}`}
        </Text>
        {cabin ? (
          <Text style={styles.note}>
            Smoothed sample: {cabin.cabinAltitudeFeet.toLocaleString()} ft ·{" "}
            {cabin.phase}
          </Text>
        ) : null}
      </Card>

      <Card>
        <Label>Cabin timeline · estimated</Label>
        {state.timeline.map((item) => (
          <View key={item.kind} style={styles.timelineRow}>
            <View style={[styles.dot, item.completed && styles.dotDone]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.timelineLabel}>
                {item.label} ·{" "}
                {new Date(item.at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
              <Text style={styles.note}>{item.detail}</Text>
            </View>
          </View>
        ))}
      </Card>

      <Card>
        <Label>Under the flight path</Label>
        {state.callouts.length ? (
          state.callouts.map((callout, index) => (
            <View key={callout.name}>
              {index > 0 ? <Divider /> : null}
              <Text style={styles.callout}>
                {callout.name} · {callout.distanceKm} km off track ·{" "}
                {new Date(callout.at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.note}>No bundled landmarks near this route.</Text>
        )}
      </Card>

      <Card>
        <Label>Data integrity</Label>
        <Subtitle>
          Position is interpolated along the cached great-circle route using the{" "}
          {route.timeBasis}. Airport-local clock times are converted with each
          airport&apos;s reported timezone; the HUD never assumes the device
          timezone. Cabin altitude comes only from the phone barometer; meal and
          lights events are estimates, not crew announcements.
          {cachedFlight
            ? cachedFlight.fetchedAt
              ? ` This snapshot was fetched ${formatDateTime(cachedFlight.fetchedAt)} and is used offline.`
              : " This tracked snapshot is used offline."
            : ""}
        </Subtitle>
      </Card>
    </Screen>
  );
}

function HudStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.hudStat}>
      <Text style={styles.hudLabel}>{label}</Text>
      <Text
        style={styles.hudValue}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.72}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hud: { borderColor: `${COLORS.radar}55`, backgroundColor: COLORS.radarSurface },
  hudStats: { flexDirection: "row", gap: 10 },
  hudStat: { flex: 1, minWidth: 0 },
  hudLabel: {
    color: COLORS.muted,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  hudValue: { color: COLORS.white, fontSize: 20, fontWeight: "700" },
  progressTrack: {
    height: 8,
    backgroundColor: COLORS.surface2,
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: { height: 8, backgroundColor: COLORS.radar, borderRadius: 999 },
  pressure: { color: COLORS.radar, fontSize: 12, fontWeight: "600" },
  note: { color: COLORS.muted, fontSize: 12, lineHeight: 18 },
  snapshot: { color: COLORS.radar, fontSize: 12, fontWeight: "600" },
  sampleNote: { color: COLORS.amber, fontSize: 12, lineHeight: 18 },
  timelineRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    paddingVertical: 5,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.muted,
    marginTop: 4,
  },
  dotDone: { backgroundColor: COLORS.radar, borderColor: COLORS.radar },
  timelineLabel: { color: COLORS.white, fontSize: 13, fontWeight: "600" },
  callout: { color: COLORS.radar, fontSize: 12, paddingVertical: 4 },
});
