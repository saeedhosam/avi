"use client";

import { useEffect, useState } from "react";
import {
  BadgeCheck,
  Cloud,
  CloudOff,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  Wifi,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button, Modal } from "./ui";

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
    offlineMode,
    toggleOffline,
    refreshData,
    syncing,
    supabaseReady,
    aeroConfigured,
    dataSourceMode,
    webPushSubscribed,
    accountUsage,
    refreshUsage,
    deleteAccount,
    startUpgrade,
  } = useApp();
  const [usageLoading, setUsageLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [upgradeBusy, setUpgradeBusy] = useState(false);

  // Panel data is refreshed when the account dialog opens (supply chain:
  // one /v1/me call per dialog, not per render).
  const loadUsage = () => {
    if (usageLoading) return;
    setUsageLoading(true);
    void refreshUsage().finally(() => setUsageLoading(false));
  };

  useEffect(() => {
    if (open) loadUsage();
    else setConfirmDelete(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Aviation Account & Settings"
      subtitle="Identity, offline cache, and cloud sync"
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
              label="Sync"
              value={account.isSignedIn ? "Linked" : "Not linked"}
              active={account.isSignedIn}
            />
            <StatusMini
              icon={<Wifi className="size-3.5" />}
              label="Live data"
              value={
                dataSourceMode === "LIVE_AERODATABOX"
                  ? "Recent live response"
                  : aeroConfigured
                    ? "Ready · no data"
                    : "Saved only"
              }
              active={dataSourceMode === "LIVE_AERODATABOX"}
            />
            <StatusMini
              icon={<Sparkles className="size-3.5" />}
              label="Weather"
              value={offlineMode ? "Offline" : "On demand"}
              active={false}
            />
          </div>
        </div>

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
                        ? "Showing your saved data. Reconnect to refresh live flights and weather."
                        : "Watchlists, notes, alerts, and your profile are saved on this device and synced to your account."}
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
                <p className="label-caps text-ink">Account sync</p>
              </div>
              <div className="mt-2 space-y-1.5 text-[11px] text-muted">
                <p className="flex items-center justify-between gap-3">
                  <span>Provider</span>
                  <span className="font-semibold text-ink">
                    {account.provider ?? "Google OAuth"}
                  </span>
                </p>
                <p className="flex items-center justify-between gap-3">
                  <span>Status</span>
                  <span className="font-semibold text-ink">
                    {supabaseReady ? "Sync connected" : "Offline only"}
                  </span>
                </p>
                <p className="flex items-center justify-between gap-3">
                  <span>Alerts</span>
                  <span className="font-semibold text-ink">
                    {webPushSubscribed ? "Enabled on this device" : "Not set up on this device"}
                  </span>
                </p>
              </div>
              {!supabaseReady && (
                <p className="mt-2 rounded-lg border border-dashed border-line px-2.5 py-2 text-[10px] leading-relaxed text-subtle">
                  Google sign-in and cross-device sync aren’t connected in
                  this build. Your data stays safe on this device until sync is
                  available.
                </p>
              )}
            </div>

            {account.isSignedIn && (
              <div className="rounded-xl border border-line bg-surface-2 p-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-accent" />
                    <p className="label-caps text-ink">Plan & usage</p>
                  </div>
                  <button
                    onClick={loadUsage}
                    disabled={usageLoading}
                    className="text-[10px] font-semibold text-accent hover:underline"
                  >
                    {usageLoading ? "Refreshing…" : "Refresh"}
                  </button>
                </div>
                {accountUsage ? (
                  <div className="mt-2.5 space-y-1.5 text-[11px] text-muted">
                    <p className="flex items-center justify-between gap-3">
                      <span>Plan</span>
                      <span className="font-bold text-ink">{accountUsage.plan}</span>
                    </p>
                    <p className="flex items-center justify-between gap-3">
                      <span>Concurrently live-tracked</span>
                      <span className="font-semibold text-ink">
                        up to {accountUsage.planLimits.concurrentTracked}
                      </span>
                    </p>
                    <p className="flex items-center justify-between gap-3">
                      <span>Saved flights</span>
                      <span className="font-semibold text-ink">
                        {accountUsage.watchlistCount} (unlimited)
                      </span>
                    </p>
                    <p className="flex items-center justify-between gap-3">
                      <span>Live data budget used</span>
                      <span className="font-semibold text-ink tabular">
                        {accountUsage.units.unitsUsed}/{accountUsage.units.unitsBudget} units
                      </span>
                    </p>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                      <div
                        className="h-full rounded-full bg-accent transition-all"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round(
                              (accountUsage.units.unitsUsed / Math.max(1, accountUsage.units.unitsBudget)) * 100,
                            ),
                          )}%`,
                        }}
                      />
                    </div>
                    {accountUsage.billing.upgradeEnabled && accountUsage.plan !== "PRO" && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {accountUsage.plan === "FREE" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={upgradeBusy}
                            onClick={async () => {
                              setUpgradeBusy(true);
                              try {
                                await startUpgrade("PLUS");
                              } finally {
                                setUpgradeBusy(false);
                              }
                            }}
                          >
                            Upgrade to Plus
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={upgradeBusy}
                          onClick={async () => {
                            setUpgradeBusy(true);
                            try {
                              await startUpgrade("PRO");
                            } finally {
                              setUpgradeBusy(false);
                            }
                          }}
                        >
                          Upgrade to Pro
                        </Button>
                        <span className="text-[9px] text-subtle">
                          Secure hosted checkout · cancels anytime
                        </span>
                      </div>
                    )}
                    <p className="text-[9px] leading-relaxed text-subtle">
                      This budget covers all Avi users this month and pauses the
                      live engine at the cap — saved data and alerts keep working.
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 rounded-lg border border-dashed border-line px-2.5 py-2 text-[10px] leading-relaxed text-subtle">
                    Usage is not available right now — it comes from the live
                    engine. Your watchlist keeps syncing regardless.
                  </p>
                )}
              </div>
            )}

            {account.isSignedIn && (
              <div className="rounded-xl border border-cancelled/30 bg-cancelled/5 p-3.5">
                <div className="flex items-center gap-2">
                  <Trash2 className="size-4 text-cancelled" />
                  <p className="label-caps text-ink">Danger zone</p>
                </div>
                <p className="mt-1 text-[10px] leading-relaxed text-muted">
                  Deleting your account erases your profile, watchlist, notes,
                  alerts, and push settings from Avi — immediately and
                  irreversibly.
                </p>
                {!confirmDelete ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() => setConfirmDelete(true)}
                  >
                    Delete account & data
                  </Button>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={deleting}
                      onClick={async () => {
                        setDeleting(true);
                        try {
                          await deleteAccount();
                          setConfirmDelete(false);
                          onClose();
                        } finally {
                          setDeleting(false);
                        }
                      }}
                    >
                      Yes — delete my account
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmDelete(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            )}
        </div>
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
