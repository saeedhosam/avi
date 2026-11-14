import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from "expo-camera";
import { useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  AeroQuestGatewayClient,
  boardingPassGatewayPath,
  parseBoardingPass,
  type BoardingPassData,
  type BoardingPassFormat,
  type Flight,
} from "@avi/shared";
import {
  Badge,
  Card,
  Divider,
  EmptyState,
  GhostButton,
  Label,
  PrimaryButton,
  Row,
  Screen,
  Subtitle,
  Title,
} from "../../src/components/ui";
import { GATEWAY_URL } from "../../src/lib/config";
import { COLORS } from "../../src/lib/theme";

function formatFromBarcode(type: string | undefined): BoardingPassFormat {
  const value = (type ?? "").toLowerCase();
  if (value.includes("pdf417")) return "PDF417";
  if (value.includes("aztec")) return "AZTEC";
  if (value.includes("qr")) return "QR";
  return "UNKNOWN";
}

export default function BoardingPassScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [pass, setPass] = useState<BoardingPassData | null>(null);
  const [manual, setManual] = useState("");
  const [flight, setFlight] = useState<Flight | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parse = (raw: string, format: BoardingPassFormat) => {
    const parsed = parseBoardingPass(raw, { format });
    setPass(parsed);
    setFlight(null);
    setError(parsed.valid ? null : parsed.warnings.join(" "));
    setScanned(true);
  };

  const onBarcodeScanned = (result: BarcodeScanningResult) => {
    if (scanned) return;
    parse(result.data, formatFromBarcode(result.type));
  };

  const fetchStatus = async () => {
    if (!pass?.valid || !pass.flightDate) return;
    setLoading(true);
    setError(null);
    try {
      const client = new AeroQuestGatewayClient({ baseUrl: GATEWAY_URL });
      const response = await client.getFlight(
        `${pass.airlineCode}${pass.flightNumber}`,
        pass.flightDate,
      );
      setFlight(response.flights[0] ?? null);
      if (!response.flights.length) {
        setError("The gateway returned no flight for this boarding pass.");
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Live status is temporarily unavailable.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <Badge tone="green">ZERO API COST · ON-DEVICE</Badge>
      <Title>Scan boarding pass</Title>
      <Subtitle>
        PDF417, Aztec, and QR BCBP data is parsed locally. Only the flight
        number and operating date are sent to the gateway for live status.
      </Subtitle>

      {!permission ? (
        <Card>
          <ActivityIndicator color={COLORS.radar} />
        </Card>
      ) : !permission.granted ? (
        <Card>
          <Text style={styles.cardTitle}>Camera permission required</Text>
          <Subtitle>
            AeroQuest needs camera access to scan the barcode. No image is
            uploaded or stored.
          </Subtitle>
          <PrimaryButton label="Allow camera" onPress={() => void requestPermission()} />
        </Card>
      ) : (
        <Card style={styles.cameraCard}>
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["pdf417", "aztec", "qr"] }}
            onBarcodeScanned={scanned ? undefined : onBarcodeScanned}
          />
          <Text style={styles.cameraHint}>
            {scanned ? "Scan paused. Reset to scan another pass." : "Point at the boarding-pass barcode."}
          </Text>
          {scanned ? (
            <GhostButton
              label="Reset scanner"
              onPress={() => {
                setScanned(false);
                setPass(null);
                setFlight(null);
                setError(null);
              }}
            />
          ) : null}
        </Card>
      )}

      <Card>
        <Label>Manual fallback</Label>
        <TextInput
          value={manual}
          onChangeText={setManual}
          placeholder="Paste the raw BCBP string"
          placeholderTextColor={COLORS.muted}
          multiline
          style={styles.input}
        />
        <GhostButton
          label="Parse pasted BCBP"
          onPress={() => parse(manual, "UNKNOWN")}
        />
      </Card>

      {error ? (
        <EmptyState title="Could not import pass" detail={error} />
      ) : null}

      {pass ? (
        <Card>
          <Row style={{ justifyContent: "space-between" }}>
            <Badge tone={pass.valid ? "green" : "red"}>
              {pass.valid ? "PARSED LOCALLY" : "INCOMPLETE"}
            </Badge>
            <Badge tone="muted">{pass.format}</Badge>
          </Row>
          <Title>{pass.passengerName || "Passenger not parsed"}</Title>
          <Row>
            <Field label="PNR" value={pass.pnr ?? "Not reported"} />
            <Field label="Flight" value={`${pass.airlineCode}${pass.flightNumber}`} />
            <Field label="Date" value={pass.flightDate ?? "Not resolved"} />
          </Row>
          <Divider />
          <Row>
            <Field label="From" value={pass.origin || "—"} />
            <Field label="To" value={pass.destination || "—"} />
            <Field label="Seat" value={pass.seatNumber ?? "Not reported"} />
          </Row>
          <Row>
            <Field label="Cabin" value={pass.cabinClass ?? "Not reported"} />
            <Field label="Sequence" value={pass.sequenceNumber ?? "Not reported"} />
            <Field label="Julian" value={String(pass.julianDate)} />
          </Row>
          {pass.warnings.length ? (
            <Text style={styles.warning}>{pass.warnings.join(" ")}</Text>
          ) : null}
          <PrimaryButton
            label="Fetch live flight status"
            onPress={() => void fetchStatus()}
            loading={loading}
            disabled={!pass.valid || !pass.flightDate}
          />
          {pass.valid ? (
            <Text style={styles.path}>
              Gateway: {boardingPassGatewayPath(pass)}
            </Text>
          ) : null}
        </Card>
      ) : null}

      {flight ? (
        <Card>
          <Label>Live gateway status</Label>
          <Row style={{ justifyContent: "space-between" }}>
            <Text style={styles.flightNumber}>{flight.flightNumber}</Text>
            <Badge
              tone={
                flight.status === "CANCELLED"
                  ? "red"
                  : flight.status === "DELAYED"
                    ? "amber"
                    : "green"
              }
            >
              {flight.status}
            </Badge>
          </Row>
          <Subtitle>
            {flight.origin.code} → {flight.destination.code} ·{" "}
            {flight.departureTimeEstimated} · Gate {flight.gateDeparture} ·{" "}
            Terminal {flight.terminalDeparture}
          </Subtitle>
          <Text style={styles.note}>
            {flight.statusReported
              ? flight.statusNote
              : "Status not reported by the provider."}
          </Text>
        </Card>
      ) : null}
    </Screen>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cameraCard: { padding: 10, gap: 8 },
  camera: { height: 240, borderRadius: 14, overflow: "hidden" },
  cameraHint: { color: COLORS.muted, fontSize: 11, textAlign: "center" },
  cardTitle: { color: COLORS.white, fontSize: 18, fontWeight: "800" },
  input: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 12,
    padding: 10,
    color: COLORS.text,
    textAlignVertical: "top",
    fontSize: 12,
  },
  field: { flex: 1, minWidth: 90 },
  fieldLabel: {
    color: COLORS.muted,
    fontSize: 9,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  fieldValue: { color: COLORS.white, fontSize: 14, fontWeight: "700", marginTop: 2 },
  warning: { color: COLORS.amber, fontSize: 12, lineHeight: 18 },
  path: { color: COLORS.muted, fontSize: 10 },
  flightNumber: { color: COLORS.white, fontSize: 22, fontWeight: "900" },
  note: { color: COLORS.muted, fontSize: 12, lineHeight: 18 },
});
