import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, {
  Circle,
  G,
  Line,
  Path,
  Text as SvgText,
} from "react-native-svg";
import {
  AeroQuestGatewayClient,
  OpenMeteoWeatherService,
  type DestinationArrivalForecast,
  type DirectFlightConnection,
  type HaulCategory,
} from "@avi/shared";
import worldCountries from "@avi/shared/assets/world_countries.json";
import {
  Badge,
  Card,
  Divider,
  EmptyState,
  GhostButton,
  Label,
  Row,
  Screen,
  Subtitle,
  Title,
} from "../../src/components/ui";
import { GATEWAY_URL, HOME_AIRPORTS } from "../../src/lib/config";
import { COLORS, HAUL_COLORS, RADIUS } from "../../src/lib/theme";

interface CountryShape {
  n: string;
  lat: number;
  lon: number;
  r: number[][][];
}

const COUNTRIES = worldCountries as CountryShape[];
const MAP_WIDTH = 340;
const MAP_HEIGHT = 190;

function project(lat: number, lon: number): [number, number] {
  return [
    ((lon + 180) / 360) * MAP_WIDTH,
    ((90 - lat) / 180) * MAP_HEIGHT,
  ];
}

function countryPath(country: CountryShape): string {
  const parts: string[] = [];
  for (const ring of country.r) {
    if (!ring.length) continue;
    const points = ring.map(([lat, lon]) => project(lat, lon));
    const [first, ...rest] = points;
    if (!first) continue;
    parts.push(
      `M ${first[0].toFixed(1)} ${first[1].toFixed(1)} ` +
        rest.map(([x, y]) => `L ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ") +
        " Z",
    );
  }
  return parts.join(" ");
}

function arcPath(
  origin: [number, number],
  destination: [number, number],
): string {
  const [x1, y1] = origin;
  const [x2, y2] = destination;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  const offset = Math.min(28, length * 0.18);
  const cx = mx - (dy / length) * offset;
  const cy = my + (dx / length) * offset;
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

const HAULS: Array<{ key: HaulCategory; label: string }> = [
  { key: "ALL", label: "All" },
  { key: "SHORT_HAUL", label: "Short" },
  { key: "MEDIUM_HAUL", label: "Medium" },
  { key: "LONG_HAUL", label: "Long" },
];

export default function ExploreScreen() {
  const { iata } = useLocalSearchParams() as { iata?: string };
  const router = useRouter();
  const airportCode = (iata ?? "CAI").toUpperCase();
  const [connections, setConnections] = useState<DirectFlightConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [airline, setAirline] = useState<string | null>(null);
  const [haul, setHaul] = useState<HaulCategory>("ALL");
  const [selected, setSelected] = useState<DirectFlightConnection | null>(null);
  const [weather, setWeather] = useState<DestinationArrivalForecast | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const client = new AeroQuestGatewayClient({ baseUrl: GATEWAY_URL });
    client
      .getAirportRoutes(airportCode)
      .then((response) => {
        if (active) setConnections(response.routes);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Route data is temporarily unavailable.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [airportCode]);

  const origin = connections[0]?.origin;
  const airlines = useMemo(() => {
    const map = new Map<string, { code: string; name: string; count: number }>();
    for (const connection of connections) {
      for (const carrier of connection.operatingCarriers) {
        const key = carrier.airlineCode || carrier.airlineName;
        const current = map.get(key);
        if (current) current.count += 1;
        else
          map.set(key, {
            code: carrier.airlineCode,
            name: carrier.airlineName,
            count: 1,
          });
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 8);
  }, [connections]);

  const visible = useMemo(
    () =>
      connections.filter((connection) => {
        if (haul !== "ALL" && connection.haulCategory !== haul) return false;
        if (airline) {
          return connection.operatingCarriers.some(
            (carrier) =>
              carrier.airlineCode === airline || carrier.airlineName === airline,
          );
        }
        return true;
      }),
    [connections, haul, airline],
  );

  const originPoint = origin ? project(origin.latitude, origin.longitude) : null;
  const selectedDest = selected?.destination ?? null;

  const loadWeather = async (connection: DirectFlightConnection) => {
    setSelected(connection);
    setWeather(null);
    setWeatherLoading(true);
    try {
      const service = new OpenMeteoWeatherService({ timeoutMs: 8_000 });
      const forecast = await service.getDestinationForecast(
        {
          code: connection.destination.iata,
          name: connection.destination.name,
          city: connection.destination.city,
          latitude: connection.destination.latitude,
          longitude: connection.destination.longitude,
        },
        "12:00",
      );
      setWeather(forecast);
    } catch {
      setWeather(null);
    } finally {
      setWeatherLoading(false);
    }
  };

  return (
    <Screen>
      <Badge>{airportCode} DIRECT NETWORK</Badge>
      <Title>{origin ? `${origin.city} non-stop` : "Direct Route Explorer"}</Title>
      <Subtitle>
        {connections.length
          ? `${connections.length} direct destinations from ${airportCode}. Distances are geodesic; durations are labelled estimates.`
          : "Loading the direct route network from the AeroQuest gateway."}
      </Subtitle>

      <Row>
        {HOME_AIRPORTS.map((airport) => (
          <GhostButton
            key={airport.iata}
            label={airport.iata}
            onPress={() => router.push(`/explore/${airport.iata}`)}
          />
        ))}
      </Row>

      <Card style={styles.mapCard}>
        <Svg width="100%" height={MAP_HEIGHT} viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}>
          <Path
            d={`M 0 0 H ${MAP_WIDTH} V ${MAP_HEIGHT} H 0 Z`}
            fill={COLORS.cockpit}
          />
          <G opacity={0.5}>
            {COUNTRIES.map((country) => (
              <Path
                key={country.n}
                d={countryPath(country)}
                fill={COLORS.surface3}
                stroke={COLORS.line}
                strokeWidth={0.35}
              />
            ))}
          </G>
          {[30, 60, 120, 150].map((lat) => {
            const [, y] = project(lat, 0);
            return (
              <Line
                key={lat}
                x1={0}
                y1={y}
                x2={MAP_WIDTH}
                y2={y}
                stroke={COLORS.line}
                strokeWidth={0.4}
              />
            );
          })}
          {originPoint
            ? visible.map((connection) => {
                const destination = project(
                  connection.destination.latitude,
                  connection.destination.longitude,
                );
                return (
                  <Path
                    key={connection.id}
                    d={arcPath(originPoint, destination)}
                    fill="none"
                    stroke={HAUL_COLORS[connection.haulCategory]}
                    strokeWidth={selected?.id === connection.id ? 1.8 : 0.9}
                    opacity={selected && selected.id !== connection.id ? 0.35 : 0.9}
                  />
                );
              })
            : null}
          {originPoint && visible.length === 0 ? (
            <SvgText
              x={MAP_WIDTH / 2}
              y={MAP_HEIGHT / 2}
              fill={COLORS.muted}
              fontSize={9}
              textAnchor="middle"
            >
              {loading ? "Loading routes…" : "No routes match these filters"}
            </SvgText>
          ) : null}
          {originPoint ? (
            <G>
              <Circle cx={originPoint[0]} cy={originPoint[1]} r={5} fill={COLORS.radar} />
              <Circle
                cx={originPoint[0]}
                cy={originPoint[1]}
                r={9}
                fill="none"
                stroke={COLORS.radar}
                strokeWidth={1}
                opacity={0.6}
              />
              <SvgText
                x={originPoint[0] + 8}
                y={originPoint[1] - 7}
                fill={COLORS.white}
                fontSize={8}
                fontWeight="bold"
              >
                {airportCode}
              </SvgText>
            </G>
          ) : null}
          {visible.map((connection) => {
            const [x, y] = project(
              connection.destination.latitude,
              connection.destination.longitude,
            );
            return (
              <G key={`${connection.id}-pin`}>
                <Circle
                  cx={x}
                  cy={y}
                  r={selected?.id === connection.id ? 3.6 : 2.4}
                  fill={HAUL_COLORS[connection.haulCategory]}
                  onPress={() => void loadWeather(connection)}
                />
                {selected?.id === connection.id ? (
                  <SvgText
                    x={x + 5}
                    y={y + 3}
                    fill={COLORS.white}
                    fontSize={7}
                    fontWeight="bold"
                  >
                    {connection.destination.iata}
                  </SvgText>
                ) : null}
              </G>
            );
          })}
        </Svg>
        <Row>
          {HAULS.map((item) => (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityState={{ selected: haul === item.key }}
              onPress={() => setHaul(item.key)}
              style={[
                styles.filter,
                haul === item.key && styles.filterActive,
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  haul === item.key && { color: COLORS.cockpit },
                  item.key !== "ALL" && { color: HAUL_COLORS[item.key] },
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </Row>
      </Card>

      {loading ? (
        <Card>
          <ActivityIndicator color={COLORS.radar} />
          <Subtitle>Caching the network on the gateway…</Subtitle>
        </Card>
      ) : null}
      {error ? (
        <EmptyState
          title="Route data unavailable"
          detail={`${error} The gateway never substitutes a static route dataset.`}
        />
      ) : null}

      {airlines.length ? (
        <Card>
          <Label>Filter by airline</Label>
          <Row>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: !airline }}
              onPress={() => setAirline(null)}
              style={[styles.chip, !airline && styles.chipActive]}
            >
              <Text style={[styles.chipText, !airline && { color: COLORS.cockpit }]}>
                All
              </Text>
            </Pressable>
            {airlines.map((carrier) => (
              <Pressable
                key={carrier.code || carrier.name}
                accessibilityRole="button"
                accessibilityState={{
                  selected: airline === (carrier.code || carrier.name),
                }}
                onPress={() =>
                  setAirline(carrier.code || carrier.name || null)
                }
                style={[
                  styles.chip,
                  airline === (carrier.code || carrier.name) && styles.chipActive,
                ]}
              >
                <Text style={styles.chipText}>
                  {carrier.code || carrier.name} · {carrier.count}
                </Text>
              </Pressable>
            ))}
          </Row>
        </Card>
      ) : null}

      {selected ? (
        <Card>
          <Row style={{ justifyContent: "space-between" }}>
            <View>
              <Label>{selected.destination.iata} · {selected.haulCategory.replace("_", " ")}</Label>
              <Text style={styles.destTitle}>{selected.destination.city}</Text>
              <Subtitle>{selected.destination.name}</Subtitle>
            </View>
            <Badge tone="green">{selected.distanceKm.toLocaleString()} km</Badge>
          </Row>
          <Divider />
          <Row>
            <Metric
              label="Duration"
              value={
                selected.durationFormatted
                  ? `~${selected.durationFormatted}`
                  : "Not reported"
              }
              note={selected.durationEstimated ? "distance estimate" : "schedule"}
            />
            <Metric
              label="Daily flights"
              value={
                selected.dailyFlightsCount != null
                  ? String(selected.dailyFlightsCount)
                  : "Not reported"
              }
              note="7-day average"
            />
            <Metric
              label="Airlines"
              value={String(selected.operatingCarriers.length)}
              note="reported operators"
            />
          </Row>
          <Divider />
          {weatherLoading ? (
            <ActivityIndicator color={COLORS.radar} />
          ) : weather?.dataAvailable ? (
            <Text style={styles.weather}>
              Arrival weather · {weather.arrivalTempC}°C {weather.arrivalCondition}
              {` · ${weather.windCondition}`}
            </Text>
          ) : (
            <Text style={styles.note}>
              Destination weather unavailable. No estimated forecast is substituted.
            </Text>
          )}
          <Row>
            <GhostButton
              label="Preview 3D cabin"
              onPress={() => router.push("/cabin/B77W/14A")}
            />
            <GhostButton
              label={`${selected.destination.iata} terminal`}
              onPress={() => router.push(`/terminal/${selected.destination.iata}`)}
            />
          </Row>
        </Card>
      ) : null}

      <Card>
        <Label>Pro tip</Label>
        <Subtitle>
          Pick a destination pin to load arrival weather. On the web, the same
          network renders on a MapLibre globe at /explore/{airportCode}.
        </Subtitle>
      </Card>
    </Screen>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricNote}>{note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  mapCard: { padding: 10, gap: 12 },
  filter: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.line,
    paddingHorizontal: 14,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  filterActive: { backgroundColor: COLORS.radar, borderColor: COLORS.radar },
  filterText: { color: COLORS.muted, fontSize: 12, fontWeight: "600" },
  chip: {
    borderRadius: RADIUS.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.line,
    paddingHorizontal: 12,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: { backgroundColor: COLORS.amber, borderColor: COLORS.amber },
  chipText: { color: COLORS.text, fontSize: 12, fontWeight: "600" },
  destTitle: { color: COLORS.white, fontSize: 22, fontWeight: "700", marginTop: 3 },
  metric: { flex: 1, minWidth: 90 },
  metricLabel: {
    color: COLORS.muted,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  metricValue: { color: COLORS.white, fontSize: 16, fontWeight: "700", marginTop: 2 },
  metricNote: { color: COLORS.muted, fontSize: 12 },
  weather: { color: COLORS.radar, fontSize: 13, fontWeight: "600" },
  note: { color: COLORS.muted, fontSize: 12, lineHeight: 18 },
});
