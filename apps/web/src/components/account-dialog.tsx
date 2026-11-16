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
import { Button, Modal, Panel } from "./ui";

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
      title="Account & settings"
      subtitle="Identity, offline cache, sync, and plan."
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
      <div className="space-y-3">
        <Panel className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full border border-accent/30 bg-accent-soft text-base font-semibold text-accent">
              {account.avatarInitial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-sm font-semibold text-ink">
                  {account.name}
                </p>
                {account.isSignedIn && (
                  <BadgeCheck className="size-4 shrink-0 text-landed" />
                )}
              </div>
              <p className="truncate text-[13px] text-muted">
                {account.isSignedIn
                  ? account.email
                  : "Local guest session · sign in to sync"}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-subtle">
                {offlineMode ? (
                  <CloudOff className="size-3 text-delayed" />
                ) : (
                  <Cloud className="size-3 text-landed" />
                )}
                {account.lastSyncTime}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-md border px-2 py-1 text-xs font-medium",
                account.isSignedIn
                  ? "border-landed/35 bg-landed/10 text-landed"
                  : "border-line/70 bg-surface-2 text-subtle",
              )}
            >
              {account.isSignedIn ? "Verified" : "Guest"}
            </span>
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
                  ? "Recent live"
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
            />
          </div>
        </Panel>

        <Panel className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <span
                className={cn(
                  "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border",
                  offlineMode
                    ? "border-delayed/40 bg-delayed/10 text-delayed"
                    : "border-landed/35 bg-landed/10 text-landed",
                )}
              >
                {offlineMode ? (
                  <CloudOff className="size-4" />
                ) : (
                  <Cloud className="size-4" />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-ink">
                  {offlineMode ? "Offline mode active" : "Background sync active"}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">
                  {offlineMode
                    ? "Showing your saved data. Reconnect to refresh live flights and weather."
                    : "Watchlists, notes, alerts, and your profile are stored on this device and synced to your account."}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={toggleOffline}
              role="switch"
              aria-checked={offlineMode}
              aria-label="Toggle offline mode"
              className={cn(
                "relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors",
                offlineMode
                  ? "border-delayed bg-delayed/30"
                  : "border-line bg-surface-3",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 size-[18px] rounded-full transition-all",
                  offlineMode ? "left-[22px] bg-delayed" : "left-0.5 bg-muted",
                )}
              />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line/50 pt-3">
            <Button
              size="sm"
              variant="outline"
              onClick={refreshData}
              disabled={syncing}
            >
              <RefreshCw className={cn("size-3.5", syncing && "animate-spin")} />
              {syncing ? "Syncing…" : "Sync now"}
            </Button>
            {!account.isSignedIn && (
              <span className="text-xs text-subtle">
                Sign in to sync across devices
              </span>
            )}
          </div>
        </Panel>

        <Panel className="p-4">
          <p className="label-caps flex items-center gap-1.5 text-subtle">
            <UserRound className="size-3.5" /> Account sync
          </p>
          <dl className="mt-2.5 space-y-2 text-[13px]">
            <Row
              label="Provider"
              value={account.provider ?? "Google OAuth"}
            />
            <Row
              label="Status"
              value={supabaseReady ? "Sync connected" : "Offline only"}
            />
            <Row
              label="Alerts"
              value={
                webPushSubscribed
                  ? "Enabled on this device"
                  : "Not set up on this device"
              }
            />
          </dl>
          {!supabaseReady && (
            <p className="mt-3 rounded-lg border border-line/60 bg-surface-2/40 px-3 py-2.5 text-xs leading-relaxed text-subtle">
              Google sign-in and cross-device sync are not connected in this
              build. Your data stays on this device until sync is available.
            </p>
          )}
        </Panel>

        {account.isSignedIn && (
          <Panel className="p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="label-caps flex items-center gap-1.5 text-subtle">
                <Sparkles className="size-3.5" /> Plan & usage
              </p>
              <button
                type="button"
                onClick={loadUsage}
                disabled={usageLoading}
                className="rounded-md px-1.5 py-1 text-xs font-medium text-accent transition-colors hover:text-ink disabled:opacity-50"
              >
                {usageLoading ? "Refreshing…" : "Refresh"}
              </button>
            </div>

            {accountUsage ? (
              <div className="mt-2.5 space-y-3">
                <dl className="space-y-2 text-[13px]">
                  <Row label="Plan" value={accountUsage.plan} mono />
                  <Row
                    label="Concurrently tracked"
                    value={`up to ${accountUsage.planLimits.concurrentTracked}`}
                  />
                  <Row
                    label="Saved flights"
                    value={`${accountUsage.watchlistCount} (unlimited)`}
                  />
                  <Row
                    label="Live data budget"
                    value={`${accountUsage.units.unitsUsed}/${accountUsage.units.unitsBudget} units`}
                  />
                </dl>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                  <div
                    className="h-full rounded-full bg-accent transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(
                          (accountUsage.units.unitsUsed /
                            Math.max(1, accountUsage.units.unitsBudget)) *
                            100,
                        ),
                      )}%`,
                    }}
                  />
                </div>

                {accountUsage.billing.upgradeEnabled &&
                  accountUsage.plan !== "PRO" && (
                    <div className="flex flex-wrap items-center gap-2">
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
                      <span className="text-xs text-subtle">
                        Secure hosted checkout
                      </span>
                    </div>
                  )}

                <p className="text-xs leading-relaxed text-subtle">
                  This monthly budget covers all Avi users and pauses the
                  live engine at the cap. Saved data and alerts keep working.
                </p>
              </div>
            ) : (
              <p className="mt-2.5 rounded-lg border border-line/60 bg-surface-2/40 px-3 py-2.5 text-xs leading-relaxed text-subtle">
                Usage is unavailable right now because it comes from the live
                engine. Your watchlist keeps syncing regardless.
              </p>
            )}
          </Panel>
        )}

        {account.isSignedIn && (
          <Panel className="border-cancelled/25 p-4">
            <p className="label-caps flex items-center gap-1.5 text-cancelled">
              <Trash2 className="size-3.5" /> Danger zone
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              Deleting your account erases your profile, watchlist, notes,
              alerts, and push settings from Avi — immediately and
              irreversibly.
            </p>
            {!confirmDelete ? (
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => setConfirmDelete(true)}
              >
                Delete account & data
              </Button>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
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
          </Panel>
        )}
      </div>
    </Modal>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd
        className={cn(
          "text-right font-medium text-ink",
          mono && "font-mono text-xs",
        )}
      >
        {value}
      </dd>
    </div>
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
    <div className="rounded-lg border border-line/60 bg-surface-2/40 px-2.5 py-2">
      <p className="flex items-center gap-1 label-caps text-subtle">
        <span className={active ? "text-landed" : "text-subtle"}>{icon}</span>
        {label}
      </p>
      <p
        className={cn(
          "mt-1 truncate text-xs font-medium",
          active ? "text-ink" : "text-muted",
        )}
      >
        {value}
      </p>
    </div>
  );
}
