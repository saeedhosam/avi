"use client";

import Link from "next/link";
import { BellRing, CheckCheck, Glasses, Plane, RefreshCw } from "lucide-react";
import { useApp } from "@/lib/store";
import { ALERT_META, cn, formatAlertTimestamp } from "@/lib/utils";
import { FlightCard } from "@/components/flight-card";
import {
  Button,
  EmptyState,
  MetricTile,
  PageHeader,
  Panel,
  SectionHeader,
} from "@/components/ui";

export default function WatchlistPage() {
  const {
    watchlist,
    alerts,
    unreadAlertCount,
    markAllAlertsRead,
    refreshData,
    syncing,
    offlineMode,
    aeroConfigured,
    dataSourceMode,
  } = useApp();
  const monitoringActive =
    !offlineMode &&
    aeroConfigured &&
    (dataSourceMode === "LIVE_AERODATABOX" ||
      dataSourceMode === "CONFIGURED_IDLE");

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Saved flights"
        title="Watchlist"
        description="Keep an eye on the flights that matter. Saved flights sync to your account and are checked whenever live provider data is available."
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void refreshData()}
              disabled={syncing}
            >
              <RefreshCw className={cn("size-4", syncing && "animate-spin")} />
              {syncing ? "Refreshing…" : "Refresh"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={markAllAlertsRead}
              disabled={unreadAlertCount === 0}
            >
              <CheckCheck className="size-4" />
              Mark alerts read
            </Button>
          </>
        }
      />

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-6">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line/70 bg-surface/60 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <BellRing
                className={cn(
                  "size-4",
                  monitoringActive ? "text-accent" : "text-delayed",
                )}
              />
              <div>
                <p className="text-[13px] font-medium text-ink">
                  {monitoringActive
                    ? "Live alerts enabled"
                    : "Monitoring paused"}
                </p>
                <p className="text-xs text-subtle">
                  {monitoringActive
                    ? "Checks run whenever the provider allows."
                    : "Showing saved flight records until live data returns."}
                </p>
              </div>
            </div>
            <span
              className={cn(
                "flex items-center gap-1.5 text-xs font-medium",
                monitoringActive ? "text-landed" : "text-delayed",
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  monitoringActive ? "animate-pulse-dot bg-landed" : "bg-delayed",
                )}
              />
              {monitoringActive ? "Monitoring" : "Paused"}
            </span>
          </div>

          {watchlist.length === 0 ? (
            <Panel>
              <EmptyState
                icon={<Glasses className="size-6" />}
                title="Your watchlist is empty"
                description="Open any flight and add it to your watchlist. You’ll get live gate, delay, boarding and baggage alerts."
                action={
                  <Link href="/search">
                    <Button size="sm">
                      <Plane className="size-4" /> Search flights
                    </Button>
                  </Link>
                }
              />
            </Panel>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {watchlist.map((flight) => (
                <FlightCard
                  key={`${flight.id}-${flight.flightDate ?? "any"}`}
                  flight={flight}
                />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Panel className="p-4">
            <SectionHeader
              title="Overview"
              action={
                <span className="font-mono text-xs tabular text-subtle">
                  {watchlist.length} saved
                </span>
              }
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <MetricTile label="Saved" value={watchlist.length} />
              <MetricTile
                label="Unread"
                value={unreadAlertCount}
                accent={unreadAlertCount > 0}
              />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-subtle">
              Saved flights are stored on this device and synced to your
              account when you sign in.
            </p>
          </Panel>

          <Panel className="p-4">
            <SectionHeader
              title="Alert inbox"
              action={<BellRing className="size-4 text-subtle" />}
            />
            <div className="mt-3 space-y-2">
              {alerts.slice(0, 8).map((alert) => (
                <div
                  key={alert.id}
                  className={cn(
                    "rounded-lg border px-3 py-2.5",
                    alert.isRead
                      ? "border-line/50 bg-transparent"
                      : "border-accent/25 bg-accent-soft",
                  )}
                >
                  <p className="text-[13px] font-medium text-ink">
                    {alert.title}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted">
                    {alert.message}
                  </p>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wider text-accent">
                      {ALERT_META[alert.type]?.label ?? alert.type}
                    </span>
                    <span className="text-xs text-subtle">
                      {formatAlertTimestamp(alert.timestamp)}
                    </span>
                  </div>
                </div>
              ))}
              {alerts.length === 0 && (
                <p className="rounded-lg border border-dashed border-line/70 px-3 py-4 text-xs leading-relaxed text-subtle">
                  No alerts yet. Watch a flight with live data to start the
                  change monitor.
                </p>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
