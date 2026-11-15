import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  Badge,
  Card,
  Label,
  ListRow,
  Row,
  Screen,
  SectionHeader,
  Subtitle,
  Title,
} from "../src/components/ui";
import { useAuth } from "../src/lib/auth";
import { HOME_AIRPORTS } from "../src/lib/config";
import { COLORS, RADIUS } from "../src/lib/theme";

const TOOLS = [
  {
    code: "TRM",
    title: "Terminal",
    detail: "Indoor gates, amenities, and sprint routing.",
    href: "/terminal/JFK",
    tag: "Free map",
  },
  {
    code: "CAB",
    title: "Cabin twin",
    detail: "Deck-aware seat map and window alignment.",
    href: "/cabin/B77W/14A",
    tag: "Pro",
  },
  {
    code: "SCN",
    title: "Scan pass",
    detail: "Read a boarding pass barcode on-device.",
    href: "/scan",
    tag: "Free",
  },
  {
    code: "BAG",
    title: "Bag fit",
    detail: "Check a carry-on against the cabin bins.",
    href: "/bag",
    tag: "Pro",
  },
  {
    code: "HUD",
    title: "Flight HUD",
    detail: "Offline progress, altitude, and landmarks.",
    href: "/hud",
    tag: "Pro",
  },
  {
    code: "PLN",
    title: "Plans",
    detail: "Compare Free, Pro, and the Trip Pass.",
    href: "/pricing",
    tag: "Billing",
  },
] as const;

export default function HomeScreen() {
  const router = useRouter();
  const { configured, ready, user } = useAuth();
  const accountLabel = user
    ? (user.email ?? "Signed in")
    : configured
      ? "Sign in to sync"
      : "Account unavailable";

  return (
    <Screen>
      <View style={styles.hero}>
        <Row style={styles.heroRow}>
          <Badge tone="muted">AEROQUEST</Badge>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open account"
            onPress={() => router.push("/auth")}
            style={({ pressed }) => [
              styles.accountChip,
              pressed && { opacity: 0.7 },
            ]}
          >
            <View style={styles.accountDot} />
            <Text style={styles.accountChipText} numberOfLines={1}>
              {user ? "Account" : "Sign in"}
            </Text>
          </Pressable>
        </Row>
        <Title>Where are you flying?</Title>
        <Subtitle>
          Live flight tracking, direct-route discovery, terminal wayfinding, and
          cabin tools in one companion.
        </Subtitle>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Find and track a flight"
        onPress={() => router.push("/flights")}
        style={({ pressed }) => [pressed && { opacity: 0.85 }]}
      >
        <View style={styles.primaryCard}>
          <View style={styles.primaryGlow} />
          <Label>Flight search</Label>
          <Text style={styles.primaryTitle}>Find and track a flight</Text>
          <Text style={styles.primaryDetail}>
            Search by flight number or airport board. Open live gate, aircraft,
            terminal, and offline HUD context.
          </Text>
          <View style={styles.primaryAction}>
            <Text style={styles.primaryActionText}>Open flight search</Text>
            <Text style={styles.primaryArrow}>→</Text>
          </View>
        </View>
      </Pressable>

      <Card>
        <Label>Explore non-stop routes</Label>
        <Text style={styles.cardBody}>
          Pick a home airport, then filter every direct destination by airline
          and haul.
        </Text>
        <View style={styles.hubRow}>
          {HOME_AIRPORTS.map((airport) => (
            <Pressable
              key={airport.iata}
              accessibilityRole="button"
              accessibilityLabel={`Explore routes from ${airport.city}`}
              onPress={() => router.push(`/explore/${airport.iata}`)}
              style={({ pressed }) => [
                styles.hub,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={styles.hubCode}>{airport.iata}</Text>
              <Text style={styles.hubCity} numberOfLines={1}>
                {airport.city}
              </Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <SectionHeader
        title="Trip tools"
        detail="Purpose-built utilities for the airport and the air."
      />
      <View style={styles.toolGrid}>
        {TOOLS.map((tool) => (
          <Pressable
            key={tool.code}
            accessibilityRole="button"
            accessibilityLabel={`${tool.title}. ${tool.detail}`}
            onPress={() => router.push(tool.href)}
            style={({ pressed }) => [
              styles.tool,
              pressed && { opacity: 0.75 },
            ]}
          >
            <View style={styles.toolTop}>
              <Text style={styles.toolCode}>{tool.code}</Text>
              <Text style={styles.toolTag}>{tool.tag}</Text>
            </View>
            <Text style={styles.toolTitle}>{tool.title}</Text>
            <Text style={styles.toolDetail} numberOfLines={3}>
              {tool.detail}
            </Text>
          </Pressable>
        ))}
      </View>

      <SectionHeader title="Account" />
      <Card style={styles.accountCard}>
        <ListRow
          code={user?.email?.[0]?.toUpperCase() ?? "AU"}
          title={accountLabel}
          detail={
            user
              ? "Tracked flights and terminal visits sync through Supabase."
              : configured
                ? "Sign in to sync your watchlist and push alerts."
                : "Account sync is not configured in this build."
          }
          onPress={() => router.push("/auth")}
          trailing={
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
                  : "LOCAL"}
            </Badge>
          }
          muted
        />
      </Card>

      <Text style={styles.footnote}>
        Missing gates, baggage belts, weather, or seat details are shown as
        unavailable. AeroQuest never fills gaps with guessed values.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 8, paddingTop: 4 },
  heroRow: { justifyContent: "space-between" },
  accountChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    minHeight: 36,
    borderRadius: RADIUS.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.line,
    backgroundColor: COLORS.surface,
  },
  accountDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.radar,
  },
  accountChipText: { color: COLORS.text, fontSize: 12, fontWeight: "600" },
  primaryCard: {
    overflow: "hidden",
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: `${COLORS.radar}59`,
    backgroundColor: COLORS.surface,
    padding: 18,
    gap: 6,
  },
  primaryGlow: {
    position: "absolute",
    top: -60,
    right: -30,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: `${COLORS.radar}12`,
  },
  primaryTitle: {
    color: COLORS.white,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  primaryDetail: { color: COLORS.muted, fontSize: 14, lineHeight: 20 },
  primaryAction: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  primaryActionText: { color: COLORS.radar, fontSize: 14, fontWeight: "700" },
  primaryArrow: { color: COLORS.radar, fontSize: 16 },
  cardBody: { color: COLORS.muted, fontSize: 14, lineHeight: 20 },
  hubRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  hub: {
    flexGrow: 1,
    minWidth: 88,
    minHeight: 56,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.line,
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.md,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  hubCode: {
    color: COLORS.white,
    fontWeight: "700",
    fontSize: 17,
    letterSpacing: 1,
  },
  hubCity: { color: COLORS.subtle, fontSize: 12, marginTop: 2 },
  toolGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tool: {
    flexGrow: 1,
    flexBasis: "46%",
    minHeight: 128,
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.line,
    backgroundColor: COLORS.surface,
    padding: 14,
    gap: 4,
  },
  toolTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  toolCode: {
    color: COLORS.radar,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  toolTag: { color: COLORS.subtle, fontSize: 12 },
  toolTitle: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
  toolDetail: { color: COLORS.muted, fontSize: 13, lineHeight: 18 },
  accountCard: { paddingVertical: 4 },
  footnote: {
    color: COLORS.subtle,
    fontSize: 12,
    lineHeight: 18,
    paddingBottom: 8,
  },
});
