import { Barometer } from "expo-sensors";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  CabinPressureTracker,
  buildOfflineInflightState,
  type CabinAltitudeEstimate,
} from "@avi/shared";
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
import { COLORS } from "../../src/lib/theme";

interface HudParams {
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

export default function OfflineInflightHudScreen() {
  const params = useLocalSearchParams() as HudParams;
  const [now, setNow] = useState(() => new Date().toISOString());
  const [sample, setSample] = useState(false);
  const [pressure, setPressure] = useState<number | null>(null);
  const [barometerAvailable, setBarometerAvailable] = useState<boolean | null>(null);
  const [cabin, setCabin] = useState<CabinAltitudeEstimate | null>(null);
  const tracker = useMemo(() => new CabinPressureTracker(), []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date().toISOString()), 30_000);
    return () => clearInterval(timer);
  }, []);

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

  const input = sample
    ? {
        flightNumber: "AEROQUEST DEMO",
        originCode: "JFK",
        destinationCode: "LHR",
        originLat: "40.6413",
        originLon: "-73.7781",
        destLat: "51.47",
        destLon: "-0.4543",
        takeoffAt: new Date(Date.now() - 2.5 * 3_600_000).toISOString(),
        landingAt: new Date(Date.now() + 4 * 3_600_000).toISOString(),
      }
    : params;

  const canBuild =
    input.originLat != null &&
    input.originLon != null &&
    input.destLat != null &&
    input.destLon != null &&
    input.takeoffAt != null &&
    input.landingAt != null;

  const state = useMemo(() => {
    if (!canBuild) return null;
    return buildOfflineInflightState({
      flight: {
        id: `${input.flightNumber ?? "UNKNOWN"}-offline`,
        flightNumber: input.flightNumber ?? "UNKNOWN",
        origin: { code: input.originCode ?? "---" },
        destination: { code: input.destinationCode ?? "---" },
        departureTimeActual: input.takeoffAt ?? null,
        arrivalTimeEstimated: input.landingAt ?? "",
      },
      origin: {
        latitude: Number(input.originLat),
        longitude: Number(input.originLon),
      },
      destination: {
        latitude: Number(input.destLat),
        longitude: Number(input.destLon),
      },
      takeoffAt: input.takeoffAt!,
      landingAt: input.landingAt!,
      now,
      pressureHpa: pressure,
      landmarks: [
        { name: "Greenland ice sheet", latitude: 72, longitude: -40 },
        { name: "Iceland", latitude: 64.9, longitude: -19 },
        { name: "Irish coast", latitude: 53.4, longitude: -8 },
      ],
    });
  }, [canBuild, input, now, pressure]);

  if (!canBuild) {
    return (
      <Screen>
        <Badge tone="amber">PRO · OFFLINE</Badge>
        <Title>In-flight HUD</Title>
        <Subtitle>
          This HUD needs a cached route: origin/destination coordinates plus
          actual takeoff and estimated landing times. Nothing is invented when
          the flight is unknown.
        </Subtitle>
        <EmptyState
          title="No cached flight selected"
          detail="Open the HUD from a tracked flight, or load the clearly-labelled sample route to preview the display."
        />
        <PrimaryButton
          label="Load sample route (not live)"
          tone="amber"
          onPress={() => setSample(true)}
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

  if (!state) return null;

  return (
    <Screen>
      <Row style={{ justifyContent: "space-between" }}>
        <View>
          <Badge tone="amber">{sample ? "SAMPLE ROUTE · NOT LIVE" : "OFFLINE HUD"}</Badge>
          <Title>{state.flightNumber}</Title>
          <Subtitle>
            {state.originCode} → {state.destinationCode}
          </Subtitle>
        </View>
        <Badge>{state.cabin.phase.replace("_", " ")}</Badge>
      </Row>

      <Card style={styles.hud}>
        <Row style={{ justifyContent: "space-between" }}>
          <View>
            <Text style={styles.hudLabel}>Cabin altitude</Text>
            <Text style={styles.hudValue}>
              {state.cabin.source === "NONE"
                ? "Unavailable"
                : `${state.cabin.cabinAltitudeFeet.toLocaleString()} ft`}
            </Text>
          </View>
          <View>
            <Text style={styles.hudLabel}>Progress</Text>
            <Text style={styles.hudValue}>
              {Math.round(state.position.progress * 100)}%
            </Text>
          </View>
          <View>
            <Text style={styles.hudLabel}>Remaining</Text>
            <Text style={styles.hudValue}>
              {Math.round(state.position.distanceRemainingKm).toLocaleString()} km
            </Text>
          </View>
        </Row>
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
            : `Pressure ${state.cabin.pressureHpa.toFixed(1)} hPa · ${state.cabin.verticalRateFpm != null ? `${state.cabin.verticalRateFpm} fpm` : "trend pending"}`}
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
                {item.label} · {new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Text>
              <Text style={styles.note}>{item.detail}</Text>
            </View>
          </View>
        ))}
      </Card>

      <Card>
        <Label>Under the flight path</Label>
        {state.callouts.length ? (
          state.callouts.map((callout) => (
            <Divider key={callout.name} />
          ))
        ) : null}
        {state.callouts.length ? (
          state.callouts.map((callout) => (
            <Text key={`${callout.name}-label`} style={styles.callout}>
              {callout.name} · {callout.distanceKm} km off track ·{" "}
              {new Date(callout.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Text>
          ))
        ) : (
          <Text style={styles.note}>No bundled landmarks near this route.</Text>
        )}
      </Card>

      <Card>
        <Label>Data integrity</Label>
        <Subtitle>
          Position is interpolated along the cached great-circle route from the
          actual takeoff timestamp. Cabin altitude comes only from the phone
          barometer; meal and lights events are estimates, not crew
          announcements.
        </Subtitle>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hud: { borderColor: COLORS.radar, backgroundColor: "#071a24" },
  hudLabel: {
    color: COLORS.muted,
    fontSize: 9,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  hudValue: { color: COLORS.white, fontSize: 20, fontWeight: "900" },
  progressTrack: {
    height: 8,
    backgroundColor: COLORS.surface2,
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: { height: 8, backgroundColor: COLORS.radar, borderRadius: 999 },
  pressure: { color: COLORS.radar, fontSize: 12, fontWeight: "600" },
  note: { color: COLORS.muted, fontSize: 11, lineHeight: 16 },
  timelineRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", paddingVertical: 5 },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.muted,
    marginTop: 4,
  },
  dotDone: { backgroundColor: COLORS.radar, borderColor: COLORS.radar },
  timelineLabel: { color: COLORS.white, fontSize: 12, fontWeight: "700" },
  callout: { color: COLORS.radar, fontSize: 12, paddingVertical: 4 },
});
