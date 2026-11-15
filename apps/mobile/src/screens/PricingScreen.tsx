import { useEffect, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  Badge,
  Card,
  Divider,
  GhostButton,
  Label,
  PrimaryButton,
  Row,
  Screen,
  Subtitle,
  Title,
} from "../components/ui";
import { GATEWAY_URL, WEB_APP_URL } from "../lib/config";
import { useAuth } from "../lib/auth";
import { getAccessToken } from "../lib/supabase";
import { COLORS } from "../lib/theme";

interface TripPassCheckout {
  url?: string;
  provider?: string;
  durationDays?: number;
  error?: string;
  message?: string;
}

const FREE_FEATURES = [
  "Direct Route Explorer and arrival weather",
  "Basic flight lookup and airport boards",
  "2D terminal maps and wayfinding",
  "Local tracked-flight snapshots",
];

const PRO_FEATURES = [
  "Instant gate, terminal, status, and baggage alerts",
  "3D Cabin & Seat Twin",
  "Tight-Connection Sprint Mode",
  "Offline in-flight barometer HUD",
  "Terminal fog-of-war passport",
  "AR carry-on bag sizer",
];

export default function PricingScreen() {
  const router = useRouter();
  const { user, configured } = useAuth();
  const [tripPass, setTripPass] = useState<TripPassCheckout | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void (async () => {
      try {
        const token = await getAccessToken();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12_000);
        const response = await fetch(`${GATEWAY_URL}/v1/billing/trip-pass`, {
          headers: {
            Accept: "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          signal: controller.signal,
        }).finally(() => clearTimeout(timer));
        const body = (await response.json().catch(() => null)) as
          | TripPassCheckout
          | null;
        if (active) setTripPass(body);
      } catch {
        if (active) {
          setTripPass({
            error: "trip_pass_unavailable",
            message: "The trip-pass checkout is temporarily unavailable.",
          });
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const openTripPass = async () => {
    if (!tripPass?.url) return;
    await Linking.openURL(tripPass.url);
  };

  return (
    <Screen>
      <Badge>PRO & TRIP PASS</Badge>
      <Title>Choose your AeroQuest</Title>
      <Subtitle>
        Free tools stay free. Pro adds live disruption alerts and the travel
        features; the $4.99 Single-Trip Pass unlocks the travel features for one
        trip without a subscription.
      </Subtitle>

      <Card>
        <Label>Free · forever</Label>
        <Text style={styles.price}>$0</Text>
        {FREE_FEATURES.map((feature) => (
          <Text key={feature} style={styles.feature}>
            ✓ {feature}
          </Text>
        ))}
        <Divider />
        <Text style={styles.note}>
          No account needed for the route explorer and 3D cabin preview.
        </Text>
      </Card>

      <Card style={styles.proCard}>
        <Label>Pro · monthly</Label>
        <Text style={styles.price}>$9.99 / month</Text>
        {PRO_FEATURES.map((feature) => (
          <Text key={feature} style={styles.feature}>
            ✓ {feature}
          </Text>
        ))}
        <PrimaryButton
          label={user ? "Open plan checkout on web" : "Sign in to choose"}
          tone="amber"
          onPress={() => {
            if (!user) {
              router.push("/auth");
              return;
            }
            void Linking.openURL(`${WEB_APP_URL}/pricing`);
          }}
        />
        <Text style={styles.note}>
          The web pricing page uses the gateway's configured billing provider.
          Card data never touches AeroQuest.
        </Text>
      </Card>

      <Card>
        <Label>Single-trip pass · one-time</Label>
        <Text style={styles.price}>
          $4.99 {tripPass?.durationDays ? `· ${tripPass.durationDays} days` : ""}
        </Text>
        <Text style={styles.feature}>
          ✓ Pro travel features for one trip
        </Text>
        <Text style={styles.feature}>✓ No subscription or renewal</Text>
        <PrimaryButton
          label={
            loading
              ? "Checking trip pass…"
              : tripPass?.url
                ? "Buy Single-Trip Pass"
                : "Trip pass not configured"
          }
          loading={loading}
          disabled={!tripPass?.url}
          onPress={() => void openTripPass()}
        />
        {tripPass?.error ? (
          <Text style={styles.warning}>
            {tripPass.message ?? "Trip-pass checkout is unavailable."}
          </Text>
        ) : null}
        <Text style={styles.note}>
          The hosted checkout is configured server-side. Nothing is charged when
          the endpoint returns unavailable, and the pass is granted only by a
          verified provider webhook.
        </Text>
      </Card>

      <Card>
        <Label>Account</Label>
        <Subtitle>
          {!configured
            ? "Supabase is not configured, so purchases and sync are unavailable in this build."
            : user
              ? `Signed in as ${user.email ?? "your account"}.`
              : "Sign in to link a purchase to your account."}
        </Subtitle>
        <Row>
          <GhostButton
            label={user ? "Manage account" : "Sign in"}
            onPress={() => router.push("/auth")}
          />
          <GhostButton
            label="Open web pricing"
            onPress={() => void Linking.openURL(`${WEB_APP_URL}/pricing`)}
          />
        </Row>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  price: {
    color: COLORS.white,
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.4,
    marginTop: 2,
  },
  feature: { color: COLORS.text, fontSize: 13, lineHeight: 20 },
  note: { color: COLORS.muted, fontSize: 12, lineHeight: 18 },
  warning: { color: COLORS.amber, fontSize: 13, lineHeight: 19 },
  proCard: { borderColor: `${COLORS.amber}66`, backgroundColor: COLORS.amberSurface },
});
