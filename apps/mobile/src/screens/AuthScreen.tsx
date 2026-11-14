import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
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
import { useAuth } from "../lib/auth";
import {
  getPushEnvironment,
  type NotificationPermissionStatus,
  type PushEnvironment,
} from "../lib/push";
import { COLORS } from "../lib/theme";

type AuthMode = "signIn" | "signUp";

const PERMISSION_LABELS: Record<NotificationPermissionStatus, string> = {
  granted: "Granted",
  denied: "Denied",
  undetermined: "Not requested",
};

export default function AuthScreen() {
  const router = useRouter();
  const {
    configured,
    ready,
    user,
    pushStatus,
    signIn,
    signUp,
    signOut,
    refreshSession,
    registerPush,
  } = useAuth();
  const [mode, setMode] = useState<AuthMode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [environment, setEnvironment] = useState<PushEnvironment | null>(null);

  const refreshEnvironment = useCallback(async () => {
    setEnvironment(await getPushEnvironment());
  }, []);

  useEffect(() => {
    void refreshEnvironment();
  }, [refreshEnvironment, user, pushStatus.state]);

  const submit = async () => {
    setError(null);
    setNotice(null);
    if (mode === "signUp" && password !== confirmPassword) {
      setError("The two password fields do not match.");
      return;
    }
    setBusy(true);
    try {
      const result =
        mode === "signIn"
          ? await signIn(email, password)
          : await signUp(email, password);
      if (!result.ok) {
        setError(result.message ?? "Authentication failed.");
        return;
      }
      setNotice(result.message ?? null);
      if (mode === "signIn") setPassword("");
      await refreshEnvironment();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Authentication failed before a session was established.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRefreshSession = async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const result = await refreshSession();
      if (!result.ok) {
        setError(result.message ?? "Could not refresh the session.");
        return;
      }
      setNotice(result.message ?? "Session refreshed.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not refresh the session.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const result = await signOut();
      if (!result.ok) {
        setError(result.message ?? "Sign out failed.");
        return;
      }
      setPassword("");
      setConfirmPassword("");
      setNotice("Signed out. Local tracked flights remain on this device.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Sign out failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRegisterPush = async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const status = await registerPush();
      if (status.state === "registered") setNotice(status.message);
      else setError(status.message);
      await refreshEnvironment();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Push registration failed before a token was requested.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Badge tone={configured ? "radar" : "amber"}>ACCOUNT · SESSION</Badge>
      <Title>Pilot account</Title>
      <Subtitle>
        Sign in with a real Supabase account to sync tracked flights, device
        alerts, and the terminal passport. AeroQuest never creates demo or
        offline credentials.
      </Subtitle>

      {!configured ? (
        <Card style={styles.unconfigured}>
          <Badge tone="amber">SUPABASE NOT CONFIGURED</Badge>
          <Text style={styles.cardTitle}>Authentication is disabled</Text>
          <Subtitle>
            This build has no `EXPO_PUBLIC_SUPABASE_URL` or
            `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Add both to `apps/mobile/.env`,
            rebuild the client, and restart the bundler.
          </Subtitle>
          <Text style={styles.note}>
            No demo account or offline auth fallback is used. Flight search and
            the local tracked-flight cache still work without an account.
          </Text>
          <GhostButton
            label="Browse flights without an account"
            onPress={() => router.push("/flights")}
          />
        </Card>
      ) : !ready ? (
        <Card>
          <Label>Restoring session</Label>
          <Subtitle>Reading the persisted device session from Supabase…</Subtitle>
        </Card>
      ) : user ? (
        <Card>
          <Row style={{ justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Label>Signed in</Label>
              <Text style={styles.email}>{user.email ?? "Email not reported"}</Text>
              <Text style={styles.note}>User ID {user.id}</Text>
            </View>
            <Badge tone="green">SESSION ACTIVE</Badge>
          </Row>
          <Divider />
          <Text style={styles.note}>
            Access tokens refresh automatically while the app is active. Signing
            out clears this device session; Supabase rows are retained.
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          <Row>
            <PrimaryButton
              label="Refresh session"
              onPress={() => void handleRefreshSession()}
              loading={busy}
              style={{ flex: 1 }}
            />
            <GhostButton
              label={busy ? "Working…" : "Sign out"}
              onPress={() => void handleSignOut()}
              style={{ flex: 1 }}
            />
          </Row>
        </Card>
      ) : (
        <Card>
          <Row>
            <ModeButton
              label="Sign in"
              active={mode === "signIn"}
              onPress={() => {
                setMode("signIn");
                setError(null);
                setNotice(null);
              }}
            />
            <ModeButton
              label="Create account"
              active={mode === "signUp"}
              onPress={() => {
                setMode("signUp");
                setError(null);
                setNotice(null);
              }}
            />
          </Row>
          <Divider />
          <Label>Email</Label>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={COLORS.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            style={styles.input}
          />
          <Label>Password</Label>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder={mode === "signUp" ? "At least 8 characters" : "Password"}
            placeholderTextColor={COLORS.muted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={mode === "signUp" ? "new-password" : "current-password"}
            textContentType={
              mode === "signUp" ? "newPassword" : "password"
            }
            style={styles.input}
          />
          {mode === "signUp" ? (
            <>
              <Label>Confirm password</Label>
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Repeat the password"
                placeholderTextColor={COLORS.muted}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                style={styles.input}
              />
            </>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          <PrimaryButton
            label={mode === "signIn" ? "Sign in" : "Create account"}
            onPress={() => void submit()}
            loading={busy}
            disabled={!email.trim() || !password}
          />
          <Text style={styles.note}>
            {mode === "signIn"
              ? "Existing Supabase accounts only. There is no guest identity."
              : "Supabase may require email confirmation before the first sign-in."}
          </Text>
        </Card>
      )}

      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <Label>Push & notifications</Label>
          <Badge
            tone={
              pushStatus.state === "registered"
                ? "green"
                : pushStatus.state === "registering"
                  ? "radar"
                  : pushStatus.state === "signed-out"
                    ? "muted"
                    : "amber"
            }
          >
            {pushStatus.state.replace(/-/g, " ").toUpperCase()}
          </Badge>
        </Row>
        <StatusRow
          label="Supabase"
          value={configured ? "Configured" : "Not configured"}
          ok={configured}
        />
        <StatusRow
          label="Session"
          value={user ? user.email ?? "Signed in" : "Signed out"}
          ok={Boolean(user)}
        />
        <StatusRow
          label="Notification permission"
          value={
            environment
              ? PERMISSION_LABELS[environment.permission]
              : "Checking…"
          }
          ok={environment?.permission === "granted"}
        />
        <StatusRow
          label="EAS project ID"
          value={
            environment
              ? environment.projectId
                ? `${environment.projectId.slice(0, 12)}…`
                : "Missing from app config"
              : "Checking…"
          }
          ok={Boolean(environment?.projectId)}
        />
        <StatusRow
          label="Push token"
          value={
            pushStatus.token
              ? `${pushStatus.token.slice(0, 20)}…${
                  pushStatus.savedToSupabase ? " · saved" : " · not saved"
                }`
              : pushStatus.state === "registered"
                ? "Issued"
                : "Not issued"
          }
          ok={Boolean(pushStatus.token)}
        />
        <Text style={styles.note}>{pushStatus.message}</Text>
        <Row>
          <PrimaryButton
            label={
              pushStatus.state === "registering"
                ? "Registering…"
                : "Register / retry push"
            }
            onPress={() => void handleRegisterPush()}
            loading={busy || pushStatus.state === "registering"}
            disabled={!user}
            style={{ flex: 1 }}
          />
          <GhostButton
            label="Recheck status"
            onPress={() => void refreshEnvironment()}
            style={{ flex: 1 }}
          />
        </Row>
        <Text style={styles.note}>
          Expo push tokens require a physical device and an EAS project ID in
          `app.json`. Without that ID no token is requested and no alert is
          claimed to be active.
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

function StatusRow({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <Row style={styles.statusRow}>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={[styles.statusValue, { color: ok ? COLORS.green : COLORS.amber }]}>
        {value}
      </Text>
    </Row>
  );
}

const styles = StyleSheet.create({
  unconfigured: { borderColor: COLORS.amber, backgroundColor: "#1a1408" },
  cardTitle: { color: COLORS.white, fontSize: 18, fontWeight: "800" },
  email: {
    color: COLORS.white,
    fontSize: 20,
    fontWeight: "800",
    marginTop: 2,
  },
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
  error: { color: COLORS.red, fontSize: 12, lineHeight: 18 },
  notice: { color: COLORS.green, fontSize: 12, lineHeight: 18 },
  note: { color: COLORS.muted, fontSize: 11, lineHeight: 17 },
  statusRow: {
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.line,
    paddingVertical: 5,
  },
  statusLabel: { color: COLORS.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8 },
  statusValue: { fontSize: 12, fontWeight: "700" },
});
