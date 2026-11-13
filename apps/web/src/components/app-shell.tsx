"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Bell,
  Building2,
  CheckCircle2,
  CircleAlert,
  Glasses,
  Info,
  Network,
  Plane,
  RefreshCw,
  Search,
  Settings2,
  X,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { DATA_SOURCE_META } from "@/lib/data-source";
import { AccountDialog } from "./account-dialog";
import { NotificationsDialog } from "./notifications-dialog";
import { Button, Modal } from "./ui";

const NAV_ITEMS = [
  { href: "/search", label: "Search", icon: Search, tag: "Flight lookup" },
  {
    href: "/routes",
    label: "Routes",
    icon: Network,
    tag: "Global connections",
  },
  {
    href: "/airports",
    label: "Airports",
    icon: Building2,
    tag: "Indoor terminal maps",
  },
  {
    href: "/airplanes",
    label: "Airplanes",
    icon: Plane,
    tag: "Cabin seatmaps",
  },
  { href: "/watchlist", label: "Watchlist", icon: Glasses, tag: "Watched flights" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const {
    watchlist,
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

  return (
    <div className="app-bg min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[240px] flex-col border-r border-line/70 bg-surface/80 backdrop-blur-xl lg:flex">
        <div className="flex h-[72px] items-center gap-2.5 border-b border-line/60 px-5">
          <div className="flex size-9 items-center justify-center rounded-full border border-accent bg-accent-soft text-accent">
            <Plane className="size-4.5" />
          </div>
          <div className="min-w-0">
            <p className="text-[17px] font-black leading-none tracking-tight text-ink">
              Avi
            </p>
            <p className="mt-1 whitespace-nowrap text-[8px] font-bold uppercase tracking-[0.16em] text-accent">
              Your sky companion
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          <p className="px-2 pb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-subtle">
            Operations
          </p>
          {NAV_ITEMS.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/search" && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all",
                  active
                    ? "border-accent/35 bg-accent-soft text-accent"
                    : "border-transparent text-muted hover:border-line/70 hover:bg-surface-2/70 hover:text-ink",
                )}
              >
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-lg border transition-colors",
                    active
                      ? "border-accent/40 bg-accent/10 text-accent"
                      : "border-line/60 bg-surface-2 text-muted group-hover:text-ink",
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-1">
                    <span className="text-[13px] font-semibold">
                      {item.label}
                    </span>
                    {item.href === "/watchlist" && watchlist.length > 0 && (
                      <span className="rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-bold text-[color:var(--bg)]">
                        {watchlist.length}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-[9px] text-subtle">
                    {item.tag}
                  </span>
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-line/60 p-3">
          <div className="flex items-center gap-1.5">
            <button
              onClick={refreshData}
              disabled={syncing}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line/70 bg-surface-2/60 px-2 py-2 text-[10px] font-bold text-muted transition-colors hover:border-accent/40 hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
            >
              <RefreshCw
                className={cn("size-3.5", syncing && "animate-spin")}
              />
              Refresh
            </button>
            <button
              onClick={() => setNotificationsOpen(true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line/70 bg-surface-2/60 px-2 py-2 text-[10px] font-bold text-muted transition-colors hover:border-accent/40 hover:text-ink"
            >
              <Bell className="size-3.5" />
              Alerts
              {unreadAlertCount > 0 && (
                <span className="rounded-full bg-[#F59E0B] px-1.5 text-[9px] font-bold leading-4 text-[#070E17]">
                  {unreadAlertCount}
                </span>
              )}
            </button>
          </div>

          <button
            onClick={() => setSourceOpen(true)}
            className="flex w-full items-center gap-2 rounded-xl border border-line/70 bg-surface-2/60 px-2.5 py-2 text-left transition-colors hover:border-accent/40"
          >
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: source.color }}
            />
            <span className="min-w-0 flex-1">
              <span
                className="block truncate text-[9px] font-extrabold uppercase tracking-wider"
                style={{ color: source.color }}
              >
                {source.badge}
              </span>
              <span className="block truncate text-[9px] text-subtle">
                {source.summary}
              </span>
            </span>
            <Info className="size-3 text-subtle" />
          </button>

          <button
            onClick={() => setAccountOpen(true)}
            className="flex w-full items-center gap-2.5 rounded-xl border border-line/70 bg-surface-2/60 p-2 text-left transition-colors hover:border-accent/40"
          >
            <span className="flex size-8 items-center justify-center rounded-full border border-accent/50 bg-accent-soft text-[11px] font-bold text-accent">
              {account.avatarInitial}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] font-bold text-ink">
                {account.name}
              </span>
              <span className="block truncate text-[9px] text-subtle">
                {account.isSignedIn ? account.email : "Sign in to sync"}
              </span>
            </span>
            <Settings2 className="size-3.5 text-subtle" />
          </button>

        </div>
      </aside>

      <div className="lg:pl-[240px]">
        <main className="min-h-screen pb-20 lg:pb-0">
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-line/70 bg-surface/95 backdrop-blur-xl lg:hidden">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/search" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[9px] font-semibold",
                active ? "text-accent" : "text-subtle",
              )}
            >
              <Icon className="size-4" />
              {item.label.split(" ")[0]}
              {item.href === "/watchlist" && watchlist.length > 0 && (
                <span className="absolute right-[22%] top-1.5 size-1.5 rounded-full bg-accent" />
              )}
            </Link>
          );
        })}
        <button
          onClick={() => setNotificationsOpen(true)}
          className="relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[9px] font-semibold text-subtle transition-colors hover:text-accent"
        >
          <Bell className="size-4" />
          Alerts
          {unreadAlertCount > 0 && (
            <span className="absolute right-[22%] top-1 flex min-w-4 items-center justify-center rounded-full bg-[#F59E0B] px-1 text-[9px] font-bold leading-4 text-[#070E17]">
              {unreadAlertCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setAccountOpen(true)}
          className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[9px] font-semibold text-subtle transition-colors hover:text-accent"
        >
          <span className="flex size-4 items-center justify-center rounded-full border border-accent/45 bg-surface-2 text-[8px] font-bold text-accent">
            {account.avatarInitial}
          </span>
          Account
        </button>
      </nav>

      <NotificationsDialog
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
      />
      <AccountDialog open={accountOpen} onClose={() => setAccountOpen(false)} />

      <Modal
        open={sourceOpen}
        onClose={() => setSourceOpen(false)}
        title="Telemetry & API diagnostics"
        subtitle={source.title}
        icon={<Info className="size-4" />}
        size="sm"
        footer={
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSourceOpen(false)}
          >
            Close
          </Button>
        }
      >
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-muted">
            {source.subtitle}
          </p>
          <div className="space-y-2">
            <DiagnosticRow
              title="Live flight data"
              detail="Flight lookup, airport boards, daily route stats"
              active={dataSourceMode === "LIVE_AERODATABOX"}
              value={
                dataSourceMode === "LIVE_AERODATABOX"
                  ? "LIVE RESPONSE"
                  : aeroConfigured
                    ? "READY · NO DATA"
                    : "SAVED DATA"
              }
            />
            <DiagnosticRow
              title="Destination weather"
              detail="Open-Meteo model forecast, fetched on demand"
              active={false}
              value="ON DEMAND"
            />
            <DiagnosticRow
              title="Local cache & background sync"
              detail="Saved flight records, watchlist, notes, alerts"
              active
              value="ACTIVE"
            />
            <DiagnosticRow
              title="Account sync"
              detail="Sign-in · profile · watchlist · alerts"
              active={Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)}
              value={Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) ? "CONFIGURED" : "OPTIONAL"}
            />
          </div>
          {!aeroConfigured && (
            <p className="rounded-lg border border-delayed/30 bg-delayed/10 px-3 py-2 text-[10px] leading-relaxed text-muted">
              Live flight lookups aren’t connected in this build, so saved
              flights and weather are used until it is. Everything else —
              watchlist, saves, notes, alerts — works normally.
            </p>
          )}
        </div>
      </Modal>

      <div className="pointer-events-none fixed bottom-20 right-4 z-[90] flex w-[min(92vw,380px)] flex-col gap-2 lg:bottom-5">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto animate-slide-left rounded-xl border border-line bg-surface/95 p-3 shadow-2xl backdrop-blur-xl"
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
              <p className="flex-1 text-[11px] leading-relaxed text-ink">
                {toast.message}
              </p>
              <button
                onClick={() => dismissToast(toast.id)}
                className="text-subtle transition-colors hover:text-ink"
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
