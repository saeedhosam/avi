"use client";

import {
  Canvas,
  useFrame,
  type ThreeElements,
} from "@react-three/fiber";
import {
  useMemo,
  useRef,
  type ComponentType,
  type ReactNode,
} from "react";
import { Color, type Group, type Mesh } from "three";
import type {
  AircraftCabinLayout,
  CabinFeature,
  CabinSeat,
  SeatClass,
} from "@avi/shared";

export interface CabinViewer3DProps {
  layout: AircraftCabinLayout;
  selectedSeat?: string | null;
  onSeatSelect?: (seat: CabinSeat) => void;
  /** Rotate the whole cabin slowly; disabled in screenshots/tests. */
  autoRotate?: boolean;
  className?: string;
  /**
   * Native shells pass `Canvas` from `@react-three/fiber/native`; the web
   * default is the DOM canvas. The scene graph is identical on both.
   */
  canvas?: ComponentType<{
    camera?: ThreeElements["camera"];
    children?: ReactNode;
    shadows?: boolean;
    dpr?: [number, number];
  }>;
}

const CLASS_COLORS: Record<SeatClass, string> = {
  FIRST: "#f4c95d",
  BUSINESS: "#7bdff2",
  PREMIUM_ECONOMY: "#b2f7ef",
  ECONOMY: "#5f6c7b",
};

const FEATURE_COLORS: Record<CabinFeature["kind"], string> = {
  LAVATORY: "#64b5f6",
  GALLEY: "#ffb74d",
  EMERGENCY_EXIT: "#66bb6a",
  OVERHEAD_BIN: "#78909c",
  CLOSET: "#8d6e63",
  STAIRS: "#ab47bc",
  CREW_REST: "#90a4ae",
  WINDOW: "#e1f5fe",
};

const DECK_GAP = 8;
const DECK_WIDTH = 5.4;
const DECK_LENGTH = 20;

function deckOffset(deckIndex: number, deckCount: number): number {
  return (deckIndex - (deckCount - 1) / 2) * DECK_GAP;
}

function seatPosition(seat: CabinSeat, deckCount: number): [number, number, number] {
  return [
    deckOffset(seat.deck, deckCount) + (seat.position.x - 0.5) * DECK_WIDTH,
    0.42,
    (seat.position.y - 0.5) * DECK_LENGTH,
  ];
}

function featurePosition(
  feature: CabinFeature,
  deckCount: number,
): [number, number, number] {
  return [
    deckOffset(feature.deck, deckCount) + (feature.position.x - 0.5) * DECK_WIDTH,
    0.4,
    (feature.position.y - 0.5) * DECK_LENGTH,
  ];
}

function SeatMesh({
  seat,
  selected,
  deckCount,
  onSelect,
}: {
  seat: CabinSeat;
  selected: boolean;
  deckCount: number;
  onSelect?: (seat: CabinSeat) => void;
}) {
  const position = seatPosition(seat, deckCount);
  return (
    <group position={position}>
      <mesh
        castShadow={false}
        receiveShadow={false}
        onClick={(event) => {
          event.stopPropagation();
          onSelect?.(seat);
        }}
        scale={selected ? 1.45 : 1}
      >
        <boxGeometry args={[0.34, selected ? 0.62 : 0.42, 0.34]} />
        <meshStandardMaterial
          color={selected ? "#f8fafc" : CLASS_COLORS[seat.seatClass]}
          emissive={selected ? new Color("#22d3ee") : new Color("#000000")}
          emissiveIntensity={selected ? 1.4 : 0}
          roughness={0.55}
          metalness={0.15}
        />
      </mesh>
      {selected ? <SelectedSeatRing /> : null}
    </group>
  );
}

function SelectedSeatRing() {
  const ref = useRef<Mesh>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const scale = 1 + Math.sin(state.clock.elapsedTime * 4) * 0.12;
    ref.current.scale.setScalar(scale);
    ref.current.rotation.z += 0.01;
  });
  return (
    <mesh ref={ref} position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.42, 0.045, 10, 28]} />
      <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={2} />
    </mesh>
  );
}

function FeatureMesh({
  feature,
  deckCount,
}: {
  feature: CabinFeature;
  deckCount: number;
}) {
  const position = featurePosition(feature, deckCount);
  const color = FEATURE_COLORS[feature.kind];
  if (feature.kind === "EMERGENCY_EXIT") {
    return (
      <mesh position={position}>
        <boxGeometry args={[0.12, 0.9, 1.1]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
      </mesh>
    );
  }
  if (feature.kind === "LAVATORY" || feature.kind === "GALLEY") {
    return (
      <group position={position}>
        <mesh>
          <boxGeometry args={[1.1, 0.8, 0.8]} />
          <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.45, 0]}>
          <boxGeometry args={[0.9, 0.1, 0.6]} />
          <meshStandardMaterial color="#0f172a" />
        </mesh>
      </group>
    );
  }
  return (
    <mesh position={position}>
      <boxGeometry args={[0.8, 0.6, 0.8]} />
      <meshStandardMaterial color={color} transparent opacity={0.8} />
    </mesh>
  );
}

/**
 * Pure R3F cabin scene. Render it inside a platform Canvas (web or native).
 * The selected seat is highlighted and every deck is laid out side by side.
 */
export function CabinScene({
  layout,
  selectedSeat,
  onSeatSelect,
  autoRotate = true,
}: Omit<CabinViewer3DProps, "className" | "canvas">) {
  const groupRef = useRef<Group>(null);
  const deckCount = Math.max(1, layout.decks.length);
  const seats = useMemo(() => layout.seats, [layout.seats]);
  const features = useMemo(() => layout.features, [layout.features]);

  useFrame((_, delta) => {
    if (autoRotate && groupRef.current) {
      groupRef.current.rotation.y += delta * 0.12;
    }
  });

  return (
    <group ref={groupRef}>
      {layout.decks.map((deck) => (
        <group key={deck.index} position={[deckOffset(deck.index, deckCount), 0, 0]}>
          <mesh position={[0, -0.18, 0]} receiveShadow>
            <boxGeometry args={[DECK_WIDTH + 0.8, 0.22, DECK_LENGTH + 1.4]} />
            <meshStandardMaterial color="#0b1220" roughness={0.95} />
          </mesh>
          <mesh position={[0, 0.02, 0]}>
            <boxGeometry args={[DECK_WIDTH, 0.04, DECK_LENGTH]} />
            <meshStandardMaterial color="#132033" roughness={0.9} />
          </mesh>
          {/* Aisle centreline */}
          <mesh position={[0, 0.06, 0]}>
            <boxGeometry args={[0.08, 0.02, DECK_LENGTH - 0.6]} />
            <meshStandardMaterial color="#22d3ee" emissive="#0e7490" emissiveIntensity={0.6} />
          </mesh>
        </group>
      ))}
      {features.map((feature) => (
        <FeatureMesh key={feature.id} feature={feature} deckCount={deckCount} />
      ))}
      {seats.map((seat) => (
        <SeatMesh
          key={`${seat.deck}-${seat.id}`}
          seat={seat}
          selected={selectedSeat?.toUpperCase() === seat.id}
          deckCount={deckCount}
          onSelect={onSeatSelect}
        />
      ))}
    </group>
  );
}

/**
 * Web/native cabin viewer. Web gets the R3F DOM Canvas automatically; native
 * callers pass `canvas={NativeCanvas}` from `@react-three/fiber/native`.
 */
export function CabinViewer3D({
  layout,
  selectedSeat,
  onSeatSelect,
  autoRotate = true,
  className,
  canvas,
}: CabinViewer3DProps) {
  const CanvasImpl = canvas ?? Canvas;
  return (
    <div className={className} style={{ width: "100%", height: "100%" }}>
      <CanvasImpl
        camera={{ position: [0, 16, 20], fov: 45 }}
        shadows={false}
        dpr={[1, 2]}
      >
        <color attach="background" args={["#050b14"]} />
        <ambientLight intensity={0.8} />
        <directionalLight position={[8, 18, 10]} intensity={1.4} color="#bae6fd" />
        <directionalLight position={[-10, 8, -12]} intensity={0.5} color="#fbbf24" />
        <CabinScene
          layout={layout}
          selectedSeat={selectedSeat}
          onSeatSelect={onSeatSelect}
          autoRotate={autoRotate}
        />
      </CanvasImpl>
    </div>
  );
}
