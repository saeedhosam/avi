import { Canvas } from "@react-three/fiber/native";
import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  resolveCabinLayout,
  resolveSeat,
  type CabinSeat,
} from "@avi/shared";
import { CabinScene } from "@avi/ui/cabin/CabinViewer3D";
import {
  Badge,
  Card,
  Divider,
  Label,
  Row,
  Screen,
  Subtitle,
  Title,
} from "../../src/components/ui";
import { COLORS } from "../../src/lib/theme";

export default function CabinScreen() {
  const params = useLocalSearchParams() as { type?: string; seat?: string };
  const aircraftType = (params.type ?? "B77W").toUpperCase();
  const [seatNumber, setSeatNumber] = useState((params.seat ?? "14A").toUpperCase());
  const layout = useMemo(() => resolveCabinLayout(aircraftType), [aircraftType]);
  const resolved = useMemo(
    () => resolveSeat(layout, seatNumber),
    [layout, seatNumber],
  );

  const onSeatSelect = (seat: CabinSeat) => {
    setSeatNumber(seat.id);
  };

  return (
    <Screen>
      <Row style={{ justifyContent: "space-between" }}>
        <View>
          <Badge>PRO · 3D CABIN</Badge>
          <Title>{layout.aircraftType} Seat Twin</Title>
        </View>
        <Badge tone="amber">{seatNumber}</Badge>
      </Row>
      <Subtitle>
        Parametric deck reconstruction. Tap any seat to inspect window
        alignment, pitch, power, and nearby lavatories/exits. This preview is
        free; live seat tracking and saved trip cabins require Pro or a
        Single-Trip Pass.
      </Subtitle>

      <Card style={styles.sceneCard}>
        <View style={styles.canvas}>
          <Canvas camera={{ position: [0, 15, 20], fov: 45 }}>
            <color attach="background" args={["#050b14"]} />
            <ambientLight intensity={0.8} />
            <directionalLight position={[8, 18, 10]} intensity={1.4} color="#bae6fd" />
            <directionalLight position={[-10, 8, -12]} intensity={0.5} color="#fbbf24" />
            <CabinScene
              layout={layout}
              selectedSeat={seatNumber}
              onSeatSelect={onSeatSelect}
              autoRotate
            />
          </Canvas>
        </View>
        <Row>
          <Text style={styles.hint}>
            {layout.decks.length} deck{layout.decks.length === 1 ? "" : "s"} ·{" "}
            {layout.seats.length} seats · {layout.overheadBins[0]?.carryOnCapacity ?? 0} bag capacity
          </Text>
        </Row>
      </Card>

      <Card>
        <Label>Seat report</Label>
        {resolved.seat ? (
          <>
            <Row style={{ justifyContent: "space-between" }}>
              <Text style={styles.seatNumber}>{resolved.seat.id}</Text>
              <Badge>{resolved.seat.seatClass.replace("_", " ")}</Badge>
            </Row>
            <Divider />
            <Detail label="Window" value={resolved.windowNote} />
            <Detail label="Legroom" value={resolved.legroomNote} />
            <Detail label="Power" value={resolved.powerNote} />
            <Detail
              label="Lavatory"
              value={
                resolved.distanceToLavatoryMeters != null
                  ? `~${resolved.distanceToLavatoryMeters} m`
                  : "Not reported"
              }
            />
            <Detail
              label="Exit"
              value={
                resolved.distanceToExitMeters != null
                  ? `~${resolved.distanceToExitMeters} m`
                  : "Not reported"
              }
            />
            <Divider />
            <Text style={styles.nearby}>
              Nearby:{" "}
              {resolved.nearbyFeatures.length
                ? resolved.nearbyFeatures.map((feature) => feature.label).join(" · ")
                : "No mapped features"}
            </Text>
          </>
        ) : (
          <Text style={styles.missing}>
            Seat {seatNumber} is not present in this parametric layout. No
            window, power, or legroom claim is generated.
          </Text>
        )}
      </Card>

      <Card>
        <Label>Overhead bin</Label>
        {layout.overheadBins.map((bin) => (
          <Text key={bin.aircraftType} style={styles.bin}>
            {bin.widthCm} × {bin.heightCm} × {bin.depthCm} cm ·{" "}
            {bin.carryOnCapacity} standard bags
          </Text>
        ))}
        <Text style={styles.note}>{layout.disclaimer}</Text>
      </Card>

      <Card>
        <Label>Recently selected</Label>
        <Row>
          {["1A", "14A", "30K", "42A"].map((candidate) => (
            <Text
              key={candidate}
              onPress={() => setSeatNumber(candidate)}
              style={[styles.quick, seatNumber === candidate && styles.quickActive]}
            >
              {candidate}
            </Text>
          ))}
        </Row>
      </Card>
    </Screen>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sceneCard: { padding: 8, gap: 8 },
  canvas: { height: 360, borderRadius: 16, overflow: "hidden" },
  hint: { color: COLORS.muted, fontSize: 11, paddingHorizontal: 6 },
  seatNumber: { color: COLORS.white, fontSize: 34, fontWeight: "900" },
  detail: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  detailLabel: { color: COLORS.muted, fontSize: 12, minWidth: 70 },
  detailValue: { color: COLORS.text, fontSize: 12, flex: 1, textAlign: "right" },
  nearby: { color: COLORS.radar, fontSize: 12, lineHeight: 18 },
  missing: { color: COLORS.amber, fontSize: 13, lineHeight: 19 },
  bin: { color: COLORS.white, fontSize: 14, fontWeight: "700" },
  note: { color: COLORS.muted, fontSize: 11, lineHeight: 17 },
  quick: {
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    fontWeight: "700",
  },
  quickActive: {
    backgroundColor: COLORS.radar,
    borderColor: COLORS.radar,
    color: COLORS.cockpit,
  },
});
