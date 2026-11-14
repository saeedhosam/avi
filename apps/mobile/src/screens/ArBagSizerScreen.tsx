import { CameraView, useCameraPermissions } from "expo-camera";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  compareBagToBin,
  resolveCabinLayout,
  type CarryOnFitResult,
} from "@avi/shared";
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
} from "../../src/components/ui";
import { COLORS } from "../../src/lib/theme";

const AIRCRAFT = ["A320", "B789", "B77W", "A388"] as const;

export default function ArBagSizerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [aircraft, setAircraft] = useState<(typeof AIRCRAFT)[number]>("B77W");
  const [width, setWidth] = useState("55");
  const [height, setHeight] = useState("40");
  const [depth, setDepth] = useState("20");
  const [result, setResult] = useState<CarryOnFitResult | null>(null);

  const layout = useMemo(() => resolveCabinLayout(aircraft), [aircraft]);
  const bin = layout.overheadBins[0]!;

  const measure = () => {
    const bag = {
      widthCm: Number(width),
      heightCm: Number(height),
      depthCm: Number(depth),
    };
    if (
      ![bag.widthCm, bag.heightCm, bag.depthCm].every(
        (value) => Number.isFinite(value) && value > 0,
      )
    ) {
      setResult(null);
      return;
    }
    setResult(compareBagToBin(bag, bin));
  };

  return (
    <Screen>
      <Badge tone="amber">PRO · AR CARRY-ON SIZER</Badge>
      <Title>Will it fit?</Title>
      <Subtitle>
        Frame your bag in the camera, then enter its dimensions. AeroQuest
        compares the bag against the selected aircraft&apos;s overhead-bin
        envelope.
      </Subtitle>

      <Card>
        <Label>Aircraft</Label>
        <Row>
          {AIRCRAFT.map((type) => (
            <Pressable
              key={type}
              onPress={() => {
                setAircraft(type);
                setResult(null);
              }}
              style={[styles.pill, aircraft === type && styles.pillActive]}
            >
              <Text
                style={[
                  styles.pillText,
                  aircraft === type && { color: COLORS.cockpit },
                ]}
              >
                {type}
              </Text>
            </Pressable>
          ))}
        </Row>
        <Text style={styles.note}>
          Bin envelope: {bin.widthCm} × {bin.heightCm} × {bin.depthCm} cm ·{" "}
          {bin.note}
        </Text>
      </Card>

      {!permission ? (
        <Card>
          <ActivityIndicator color={COLORS.radar} />
        </Card>
      ) : !permission.granted ? (
        <Card>
          <Subtitle>
            Camera access frames the bag and shows the measurement overlay.
          </Subtitle>
          <PrimaryButton label="Allow camera" onPress={() => void requestPermission()} />
        </Card>
      ) : (
        <Card style={styles.cameraCard}>
          <CameraView style={styles.camera} facing="back" />
          <View pointerEvents="none" style={styles.overlay}>
            <View style={styles.frame} />
            <Text style={styles.overlayText}>
              Align the widest bag edges inside the frame
            </Text>
          </View>
        </Card>
      )}

      <Card>
        <Label>Measured dimensions (cm)</Label>
        <Row>
          <DimensionInput label="Width" value={width} onChange={setWidth} />
          <DimensionInput label="Height" value={height} onChange={setHeight} />
          <DimensionInput label="Depth" value={depth} onChange={setDepth} />
        </Row>
        <PrimaryButton label="Check overhead-bin fit" onPress={measure} />
        <Text style={styles.note}>
          Camera calibration is the largest source of error. Treat a borderline
          result as a prompt to check at the gate, not a guarantee.
        </Text>
      </Card>

      {result ? (
        <Card style={{ borderColor: result.fits ? COLORS.green : COLORS.red }}>
          <Row style={{ justifyContent: "space-between" }}>
            <Badge tone={result.fits ? "green" : "red"}>
              {result.fits ? "FITS" : "DOES NOT FIT"}
            </Badge>
            <Badge tone="muted">{result.orientation ?? "no orientation"}</Badge>
          </Row>
          <Title>{result.advice}</Title>
          <Divider />
          <Row>
            <Stat label="Bag volume" value={`${result.bagVolumeLiters} L`} />
            <Stat label="Bin volume" value={`${result.binVolumeLiters} L`} />
            <Stat
              label="Overage"
              value={result.excessCm ? `${result.excessCm} cm` : "0 cm"}
            />
          </Row>
          {result.limitingAxis ? (
            <Text style={styles.warning}>
              Limiting axis: {result.limitingAxis}
            </Text>
          ) : null}
          <GhostButton label="Measure another bag" onPress={() => setResult(null)} />
        </Card>
      ) : null}
    </Screen>
  );
}

function DimensionInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.dimension}>
      <Text style={styles.dimensionLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        style={styles.input}
        placeholderTextColor={COLORS.muted}
      />
    </View>
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
  cameraCard: { padding: 8, gap: 8 },
  camera: { height: 280, borderRadius: 16, overflow: "hidden" },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  frame: {
    width: "72%",
    height: "58%",
    borderWidth: 2,
    borderColor: COLORS.radar,
    borderRadius: 14,
    backgroundColor: "rgba(34,211,238,0.05)",
  },
  overlayText: {
    color: COLORS.radar,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  pill: {
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillActive: { backgroundColor: COLORS.radar, borderColor: COLORS.radar },
  pillText: { color: COLORS.text, fontSize: 11, fontWeight: "800" },
  dimension: { flex: 1, minWidth: 80, gap: 4 },
  dimensionLabel: {
    color: COLORS.muted,
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "700",
  },
  stat: { flex: 1, minWidth: 80 },
  statLabel: {
    color: COLORS.muted,
    fontSize: 9,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  statValue: { color: COLORS.white, fontSize: 15, fontWeight: "800" },
  note: { color: COLORS.muted, fontSize: 11, lineHeight: 17 },
  warning: { color: COLORS.amber, fontSize: 12, fontWeight: "700" },
});
