import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  Badge,
  Card,
  Label,
  Row,
  Screen,
  Subtitle,
  Title,
} from "../src/components/ui";
import { useAuth } from "../src/lib/auth";
import { HOME_AIRPORTS } from "../src/lib/config";
import { COLORS } from "../src/lib/theme";

const FEATURES = [
  {
    id: "flights",
    eyebrow: "LIVE GATEWAY · OFFLINE CACHE",
    title: "Flight Search & Tracking",
    detail:
      "Find a flight by number or airport board, track its live snapshot, and open gate, aircraft, terminal, and offline HUD context.",
    action: "Find a flight",
    href: "/flights",
  },
  {
    id: "explore",
    eyebrow: "FREE · WEB + MOBILE",
    title: "Direct Route Explorer",
    detail:
      "Pick a home airport and see every non-stop destination on a 3D-ready globe, colour-coded by haul and filtered by airline.",
    action: "Explore routes",
    href: "/explore/CAI",
  },
  {
    id: "terminal",
    eyebrow: "FREE 2D · PRO SPRINT",
    title: "Terminal Radar",
    detail:
      "A game-style indoor map with glowing POI pins, nearest restroom/power/water routing, and Tight-Connection Sprint Mode.",
    action: "Open JFK T4",
    href: "/terminal/JFK",
  },
  {
    id: "cabin",
    eyebrow: "PRO · 3D CABIN",
    title: "Seat Twin",
    detail:
      "Inspect a parametric cabin deck, highlight 14A, and review window alignment, pitch, power, lavatories, and exits.",
    action: "Open 777 cabin",
    href: "/cabin/B77W/14A",
  },
  {
    id: "scan",
    eyebrow: "FREE · ZERO API COST",
    title: "Boarding Pass Scanner",
    detail:
      "Scan PDF417, Aztec, or QR BCBP data on-device, parse the PNR, route, and seat locally, then fetch live status from the gateway.",
    action: "Scan a pass",
    href: "/scan",
  },
  {
    id: "bag",
    eyebrow: "PRO · AR SIZER",
    title: "Carry-On Fit Check",
    detail:
      "Measure a bag against the overhead-bin dimensions for the aircraft on your booking before you reach the gate.",
    action: "Size my bag",
    href: "/bag",
  },
  {
    id: "hud",
    eyebrow: "PRO · OFFLINE",
    title: "In-Flight HUD",
    detail:
      "Barometer-derived cabin altitude, great-circle progress, meal-service timeline, and landmark callouts with no signal.",
    action: "Open HUD",
    href: "/hud",
  },
] as const;

export default function HomeScreen() {
  const router = useRouter();
  const { configured, ready, user } = useAuth();

  return (
    <Screen>
      <View style={styles.hero}>
        <Badge>STARTER-SAFE GATEWAY</Badge>
        <Title>AeroQuest</Title>
        <Subtitle>
          One travel companion for route discovery, terminal sprints, 3D cabins,
          boarding passes, and offline flight awareness.
        </Subtitle>
      </View>

      <Pressable
        onPress={() => router.push("/auth")}
        style={({ pressed }) => [pressed && { opacity: 0.82 }]}
      >
        <Card>
          <Row style={{ justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Label>Account</Label>
              <Text style={styles.accountTitle}>
                {user
                  ? user.email ?? "Signed in"
                  : configured
                    ? "Sign in to sync"
                    : "Account unavailable"}
              </Text>
            </View>
            <Badge
              tone={
                user ? "green" : configured && ready ? "muted" : "amber"
              }
            >
              {user
                ? "SIGNED IN"
                : configured
                  ? ready
                    ? "SIGNED OUT"
                    : "RESTORING"
                  : "NOT CONFIGURED"}
            </Badge>
          </Row>
          <Text style={styles.note}>
            {user
              ? "Tracked flights, device push tokens, and passport visits sync through Supabase. Local snapshots still work offline."
              : configured
                ? "Sign in with a real Supabase account to sync tracked flights and terminal passport visits. No demo account is created."
                : "Supabase environment variables are missing. Local flights and the terminal map still work; account sync does not."}
          </Text>
          <Text style={styles.action}>
            {user ? "Manage account →" : "Open account →"}
          </Text>
        </Card>
      </Pressable>

      <Card>
        <Label>Choose your home airport</Label>
        <Row>
          {HOME_AIRPORTS.map((airport) => (
            <Pressable
              key={airport.iata}
              onPress={() => router.push(`/explore/${airport.iata}`)}
              style={({ pressed }) => [styles.hub, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.hubCode}>{airport.iata}</Text>
              <Text style={styles.hubCity}>{airport.city}</Text>
            </Pressable>
          ))}
        </Row>
        <Text style={styles.note}>
          Route statistics are cached for 7 days on the Hetzner gateway. Clients
          never call AeroDataBox directly.
        </Text>
      </Card>

      {FEATURES.map((feature) => (
        <Pressable
          key={feature.id}
          onPress={() => router.push(feature.href)}
          style={({ pressed }) => [pressed && { opacity: 0.82 }]}
        >
          <Card>
            <Text style={styles.eyebrow}>{feature.eyebrow}</Text>
            <Text style={styles.featureTitle}>{feature.title}</Text>
            <Text style={styles.featureDetail}>{feature.detail}</Text>
            <Text style={styles.action}>{feature.action} →</Text>
          </Card>
        </Pressable>
      ))}

      <Card>
        <Label>Data integrity</Label>
        <Subtitle>
          Missing gates, baggage belts, weather, or seat details are shown as
          unavailable. AeroQuest never fills gaps with guessed values.
        </Subtitle>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 8, paddingTop: 8, paddingBottom: 4 },
  hub: {
    flexGrow: 1,
    minWidth: 72,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.surface2,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  hubCode: {
    color: COLORS.radar,
    fontWeight: "900",
    fontSize: 18,
    letterSpacing: 1.5,
  },
  hubCity: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  accountTitle: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 2,
  },
  note: { color: COLORS.muted, fontSize: 11, lineHeight: 17 },
  eyebrow: {
    color: COLORS.amber,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  featureTitle: {
    color: COLORS.white,
    fontSize: 20,
    fontWeight: "800",
    marginTop: 2,
  },
  featureDetail: { color: COLORS.muted, fontSize: 13, lineHeight: 19 },
  action: { color: COLORS.radar, fontWeight: "800", marginTop: 4 },
});
