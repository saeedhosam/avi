"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Bell,
  CheckCircle2,
  CircleAlert,
  Info,
  Plane,
  RefreshCw,
  X,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { DATA_SOURCE_META } from "@/lib/data-source";
import { EXPLORE_HOME_EVENT } from "@/lib/explore-events";
import { AccountDialog } from "./account-dialog";
import { NotificationsDialog } from "./notifications-dialog";
import { Button, Modal } from "./ui";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const {
    unreadAlertCount,
    account,
    refreshData,
    syncing,
    dataSourceMode,
    aeroConfigured,
    toasts,
    dismissToast,
  } = useApp();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);

  const source = DATA_SOURCE_META[dataSourceMode];
  const isGlobeRoute =
    pathname === "/explore" || pathname.startsWith("/explore/");

  return (
    <div className="app-bg min-h-screen">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      {/* Floating brand */}
      <Link
        href="/explore"
        aria-label="Avi home"
        onClick={(event) => {
          if (!pathname.startsWith("/explore")) return;
          event.preventDefault();
          window.dispatchEvent(new Event(EXPLORE_HOME_EVENT));
        }}
        className="floating-top floating-left fixed z-50 flex items-center gap-2.5 rounded-full border border-line/70 bg-surface/85 py-1.5 pl-1.5 pr-3.5 shadow-2xl backdrop-blur-xl transition-colors hover:border-line-strong sm:gap-3 sm:pr-4"
      >
        <span className="flex size-8 items-center justify-center rounded-full border border-accent/40 bg-accent-soft text-accent sm:size-9">
          <Plane className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold leading-none tracking-tight text-ink">
            Avi
          </span>
          <span className="mt-1 hidden text-[10px] font-medium text-subtle sm:block">
            Direct-route explorer
          </span>
        </span>
      </Link>

      {/* Floating account, alerts, and data status */}
      <div className="floating-top floating-right fixed z-50 flex items-center gap-1 rounded-full border border-line/70 bg-surface/85 p-1 shadow-2xl backdrop-blur-xl">
        <button
          type="button"
          onClick={() => setSourceOpen(true)}
          title={source.title}
          aria-label={`Data status: ${source.short}`}
          className="flex min-h-9 items-center gap-1.5 rounded-full px-2 text-xs font-medium text-muted transition-colors hover:bg-surface-2/70 hover:text-ink sm:px-2.5"
        >
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: source.color }}
          />
          <span className="hidden sm:inline">{source.short}</span>
        </button>

        <button
          type="button"
          onClick={() => setNotificationsOpen(true)}
          aria-label={
            unreadAlertCount > 0
              ? `Alerts, ${unreadAlertCount} unread`
              : "Alerts"
          }
          title="Alerts"
          className="relative flex size-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2/70 hover:text-ink"
        >
          <Bell className="size-4" />
          {unreadAlertCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-delayed px-1 text-center text-[10px] font-semibold leading-4 text-[color:var(--bg)]">
              {unreadAlertCount > 9 ? "9+" : unreadAlertCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setAccountOpen(true)}
          aria-label={
            account.isSignedIn ? `Account: ${account.name}` : "Sign in"
          }
          title={account.isSignedIn ? account.name : "Sign in"}
          className="flex size-9 items-center justify-center rounded-full border border-accent/35 bg-accent-soft text-xs font-semibold text-accent transition-colors hover:border-accent/60 hover:bg-accent/15"
        >
          {account.avatarInitial}
        </button>
      </div>

      <main
        id="main-content"
        className={isGlobeRoute ? "shell-globe" : "shell-content"}
      >
        {children}
      </main>

      {/* Floating legal links */}
      <div className="floating-bottom floating-right fixed z-50 flex items-center gap-2 rounded-full border border-line/60 bg-surface/80 px-3 py-1.5 text-[11px] font-medium text-subtle shadow-lg backdrop-blur-xl">
        <Link href="/legal/terms" className="transition-colors hover:text-ink">
          Terms
        </Link>
        <span className="h-3 w-px bg-line/70" />
        <Link
          href="/legal/privacy"
          className="transition-colors hover:text-ink"
        >
          Privacy
        </Link>
      </div>

      <NotificationsDialog
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
      />
      <AccountDialog open={accountOpen} onClose={() => setAccountOpen(false)} />

      <Modal
        open={sourceOpen}
        onClose={() => setSourceOpen(false)}
        title="Data & API status"
        subtitle={source.title}
        icon={<Info className="size-4" />}
        size="sm"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSourceOpen(false)}
            >
              Close
            </Button>
            <Button
              size="sm"
              onClick={() => void refreshData()}
              disabled={syncing}
            >
              <RefreshCw
                className={cn("size-3.5", syncing && "animate-spin")}
              />
              {syncing ? "Syncing" : "Refresh data"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-muted">
            {source.subtitle}
          </p>
          <div className="divide-y divide-line/60 rounded-lg border border-line/60">
            <DiagnosticRow
              title="Live flight data"
              detail="Flight lookup, airport boards, route stats"
              active={dataSourceMode === "LIVE_AERODATABOX"}
              value={
                dataSourceMode === "LIVE_AERODATABOX"
                  ? "Live"
                  : aeroConfigured
                    ? "Ready · no data"
                    : "Saved data"
              }
            />
            <DiagnosticRow
              title="Destination weather"
              detail="Open-Meteo forecast, fetched on demand"
              active={false}
              value="On demand"
            />
            <DiagnosticRow
              title="Local cache & background sync"
              detail="Saved flights, watchlist, notes, alerts"
              active
              value="Active"
            />
            <DiagnosticRow
              title="Account sync"
              detail="Sign-in · profile · watchlist · alerts"
              active={Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)}
              value={
                Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)
                  ? "Configured"
                  : "Optional"
              }
            />
          </div>
          {!aeroConfigured && (
            <p className="rounded-lg border border-delayed/30 bg-delayed/8 px-3.5 py-3 text-sm leading-relaxed text-muted">
              Live flight lookups aren’t connected in this build, so saved
              flights and weather are used until they are. Watchlist, saves,
              notes and alerts work normally.
            </p>
          )}
        </div>
      </Modal>

      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-16 right-3 z-[90] flex w-[min(92vw,380px)] flex-col gap-2 sm:bottom-20 sm:right-4"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto animate-slide-left rounded-lg border border-line bg-surface/95 p-3.5 shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-start gap-2.5">
              {toast.kind === "success" ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-landed" />
              ) : toast.kind === "warning" ? (
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-delayed" />
              ) : toast.kind === "alert" ? (
                <Bell className="mt-0.5 size-4 shrink-0 text-accent" />
              ) : (
                <Info className="mt-0.5 size-4 shrink-0 text-accent-2" />
              )}
              <p className="flex-1 text-[13px] leading-relaxed text-ink">
                {toast.message}
              </p>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="-m-1 p-1 text-subtle transition-colors hover:text-ink"
                aria-label="Dismiss notification"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
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
