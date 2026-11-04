"use client";

import { useState } from "react";
import {
  BadgeCheck,
  Cloud,
  CloudOff,
  Laptop,
  LogIn,
  LogOut,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Sun,
  UserRound,
  Wifi,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { ThemeMode } from "@/lib/types";
import { Button, Modal } from "./ui";

const THEME_OPTIONS: Array<{
  value: ThemeMode;
  label: string;
  description: string;
  icon: typeof Sun;
}> = [
  {
    value: "SYSTEM",
    label: "System",
    description: "Match your desktop appearance automatically",
    icon: Laptop,
  },
  {
    value: "LIGHT",
    label: "Light",
    description: "Crisp daytime high-visibility cockpit theme",
    icon: Sun,
  },
  {
    value: "DARK",
    label: "Dark",
    description: "Deep space aviation radar night theme",
    icon: Moon,
  },
];

export function AccountDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {
    account,
    authBusy,
    signIn,
    signOut,
    themeMode,
    setThemeMode,
    offlineMode,
    toggleOffline,
    refreshData,
    syncing,
    firebaseReady,
    aeroConfigured,
    fcmToken,
  } = useApp();
  const [tab, setTab] = useState<"account" | "preferences">("account");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Aviation Account & Settings"
      subtitle="Identity, appearance, offline cache, and cloud sync"
      icon={<ShieldCheck className="size-4" />}
      size="md"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
          {account.isSignedIn ? (
            <Button variant="danger" size="sm" onClick={signOut}>
              <LogOut className="size-3.5" /> Sign out
            </Button>
          ) : (
            <Button size="sm" onClick={signIn} disabled={authBusy}>
              <LogIn className="size-3.5" />
              {authBusy ? "Connecting…" : "Sign in with Google"}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-line bg-surface-2 p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-accent bg-accent-soft text-lg font-black text-accent">
              {account.avatarInitial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-sm font-bold text-ink">
                  {account.name}
                </p>
                {account.isSignedIn && (
                  <BadgeCheck className="size-4 shrink-0 text-landed" />
                )}
              </div>
              <p className="truncate text-xs text-muted">
                {account.isSignedIn
                  ? account.email
                  : "Local guest session · sign in below"}
              </p>
              <p className="mt-0.5 flex items-center gap-1 text-[10px] text-subtle">
                {offlineMode ? (
                  <CloudOff className="size-3 text-delayed" />
                ) : (
                  <Cloud className="size-3 text-landed" />
                )}
                {account.lastSyncTime}
              </p>
            </div>
            {account.isSignedIn ? (
              <span className="rounded-full border border-landed/40 bg-landed/10 px-2 py-1 text-[9px] font-bold text-landed">
                VERIFIED
              </span>
            ) : (
              <span className="rounded-full border border-line bg-surface px-2 py-1 text-[9px] font-bold text-subtle">
                GUEST
              </span>
            )}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <StatusMini
              icon={<Cloud className="size-3.5" />}
              label="Firestore"
              value={account.isSignedIn ? "Synced" : "Not linked"}
              active={account.isSignedIn}
            />
            <StatusMini
              icon={<Wifi className="size-3.5" />}
              label="AeroDataBox"
              value={aeroConfigured ? "Configured" : "Cache"}
              active={aeroConfigured}
            />
            <StatusMini
              icon={<Sparkles className="size-3.5" />}
              label="Weather"
              value="Open-Meteo"
              active
            />
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-line bg-surface-2 p-1">
          {(
            [
              { value: "account", label: "Account & sync" },
              { value: "preferences", label: "Appearance" },
            ] as const
          ).map((item) => (
            <button
              key={item.value}
              onClick={() => setTab(item.value)}
              className={cn(
                "flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
                tab === item.value
                  ? "bg-accent text-[color:var(--bg)]"
                  : "text-muted hover:text-ink",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "account" ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-line bg-surface-2 p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div
                    className={cn(
                      "mt-0.5 flex size-8 items-center justify-center rounded-lg border",
                      offlineMode
                        ? "border-delayed/40 bg-delayed/10 text-delayed"
                        : "border-landed/40 bg-landed/10 text-landed",
                    )}
                  >
                    {offlineMode ? (
                      <CloudOff className="size-4" />
                    ) : (
                      <Cloud className="size-4" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-ink">
                      {offlineMode ? "Offline mode active" : "Background sync active"}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                      {offlineMode
                        ? "Serving the local browser cache. Reconnect to refresh live telemetry."
                        : "Watchlists, notes, alerts, and profile are persisted locally and mirrored to Firestore."}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={toggleOffline}
                  aria-label="Toggle offline mode"
                  className={cn(
                    "relative h-6 w-11 shrink-0 rounded-full border transition-colors",
                    offlineMode
                      ? "border-delayed bg-delayed/30"
                      : "border-line bg-surface-3",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 size-4.5 rounded-full transition-all",
                      offlineMode
                        ? "left-[22px] bg-delayed"
                        : "left-0.5 bg-muted",
                    )}
                  />
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={refreshData}
                  disabled={syncing}
                >
                  <RefreshCw
                    className={cn("size-3.5", syncing && "animate-spin")}
                  />
                  {syncing ? "Syncing…" : "Sync now"}
                </Button>
                {!account.isSignedIn && (
                  <span className="text-[10px] text-subtle">
                    Sign in to sync across devices
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-line bg-surface-2 p-3.5">
              <div className="flex items-center gap-2">
                <UserRound className="size-4 text-accent" />
                <p className="label-caps text-ink">Firebase authentication</p>
              </div>
              <div className="mt-2 space-y-1.5 text-[11px] text-muted">
                <p className="flex items-center justify-between gap-3">
                  <span>Provider</span>
                  <span className="font-semibold text-ink">
                    {account.provider ?? "Google OAuth"}
                  </span>
                </p>
                <p className="flex items-center justify-between gap-3">
                  <span>Environment</span>
                  <span className="font-semibold text-ink">
                    {firebaseReady ? "Firebase client ready" : "Local demo mode"}
                  </span>
                </p>
                <p className="flex items-center justify-between gap-3">
                  <span>FCM device token</span>
                  <span className="max-w-[200px] truncate font-mono text-[10px] text-accent">
                    {fcmToken || "—"}
                  </span>
                </p>
              </div>
              {!firebaseReady && (
                <p className="mt-2 rounded-lg border border-dashed border-line px-2.5 py-2 text-[10px] leading-relaxed text-subtle">
                  Add your Firebase web app values to{" "}
                  <code className="font-mono text-accent">.env.local</code> to
                  enable Google sign-in, Firestore, App Check, and FCM. The app
                  gracefully falls back to local storage until then.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              {THEME_OPTIONS.map((option) => {
                const Icon = option.icon;
                const active = themeMode === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() => setThemeMode(option.value)}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-all",
                      active
                        ? "border-accent bg-accent-soft"
                        : "border-line bg-surface-2 hover:border-accent/40",
                    )}
                  >
                    <div
                      className={cn(
                        "flex size-8 items-center justify-center rounded-lg border",
                        active
                          ? "border-accent/50 bg-accent/15 text-accent"
                          : "border-line bg-surface text-muted",
                      )}
                    >
                      <Icon className="size-4" />
                    </div>
                    <p
                      className={cn(
                        "mt-2 text-xs font-bold",
                        active ? "text-accent" : "text-ink",
                      )}
                    >
                      {option.label}
                    </p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-subtle">
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>
            <div className="rounded-xl border border-line bg-surface-2 p-3.5">
              <p className="label-caps text-subtle">Display theme</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                The SkyTrack cockpit palette is preserved across both themes.
                Dark mode is the default radar-night experience; light mode uses
                the same aviation instrument language with high-contrast surfaces.
              </p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function StatusMini({
  icon,
  label,
  value,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  active?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line/70 bg-surface px-2 py-1.5">
      <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-subtle">
        <span className={active ? "text-landed" : "text-subtle"}>{icon}</span>
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 truncate text-[10px] font-semibold",
          active ? "text-ink" : "text-muted",
        )}
      >
        {value}
      </p>
    </div>
  );
}
