"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BellRing,
  Bookmark,
  CheckCheck,
  Plane,
  RefreshCw,
  Share2,
} from "lucide-react";
import { useApp } from "@/lib/store";
import type { Flight } from "@/lib/types";
import { ALERT_META, cn, formatAlertTimestamp } from "@/lib/utils";
import { FlightCard } from "@/components/flight-card";
import { ShareFlightDialog } from "@/components/share-dialog";
import { Button, EmptyState, Panel } from "@/components/ui";

export default function WatchlistPage() {
  const {
    watchlist,
    alerts,
    unreadAlertCount,
    markAllAlertsRead,
    refreshData,
    syncing,
  } = useApp();
  const [shareFlight, setShareFlight] = useState<Flight | null>(null);

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4 lg:px-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="label-caps text-accent">Saved flight watchlist</p>
          <h2 className="mt-1 flex items-center gap-2 text-xl font-black tracking-tight text-ink">
            Your watchlist
            <span className="text-sm font-semibold text-muted">
              ({watchlist.length} saved)
            </span>
          </h2>
          <p className="mt-1 text-[11px] text-muted">
            {watchlist.length} saved flights · {unreadAlertCount} unread alerts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void refreshData()}
            disabled={syncing}
          >
            <RefreshCw className={cn("size-3.5", syncing && "animate-spin")} />
            Refresh
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={markAllAlertsRead}
            disabled={unreadAlertCount === 0}
          >
            <CheckCheck className="size-3.5" />
            Mark alerts read
          </Button>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2">
            <div className="flex items-center gap-2">
              <BellRing className="size-4 text-accent" />
              <p className="text-[11px] font-semibold text-ink">
                Live alerts active · Gate, delay, boarding & baggage updates
              </p>
            </div>
            <span className="flex items-center gap-1 text-[9px] font-bold text-landed">
              <span className="size-1.5 animate-pulse-dot rounded-full bg-landed" />
              WATCHING
            </span>
          </div>

          {watchlist.length === 0 ? (
            <Panel>
              <EmptyState
                icon={<Bookmark className="size-6" />}
                title="Your watchlist is empty"
                description="Open any flight and tap Watchlist to save it. You'll receive live gate, delay, boarding, and baggage alerts."
                action={
                  <Link href="/search">
                    <Button size="sm">
                      <Plane className="size-3.5" /> Search flights
                    </Button>
                  </Link>
                }
              />
            </Panel>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {watchlist.map((flight) => (
                <FlightCard key={`${flight.id}-${flight.flightDate ?? "any"}`} flight={flight} />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <Panel className="p-3">
            <div className="flex items-center justify-between">
              <p className="label-caps text-ink">Watchlist status</p>
              <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[9px] text-muted">
                {watchlist.length} saved
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-line bg-surface-2 px-3 py-2">
                <p className="text-[10px] text-muted">Saved flights</p>
                <p className="mt-1 text-lg font-black text-ink">
                  {watchlist.length}
                </p>
              </div>
              <div className="rounded-lg border border-line bg-surface-2 px-3 py-2">
                <p className="text-[10px] text-muted">Unread alerts</p>
                <p className="mt-1 text-lg font-black text-ink">
                  {unreadAlertCount}
                </p>
              </div>
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-muted">
              Saved flights are stored on this device and synced to
              your account, with live status checks whenever data is available.
            </p>
          </Panel>

          <Panel className="p-3">
            <div className="flex items-center justify-between">
              <p className="label-caps text-ink">Alert inbox</p>
              <BellRing className="size-3.5 text-accent" />
            </div>
            <div className="mt-2 space-y-1.5">
              {alerts.slice(0, 8).map((alert) => (
                <div
                  key={alert.id}
                  className={cn(
                    "rounded-lg border px-2.5 py-2",
                    alert.isRead
                      ? "border-line/60 bg-surface/60"
                      : "border-accent/25 bg-accent-soft/40",
                  )}
                >
                  <p className="text-[10px] font-semibold text-ink">
                    {alert.title}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[9px] text-muted">
                    {alert.message}
                  </p>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="font-mono text-[8px] uppercase tracking-wider text-accent">
                      {ALERT_META[alert.type]?.label ?? alert.type}
                    </span>
                    <span className="text-[8px] text-subtle">
                      {formatAlertTimestamp(alert.timestamp)}
                    </span>
                  </div>
                </div>
              ))}
              {alerts.length === 0 && (
                <p className="rounded-lg border border-dashed border-line px-2.5 py-3 text-[10px] text-subtle">
                  No alerts yet. Watch a flight with live data to start the
                  change monitor.
                </p>
              )}
            </div>
          </Panel>

          {watchlist.length > 0 && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShareFlight(watchlist[0])}
            >
              <Share2 className="size-3.5" />
              Share watchlist flight
            </Button>
          )}
        </div>
      </div>

      {shareFlight && (
        <ShareFlightDialog
          flight={shareFlight}
          open
          onClose={() => setShareFlight(null)}
        />
      )}
    </div>
  );
}
