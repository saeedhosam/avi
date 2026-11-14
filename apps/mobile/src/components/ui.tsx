import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { COLORS } from "../lib/theme";

export function Screen({
  children,
  scroll = true,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const content = (
    <View style={[styles.content, style]}>{children}</View>
  );
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Subtitle({ children }: { children: ReactNode }) {
  return <Text style={styles.subtitle}>{children}</Text>;
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Badge({
  children,
  tone = "radar",
}: {
  children: ReactNode;
  tone?: "radar" | "amber" | "green" | "red" | "muted";
}) {
  const color =
    tone === "amber"
      ? COLORS.amber
      : tone === "green"
        ? COLORS.green
        : tone === "red"
          ? COLORS.red
          : tone === "muted"
            ? COLORS.muted
            : COLORS.radar;
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{children}</Text>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  tone = "radar",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone?: "radar" | "amber" | "muted";
}) {
  const background =
    tone === "amber" ? COLORS.amber : tone === "muted" ? COLORS.surface2 : COLORS.radar;
  const foreground = tone === "radar" ? COLORS.cockpit : COLORS.cockpit;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <Text style={[styles.buttonText, { color: foreground }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function GhostButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.ghost, pressed && { opacity: 0.6 }]}
    >
      <Text style={styles.ghostText}>{label}</Text>
    </Pressable>
  );
}

export function Row({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <Card>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDetail}>{detail}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.cockpit },
  scroll: { paddingBottom: 48 },
  content: { padding: 16, gap: 14 },
  card: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.line,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 10,
  },
  title: { color: COLORS.white, fontSize: 28, fontWeight: "800", letterSpacing: 0.3 },
  subtitle: { color: COLORS.muted, fontSize: 14, lineHeight: 20 },
  label: {
    color: COLORS.radar,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  badge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  button: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  buttonText: { fontSize: 15, fontWeight: "800" },
  ghost: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
    paddingVertical: 12,
    alignItems: "center",
  },
  ghostText: { color: COLORS.text, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  divider: { height: 1, backgroundColor: COLORS.line, marginVertical: 4 },
  emptyTitle: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
  emptyDetail: { color: COLORS.muted, fontSize: 13, lineHeight: 19 },
});
