import { useEffect, useRef, type ReactNode } from "react";
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { COLORS, RADIUS, TOUCH } from "../lib/theme";

type Tone = "radar" | "amber" | "green" | "red" | "muted" | "blue";

function toneColor(tone: Tone) {
  switch (tone) {
    case "amber":
      return COLORS.amber;
    case "green":
      return COLORS.green;
    case "red":
      return COLORS.red;
    case "muted":
      return COLORS.muted;
    case "blue":
      return COLORS.blue;
    default:
      return COLORS.radar;
  }
}

export function Screen({
  children,
  scroll = true,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const content = <View style={[styles.content, style]}>{children}</View>;
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
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

export function SectionHeader({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderText}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.title} accessibilityRole="header">
      {children}
    </Text>
  );
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
  tone?: Tone;
}) {
  const color = toneColor(tone);
  return (
    <View style={[styles.badge, { borderColor: `${color}66` }]}>
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
  style,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone?: "radar" | "amber" | "muted";
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}) {
  const background =
    tone === "amber"
      ? COLORS.amber
      : tone === "muted"
        ? COLORS.surface2
        : COLORS.radar;
  const foreground = tone === "muted" ? COLORS.text : COLORS.cockpit;
  const blocked = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: Boolean(blocked), busy: Boolean(loading) }}
      onPress={onPress}
      disabled={blocked}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: background,
          borderColor: tone === "muted" ? COLORS.line : background,
          opacity: blocked ? 0.45 : pressed ? 0.82 : 1,
        },
        style,
      ]}
    >
      <Text style={[styles.buttonText, { color: foreground }]}>
        {loading ? "Working…" : label}
      </Text>
    </Pressable>
  );
}

export function GhostButton({
  label,
  onPress,
  style,
  disabled,
}: {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.ghost,
        disabled && { opacity: 0.45 },
        pressed && { opacity: 0.65 },
        style,
      ]}
    >
      <Text style={styles.ghostText}>{label}</Text>
    </Pressable>
  );
}

export function ListRow({
  code,
  title,
  detail,
  onPress,
  trailing,
  muted,
}: {
  code: string;
  title: string;
  detail?: string;
  onPress: () => void;
  trailing?: ReactNode;
  muted?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={detail}
      onPress={onPress}
      style={({ pressed }) => [styles.listRow, pressed && styles.pressed]}
    >
      <View style={[styles.rowCode, muted && styles.rowCodeMuted]}>
        <Text style={[styles.rowCodeText, muted && { color: COLORS.muted }]}>
          {code}
        </Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{title}</Text>
        {detail ? (
          <Text style={styles.rowDetail} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
      {trailing ?? <Text style={styles.rowChevron}>›</Text>}
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

export function Skeleton({
  height = 16,
  width = "100%",
  style,
}: {
  height?: number;
  width?: number | `${number}%`;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.85,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={[
        styles.skeleton,
        { height, width, opacity },
        style,
      ]}
    />
  );
}

export function StatePanel({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.statePanel}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDetail}>{detail}</Text>
      {action ? <View style={styles.stateAction}>{action}</View> : null}
    </View>
  );
}

export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <Card>
      <StatePanel title={title} detail={detail} action={action} />
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.cockpit },
  scroll: { paddingBottom: 40, flexGrow: 1 },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 16,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.line,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.lg,
    padding: 16,
    gap: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 6,
  },
  sectionHeaderText: { flex: 1, gap: 2 },
  sectionTitle: {
    color: COLORS.white,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
  sectionDetail: { color: COLORS.subtle, fontSize: 13, lineHeight: 18 },
  title: {
    color: COLORS.white,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  subtitle: { color: COLORS.muted, fontSize: 15, lineHeight: 22 },
  label: {
    color: COLORS.subtle,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  badge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: COLORS.surface2,
  },
  badgeText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },
  button: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    minHeight: TOUCH,
  },
  buttonText: { fontSize: 15, fontWeight: "700" },
  ghost: {
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.line,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: TOUCH,
  },
  ghostText: { color: COLORS.text, fontSize: 14, fontWeight: "600" },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: TOUCH,
    paddingVertical: 10,
  },
  pressed: { opacity: 0.7 },
  rowCode: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.line,
    backgroundColor: COLORS.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  rowCodeMuted: { backgroundColor: "transparent" },
  rowCodeText: {
    color: COLORS.radar,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  rowBody: { flex: 1, gap: 1 },
  rowTitle: { color: COLORS.white, fontSize: 15, fontWeight: "600" },
  rowDetail: { color: COLORS.muted, fontSize: 13, lineHeight: 18 },
  rowChevron: { color: COLORS.subtle, fontSize: 22, marginTop: -2 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.line },
  statePanel: { alignItems: "center", paddingVertical: 20, gap: 6 },
  stateAction: { marginTop: 10 },
  emptyTitle: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
  emptyDetail: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  skeleton: {
    backgroundColor: COLORS.surface3,
    borderRadius: RADIUS.sm,
  },
});
