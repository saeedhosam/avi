"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BadgeDollarSign,
  Bell,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Glasses,
  Globe2,
  Info,
  LayoutGrid,
  Network,
  Plane,
  RefreshCw,
  Search,
  Settings2,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { DATA_SOURCE_META } from "@/lib/data-source";
import { AccountDialog } from "./account-dialog";
import { NotificationsDialog } from "./notifications-dialog";
import { Button, Modal } from "./ui";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  matches?: string[];
};

const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Plan",
    items: [
      { href: "/search", label: "Search", icon: Search },
      { href: "/explore/CAI", label: "Explore", icon: Globe2, matches: ["/explore"] },
      { href: "/routes", label: "Routes", icon: Network },
    ],
  },
  {
    label: "At the airport",
    items: [
      { href: "/airports", label: "Airports", icon: Building2 },
      {
        href: "/airplanes",
        label: "Airplanes",
        icon: Plane,
        matches: ["/airplanes", "/cabin"],
      },
    ],
  },
  {
    label: "Your account",
    items: [
      { href: "/watchlist", label: "Watchlist", icon: Glasses },
      { href: "/pricing", label: "Plans", icon: BadgeDollarSign },
    ],
  },
];

const MOBILE_ITEMS: NavItem[] = [
  { href: "/search", label: "Search", icon: Search },
  { href: "/explore/CAI", label: "Explore", icon: Globe2, matches: ["/explore"] },
  { href: "/airports", label: "Airports", icon: Building2 },
  { href: "/watchlist", label: "Watchlist", icon: Glasses },
];

function isActive(pathname: string, item: NavItem) {
  const targets = item.matches ?? [item.href];
  return targets.some(
    (target) => pathname === target || pathname.startsWith(`${target}/`),
  );
}

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
  const [moreOpen, setMoreOpen] = useState(false);

  const source = DATA_SOURCE_META[dataSourceMode];
  const moreActive = ["/routes", "/airplanes", "/cabin", "/pricing"].some(
    (href) => pathname === href || pathname.startsWith(`${href}/`),
  );

  return (
    <div className="app-bg min-h-screen">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-line/60 bg-surface/70 backdrop-blur-xl lg:flex">
        <Link
          href="/search"
          className="flex h-[68px] items-center gap-2.5 border-b border-line/50 px-5 transition-colors hover:bg-surface-2/40"
        >
          <span className="flex size-9 items-center justify-center rounded-full border border-accent/40 bg-accent-soft text-accent">
            <Plane className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-[17px] font-semibold leading-none tracking-tight text-ink">
              AeroQuest
            </span>
            <span className="mt-1 block whitespace-nowrap text-xs font-medium text-subtle">
              Route · Terminal · Cabin
            </span>
          </span>
        </Link>

        <nav
          className="flex-1 space-y-5 overflow-y-auto px-3 py-5"
          aria-label="Primary"
        >
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="label-caps px-3 pb-2 text-subtle">{group.label}</p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(pathname, item);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group flex min-h-11 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors",
                        active
                          ? "bg-accent-soft text-accent"
                          : "text-muted hover:bg-surface-2/60 hover:text-ink",
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-[18px] shrink-0",
                          active ? "text-accent" : "text-subtle group-hover:text-muted",
                        )}
                      />
                      <span className="flex-1">{item.label}</span>
                      {item.href === "/watchlist" && watchlist.length > 0 && (
                        <span className="rounded-full bg-surface-3 px-1.5 py-0.5 text-xs font-semibold tabular text-muted">
                          {watchlist.length}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="space-y-1.5 border-t border-line/50 p-3">
          <button
            type="button"
            onClick={() => setSourceOpen(true)}
            className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left transition-colors hover:bg-surface-2/60"
          >
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: source.color }}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-ink">
                {source.badge}
              </span>
              <span className="block truncate text-xs text-subtle">
                Data &amp; API status
              </span>
            </span>
            <Info className="size-3.5 text-subtle" />
          </button>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void refreshData()}
              disabled={syncing}
              className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-medium text-muted transition-colors hover:bg-surface-2/60 hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
            >
              <RefreshCw className={cn("size-3.5", syncing && "animate-spin")} />
              {syncing ? "Syncing" : "Refresh"}
            </button>
            <button
              type="button"
              onClick={() => setNotificationsOpen(true)}
              className="relative flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-medium text-muted transition-colors hover:bg-surface-2/60 hover:text-ink"
            >
              <Bell className="size-3.5" />
              Alerts
              {unreadAlertCount > 0 && (
                <span className="ml-0.5 rounded-full bg-delayed px-1.5 text-xs font-semibold tabular leading-4 text-[color:var(--bg)]">
                  {unreadAlertCount}
                </span>
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setAccountOpen(true)}
            className="flex min-h-12 w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-2/60"
          >
            <span className="flex size-8 items-center justify-center rounded-full border border-accent/40 bg-accent-soft text-xs font-semibold text-accent">
              {account.avatarInitial}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-ink">
                {account.name}
              </span>
              <span className="block truncate text-xs text-subtle">
                {account.isSignedIn ? account.email : "Sign in to sync"}
              </span>
            </span>
            <Settings2 className="size-3.5 shrink-0 text-subtle" />
          </button>

          <div className="flex items-center justify-between px-3 pt-1 text-xs text-subtle">
            <Link href="/legal/terms" className="hover:text-muted">
              Terms
            </Link>
            <Link href="/legal/privacy" className="hover:text-muted">
              Privacy
            </Link>
          </div>
        </div>
      </aside>

      <div className="lg:pl-[248px]">
        <main id="main-content" className="min-h-screen pb-safe-nav pt-safe">
          {children}
        </main>
      </div>

      {/* Mobile tab bar: five destinations, everything else under More. */}
      <nav
        className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line/60 bg-surface/95 backdrop-blur-xl lg:hidden"
        aria-label="Primary"
      >
        <div className="grid grid-cols-5">
          {MOBILE_ITEMS.map((item) => {
            const active = isActive(pathname, item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[58px] flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
                  active ? "text-accent" : "text-subtle hover:text-ink",
                )}
              >
                <span className="relative">
                  <Icon className="size-5" />
                  {item.href === "/watchlist" && watchlist.length > 0 && (
                    <span className="absolute -right-1.5 -top-1 size-1.5 rounded-full bg-accent" />
                  )}
                </span>
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-expanded={moreOpen}
            className={cn(
              "flex min-h-[58px] flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
              moreActive || moreOpen
                ? "text-accent"
                : "text-subtle hover:text-ink",
            )}
          >
            <span className="relative">
              <LayoutGrid className="size-5" />
              {unreadAlertCount > 0 && (
                <span className="absolute -right-2 -top-1 min-w-3.5 rounded-full bg-delayed px-1 text-center text-xs font-semibold leading-3.5 text-[color:var(--bg)]">
                  {unreadAlertCount}
                </span>
              )}
            </span>
            More
          </button>
        </div>
      </nav>

      <NotificationsDialog
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
      />
      <AccountDialog open={accountOpen} onClose={() => setAccountOpen(false)} />

      <MoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        pathname={pathname}
        onAlerts={() => {
          setMoreOpen(false);
          setNotificationsOpen(true);
        }}
        onAccount={() => {
          setMoreOpen(false);
          setAccountOpen(true);
        }}
        onSource={() => {
          setMoreOpen(false);
          setSourceOpen(true);
        }}
        accountName={account.name}
      />

      <Modal
        open={sourceOpen}
        onClose={() => setSourceOpen(false)}
        title="Data & API status"
        subtitle={source.title}
        icon={<Info className="size-4" />}
        size="sm"
        footer={
          <Button size="sm" variant="ghost" onClick={() => setSourceOpen(false)}>
            Close
          </Button>
        }
      >
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-muted">{source.subtitle}</p>
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
        className="pointer-events-none fixed bottom-24 right-4 z-[90] flex w-[min(92vw,380px)] flex-col gap-2 lg:bottom-5"
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

function MoreSheet({
  open,
  onClose,
  pathname,
  onAlerts,
  onAccount,
  onSource,
  accountName,
}: {
  open: boolean;
  onClose: () => void;
  pathname: string;
  onAlerts: () => void;
  onAccount: () => void;
  onSource: () => void;
  accountName: string;
}) {
  const rows: Array<
    | { kind: "link"; href: string; label: string; icon: LucideIcon; detail: string }
    | { kind: "action"; label: string; icon: LucideIcon; detail: string; onPress: () => void }
  > = [
    {
      kind: "link",
      href: "/routes",
      label: "Routes",
      icon: Network,
      detail: "Global connection planner",
    },
    {
      kind: "link",
      href: "/airplanes",
      label: "Airplanes",
      icon: Plane,
      detail: "Cabin and seat maps",
    },
    {
      kind: "link",
      href: "/pricing",
      label: "Plans",
      icon: BadgeDollarSign,
      detail: "Free · Pro · Trip Pass",
    },
    {
      kind: "action",
      label: "Alerts",
      icon: Bell,
      detail: "Watchlist notifications",
      onPress: onAlerts,
    },
    {
      kind: "action",
      label: accountName,
      icon: Settings2,
      detail: "Account and sync",
      onPress: onAccount,
    },
    {
      kind: "action",
      label: "Data & API status",
      icon: Info,
      detail: "Sources and availability",
      onPress: onSource,
    },
  ];

  return (
    <Modal open={open} onClose={onClose} title="More" size="sm">
      <div className="divide-y divide-line/60">
        {rows.map((row) => {
          const Icon = row.icon;
          const active =
            row.kind === "link" &&
            (pathname === row.href || pathname.startsWith(`${row.href}/`));
          const inner = (
            <>
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg border border-line/60 bg-surface-2",
                  active ? "text-accent" : "text-muted",
                )}
              >
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">
                  {row.label}
                </span>
                <span className="block truncate text-xs text-subtle">
                  {row.detail}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-subtle" />
            </>
          );
          return row.kind === "link" ? (
            <Link
              key={row.href}
              href={row.href}
              onClick={onClose}
              className="flex min-h-14 items-center gap-3 py-2.5"
            >
              {inner}
            </Link>
          ) : (
            <button
              key={row.label}
              type="button"
              onClick={row.onPress}
              className="flex min-h-14 w-full items-center gap-3 py-2.5 text-left"
            >
              {inner}
            </button>
          );
        })}
        <div className="flex items-center justify-between py-3 text-xs text-subtle">
          <Link href="/legal/terms" onClick={onClose} className="hover:text-muted">
            Terms
          </Link>
          <Link href="/legal/privacy" onClick={onClose} className="hover:text-muted">
            Privacy
          </Link>
        </div>
      </div>
    </Modal>
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
