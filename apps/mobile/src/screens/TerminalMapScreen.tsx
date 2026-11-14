import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, {
  Circle,
  G,
  Line,
  Path,
  Rect,
  Text as SvgText,
} from "react-native-svg";
import {
  AMENITY_META,
  QUICK_POI_FILTERS,
  airportTerminalLayoutSchema,
  buildTerminalGraph,
  emptyFogOfWarState,
  evaluateSprintMode,
  findNearestAmenity,
  recordFogVisit,
  type AirportTerminalLayout,
  type AmenityCategory,
  type Flight,
  type FogOfWarState,
  type PointF,
  type TerminalAmenity,
  type TerminalRoute,
} from "@avi/shared";
import terminalLayoutsJson from "@avi/catalog/terminal-layouts.json";
import {
  Badge,
  Card,
  Divider,
  GhostButton,
  Label,
  Row,
  Screen,
  Subtitle,
  Title,
} from "../../src/components/ui";
import { useAuth } from "../../src/lib/auth";
import {
  displayText,
  formatClock,
  statusLabel,
  statusTone,
} from "../../src/lib/flightDisplay";
import { recordPassportVisit } from "../../src/lib/passport";
import { COLORS } from "../../src/lib/theme";
import { getTrackedFlight } from "../../src/lib/trackedFlights";
import OsmTerminalGraphScreen from "./OsmTerminalGraphScreen";

const LAYOUTS = (terminalLayoutsJson as unknown[])
  .map((layout) => airportTerminalLayoutSchema.safeParse(layout))
  .filter((parsed) => parsed.success)
  .map((parsed) => parsed.data);

const MAP_WIDTH = 360;
const MAP_HEIGHT = 300;

function iso(point: PointF): [number, number] {
  return [
    (point.x - point.y) * 155 + MAP_WIDTH / 2,
    (point.x + point.y) * 72 + 55,
  ];
}

export default function TerminalMapScreen() {
  const params = useLocalSearchParams() as {
    iata?: string;
    terminal?: string;
    flightId?: string;
    arrivalGate?: string;
    departureGate?: string;
    arrivalTime?: string;
    boardingTime?: string;
  };
  const flightId = params.flightId?.trim() ?? "";
  const { configured, user } = useAuth();
  const [flightContext, setFlightContext] = useState<Flight | null>(null);
  const [flightContextState, setFlightContextState] = useState<
    "idle" | "loading" | "found" | "missing"
  >("idle");

  useEffect(() => {
    if (!flightId) {
      setFlightContext(null);
      setFlightContextState("idle");
      return;
    }
    let active = true;
    setFlightContext(null);
    setFlightContextState("loading");
    getTrackedFlight(flightId)
      .then((entry) => {
        if (!active) return;
        if (entry) {
          setFlightContext(entry.flight);
          setFlightContextState("found");
        } else {
          setFlightContext(null);
          setFlightContextState("missing");
        }
      })
      .catch(() => {
        if (!active) return;
        setFlightContext(null);
        setFlightContextState("missing");
      });
    return () => {
      active = false;
    };
  }, [flightId]);

  const airportCode = (
    params.iata ??
    flightContext?.origin.code ??
    "JFK"
  ).toUpperCase();
  const layout = useMemo<AirportTerminalLayout | null>(
    () =>
      LAYOUTS.find((candidate) => candidate.airportCode === airportCode) ?? null,
    [airportCode],
  );
  const [level, setLevel] = useState<number>(layout?.availableLevels[0] ?? 1);
  const [filter, setFilter] = useState<AmenityCategory>("ALL");
  const [selected, setSelected] = useState<TerminalAmenity | null>(null);
  const [route, setRoute] = useState<TerminalRoute | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fog, setFog] = useState<FogOfWarState>(() => emptyFogOfWarState());

  const graph = useMemo(() => (layout ? buildTerminalGraph(layout) : null), [layout]);

  useEffect(() => {
    if (!layout) return;
    setLevel(layout.availableLevels[0] ?? 1);
    setFog((state) =>
      recordFogVisit(state, {
        airportCode: layout.airportCode,
        terminalId: layout.terminalId,
        level: layout.availableLevels[0] ?? 1,
      }),
    );
    void recordPassportVisit({
      airportCode: layout.airportCode,
      terminalId: layout.terminalId,
      level: layout.availableLevels[0] ?? 1,
    });
  }, [layout]);

  const floor = layout?.floors[String(level)] ?? null;
  const floorAmenities =
    layout?.amenities.filter((amenity) => amenity.level === level) ?? [];

  const nearest = useMemo(() => {
    if (!layout || !graph || filter === "ALL") return null;
    const security = graph.nodes.find((node) => node.kind === "security");
    if (!security) return null;
    return findNearestAmenity(graph, layout, security.id, filter, { level });
  }, [layout, graph, filter, level]);

  useEffect(() => {
    if (nearest) {
      setSelected(nearest.amenity);
      setRoute(nearest.route);
    }
  }, [nearest]);

  const sprintInput = useMemo(() => {
    const arrivalGate = params.arrivalGate?.trim();
    const departureGate =
      params.departureGate?.trim() || flightContext?.gateDeparture?.trim();
    const arrivalTime = params.arrivalTime?.trim();
    const boardingTime = params.boardingTime?.trim();
    if (!arrivalGate || !departureGate || !arrivalTime || !boardingTime) {
      return null;
    }
    return { arrivalGate, departureGate, arrivalTime, boardingTime };
  }, [
    flightContext,
    params.arrivalGate,
    params.arrivalTime,
    params.boardingTime,
    params.departureGate,
  ]);

  const sprintMissingFields = useMemo(() => {
    const missing: string[] = [];
    if (!params.arrivalGate?.trim()) missing.push("arrival gate");
    if (!(params.departureGate?.trim() || flightContext?.gateDeparture?.trim())) {
      missing.push("departure gate");
    }
    if (!params.arrivalTime?.trim()) missing.push("arrival time");
    if (!params.boardingTime?.trim()) missing.push("boarding time");
    return missing;
  }, [
    flightContext,
    params.arrivalGate,
    params.arrivalTime,
    params.boardingTime,
    params.departureGate,
  ]);

  const partialConnection = [
    params.arrivalGate,
    params.departureGate,
    params.arrivalTime,
    params.boardingTime,
  ].some((value) => Boolean(value?.trim()));

  const sprint = useMemo(() => {
    if (!layout || !graph || !sprintInput) return null;
    return evaluateSprintMode({
      layout,
      graph,
      ...sprintInput,
    });
  }, [layout, graph, sprintInput]);

  const activeRoute = sprint?.active ? sprint.route : route;
  const awaitingFlightContext = Boolean(
    flightId && flightContextState === "loading" && !params.iata,
  );

  if (awaitingFlightContext) {
    return (
      <Screen>
        <Title>Terminal map</Title>
        <Subtitle>Loading the tracked-flight context from the local cache…</Subtitle>
      </Screen>
    );
  }

  if (!layout || !floor || !graph) {
    const ingestedTerminal = params.terminal?.trim();
    if (ingestedTerminal) {
      const normalized = /^\d+$/.test(ingestedTerminal)
        ? `T${ingestedTerminal}`
        : ingestedTerminal.toUpperCase();
      return (
        <OsmTerminalGraphScreen iata={airportCode} terminal={normalized} />
      );
    }
    return (
      <Screen>
        <Title>Terminal map unavailable</Title>
        <Subtitle>
          No curated indoor layout exists for {airportCode}. AeroQuest does not
          substitute another airport&apos;s terminal.
        </Subtitle>
        <Card>
          <Label>Ingested OSM graphs</Label>
          <Subtitle>
            Open this screen with a terminal id (for example T3) to use an
            ingested OpenStreetMap indoor graph when one exists.
          </Subtitle>
        </Card>
      </Screen>
    );
  }

  const viewBox = [
    MAP_WIDTH / 2 - MAP_WIDTH / 2 / zoom,
    MAP_HEIGHT / 2 - MAP_HEIGHT / 2 / zoom,
    MAP_WIDTH / zoom,
    MAP_HEIGHT / zoom,
  ].join(" ");

  const changeLevel = (next: number) => {
    setLevel(next);
    setSelected(null);
    setRoute(null);
    setFog((state) =>
      recordFogVisit(state, {
        airportCode: layout.airportCode,
        terminalId: layout.terminalId,
        level: next,
      }),
    );
    void recordPassportVisit({
      airportCode: layout.airportCode,
      terminalId: layout.terminalId,
      level: next,
    });
  };

  return (
    <Screen>
      <Row style={{ justifyContent: "space-between" }}>
        <View>
          <Badge>{layout.airportCode} · {layout.terminalId}</Badge>
          <Title>{layout.terminalName}</Title>
        </View>
        <Badge tone="muted">L{level}</Badge>
      </Row>
      <Subtitle>
        Isometric terminal radar built from curated indoor POIs. Route estimates
        are approximate and not certified navigation.
      </Subtitle>

      {flightContext ? (
        <Card>
          <Row style={{ justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Label>Tracked flight context</Label>
              <Text style={styles.contextFlight}>
                {flightContext.flightNumber}
              </Text>
              <Text style={styles.note}>
                {flightContext.origin.code} → {flightContext.destination.code}
              </Text>
            </View>
            <Badge tone={statusTone(flightContext)}>
              {statusLabel(flightContext)}
            </Badge>
          </Row>
          <Row>
            <Stat
              label="Departure terminal"
              value={displayText(flightContext.terminalDeparture)}
            />
            <Stat
              label="Departure gate"
              value={displayText(flightContext.gateDeparture)}
            />
            <Stat
              label="Estimated"
              value={formatClock(flightContext.departureTimeEstimated)}
            />
          </Row>
          {flightContext.origin.code !== airportCode ? (
            <Text style={styles.note}>
              The cached flight departs {flightContext.origin.code}, not{" "}
              {airportCode}. Its gate is not placed on this map.
            </Text>
          ) : null}
          {layout &&
          flightContext.terminalDeparture.trim() &&
          flightContext.terminalDeparture.trim().toUpperCase() !==
            layout.terminalId.toUpperCase() ? (
            <Text style={styles.note}>
              This map covers terminal {layout.terminalId}; the flight reports
              terminal {flightContext.terminalDeparture}. No gate pin is
              fabricated.
            </Text>
          ) : null}
        </Card>
      ) : flightContextState === "missing" ? (
        <Card>
          <Label>Tracked flight unavailable</Label>
          <Text style={styles.note}>
            The requested flight is not in the local tracked-flight cache, so no
            gate or connection context is shown.
          </Text>
        </Card>
      ) : null}

      {sprint?.active ? (
        <Card style={styles.sprintCard}>
          <Row style={{ justifyContent: "space-between" }}>
            <Badge tone={sprint.urgency === "critical" ? "red" : "amber"}>
              SPRINT MODE
            </Badge>
            <Text style={styles.sprintMinutes}>
              {Math.round(sprint.minutesUntilBoarding)} min
            </Text>
          </Row>
          <Text style={styles.sprintTitle}>{sprint.headline}</Text>
          <Text style={styles.sprintDetail}>{sprint.detail}</Text>
          <Text style={styles.sprintGates}>
            {sprint.arrivalGate} → {sprint.departureGate}
          </Text>
        </Card>
      ) : sprint ? (
        <Card>
          <Label>Connection timing</Label>
          <Text style={styles.contextFlight}>{sprint.headline}</Text>
          <Text style={styles.note}>{sprint.detail}</Text>
          <Text style={styles.sprintGates}>
            {sprint.arrivalGate} → {sprint.departureGate}
          </Text>
        </Card>
      ) : partialConnection && sprintMissingFields.length ? (
        <Card style={styles.contextWarning}>
          <Label>Connection context incomplete</Label>
          <Text style={styles.note}>
            Missing {sprintMissingFields.join(", ")}. Sprint Mode never estimates
            a gate or boarding time.
          </Text>
        </Card>
      ) : null}

      <Card style={styles.mapCard}>
        <Svg width="100%" height={MAP_HEIGHT} viewBox={viewBox}>
          <Rect x={0} y={0} width={MAP_WIDTH} height={MAP_HEIGHT} fill="#06111d" />
          {Array.from({ length: 8 }, (_, index) => (
            <Line
              key={`grid-${index}`}
              x1={0}
              y1={index * 42}
              x2={MAP_WIDTH}
              y2={index * 42}
              stroke={COLORS.radar}
              strokeWidth={0.3}
              opacity={0.09}
            />
          ))}
          {Array.from({ length: 9 }, (_, index) => (
            <Line
              key={`vgrid-${index}`}
              x1={index * 44}
              y1={0}
              x2={index * 44}
              y2={MAP_HEIGHT}
              stroke={COLORS.radar}
              strokeWidth={0.3}
              opacity={0.09}
            />
          ))}

          {floor.concourseSections.map((section) => {
            const [x1, y1] = iso(section.start);
            const [x2, y2] = iso(section.end);
            return (
              <G key={section.id}>
                <Line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={COLORS.line}
                  strokeWidth={26 * section.width * 8}
                  strokeLinecap="round"
                />
                <Line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#12293a"
                  strokeWidth={20 * section.width * 8}
                  strokeLinecap="round"
                />
              </G>
            );
          })}

          {(() => {
            const [x, y] = iso(floor.centralHubCenter);
            return (
              <G>
                <Circle cx={x} cy={y} r={34} fill="#0d1c2c" stroke={COLORS.line} />
                <SvgText x={x} y={y + 3} fill={COLORS.muted} fontSize={7} textAnchor="middle">
                  {floor.levelName}
                </SvgText>
              </G>
            );
          })()}

          {(() => {
            const [x, y] = iso(floor.securityPosition);
            return (
              <G>
                <Rect
                  x={x - 26}
                  y={y - 6}
                  width={52}
                  height={12}
                  rx={4}
                  fill="#1e2838"
                  stroke={COLORS.red}
                  strokeWidth={1}
                />
                <SvgText x={x} y={y + 2.5} fill="#fca5a5" fontSize={5} textAnchor="middle">
                  SECURITY
                </SvgText>
              </G>
            );
          })()}

          {activeRoute ? (
            <Path
              d={activeRoute.path
                .map((node, index) => {
                  const [x, y] = iso(node.point);
                  return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
                })
                .join(" ")}
              fill="none"
              stroke={sprint?.active ? COLORS.amber : COLORS.radar}
              strokeWidth={3}
              strokeDasharray="7 5"
              strokeLinecap="round"
            />
          ) : null}

          {floorAmenities.map((amenity) => {
            const [x, y] = iso(amenity.position);
            const meta = AMENITY_META[amenity.category];
            const isSelected = selected?.id === amenity.id;
            return (
              <G key={amenity.id}>
                {isSelected ? (
                  <Circle cx={x} cy={y} r={13} fill={meta.color} opacity={0.22} />
                ) : null}
                <Circle
                  cx={x}
                  cy={y}
                  r={isSelected ? 7 : 5}
                  fill={isSelected ? meta.color : "#0b1424"}
                  stroke={meta.color}
                  strokeWidth={1.4}
                  onPress={() => {
                    setSelected(amenity);
                    setRoute(null);
                  }}
                />
                <SvgText
                  x={x}
                  y={y + 2.2}
                  fill={isSelected ? COLORS.cockpit : COLORS.white}
                  fontSize={isSelected ? 5.5 : 4.5}
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {amenity.gateNumber ?? meta.shortLabel}
                </SvgText>
              </G>
            );
          })}
        </Svg>

        <Row>
          {layout.availableLevels.map((option) => (
            <Pressable
              key={option}
              onPress={() => changeLevel(option)}
              style={[styles.level, level === option && styles.levelActive]}
            >
              <Text
                style={[
                  styles.levelText,
                  level === option && { color: COLORS.cockpit },
                ]}
              >
                L{option}
              </Text>
            </Pressable>
          ))}
          <View style={{ flex: 1 }} />
          <GhostButton label="−" onPress={() => setZoom((value) => Math.max(1, value - 0.25))} />
          <GhostButton label="+" onPress={() => setZoom((value) => Math.min(2.5, value + 0.25))} />
        </Row>
      </Card>

      <Card>
        <Label>Quick filters · nearest route</Label>
        <Row>
          {QUICK_POI_FILTERS.map((item) => (
            <Pressable
              key={item.category}
              onPress={() => setFilter(item.category)}
              style={[
                styles.pill,
                filter === item.category && {
                  backgroundColor: AMENITY_META[item.category].color,
                  borderColor: AMENITY_META[item.category].color,
                },
              ]}
            >
              <Text
                style={[
                  styles.pillText,
                  filter === item.category && { color: COLORS.cockpit },
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </Row>
        {filter !== "ALL" && !nearest ? (
          <Text style={styles.note}>
            No reachable {filter.toLowerCase()} POI is mapped on level {level}.
          </Text>
        ) : null}
      </Card>

      {selected ? (
        <Card>
          <Row style={{ justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Label>{AMENITY_META[selected.category].displayName}</Label>
              <Text style={styles.amenityName}>{selected.name}</Text>
              <Subtitle>{selected.locationDescription}</Subtitle>
            </View>
            <Badge>{selected.level === 0 ? "ARRIVALS" : `L${selected.level}`}</Badge>
          </Row>
          <Divider />
          <Row>
            <Stat label="Walk" value={`${selected.walkTimeFromSecurityMinutes} min`} />
            <Stat label="Distance" value={`${selected.walkDistanceMeters} m`} />
            <Stat
              label="Wait"
              value={
                selected.waitTimeMinutes != null
                  ? `${selected.waitTimeMinutes} min`
                  : "Not reported"
              }
            />
          </Row>
          {route ? (
            <Text style={styles.routeText}>
              Fastest mapped route · {route.estimatedMinutes} min ·{" "}
              {route.totalDistanceMeters} m
              {route.usesMovingWalkway ? " · moving walkway" : ""}
              {route.usesTrain ? " · terminal train" : ""}
            </Text>
          ) : null}
          <Text style={styles.note}>
            {selected.openingHours} · {selected.features.join(" · ") || "No features reported"}
          </Text>
        </Card>
      ) : null}

      <Card>
        <Label>Fog-of-war passport</Label>
        <Subtitle>
          {fog.visitedTerminalKeys.length} terminal level
          {fog.visitedTerminalKeys.length === 1 ? "" : "s"} cleared this session.
          {fog.badges.length ? ` Badges: ${fog.badges.join(", ")}.` : ""}
        </Subtitle>
        <Text style={styles.note}>
          {user
            ? `Signed in as ${user.email ?? "your account"}. New visits are sent to the passport sync endpoint in the background.`
            : configured
              ? "Sign in from Account to persist visits across devices. This session still tracks local fog-of-war."
              : "Supabase is not configured, so passport visits stay local to this session."}
        </Text>
      </Card>

      {!sprint && !partialConnection ? (
        <Card>
          <Label>Tight-Connection Sprint Mode</Label>
          <Subtitle>
            Open the terminal map from a flight detail or connection alert with
            arrival gate, departure gate, arrival time, and boarding time. A
            tracked flight can supply only its own departure gate; the inbound
            gate and times must be explicit. Under 45 minutes, this screen
            switches to the high-contrast sprint HUD.
          </Subtitle>
        </Card>
      ) : null}
    </Screen>
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
  mapCard: { padding: 10, gap: 10 },
  sprintCard: {
    borderColor: COLORS.amber,
    backgroundColor: "#1a1408",
  },
  sprintMinutes: { color: COLORS.amber, fontSize: 26, fontWeight: "900" },
  sprintTitle: { color: COLORS.white, fontSize: 22, fontWeight: "900" },
  sprintDetail: { color: COLORS.amber, fontSize: 13, fontWeight: "600" },
  sprintGates: { color: COLORS.muted, fontSize: 12, letterSpacing: 1 },
  contextFlight: {
    color: COLORS.white,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  contextWarning: { borderColor: COLORS.amber, backgroundColor: "#1a1408" },
  level: {
    borderRadius: 9,
    borderWidth: 1,
    borderColor: COLORS.line,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  levelActive: { backgroundColor: COLORS.radar, borderColor: COLORS.radar },
  levelText: { color: COLORS.text, fontSize: 11, fontWeight: "800" },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.line,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillText: { color: COLORS.text, fontSize: 10, fontWeight: "700" },
  amenityName: { color: COLORS.white, fontSize: 20, fontWeight: "800", marginTop: 2 },
  stat: { flex: 1, minWidth: 80 },
  statLabel: {
    color: COLORS.muted,
    fontSize: 9,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  statValue: { color: COLORS.white, fontSize: 16, fontWeight: "800" },
  routeText: { color: COLORS.radar, fontSize: 12, fontWeight: "700" },
  note: { color: COLORS.muted, fontSize: 11, lineHeight: 17 },
});
