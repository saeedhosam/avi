import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, {
  Circle,
  Line,
  Path,
  Text as SvgText,
} from "react-native-svg";
import {
  AMENITY_META,
  AeroQuestGatewayClient,
  QUICK_POI_FILTERS,
  shortestPath,
  type AmenityCategory,
  type TerminalGraphNode,
  type TerminalRoute,
  type TerminalSpatialGraph,
} from "@avi/shared";
import {
  Badge,
  Card,
  GhostButton,
  Label,
  Row,
  Screen,
  Subtitle,
  Title,
} from "../components/ui";
import { GATEWAY_URL } from "../lib/config";
import { getAccessToken } from "../lib/supabase";
import { COLORS } from "../lib/theme";

const MAP_WIDTH = 360;
const MAP_HEIGHT = 300;

function screenPoint(node: TerminalGraphNode): [number, number] {
  return [node.point.x * MAP_WIDTH, node.point.y * MAP_HEIGHT];
}

export default function OsmTerminalGraphScreen({
  iata,
  terminal,
}: {
  iata: string;
  terminal: string;
}) {
  const [graph, setGraph] = useState<TerminalSpatialGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<AmenityCategory>("ALL");
  const [selected, setSelected] = useState<TerminalGraphNode | null>(null);
  const [route, setRoute] = useState<TerminalRoute | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setGraph(null);
    setSelected(null);
    setRoute(null);
    void (async () => {
      try {
        const client = new AeroQuestGatewayClient({
          baseUrl: GATEWAY_URL,
          accessToken: await getAccessToken(),
        });
        const response = await client.getTerminalGraph(iata, terminal);
        if (active) setGraph(response.graph);
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "The ingested terminal graph is unavailable.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [iata, terminal]);

  const startNode = useMemo(() => {
    if (!graph) return null;
    return (
      graph.nodes.find((node) => node.kind === "security") ??
      graph.nodes.find((node) => node.kind === "entrance") ??
      graph.nodes[0] ??
      null
    );
  }, [graph]);

  const nearest = useMemo(() => {
    if (!graph || !startNode || filter === "ALL") return null;
    const candidates = graph.nodes.filter(
      (node) => node.category === filter && node.id !== startNode.id,
    );
    let best: { node: TerminalGraphNode; route: TerminalRoute } | null = null;
    for (const node of candidates) {
      const candidateRoute = shortestPath(graph, startNode.id, node.id);
      if (!candidateRoute) continue;
      if (!best || candidateRoute.estimatedMinutes < best.route.estimatedMinutes) {
        best = { node, route: candidateRoute };
      }
    }
    return best;
  }, [filter, graph, startNode]);

  useEffect(() => {
    if (nearest) {
      setSelected(nearest.node);
      setRoute(nearest.route);
    }
  }, [nearest]);

  if (loading) {
    return (
      <Screen>
        <Title>OSM terminal graph</Title>
        <ActivityIndicator color={COLORS.radar} />
        <Subtitle>
          Loading the ingested {iata} {terminal} graph from the gateway…
        </Subtitle>
      </Screen>
    );
  }

  if (!graph || !startNode) {
    return (
      <Screen>
        <Title>Terminal map unavailable</Title>
        <Subtitle>
          No ingested indoor graph exists for {iata} {terminal}, and the curated
          catalog has no layout for this airport. AeroQuest does not substitute
          another terminal.
        </Subtitle>
        <Card>
          <Label>How to add it</Label>
          <Subtitle>
            Run the OSM ingest for this exact terminal, then reopen this screen
            with the terminal id. {error ? `Gateway said: ${error}` : ""}
          </Subtitle>
        </Card>
      </Screen>
    );
  }

  const selectedRoute = route;
  const meta = selected?.category ? AMENITY_META[selected.category] : null;

  return (
    <Screen>
      <Row style={{ justifyContent: "space-between" }}>
        <View style={{ flex: 1 }}>
          <Badge tone="green">INGESTED OSM GRAPH</Badge>
          <Title>{iata} {terminal}</Title>
        </View>
        <Badge tone="muted">{graph.source}</Badge>
      </Row>
      <Subtitle>
        Indoor graph ingested from OpenStreetMap tags. Routes are approximate and
        not certified navigation.
      </Subtitle>

      <Card style={styles.mapCard}>
        <Svg width="100%" height={MAP_HEIGHT} viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}>
          <Path
            d={`M 0 0 H ${MAP_WIDTH} V ${MAP_HEIGHT} H 0 Z`}
            fill="#06111d"
          />
          {graph.edges.map((edge) => {
            const from = graph.nodes.find((node) => node.id === edge.from);
            const to = graph.nodes.find((node) => node.id === edge.to);
            if (!from || !to) return null;
            const [x1, y1] = screenPoint(from);
            const [x2, y2] = screenPoint(to);
            return (
              <Line
                key={edge.id}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={edge.kind === "moving_walkway" || edge.kind === "train" ? COLORS.amber : COLORS.line}
                strokeWidth={edge.kind === "train" ? 2 : 1}
                opacity={0.65}
              />
            );
          })}
          {selectedRoute ? (
            <Path
              d={selectedRoute.path
                .map((node, index) => {
                  const [x, y] = screenPoint(node);
                  return `${index === 0 ? "M" : "L"} ${x} ${y}`;
                })
                .join(" ")}
              fill="none"
              stroke={COLORS.radar}
              strokeWidth={3}
              strokeDasharray="7 5"
            />
          ) : null}
          {graph.nodes.map((node) => {
            const [x, y] = screenPoint(node);
            const color = node.category ? AMENITY_META[node.category].color : COLORS.muted;
            const active = selected?.id === node.id;
            return (
              <Circle
                key={node.id}
                cx={x}
                cy={y}
                r={active ? 7 : 4}
                fill={active ? color : COLORS.cockpit}
                stroke={color}
                strokeWidth={active ? 2 : 1}
                onPress={() => {
                  setSelected(node);
                  setFilter("ALL");
                  setRoute(
                    startNode.id === node.id
                      ? null
                      : shortestPath(graph, startNode.id, node.id),
                  );
                }}
              />
            );
          })}
          <SvgText x={8} y={14} fill={COLORS.muted} fontSize={8}>
            {graph.nodes.length} nodes · {graph.edges.length} edges
          </SvgText>
        </Svg>
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
            No reachable {filter.toLowerCase()} node exists in this ingested graph.
          </Text>
        ) : null}
      </Card>

      {selected ? (
        <Card>
          <Row style={{ justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Label>{meta?.displayName ?? selected.kind}</Label>
              <Text style={styles.nodeTitle}>{selected.label ?? selected.id}</Text>
              <Text style={styles.note}>
                Level {selected.level} · {selected.kind}
                {selected.tags?.amenity ? ` · ${selected.tags.amenity}` : ""}
              </Text>
            </View>
            <Badge>OSM</Badge>
          </Row>
          {selectedRoute ? (
            <Text style={styles.route}>
              {selectedRoute.estimatedMinutes} min ·{" "}
              {selectedRoute.totalDistanceMeters} m from{" "}
              {startNode.label ?? "the reference node"}
              {selectedRoute.usesMovingWalkway ? " · moving walkway" : ""}
              {selectedRoute.usesTrain ? " · train" : ""}
            </Text>
          ) : (
            <Text style={styles.note}>
              Select another node to calculate a route from the reference point.
            </Text>
          )}
          <GhostButton label="Clear selection" onPress={() => setSelected(null)} />
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  mapCard: { padding: 10, gap: 10 },
  pill: {
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillText: { color: COLORS.text, fontSize: 10, fontWeight: "700" },
  nodeTitle: { color: COLORS.white, fontSize: 20, fontWeight: "800", marginTop: 2 },
  route: { color: COLORS.radar, fontSize: 13, fontWeight: "700" },
  note: { color: COLORS.muted, fontSize: 11, lineHeight: 17 },
});
