"use client";

import { useState } from "react";
import { Info, RadioTower, RefreshCw } from "lucide-react";
import { useApp } from "@/lib/store";
import { DATA_SOURCE_META } from "@/lib/data-source";
import { cn } from "@/lib/utils";
import { Button, Callout, Modal } from "./ui";

export function SourceBanner({ className }: { className?: string }) {
  const { dataSourceMode, syncing, refreshData, aeroConfigured, offlineMode } =
    useApp();
  const [open, setOpen] = useState(false);
  const meta = DATA_SOURCE_META[dataSourceMode];

  return (
    <>
      <div
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border border-line/60 bg-surface-2/40 px-3 py-2",
          className,
        )}
      >
        {syncing ? (
          <RefreshCw className="size-3.5 animate-spin text-accent" />
        ) : (
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: meta.color }}
          />
        )}
        {/* Real button + separate refresh control: no nested interactive widgets. */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-label="Open data and sync status details"
        >
          <span className="shrink-0 text-xs font-semibold text-ink">
            {syncing ? "Syncing…" : meta.badge}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted">
            {meta.summary}
          </span>
          <Info className="size-3.5 shrink-0 text-subtle" />
        </button>
        <button
          type="button"
          onClick={() => {
            void refreshData();
          }}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-subtle transition-colors hover:bg-surface-3 hover:text-ink"
          aria-label="Refresh data"
        >
          <RefreshCw className={cn("size-3.5", syncing && "animate-spin")} />
        </button>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Data & sync status"
        subtitle={meta.title}
        icon={<RadioTower className="size-4" />}
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button size="sm" onClick={refreshData} disabled={syncing}>
              <RefreshCw className={cn("size-4", syncing && "animate-spin")} />
              {syncing ? "Refreshing…" : "Refresh"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-muted">{meta.subtitle}</p>
          <div className="divide-y divide-line/60 rounded-lg border border-line/60">
            <DiagnosticRow
              title="Live flight data"
              detail="Flights, boards, delays, daily route stats"
              active={dataSourceMode === "LIVE_AERODATABOX"}
              value={
                offlineMode
                  ? "Offline"
                  : dataSourceMode === "LIVE_AERODATABOX"
                    ? "Live"
                    : dataSourceMode === "CONFIGURED_IDLE"
                      ? "Ready · no data"
                      : dataSourceMode === "QUOTA_FALLBACK"
                        ? "Paused"
                        : "Unavailable"
              }
            />
            <DiagnosticRow
              title="Destination weather"
              detail="Open-Meteo model forecast, fetched on demand"
              active={false}
              value="On demand"
            />
            <DiagnosticRow
              title="Local cache & background sync"
              detail="Saved flights, watchlist, notes, alerts"
              active
              value="Active"
            />
          </div>

          <div className="rounded-lg border border-line/60 px-3.5 py-3">
            <p className="label-caps text-subtle">Sources</p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              Flight data by{" "}
              <a
                href="https://aerodatabox.com/"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-accent"
              >
                AeroDataBox
              </a>
              . Weather by{" "}
              <a
                href="https://open-meteo.com/"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-accent"
              >
                Open-Meteo
              </a>
              . Map data ©{" "}
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-accent"
              >
                OpenStreetMap contributors
              </a>{" "}
              · tiles by{" "}
              <a
                href="https://openfreemap.org/"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-accent"
              >
                OpenFreeMap
              </a>
              .
            </p>
            <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line/50 pt-2.5 text-xs text-muted">
              <a
                href="/legal/privacy"
                className="underline underline-offset-2 hover:text-accent"
              >
                Privacy
              </a>
              <span className="text-subtle">·</span>
              <a
                href="/legal/terms"
                className="underline underline-offset-2 hover:text-accent"
              >
                Terms
              </a>
              <span className="text-subtle">· Not for operational navigation.</span>
            </p>
          </div>

          {offlineMode ? (
            <Callout tone="info">
              You’re offline. Live lookups are paused and your saved data is
              used across all screens.
            </Callout>
          ) : !aeroConfigured ? (
            <Callout tone="attention" title="Live flight data is not connected">
              Saved flights and boards come from your last sync. Weather is
              live.
            </Callout>
          ) : null}
        </div>
      </Modal>
    </>
  );
}

function DiagnosticRow({
  title,
  detail,
  active,
  value,
}: {
  title: string;
  detail: string;
  active: boolean;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-3">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-ink">{title}</p>
        <p className="mt-0.5 truncate text-xs text-subtle">{detail}</p>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-md border px-2 py-1 text-xs font-semibold",
          active
            ? "border-landed/30 bg-landed/10 text-landed"
            : "border-delayed/30 bg-delayed/10 text-delayed",
        )}
      >
        {value}
      </span>
    </div>
  );
}
