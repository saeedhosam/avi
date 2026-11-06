"use client";

import { useState } from "react";
import {
  RadioTower,
  Cloud,
  Info,
  RefreshCw,
  WifiOff,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { DATA_SOURCE_META } from "@/lib/data-source";
import { cn } from "@/lib/utils";
import { Button, Modal } from "./ui";

export function SourceBanner({ className }: { className?: string }) {
  const { dataSourceMode, syncing, refreshData, aeroConfigured, offlineMode } =
    useApp();
  const [open, setOpen] = useState(false);
  const meta = DATA_SOURCE_META[dataSourceMode];

  return (
    <>
      <div
        className={cn(
          "flex w-full items-center gap-2 rounded-xl border bg-surface-2/80 px-3 py-2 text-left transition-colors hover:border-accent/40",
          className,
        )}
        style={{ borderColor: `${meta.color}66` }}
      >
        {syncing ? (
          <RefreshCw className="size-3 animate-spin text-accent" />
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
          <span
            className="shrink-0 text-[9px] font-extrabold uppercase tracking-[0.1em]"
            style={{ color: meta.color }}
          >
            {syncing ? "SYNCING…" : meta.badge}
          </span>
          <span className="min-w-0 flex-1 truncate text-[10px] text-muted">
            · {meta.summary}
          </span>
          <Info className="size-3 shrink-0 text-subtle" />
        </button>
        <button
          type="button"
          onClick={() => {
            void refreshData();
          }}
          className="ml-1 flex size-6 shrink-0 items-center justify-center rounded-md text-accent transition-colors hover:bg-surface-3"
          aria-label="Refresh data"
        >
          <RefreshCw className={cn("size-3", syncing && "animate-spin")} />
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
              <RefreshCw className={cn("size-3.5", syncing && "animate-spin")} />
              Refresh
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-muted">{meta.subtitle}</p>
          <div className="space-y-2">
            <DiagnosticRow
              title="Live flight data"
              detail="Flights, airport boards, delays, daily route stats"
              active={aeroConfigured && !offlineMode}
              value={aeroConfigured ? "CONNECTED" : "SAVED DATA"}
            />
            <DiagnosticRow
              title="Destination weather"
              detail="Live METAR, forecasts, VFR/IFR rules"
              active={!offlineMode}
              value="CONNECTED"
            />
            <DiagnosticRow
              title="Local cache + background sync"
              detail="Flights, watchlist, notes, alerts, routes"
              active
              value="ACTIVE"
            />
          </div>
          <div className="space-y-1.5 rounded-xl border border-line/70 bg-surface px-3 py-2.5">
            <p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-subtle">
              Data sources
            </p>
            <p className="text-[9px] leading-relaxed text-subtle">
              Flight data by{" "}
              <a
                href="https://www.aerodatabox.com/"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-accent"
              >
                AeroDataBox
              </a>
              .{" "}
              <a
                href="https://open-meteo.com/"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-accent"
              >
                Weather data by Open-Meteo
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
              . Not for operational navigation use.
            </p>
          </div>
          {offlineMode ? (
            <p className="flex items-start gap-2 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-[10px] leading-relaxed text-muted">
              <WifiOff className="mt-0.5 size-3.5 shrink-0 text-accent" />
              You’re offline. Live lookups are paused and
              your saved data is being used across all screens.
            </p>
          ) : !aeroConfigured ? (
            <p className="flex items-start gap-2 rounded-lg border border-delayed/30 bg-delayed/10 px-3 py-2 text-[10px] leading-relaxed text-muted">
              <Cloud className="mt-0.5 size-3.5 shrink-0 text-delayed" />
              Live flight lookups aren’t connected in this build.
              Saved flights and boards are shown from your last sync. Weather is live.
            </p>
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
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line/70 bg-surface-2 px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold text-ink">{title}</p>
        <p className="mt-0.5 truncate text-[9px] text-subtle">{detail}</p>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-md border px-1.5 py-1 text-[8px] font-extrabold tracking-wide",
          active
            ? "border-landed/35 bg-landed/10 text-landed"
            : "border-delayed/35 bg-delayed/10 text-delayed",
        )}
      >
        {value}
      </span>
    </div>
  );
}
