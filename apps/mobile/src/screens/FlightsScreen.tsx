import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  AeroQuestGatewayClient,
  type Flight,
  type GatewayBoardFlight,
  type GatewayBoardWeather,
  type GatewayProvenance,
} from "@avi/shared";
import {
  Badge,
  Card,
  Divider,
  EmptyState,
  GhostButton,
  Label,
  Row,
  Screen,
  Subtitle,
  Title,
} from "../components/ui";
import { GATEWAY_URL } from "../lib/config";
import {
  describeGatewayError,
  displayText,
  formatClock,
  formatDateTime,
  statusLabel,
  statusTone,
} from "../lib/flightDisplay";
import { getAccessToken } from "../lib/supabase";
import { COLORS } from "../lib/theme";
import {
  addTrackedFlight,
  listTrackedFlights,
  operatingDateForFlight,
  refreshTrackedFlight,
  removeTrackedFlight,
  trackedFlightId,
  type TrackedFlightEntry,
} from "../lib/trackedFlights";

type SearchMode = "flight" | "board";

function todayIso(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function provenanceLine(provenance: GatewayProvenance): string {
  return `${provenance.source}${provenance.cached ? " · cached" : ""}${
    provenance.stale ? " · stale" : ""
  } · fetched ${formatDateTime(provenance.fetchedAt)} · TTL ${
    provenance.ttlSeconds
  }s`;
}

export default function FlightsScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<SearchMode>("flight");
  const [flightNumber, setFlightNumber] = useState("");
  const [date, setDate] = useState(todayIso);
  const [airport, setAirport] = useState("");
  const [results, setResults] = useState<Flight[]>([]);
  const [boardFlights, setBoardFlights] = useState<GatewayBoardFlight[]>([]);
  const [boardWeather, setBoardWeather] = useState<GatewayBoardWeather | null>(
    null,
  );
  const [provenance, setProvenance] = useState<GatewayProvenance | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tracked, setTracked] = useState<TrackedFlightEntry[]>([]);
  const [trackedLoading, setTrackedLoading] = useState(true);
  const [refreshingIds, setRefreshingIds] = useState<string[]>([]);

  const loadTracked = useCallback(async () => {
    const entries = await listTrackedFlights();
    setTracked(entries);
    setTrackedLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadTracked();
    }, [loadTracked]),
  );

  const trackedIds = useMemo(
    () => new Set(tracked.map((entry) => entry.id)),
    [tracked],
  );

  const gatewayClient = useCallback(async () => {
    return new AeroQuestGatewayClient({
      baseUrl: GATEWAY_URL,
      accessToken: await getAccessToken(),
    });
  }, []);

  const changeMode = (next: SearchMode) => {
    setMode(next);
    setError(null);
    setNotice(null);
    setResults([]);
    setBoardFlights([]);
    setBoardWeather(null);
    setProvenance(null);
  };

  const openDetail = useCallback(
    (flight: Flight, fallbackDate?: string) => {
      const operatingDate =
        flight.flightDate ??
        operatingDateForFlight(flight) ??
        fallbackDate ??
        date;
      router.push({
        pathname: "/flight/[id]",
        params: {
          id: trackedFlightId(flight),
          flightNumber: flight.flightNumber,
          date: operatingDate,
        },
      });
    },
    [date, router],
  );

  const trackFlight = async (flight: Flight) => {
    setError(null);
    try {
      await addTrackedFlight(flight);
      await loadTracked();
      setNotice(
        `${flight.flightNumber} cached on this device for the offline HUD and terminal context.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Could not write the tracked-flight cache: ${cause.message}`
          : "Could not write the tracked-flight cache.",
      );
    }
  };

  const searchByFlightNumber = async () => {
    const number = flightNumber.replace(/\s+/g, "").toUpperCase();
    if (!number) {
      setError("Enter a flight number, for example MS985.");
      return;
    }
    if (!isValidIsoDate(date)) {
      setError("Enter the operating date as YYYY-MM-DD.");
      return;
    }
    setSearching(true);
    setError(null);
    setNotice(null);
    setResults([]);
    setBoardFlights([]);
    setBoardWeather(null);
    setProvenance(null);
    try {
      const client = await gatewayClient();
      const response = await client.getFlight(number, date);
      setResults(response.flights);
      setProvenance(response.provenance);
      if (!response.flights.length) {
        setError(
          `The gateway returned no flight for ${number} on ${date}. No substitute flight is shown.`,
        );
      }
    } catch (cause) {
      setError(describeGatewayError(cause));
    } finally {
      setSearching(false);
    }
  };

  const searchByAirport = async () => {
    const code = airport.replace(/\s+/g, "").toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) {
      setError("Enter a three-letter airport code, for example CAI.");
      return;
    }
    setSearching(true);
    setError(null);
    setNotice(null);
    setResults([]);
    setBoardFlights([]);
    setBoardWeather(null);
    setProvenance(null);
    try {
      const client = await gatewayClient();
      const response = await client.getAirportBoard(code);
      setBoardFlights(response.flights);
      setBoardWeather(response.weather);
      setProvenance(response.provenance);
      if (!response.flights.length) {
        setError(`The gateway returned an empty board for ${code}.`);
      }
    } catch (cause) {
      setError(describeGatewayError(cause));
    } finally {
      setSearching(false);
    }
  };

  const refreshCached = async (entry: TrackedFlightEntry) => {
    setRefreshingIds((ids) => [...ids, entry.id]);
    setError(null);
    setNotice(null);
    try {
      const refreshed = await refreshTrackedFlight(entry.id);
      if (!refreshed) {
        setError("That flight is no longer in the tracked-flight cache.");
        return;
      }
      await loadTracked();
      setNotice(`${refreshed.flight.flightNumber} refreshed from the gateway.`);
    } catch (cause) {
      setError(describeGatewayError(cause));
    } finally {
      setRefreshingIds((ids) => ids.filter((id) => id !== entry.id));
    }
  };

  const removeCached = async (entry: TrackedFlightEntry) => {
    setError(null);
    setNotice(null);
    try {
      const removed = await removeTrackedFlight(entry.id);
      await loadTracked();
      setNotice(
        removed
          ? `${entry.flight.flightNumber} removed from this device.`
          : "That flight was already removed.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Could not remove the cached flight: ${cause.message}`
          : "Could not remove the cached flight.",
      );
    }
  };

  return (
    <Screen>
      <Badge>LIVE GATEWAY · OFFLINE CACHE</Badge>
      <Title>Flight search</Title>
      <Subtitle>
        Search by flight number or load an airport board. Every response is
        validated by the AeroQuest gateway; cached snapshots power the offline
        HUD and terminal context.
      </Subtitle>

      <Card>
        <Row>
          <ModeButton
            label="Flight number"
            active={mode === "flight"}
            onPress={() => changeMode("flight")}
          />
          <ModeButton
            label="Airport board"
            active={mode === "board"}
            onPress={() => changeMode("board")}
          />
        </Row>
        <Divider />
        {mode === "flight" ? (
          <>
            <Label>Flight number</Label>
            <TextInput
              value={flightNumber}
              onChangeText={setFlightNumber}
              placeholder="MS985"
              placeholderTextColor={COLORS.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="flight-number"
              style={styles.input}
            />
            <Label>Operating date</Label>
            <TextInput
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={COLORS.muted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            <Row>
              <PrimarySearchButton
                label={searching ? "Searching…" : "Search flight"}
                onPress={() => void searchByFlightNumber()}
                loading={searching}
              />
              <GhostButton label="Today" onPress={() => setDate(todayIso())} />
            </Row>
          </>
        ) : (
          <>
            <Label>Airport</Label>
            <TextInput
              value={airport}
              onChangeText={setAirport}
              placeholder="CAI"
              placeholderTextColor={COLORS.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={3}
              style={styles.input}
            />
            <PrimarySearchButton
              label={searching ? "Loading board…" : "Load airport board"}
              onPress={() => void searchByAirport()}
              loading={searching}
            />
          </>
        )}
        <Text style={styles.note}>
          Nothing is stored server-side until you sign in and track a flight. A
          failed gateway request never falls back to a static flight list.
        </Text>
      </Card>

      {error ? <EmptyState title="Flight data unavailable" detail={error} /> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {searching ? (
        <Card>
          <ActivityIndicator color={COLORS.radar} />
          <Subtitle>Querying the caching gateway…</Subtitle>
        </Card>
      ) : null}

      {results.map((flight) => (
        <FlightResultCard
          key={flight.id}
          flight={flight}
          tracked={trackedIds.has(trackedFlightId(flight))}
          onOpen={() => openDetail(flight, date)}
          onTrack={() => void trackFlight(flight)}
        />
      ))}

      {boardWeather || boardFlights.length ? (
        <Card>
          <Row style={{ justifyContent: "space-between" }}>
            <Label>Airport board</Label>
            <Badge tone="muted">{boardFlights.length} flights</Badge>
          </Row>
          {boardWeather ? (
            <Text style={styles.weather}>
              {boardWeather.code} · {boardWeather.tempC}°C ·{" "}
              {boardWeather.condition} · {boardWeather.wind}
            </Text>
          ) : (
            <Text style={styles.note}>
              Airport weather was not reported for this board.
            </Text>
          )}
        </Card>
      ) : null}

      {boardFlights.map(({ flight, direction }) => (
        <FlightResultCard
          key={`${direction}-${flight.id}`}
          flight={flight}
          direction={direction}
          tracked={trackedIds.has(trackedFlightId(flight))}
          onOpen={() => openDetail(flight)}
          onTrack={() => void trackFlight(flight)}
        />
      ))}

      {provenance ? (
        <Card>
          <Label>Response provenance</Label>
          <Text style={styles.provenance}>{provenanceLine(provenance)}</Text>
          <Text style={styles.note}>{provenance.attribution}</Text>
        </Card>
      ) : null}

      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <Label>Tracked flights · offline cache</Label>
          <Badge tone={tracked.length ? "green" : "muted"}>
            {tracked.length} saved
          </Badge>
        </Row>
        {trackedLoading ? (
          <ActivityIndicator color={COLORS.radar} />
        ) : tracked.length ? (
          tracked.map((entry) => (
            <View key={entry.id} style={styles.trackedRow}>
              <Row style={{ justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.trackedNumber}>
                    {entry.flight.flightNumber}
                  </Text>
                  <Text style={styles.trackedRoute}>
                    {entry.flight.origin.code} → {entry.flight.destination.code}
                  </Text>
                </View>
                <Badge tone={statusTone(entry.flight)}>
                  {statusLabel(entry.flight)}
                </Badge>
              </Row>
              <Text style={styles.note}>
                Departs {formatClock(entry.flight.departureTimeEstimated)} · Gate{" "}
                {displayText(entry.flight.gateDeparture)} · Terminal{" "}
                {displayText(entry.flight.terminalDeparture)}
              </Text>
              <Text style={styles.note}>
                Snapshot updated {formatDateTime(entry.updatedAt)}
              </Text>
              <Row>
                <GhostButton
                  label="Open"
                  onPress={() => {
                    const operatingDate = operatingDateForFlight(entry.flight);
                    router.push({
                      pathname: "/flight/[id]",
                      params: {
                        id: entry.id,
                        flightNumber: entry.flight.flightNumber,
                        ...(operatingDate ? { date: operatingDate } : {}),
                      },
                    });
                  }}
                  style={{ flex: 1 }}
                />
                <GhostButton
                  label={
                    refreshingIds.includes(entry.id) ? "Refreshing…" : "Refresh"
                  }
                  onPress={() => void refreshCached(entry)}
                  style={{ flex: 1 }}
                />
                <GhostButton
                  label="Remove"
                  onPress={() => void removeCached(entry)}
                  style={{ flex: 1 }}
                />
              </Row>
            </View>
          ))
        ) : (
          <Text style={styles.note}>
            No flights cached yet. Search above and choose “Track for offline”
            to store a snapshot on this device.
          </Text>
        )}
        <Divider />
        <Text style={styles.note}>
          Local snapshots are always written to this device first. When a
          Supabase session exists, rows are also best-effort mirrored to
          `watchlist_items`; network or permission failures never delete the
          local copy. The gateway never returns fabricated flights.
        </Text>
      </Card>
    </Screen>
  );
}

function ModeButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.mode, active && styles.modeActive]}
    >
      <Text style={[styles.modeText, active && styles.modeTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function PrimarySearchButton({
  label,
  onPress,
  loading,
}: {
  label: string;
  onPress: () => void;
  loading: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [
        styles.searchButton,
        pressed && { opacity: 0.8 },
        loading && { opacity: 0.5 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={COLORS.cockpit} />
      ) : (
        <Text style={styles.searchButtonText}>{label}</Text>
      )}
    </Pressable>
  );
}

function FlightResultCard({
  flight,
  tracked,
  direction,
  onOpen,
  onTrack,
}: {
  flight: Flight;
  tracked: boolean;
  direction?: "DEPARTURE" | "ARRIVAL";
  onOpen: () => void;
  onTrack: () => void;
}) {
  return (
    <Card>
      <Row style={{ justifyContent: "space-between" }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.airline}>{flight.airline}</Text>
          <Text style={styles.flightNumber}>{flight.flightNumber}</Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 6 }}>
          <Badge tone={statusTone(flight)}>{statusLabel(flight)}</Badge>
          {direction ? (
            <Badge tone={direction === "DEPARTURE" ? "green" : "radar"}>
              {direction}
            </Badge>
          ) : null}
        </View>
      </Row>
      <Text style={styles.route}>
        {flight.origin.code} {flight.origin.city} → {flight.destination.code}{" "}
        {flight.destination.city}
      </Text>
      <Row>
        <Field
          label="Departs"
          value={formatClock(
            flight.departureTimeActual ??
              flight.departureTimeEstimated ??
              flight.departureTimeScheduled,
          )}
        />
        <Field label="Gate" value={displayText(flight.gateDeparture)} />
        <Field label="Terminal" value={displayText(flight.terminalDeparture)} />
      </Row>
      <Row>
        <GhostButton label="Open details" onPress={onOpen} style={{ flex: 1 }} />
        <GhostButton
          label={tracked ? "Cached ✓" : "Track for offline"}
          onPress={tracked ? onOpen : onTrack}
          style={{ flex: 1 }}
        />
      </Row>
      {flight.flightDate ? (
        <Text style={styles.note}>Operating date {flight.flightDate}</Text>
      ) : null}
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.surface2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: COLORS.text,
    fontSize: 14,
  },
  mode: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.line,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  modeActive: { backgroundColor: COLORS.radar, borderColor: COLORS.radar },
  modeText: { color: COLORS.muted, fontSize: 12, fontWeight: "800" },
  modeTextActive: { color: COLORS.cockpit },
  searchButton: {
    backgroundColor: COLORS.radar,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
  },
  searchButtonText: { color: COLORS.cockpit, fontWeight: "800", fontSize: 14 },
  notice: { color: COLORS.green, fontSize: 12, lineHeight: 18 },
  note: { color: COLORS.muted, fontSize: 11, lineHeight: 17 },
  weather: { color: COLORS.radar, fontSize: 13, fontWeight: "600" },
  provenance: { color: COLORS.radar, fontSize: 11, fontWeight: "700" },
  airline: {
    color: COLORS.amber,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  flightNumber: {
    color: COLORS.white,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  route: { color: COLORS.text, fontSize: 13, fontWeight: "600" },
  field: { flex: 1, minWidth: 88 },
  fieldLabel: {
    color: COLORS.muted,
    fontSize: 9,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  fieldValue: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 2,
  },
  trackedRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.line,
    paddingTop: 10,
    gap: 6,
  },
  trackedNumber: {
    color: COLORS.white,
    fontSize: 19,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  trackedRoute: { color: COLORS.radar, fontSize: 12, fontWeight: "700" },
});
