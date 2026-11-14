import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  AeroQuestGatewayClient,
  type Flight,
  type GatewayProvenance,
} from "@avi/shared";
import {
  Badge,
  Card,
  Divider,
  EmptyState,
  GhostButton,
  Label,
  PrimaryButton,
  Row,
  Screen,
  Subtitle,
  Title,
} from "../components/ui";
import { GATEWAY_URL } from "../lib/config";
import {
  describeGatewayError,
  displayBoolean,
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
  getTrackedFlight,
  operatingDateForFlight,
  refreshTrackedFlight,
  removeTrackedFlight,
  type TrackedFlightEntry,
} from "../lib/trackedFlights";

interface FlightDetailParams {
  id?: string;
  flightNumber?: string;
  date?: string;
  arrivalGate?: string;
  departureGate?: string;
  arrivalTime?: string;
  boardingTime?: string;
}

function parseRouteId(id: string): {
  flightNumber?: string;
  date?: string;
} {
  const match = /^(.+)-(\d{4}-\d{2}-\d{2})$/.exec(id.trim());
  if (match?.[1] && match[2]) {
    return { flightNumber: match[1], date: match[2] };
  }
  return id.trim() ? { flightNumber: id.trim() } : {};
}

function pickFlight(flights: Flight[], flightNumber: string): Flight | null {
  const compact = flightNumber.replace(/\s+/g, "").toUpperCase();
  return (
    flights.find(
      (candidate) =>
        candidate.flightNumber.replace(/\s+/g, "").toUpperCase() === compact,
    ) ??
    flights[0] ??
    null
  );
}

export default function FlightDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams() as FlightDetailParams;
  const routeId = params.id?.trim() ?? "";
  const paramNumber = params.flightNumber?.trim() ?? "";
  const paramDate = params.date?.trim() ?? "";
  const parsed = useMemo(() => parseRouteId(routeId), [routeId]);

  const [flight, setFlight] = useState<Flight | null>(null);
  const [trackedEntry, setTrackedEntry] = useState<TrackedFlightEntry | null>(
    null,
  );
  const [provenance, setProvenance] = useState<GatewayProvenance | null>(null);
  const [source, setSource] = useState<"cache" | "gateway" | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyAction, setBusyAction] = useState<"terminal" | "hud" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchGatewayFlight = useCallback(async (number: string, date: string) => {
    const client = new AeroQuestGatewayClient({
      baseUrl: GATEWAY_URL,
      accessToken: await getAccessToken(),
    });
    return client.getFlight(number, date);
  }, []);

  useEffect(() => {
    if (!routeId) {
      setLoading(false);
      setError("No flight identifier was supplied.");
      return;
    }
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      setNotice(null);
      setRefreshing(false);
      setFlight(null);
      setTrackedEntry(null);
      setProvenance(null);
      setSource(null);
      const entry = await getTrackedFlight(routeId);
      if (!active) return;
      if (entry) {
        setFlight(entry.flight);
        setTrackedEntry(entry);
        setSource("cache");
        setLoading(false);
      }

      const number =
        paramNumber || entry?.flight.flightNumber || parsed.flightNumber;
      const date =
        paramDate ||
        (entry ? operatingDateForFlight(entry.flight) : null) ||
        parsed.date;

      if (!number || !date) {
        if (!entry) {
          setError(
            "This flight needs a flight number and operating date. Open it from search results or a tracked flight.",
          );
        }
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (entry) setRefreshing(true);
      try {
        const response = await fetchGatewayFlight(number, date);
        if (!active) return;
        const fresh = pickFlight(response.flights, number);
        if (!fresh) {
          setError(
            entry
              ? `Showing the cached snapshot from ${formatDateTime(entry.updatedAt)}. The gateway returned no flight for ${number} on ${date}.`
              : `The gateway returned no flight for ${number} on ${date}. No substitute flight is shown.`,
          );
          return;
        }
        setFlight(fresh);
        setProvenance(response.provenance);
        setSource("gateway");
        setError(null);
        if (entry) {
          try {
            const updated = await addTrackedFlight(fresh);
            if (updated.id !== entry.id) {
              await removeTrackedFlight(entry.id);
            }
            if (active) setTrackedEntry(updated);
          } catch (cause) {
            console.warn("Could not update the tracked-flight snapshot", cause);
          }
        }
      } catch (cause) {
        if (!active) return;
        const message = describeGatewayError(cause);
        setError(
          entry
            ? `Showing the cached snapshot from ${formatDateTime(entry.updatedAt)}. Refresh failed: ${message}`
            : message,
        );
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [
    fetchGatewayFlight,
    paramDate,
    paramNumber,
    parsed.date,
    parsed.flightNumber,
    routeId,
  ]);

  const refresh = async () => {
    if (!flight) return;
    const date =
      operatingDateForFlight(flight) || paramDate || parsed.date || null;
    if (!date) {
      setError(
        "This flight has no operating date, so live status cannot be refreshed.",
      );
      return;
    }
    setRefreshing(true);
    setError(null);
    setNotice(null);
    try {
      if (trackedEntry) {
        const refreshed = await refreshTrackedFlight(trackedEntry.id);
        if (!refreshed) throw new Error("The tracked flight is no longer cached.");
        setFlight(refreshed.flight);
        setTrackedEntry(refreshed);
        setProvenance(null);
        setSource("gateway");
        setNotice("Cached snapshot refreshed from the gateway.");
      } else {
        const response = await fetchGatewayFlight(flight.flightNumber, date);
        const fresh = pickFlight(response.flights, flight.flightNumber);
        if (!fresh) {
          throw new Error(
            `The gateway returned no flight for ${flight.flightNumber} on ${date}.`,
          );
        }
        setFlight(fresh);
        setProvenance(response.provenance);
        setSource("gateway");
        setNotice("Live status refreshed from the gateway.");
      }
    } catch (cause) {
      setError(describeGatewayError(cause));
    } finally {
      setRefreshing(false);
    }
  };

  const track = async () => {
    if (!flight) return;
    setError(null);
    try {
      const entry = await addTrackedFlight(flight);
      setTrackedEntry(entry);
      setNotice(
        "Snapshot saved locally and, when signed in, mirrored to the watchlist.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Could not cache this flight: ${cause.message}`
          : "Could not cache this flight.",
      );
    }
  };

  const untrack = async () => {
    if (!trackedEntry) return;
    setError(null);
    try {
      await removeTrackedFlight(trackedEntry.id);
      setTrackedEntry(null);
      setNotice("Flight removed from the local tracked-flight cache.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Could not remove the cached flight: ${cause.message}`
          : "Could not remove the cached flight.",
      );
    }
  };

  const ensureCached = async (): Promise<TrackedFlightEntry | null> => {
    if (trackedEntry) return trackedEntry;
    if (!flight) return null;
    const entry = await addTrackedFlight(flight);
    setTrackedEntry(entry);
    return entry;
  };

  const openTerminal = async () => {
    if (!flight || busyAction) return;
    setBusyAction("terminal");
    let entry = trackedEntry;
    try {
      entry = await ensureCached();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Terminal map will open without a cached flight context: ${cause.message}`
          : "Terminal map will open without a cached flight context.",
      );
    }
    const terminalParams: Record<string, string> = {
      iata: flight.origin.code,
    };
    const departureTerminal = flight.terminalDeparture.trim();
    if (departureTerminal && departureTerminal !== "—") {
      terminalParams.terminal = /^\d+$/.test(departureTerminal)
        ? `T${departureTerminal}`
        : departureTerminal.toUpperCase();
    }
    if (entry) terminalParams.flightId = entry.id;
    if (params.arrivalGate?.trim()) {
      terminalParams.arrivalGate = params.arrivalGate.trim();
    }
    if (params.departureGate?.trim()) {
      terminalParams.departureGate = params.departureGate.trim();
    }
    if (params.arrivalTime?.trim()) {
      terminalParams.arrivalTime = params.arrivalTime.trim();
    }
    if (params.boardingTime?.trim()) {
      terminalParams.boardingTime = params.boardingTime.trim();
    }
    router.push({
      pathname: "/terminal/[iata]",
      params: terminalParams,
    });
    setBusyAction(null);
  };

  const openHud = async () => {
    if (!flight || busyAction) return;
    setBusyAction("hud");
    try {
      const entry = await ensureCached();
      if (!entry) {
        setError("This flight could not be cached for the offline HUD.");
        return;
      }
      router.push({
        pathname: "/hud",
        params: { flightId: entry.id },
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Could not cache this flight for the HUD: ${cause.message}`
          : "Could not cache this flight for the HUD.",
      );
    } finally {
      setBusyAction(null);
    }
  };

  if (loading && !flight) {
    return (
      <Screen>
        <ActivityIndicator color={COLORS.radar} />
        <Subtitle>Loading the flight from the gateway or offline cache…</Subtitle>
      </Screen>
    );
  }

  if (!flight) {
    return (
      <Screen>
        <Badge tone="amber">FLIGHT UNAVAILABLE</Badge>
        <Title>No flight snapshot</Title>
        <EmptyState
          title="This flight could not be loaded"
          detail={
            error ??
            "Open a result from flight search so the flight number and operating date are known."
          }
        />
        <PrimaryButton
          label="Search flights"
          onPress={() => router.push("/flights")}
        />
      </Screen>
    );
  }

  const departureGate = displayText(flight.gateDeparture);
  const arrivalGate = displayText(flight.gateArrival);
  const delayValue = flight.delayReported
    ? `${flight.delayMinutes} min`
    : "Not reported";
  const hasConnectionContext = [
    params.arrivalGate,
    params.departureGate,
    params.arrivalTime,
    params.boardingTime,
  ].some((value) => Boolean(value?.trim()));

  return (
    <Screen>
      <Row style={{ justifyContent: "space-between" }}>
        <View style={{ flex: 1 }}>
          <Badge tone="radar">
            {source === "gateway" ? "GATEWAY RESPONSE" : "CACHED SNAPSHOT"}
          </Badge>
          <Title>{flight.flightNumber}</Title>
          <Subtitle>
            {flight.airline} · {flight.origin.city} → {flight.destination.city}
          </Subtitle>
        </View>
        <Badge tone={statusTone(flight)}>{statusLabel(flight)}</Badge>
      </Row>

      {refreshing ? (
        <Row>
          <ActivityIndicator color={COLORS.radar} />
          <Text style={styles.note}>Refreshing from the gateway…</Text>
        </Row>
      ) : null}
      {error ? (
        <Card style={styles.warningCard}>
          <Label>Refresh issue</Label>
          <Text style={styles.warning}>{error}</Text>
        </Card>
      ) : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <View>
            <Label>Status</Label>
            <Text style={styles.statusValue}>{statusLabel(flight)}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.statLabel}>Delay</Text>
            <Text
              style={[
                styles.statusValue,
                flight.delayReported && flight.delayMinutes > 0
                  ? { color: COLORS.amber }
                  : null,
              ]}
            >
              {delayValue}
            </Text>
          </View>
        </Row>
        {flight.delayReported && flight.delayReason ? (
          <Text style={styles.note}>Reason: {flight.delayReason}</Text>
        ) : null}
        <Text style={styles.note}>
          {flight.statusReported
            ? flight.statusNote || "No additional status note was provided."
            : `Provider status not reported${
                flight.statusRaw.trim()
                  ? ` (raw: ${flight.statusRaw.trim()})`
                  : ""
              }. AeroQuest does not present an inferred status as fact.`}
        </Text>
        <Divider />
        <Row>
          <Stat
            label="Scheduled"
            value={`${formatClock(flight.departureTimeScheduled)} → ${formatClock(
              flight.arrivalTimeScheduled,
            )}`}
          />
          <Stat
            label="Estimated"
            value={`${formatClock(flight.departureTimeEstimated)} → ${formatClock(
              flight.arrivalTimeEstimated,
            )}`}
          />
          <Stat
            label="Actual"
            value={`${formatClock(flight.departureTimeActual)} → ${formatClock(
              flight.arrivalTimeActual,
            )}`}
          />
        </Row>
      </Card>

      <Card>
        <Label>Gates & terminals</Label>
        <Row>
          <Stat label="Departure terminal" value={displayText(flight.terminalDeparture)} />
          <Stat label="Departure gate" value={departureGate} />
          <Stat label="Check-in" value={displayText(flight.checkInCounter)} />
        </Row>
        <Divider />
        <Row>
          <Stat label="Arrival terminal" value={displayText(flight.terminalArrival)} />
          <Stat label="Arrival gate" value={arrivalGate} />
          <Stat label="Baggage" value={displayText(flight.baggageCarousel)} />
        </Row>
        <Text style={styles.note}>
          Missing gates and belts are shown as not reported. The terminal map is
          opened only for {flight.origin.code}; no gate pin is invented.
        </Text>
      </Card>

      <Card>
        <Label>Aircraft</Label>
        <Row>
          <Stat label="Type" value={displayText(flight.aircraft.model)} />
          <Stat label="Registration" value={displayText(flight.aircraft.registration)} />
          <Stat label="Age" value={displayText(flight.aircraft.age)} />
        </Row>
        <Row>
          <Stat label="Wi-Fi" value={displayBoolean(flight.aircraft.wifiAvailable)} />
          <Stat label="Power" value={displayBoolean(flight.aircraft.powerOutlets)} />
          <Stat label="Seat layout" value={displayText(flight.aircraft.seatLayout)} />
        </Row>
      </Card>

      <Row>
        <PrimaryButton
          label={busyAction === "terminal" ? "Opening…" : "Terminal map"}
          onPress={() => void openTerminal()}
          loading={busyAction === "terminal"}
          disabled={busyAction != null}
          style={{ flex: 1 }}
        />
        <GhostButton
          label={busyAction === "hud" ? "Caching…" : "Offline HUD"}
          onPress={() => void openHud()}
          style={{ flex: 1 }}
        />
      </Row>
      <Row>
        <GhostButton
          label={refreshing ? "Refreshing…" : "Refresh status"}
          onPress={() => void refresh()}
          style={{ flex: 1 }}
        />
        <GhostButton
          label={trackedEntry ? "Remove tracking" : "Track flight"}
          onPress={() => void (trackedEntry ? untrack() : track())}
          style={{ flex: 1 }}
        />
        <GhostButton
          label="Flight search"
          onPress={() => router.push("/flights")}
          style={{ flex: 1 }}
        />
      </Row>

      {hasConnectionContext ? (
        <Card>
          <Label>Connection context</Label>
          <Row>
            <Stat label="Arrival gate" value={displayText(params.arrivalGate)} />
            <Stat label="Departure gate" value={displayText(params.departureGate)} />
            <Stat label="Arrival time" value={displayText(params.arrivalTime)} />
            <Stat label="Boarding time" value={displayText(params.boardingTime)} />
          </Row>
          <Text style={styles.note}>
            Sprint Mode starts on the terminal map only when the gates and times
            above are complete. Missing values are never estimated.
          </Text>
        </Card>
      ) : null}

      {flight.timeline.length ? (
        <Card>
          <Label>Provider timeline</Label>
          {flight.timeline.map((item, index) => (
            <View key={`${item.title}-${index}`} style={styles.timelineRow}>
              <View
                style={[
                  styles.timelineDot,
                  item.isCompleted && styles.timelineDotDone,
                ]}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.timelineTitle}>
                  {item.title} · {formatClock(item.time)}
                </Text>
                <Text style={styles.note}>{item.description}</Text>
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      <Card>
        <Label>Snapshot provenance</Label>
        <Text style={styles.provenance}>
          {source === "gateway"
            ? "Live gateway response"
            : "Local tracked-flight snapshot"}
          {trackedEntry ? ` · cached ${formatDateTime(trackedEntry.updatedAt)}` : ""}
        </Text>
        {provenance ? (
          <>
            <Text style={styles.provenance}>
              {provenance.source}
              {provenance.cached ? " · cached" : ""}
              {provenance.stale ? " · stale" : ""} · fetched{" "}
              {formatDateTime(provenance.fetchedAt)}
            </Text>
            <Text style={styles.note}>{provenance.attribution}</Text>
          </>
        ) : null}
        <Text style={styles.note}>
          Flight source {displayText(flight.source)} · provider fetched{" "}
          {formatDateTime(flight.fetchedAt)}
        </Text>
      </Card>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  warningCard: { borderColor: COLORS.amber, backgroundColor: "#1a1408" },
  warning: { color: COLORS.amber, fontSize: 12, lineHeight: 18 },
  notice: { color: COLORS.green, fontSize: 12, lineHeight: 18 },
  note: { color: COLORS.muted, fontSize: 11, lineHeight: 17 },
  statusValue: { color: COLORS.white, fontSize: 20, fontWeight: "900" },
  stat: { flex: 1, minWidth: 88 },
  statLabel: {
    color: COLORS.muted,
    fontSize: 9,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  statValue: { color: COLORS.white, fontSize: 14, fontWeight: "700", marginTop: 2 },
  timelineRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    paddingVertical: 4,
  },
  timelineDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.muted,
    marginTop: 4,
  },
  timelineDotDone: { backgroundColor: COLORS.radar, borderColor: COLORS.radar },
  timelineTitle: { color: COLORS.white, fontSize: 12, fontWeight: "700" },
  provenance: { color: COLORS.radar, fontSize: 11, fontWeight: "700" },
});
