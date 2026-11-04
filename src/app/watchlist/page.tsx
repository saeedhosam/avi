"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BellRing,
  Bookmark,
  Heart,
  Plane,
  Share2,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useApp } from "@/lib/store";
import type { AlertType, Flight } from "@/lib/types";
import { ALERT_META, cn } from "@/lib/utils";
import { FlightCard } from "@/components/flight-card";
import { ShareFlightDialog } from "@/components/share-dialog";
import { Button, EmptyState, Panel, Tabs } from "@/components/ui";

type WatchTab = "FAVORITES" | "TRACKED" | "ALL";

const QUICK_ACTIONS: Array<{ type: AlertType; label: string }> = [
  { type: "GATE_CHANGE", label: "Gate" },
  { type: "DELAY", label: "Delay" },
  { type: "BOARDING", label: "Boarding" },
  { type: "BAGGAGE", label: "Baggage" },
];

export default function WatchlistPage() {
  const {
    favorites,
    tracked,
    flights,
    simulateAlert,
    alerts,
    unreadAlertCount,
    markAllAlertsRead,
  } = useApp();
  const [tab, setTab] = useState<WatchTab>("FAVORITES");
  const [shareFlight, setShareFlight] = useState<Flight | null>(null);

  const allSaved = useMemo(
    () =>
      flights.filter((flight) => flight.isFavorite || flight.isTracked),
    [flights],
  );

  const displayed =
    tab === "FAVORITES" ? favorites : tab === "TRACKED" ? tracked : allSaved;

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4 lg:px-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="label-caps text-accent">Saved flight watchlist</p>
          <h2 className="mt-1 flex items-center gap-2 text-xl font-black tracking-tight text-ink">
            Your watchlist
            <span className="text-sm font-semibold text-muted">
              ({allSaved.length} saved)
            </span>
          </h2>
          <p className="mt-1 text-[11px] text-muted">
            {favorites.length} favorites · {tracked.length} tracked offline ·{" "}
            {unreadAlertCount} unread alerts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs
            value={tab}
            onChange={setTab}
            compact
            tabs={[
              { value: "FAVORITES", label: "Favorites", count: favorites.length },
              { value: "TRACKED", label: "Tracked", count: tracked.length },
              { value: "ALL", label: "All saved", count: allSaved.length },
            ]}
          />
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2">
            <div className="flex items-center gap-2">
              <BellRing className="size-4 text-accent" />
              <p className="text-[11px] font-semibold text-ink">
                Live alerts active · Gate, delay, boarding & baggage push enabled
              </p>
            </div>
            <span className="flex items-center gap-1 text-[9px] font-bold text-landed">
              <span className="size-1.5 animate-pulse-dot rounded-full bg-landed" />
              WATCHING
            </span>
          </div>

          {displayed.length === 0 ? (
            <Panel>
              <EmptyState
                icon={
                  tab === "TRACKED" ? (
                    <Bookmark className="size-6" />
                  ) : (
                    <Heart className="size-6" />
                  )
                }
                title={
                  tab === "TRACKED"
                    ? "No tracked flights"
                    : tab === "FAVORITES"
                      ? "Your watchlist is empty"
                      : "No saved flights"
                }
                description={
                  tab === "TRACKED"
                    ? "Open any flight and tap Track to cache it locally for offline monitoring with push alerts."
                    : "Tap the heart icon on any flight to save it. You'll receive real-time alerts for gate changes, boarding calls, delays, and baggage updates even while offline."
                }
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
            <div className="space-y-3">
              {displayed.map((flight) => (
                <div key={flight.id}>
                  <FlightCard flight={flight} />
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 px-1">
                    <span className="text-[9px] font-semibold text-subtle">
                      Test alerts:
                    </span>
                    {QUICK_ACTIONS.map((action) => (
                      <button
                        key={action.type}
                        onClick={() => simulateAlert(flight.flightNumber, action.type)}
                        className="rounded-md border px-2 py-1 text-[9px] font-semibold transition-colors hover:brightness-110"
                        style={{
                          color: ALERT_META[action.type].color,
                          backgroundColor: `${ALERT_META[action.type].color}12`,
                          borderColor: `${ALERT_META[action.type].color}45`,
                        }}
                      >
                        {action.label}
                      </button>
                    ))}
                    <button
                      onClick={() => setShareFlight(flight)}
                      className="flex items-center gap-1 rounded-md border border-accent/35 bg-accent-soft px-2 py-1 text-[9px] font-bold text-accent transition-colors hover:bg-accent/15"
                    >
                      <Share2 className="size-2.5" /> Share
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-3">
          <Panel className="p-3">
            <div className="flex items-center justify-between">
              <p className="label-caps text-subtle">Watchlist health</p>
              <Sparkles className="size-3.5 text-accent" />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Stat label="Favorites" value={favorites.length} accent />
              <Stat label="Tracked" value={tracked.length} />
              <Stat label="Airborne" value={allSaved.filter((f) => f.status === "DEPARTED").length} />
              <Stat label="Unread alerts" value={unreadAlertCount} />
            </div>
            <p className="mt-2 rounded-lg border border-line/60 bg-surface-2 px-2 py-1.5 text-[9px] leading-relaxed text-muted">
              Favorites and tracked flights are cached locally and mirrored to
              Firestore for signed-in users. Alerts update every flight state
              change.
            </p>
          </Panel>

          <Panel className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line/60 px-3 py-2">
              <p className="label-caps text-subtle">Alert inbox</p>
              {unreadAlertCount > 0 && (
                <button
                  onClick={markAllAlertsRead}
                  className="text-[9px] font-semibold text-accent hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-[360px] space-y-1.5 overflow-y-auto p-2">
              {alerts.length === 0 ? (
                <p className="px-2 py-4 text-center text-[10px] text-subtle">
                  No alerts yet.
                </p>
              ) : (
                alerts.slice(0, 8).map((alert) => {
                  const meta = ALERT_META[alert.type];
                  return (
                    <div
                      key={alert.id}
                      className={cn(
                        "rounded-lg border px-2 py-1.5",
                        alert.isRead
                          ? "border-line/50 bg-surface-2/50"
                          : "border-line bg-surface-2",
                      )}
                    >
                      <p className="flex items-center gap-1.5">
                        <span
                          className="size-1.5 rounded-full"
                          style={{ backgroundColor: meta.color }}
                        />
                        <span className="truncate text-[9px] font-bold text-ink">
                          {alert.title}
                        </span>
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-[8px] text-subtle">
                        <span className="font-mono text-accent">
                          {alert.flightNumber}
                        </span>
                        · {alert.timestamp}
                        {!alert.isRead && (
                          <span className="ml-auto rounded-full bg-accent/15 px-1 py-0.5 text-[7px] font-bold text-accent">
                            NEW
                          </span>
                        )}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </Panel>

          <Panel className="p-3">
            <p className="label-caps text-subtle">Quick alert simulation</p>
            <p className="mt-1 text-[9px] leading-relaxed text-muted">
              Use the test chips below each saved flight to push a gate, delay,
              boarding, or baggage alert through the live pipeline.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <TriangleAlert className="size-3.5 text-delayed" />
              <span className="text-[9px] text-subtle">
                Alerts persist locally and mirror to Firestore.
              </span>
            </div>
          </Panel>

          <div className="rounded-xl border border-dashed border-line bg-surface-2/50 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[10px] font-bold text-muted">
              <Plane className="size-3 text-accent" /> Offline ready
            </p>
            <p className="mt-1 text-[9px] leading-relaxed text-subtle">
              Every saved flight, note, and alert stays available in the local
              cache when the network drops.
            </p>
          </div>
        </aside>
      </div>

      {shareFlight && (
        <ShareFlightDialog
          flight={shareFlight}
          open={Boolean(shareFlight)}
          onClose={() => setShareFlight(null)}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line/60 bg-surface-2 px-2 py-1.5">
      <p className="text-[8px] font-bold uppercase tracking-wider text-subtle">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-sm font-black tabular",
          accent ? "text-accent" : "text-ink",
        )}
      >
        {value}
      </p>
    </div>
  );
}
