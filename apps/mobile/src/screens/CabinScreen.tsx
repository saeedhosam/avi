import { Canvas } from "@react-three/fiber/native";
import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
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
  SectionHeader,
  Subtitle,
  Title,
} from "../../src/components/ui";
import { COLORS, RADIUS } from "../../src/lib/theme";

const QUICK_SEATS = ["1A", "14A", "30K", "42A"] as const;

export default function CabinScreen() {
  const params = useLocalSearchParams() as { type?: string; seat?: string };
  const aircraftType = (params.type ?? "B77W").toUpperCase();
  const [seatNumber, setSeatNumber] = useState(
    (params.seat ?? "14A").toUpperCase(),
  );
  // Seat labels repeat across decks on widebodies; track the deck explicitly
  // so the 3D highlight and the report describe the same physical seat.
  const [deck, setDeck] = useState<number | null>(null);
  const layout = useMemo(() => resolveCabinLayout(aircraftType), [aircraftType]);
  const resolved = useMemo(
    () =>
      resolveSeat(layout, seatNumber, deck == null ? undefined : { deck }),
    [layout, seatNumber, deck],
  );
  const activeDeck = deck ?? resolved.seat?.deck ?? null;
  const deckName =
    layout.decks.find((item) => item.index === activeDeck)?.name ?? null;

  const selectSeat = (seat: CabinSeat) => {
    setSeatNumber(seat.id);
    setDeck(seat.deck);
  };

  const jumpTo = (candidate: string) => {
    setSeatNumber(candidate);
    setDeck(null);
  };

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Badge>Pro · 3D cabin</Badge>
          <Title>{layout.aircraftType}</Title>
          <Subtitle>
            Parametric deck reconstruction. Seat details are reconstructed from
            the aircraft type and are not a certified cabin plan.
          </Subtitle>
        </View>
        <Badge tone="amber">{seatNumber}</Badge>
      </View>

      <Card style={styles.sceneCard}>
        <View style={styles.canvas}>
          <Canvas camera={{ position: [0, 15, 20], fov: 45 }}>
            <color attach="background" args={[COLORS.cockpit]} />
            <ambientLight intensity={0.8} />
            <directionalLight
              position={[8, 18, 10]}
              intensity={1.4}
              color="#bae6fd"
            />
            <directionalLight
              position={[-10, 8, -12]}
              intensity={0.5}
              color="#fbbf24"
            />
            <CabinScene
              layout={layout}
              selectedSeat={seatNumber}
              selectedDeck={activeDeck}
              onSeatSelect={selectSeat}
              autoRotate
            />
          </Canvas>
        </View>
        <View style={styles.sceneMeta}>
          <Text style={styles.hint}>
            {layout.decks.length} deck{layout.decks.length === 1 ? "" : "s"} ·{" "}
            {layout.seats.length} seats ·{" "}
            {layout.overheadBins[0]?.carryOnCapacity ?? 0} bag capacity
          </Text>
          <Text style={styles.hint}>Tap a seat to inspect it.</Text>
        </View>
      </Card>

      <Card>
        <SectionHeader
          title={resolved.seat ? `Seat ${resolved.seat.id}` : `Seat ${seatNumber}`}
          detail={deckName ?? "Deck not resolved"}
          action={
            resolved.seat ? (
              <Badge tone="muted">
                {resolved.seat.seatClass.replace("_", " ")}
              </Badge>
            ) : undefined
          }
        />
        {layout.decks.length > 1 ? (
          <Row style={styles.deckRow}>
            {layout.decks.map((item) => (
              <Pressable
                key={item.index}
                accessibilityRole="button"
                accessibilityState={{ selected: activeDeck === item.index }}
                onPress={() => setDeck(item.index)}
                style={({ pressed }) => [
                  styles.chip,
                  activeDeck === item.index && styles.chipActive,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    activeDeck === item.index && styles.chipTextActive,
                  ]}
                >
                  {item.name}
                </Text>
              </Pressable>
            ))}
          </Row>
        ) : null}
        <Divider />
        {resolved.seat ? (
          <View style={styles.detailList}>
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
                ? resolved.nearbyFeatures
                    .map((feature) => feature.label)
                    .join(" · ")
                : "No mapped features"}
            </Text>
          </View>
        ) : (
          <Text style={styles.missing}>
            Seat {seatNumber} is not present on{" "}
            {deckName ?? "this deck"}. No window, power, or legroom claim is
            generated.
          </Text>
        )}
      </Card>

      <Card>
        <Label>Jump to a seat</Label>
        <Row style={styles.deckRow}>
          {QUICK_SEATS.map((candidate) => (
            <Pressable
              key={candidate}
              accessibilityRole="button"
              accessibilityLabel={`Inspect seat ${candidate}`}
              onPress={() => jumpTo(candidate)}
              style={({ pressed }) => [
                styles.chip,
                seatNumber === candidate && styles.chipActive,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  seatNumber === candidate && styles.chipTextActive,
                ]}
              >
                {candidate}
              </Text>
            </Pressable>
          ))}
        </Row>
        <Text style={styles.note}>
          Repeating labels such as 14A exist on more than one deck. Choose the
          deck above before comparing.
        </Text>
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
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 4,
  },
  headerText: { flex: 1, gap: 8 },
  sceneCard: { padding: 8, gap: 8 },
  canvas: { height: 360, borderRadius: RADIUS.md, overflow: "hidden" },
  sceneMeta: { gap: 2, paddingHorizontal: 6, paddingBottom: 4 },
  hint: { color: COLORS.subtle, fontSize: 12, lineHeight: 17 },
  detailList: { gap: 8 },
  detail: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  detailLabel: { color: COLORS.muted, fontSize: 13, minWidth: 76 },
  detailValue: {
    color: COLORS.text,
    fontSize: 13,
    flex: 1,
    textAlign: "right",
    lineHeight: 18,
  },
  nearby: { color: COLORS.radar, fontSize: 13, lineHeight: 19 },
  missing: { color: COLORS.amber, fontSize: 14, lineHeight: 20 },
  bin: { color: COLORS.white, fontSize: 14, fontWeight: "600" },
  note: { color: COLORS.subtle, fontSize: 12, lineHeight: 18 },
  deckRow: { gap: 8 },
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: RADIUS.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.line,
    backgroundColor: COLORS.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: {
    borderColor: `${COLORS.radar}66`,
    backgroundColor: `${COLORS.radar}18`,
  },
  chipText: { color: COLORS.muted, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: COLORS.radar },
});
