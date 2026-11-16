"use client";

import { useState } from "react";
import {
  BellRing,
  Building2,
  CheckCheck,
  Clock,
  DoorOpen,
  KeyRound,
  Luggage,
  Radio,
  Ticket,
  XCircle,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { ALERT_META, cn, formatAlertTimestamp } from "@/lib/utils";
import { Button, EmptyState, Modal, Panel } from "./ui";

const alertIconMap = {
  GATE_CHANGE: DoorOpen,
  TERMINAL_CHANGE: Building2,
  DELAY: Clock,
  BOARDING: Ticket,
  CANCELLATION: XCircle,
  BAGGAGE: Luggage,
} as const;

export function NotificationsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {
    alerts,
    unreadAlertCount,
    markAlertRead,
    markAllAlertsRead,
    enableBrowserNotifications,
    enableWebPush,
    notificationPermission,
    webPushSupported,
    webPushConfigured,
    webPushSubscribed,
    offlineMode,
  } = useApp();

  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Alerts & push"
      subtitle="Generated only by real status changes Avi receives."
      icon={<BellRing className="size-4" />}
      size="lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
          {unreadAlertCount > 0 && (
            <Button size="sm" onClick={markAllAlertsRead}>
              <CheckCheck className="size-3.5" /> Mark all read
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <Panel className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="label-caps flex items-center gap-1.5 text-subtle">
              <KeyRound className="size-3.5" /> Push registration
            </p>
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  offlineMode ? "bg-delayed" : "bg-landed",
                )}
              />
              {offlineMode ? "Offline" : "Connected"}
            </span>
          </div>

          {webPushSubscribed ? (
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-landed/30 bg-landed/8 px-3 py-2.5 text-[13px] leading-relaxed text-muted">
              <KeyRound className="mt-0.5 size-3.5 shrink-0 text-landed" />
              Push is enabled on this device — alerts arrive even with the app
              closed.
            </p>
          ) : !webPushSupported || !webPushConfigured ? (
            <p className="mt-3 rounded-lg border border-line/60 bg-surface-2/40 px-3 py-2.5 text-xs leading-relaxed text-subtle">
              {webPushSupported
                ? "Web Push is not connected in this build yet. In-app alerts still work."
                : "This browser does not support Web Push. In-app alerts still work."}
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {pushMessage && (
                <p className="rounded-lg border border-delayed/30 bg-delayed/8 px-3 py-2 text-xs leading-relaxed text-muted">
                  {pushMessage}
                </p>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={pushBusy}
                onClick={async () => {
                  setPushBusy(true);
                  setPushMessage(null);
                  try {
                    await enableWebPush();
                  } finally {
                    setPushBusy(false);
                  }
                }}
              >
                <KeyRound className="size-3.5" />
                {pushBusy ? "Connecting…" : "Enable push on this device"}
              </Button>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/50 pt-3">
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <Radio className="size-3.5 text-accent" />
              In-app notifications
              <span className="font-medium text-ink">
                {notificationPermission}
              </span>
            </p>
            <Button
              size="sm"
              variant="ghost"
              onClick={enableBrowserNotifications}
            >
              <BellRing className="size-3.5" />
              In-app only
            </Button>
          </div>
        </Panel>

        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="label-caps text-subtle">
              Inbox · {unreadAlertCount} unread
            </p>
            <span className="flex items-center gap-1.5 text-xs font-medium text-landed">
              <span className="size-1.5 animate-pulse-dot rounded-full bg-landed" />
              Live
            </span>
          </div>

          {!alerts.length ? (
            <EmptyState
              icon={<BellRing className="size-5" />}
              title="No alerts yet"
              description="Track or favourite a live flight. Gate changes, delays, boarding calls, cancellations and baggage updates appear here when the provider reports them."
            />
          ) : (
            <div className="mt-2 space-y-1.5">
              {alerts.map((alert) => {
                const meta = ALERT_META[alert.type];
                const AlertIcon = alertIconMap[alert.type];
                return (
                  <button
                    key={alert.id}
                    type="button"
                    onClick={() => markAlertRead(alert.id)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left transition-colors",
                      alert.isRead
                        ? "border-line/50 bg-surface-2/30"
                        : "border-line/70 bg-surface-2/60 hover:border-line-strong",
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
                            "text-[13px] font-medium",
                            alert.isRead ? "text-muted" : "text-ink",
                          )}
                        >
                          {alert.title}
                        </span>
                        {!alert.isRead && (
                          <span
                            className="size-1.5 rounded-full bg-accent"
                            aria-label="Unread"
                          />
                        )}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted">
                        {alert.message}
                      </span>
                      <span className="mt-1.5 flex items-center gap-2 text-xs text-subtle">
                        <span className="font-mono font-medium text-accent">
                          {alert.flightNumber}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{formatAlertTimestamp(alert.timestamp)}</span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <p className="rounded-lg border border-line/60 bg-surface-2/40 px-3 py-2.5 text-xs leading-relaxed text-subtle">
          Alerts come from comparing successive live snapshots Avi has
          actually received. No fabricated alerts and no test notifications.
        </p>
      </div>
    </Modal>
  );
}
