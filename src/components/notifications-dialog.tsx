"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BellRing,
  Check,
  CheckCheck,
  Clock,
  Copy,
  DoorOpen,
  KeyRound,
  Luggage,
  PlaneTakeoff,
  Radio,
  Ticket,
  Timer,
  Trash2,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { ALERT_META, STATUS_META, cn } from "@/lib/utils";
import type { AlertType } from "@/lib/types";
import { Button, EmptyState, IconButton, Modal, Tabs } from "./ui";

const alertIconMap = {
  GATE_CHANGE: DoorOpen,
  DELAY: Clock,
  BOARDING: Ticket,
  CANCELLATION: XCircle,
  BAGGAGE: Luggage,
} as const;

const TEST_ACTIONS: Array<{ type: AlertType; label: string }> = [
  { type: "GATE_CHANGE", label: "Gate" },
  { type: "DELAY", label: "Delay" },
  { type: "BOARDING", label: "Boarding" },
  { type: "CANCELLATION", label: "Cancel" },
  { type: "BAGGAGE", label: "Baggage" },
];

function Countdown({ firesAt }: { firesAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil((firesAt - now) / 1000));
  return <span className="tabular">{seconds}s</span>;
}

export function NotificationsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {
    alerts,
    scheduledAlerts,
    favorites,
    flights,
    fcmToken,
    markAlertRead,
    markAllAlertsRead,
    cancelScheduledAlert,
    simulateAlert,
    scheduleAlert,
    enableBrowserNotifications,
    notificationPermission,
    offlineMode,
  } = useApp();

  const [tab, setTab] = useState<"live" | "scheduled">("live");
  const [selectedFlight, setSelectedFlight] = useState("");
  const [copied, setCopied] = useState(false);

  const savedFlights = useMemo(
    () => (favorites.length ? favorites : flights.slice(0, 4)),
    [favorites, flights],
  );

  useEffect(() => {
    if (!selectedFlight && savedFlights[0]) {
      setSelectedFlight(savedFlights[0].flightNumber);
    }
  }, [savedFlights, selectedFlight]);

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(fcmToken);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access is optional.
    }
  };

  const trigger = (type: AlertType) => {
    if (!selectedFlight) return;
    simulateAlert(selectedFlight, type);
  };

  const quickSchedule = (type: AlertType, seconds: number) => {
    const flight = savedFlights.find(
      (item) => item.flightNumber === selectedFlight,
    );
    if (!flight) return;
    const typeLabel = ALERT_META[type].label;
    scheduleAlert(
      flight.flightNumber,
      type,
      `Scheduled ${typeLabel}: ${flight.flightNumber}`,
      `This is a scheduled ${typeLabel.toLowerCase()} alert for ${flight.flightNumber} (${flight.origin.code} ➔ ${flight.destination.code}).`,
      seconds,
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Flight Alerts & Push"
      subtitle="Live FCM alerts · Local scheduler · Background sync"
      icon={<BellRing className="size-4" />}
      size="lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
          {tab === "live" && alerts.some((alert) => !alert.isRead) && (
            <Button size="sm" onClick={markAllAlertsRead}>
              <CheckCheck className="size-3.5" /> Mark all read
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "live", label: "Live & Push", count: alerts.length },
            {
              value: "scheduled",
              label: "Scheduled",
              count: scheduledAlerts.length,
            },
          ]}
        />

        {tab === "live" ? (
          <>
            <div className="rounded-xl border border-line bg-surface-2 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <KeyRound className="size-4 text-accent" />
                  <span className="label-caps text-ink">
                    FCM device registration
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      offlineMode ? "bg-delayed" : "bg-landed",
                    )}
                  />
                  <span className="text-[10px] font-semibold text-muted">
                    {offlineMode ? "Offline" : "Connected"}
                  </span>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg border border-line/70 bg-surface px-2.5 py-2 font-mono text-[10px] text-muted">
                  {fcmToken || "Registering device…"}
                </code>
                <IconButton label="Copy FCM token" onClick={copyToken}>
                  {copied ? (
                    <Check className="size-3.5 text-landed" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </IconButton>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[11px] text-muted">
                  <Radio className="size-3.5 text-accent" />
                  Browser push:{" "}
                  <span className="font-semibold text-ink">
                    {notificationPermission}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={enableBrowserNotifications}
                >
                  <BellRing className="size-3.5" />
                  Enable desktop push
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-line bg-surface-2 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="label-caps text-subtle">
                  Instant push simulator
                </span>
                <span className="text-[10px] text-subtle">
                  Updates flight state + pushes alert
                </span>
              </div>
              <select
                value={selectedFlight}
                onChange={(event) => setSelectedFlight(event.target.value)}
                className="mt-2 h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-xs font-semibold text-ink outline-none focus:border-accent"
              >
                {savedFlights.map((flight) => (
                  <option key={flight.id} value={flight.flightNumber}>
                    {flight.flightNumber} · {flight.origin.code} →{" "}
                    {flight.destination.code} · {STATUS_META[flight.status].label}
                  </option>
                ))}
              </select>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {TEST_ACTIONS.map((action) => (
                  <button
                    key={action.type}
                    onClick={() => trigger(action.type)}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors hover:brightness-110"
                    style={{
                      color: ALERT_META[action.type].color,
                      backgroundColor: `${ALERT_META[action.type].color}14`,
                      borderColor: `${ALERT_META[action.type].color}55`,
                    }}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="label-caps text-subtle">
                  Alert inbox · {alerts.filter((alert) => !alert.isRead).length} unread
                </span>
                {!alerts.length && (
                  <span className="text-[10px] text-subtle">No alerts yet</span>
                )}
              </div>
              {!alerts.length ? (
                <EmptyState
                  icon={<BellRing className="size-5" />}
                  title="Alert inbox is clear"
                  description="Simulate a gate change, delay, boarding call, cancellation, or baggage update to see the push pipeline in action."
                />
              ) : (
                <div className="space-y-2">
                  {alerts.map((alert) => {
                    const meta = ALERT_META[alert.type];
                    const AlertIcon = alertIconMap[alert.type];
                    return (
                      <button
                        key={alert.id}
                        onClick={() => markAlertRead(alert.id)}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                          alert.isRead
                            ? "border-line/60 bg-surface-2/50"
                            : "border-line bg-surface-2 hover:border-accent/40",
                        )}
                      >
                        <span
                          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border"
                          style={{
                            color: meta.color,
                            backgroundColor: `${meta.color}14`,
                            borderColor: `${meta.color}44`,
                          }}
                        >
                          <AlertIcon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                "text-xs font-bold",
                                alert.isRead ? "text-muted" : "text-ink",
                              )}
                            >
                              {alert.title}
                            </span>
                            {!alert.isRead && (
                              <span className="size-1.5 rounded-full bg-accent" />
                            )}
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">
                            {alert.message}
                          </span>
                          <span className="mt-1 flex items-center gap-2 text-[10px] text-subtle">
                            <span className="font-mono font-semibold text-accent">
                              {alert.flightNumber}
                            </span>
                            <span>·</span>
                            <span>{alert.timestamp}</span>
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="rounded-xl border border-line bg-surface-2 p-3.5">
              <div className="flex items-center gap-2">
                <Timer className="size-4 text-accent" />
                <span className="label-caps text-ink">
                  Schedule a local alert
                </span>
              </div>
              <select
                value={selectedFlight}
                onChange={(event) => setSelectedFlight(event.target.value)}
                className="mt-2 h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-xs font-semibold text-ink outline-none focus:border-accent"
              >
                {savedFlights.map((flight) => (
                  <option key={flight.id} value={flight.flightNumber}>
                    {flight.flightNumber} · {flight.origin.code} →{" "}
                    {flight.destination.code}
                  </option>
                ))}
              </select>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {(
                  [
                    ["GATE_CHANGE", 10] as const,
                    ["DELAY", 20] as const,
                    ["BOARDING", 30] as const,
                  ] as Array<readonly [AlertType, number]>
                ).map(([type, seconds]) => (
                  <button
                    key={type}
                    onClick={() => quickSchedule(type, seconds)}
                    className="rounded-lg border border-line bg-surface px-2 py-2 text-[10px] font-semibold text-muted transition-colors hover:border-accent/50 hover:text-accent"
                  >
                    {ALERT_META[type].label} · {seconds}s
                  </button>
                ))}
              </div>
            </div>

            {scheduledAlerts.length === 0 ? (
              <EmptyState
                icon={<Timer className="size-5" />}
                title="No scheduled alerts"
                description="Schedule a gate, delay, or boarding alert above. Alerts are persisted locally and fire even if you navigate to another page."
              />
            ) : (
              <div className="space-y-2">
                {scheduledAlerts.map((item) => {
                  const meta = ALERT_META[item.type];
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3"
                    >
                      <span
                        className="flex size-8 shrink-0 items-center justify-center rounded-lg border"
                        style={{
                          color: meta.color,
                          backgroundColor: `${meta.color}14`,
                          borderColor: `${meta.color}44`,
                        }}
                      >
                        <PlaneTakeoff className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-ink">
                          {item.title}
                        </p>
                        <p className="mt-0.5 flex items-center gap-2 text-[10px] text-subtle">
                          <span className="font-mono text-accent">
                            {item.flightNumber}
                          </span>
                          <span>·</span>
                          <span>Fires in</span>
                          <Countdown firesAt={item.firesAt} />
                        </p>
                      </div>
                      <IconButton
                        label="Cancel scheduled alert"
                        onClick={() => cancelScheduledAlert(item.id)}
                      >
                        <Trash2 className="size-3.5 text-cancelled" />
                      </IconButton>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        <div className="flex items-center gap-2 rounded-xl border border-dashed border-line px-3 py-2 text-[10px] text-subtle">
          <TriangleAlert className="size-3.5 shrink-0" />
          Alerts are stored locally and mirrored to Firestore when signed in. FCM
          topic subscriptions: <span className="font-mono">flight_aa100</span>
        </div>
      </div>
    </Modal>
  );
}
