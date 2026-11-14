"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  Flight,
  FlightAlert,
  RecentSearch,
  UserAccount,
} from "./types";
import type { DataSourceMode } from "./data-source";
import { authFetch } from "./authed-fetch";
import { getSupabase } from "./supabase";
import { normalizeFlightNumber, uid } from "./utils";
import {
  disableWebPush,
  enableWebPush as enableWebPushSubscription,
  hasWebPushSubscription,
  webPushConfigured as webPushConfiguredCheck,
  webPushSupported as webPushSupportedCheck,
} from "./push";
import {
  deleteWatchlistItemCloud,
  fetchCloudAlerts,
  fetchCloudWatchlist,
  markAlertReadCloud,
  observeSupabaseAuth,
  saveUserProfile,
  saveWatchlistItemCloud,
  signInWithGoogleSupabase,
  signOutSupabase,
  subscribeToUserData,
  supabaseEnabled,
  watchRowId,
} from "./supabase";

const STORAGE_KEY = "skytrack.desktop.live.v1";

type ToastKind = "info" | "success" | "warning" | "alert";

export interface AccountUsage {
  plan: "FREE" | "PLUS" | "PRO";
  planLimits: { concurrentTracked: number };
  watchlistCount: number;
  units: { unitsUsed: number; unitsBudget: number };
  billing: { provider: "manual" | "lemon_squeezy" | "polar"; upgradeEnabled: boolean };
  tripPass?: { active: boolean; expiresAt: string | null };
}

export interface Toast {
  id: string;
  message: string;
  kind: ToastKind;
}

interface PersistedState {
  flights: Flight[];
  alerts: FlightAlert[];
  recents: RecentSearch[];
  offlineMode: boolean;
}

interface AppContextValue {
  hydrated: boolean;
  flights: Flight[];
  watchlist: Flight[];
  upsertFlights: (incoming: Flight[], options?: { source?: "live" | "cloud" }) => void;
  toggleWatchlist: (flight: Flight, notes?: string) => void;
  updateNotes: (flightNumber: string, notes: string, flightDate?: string) => void;
  alerts: FlightAlert[];
  unreadAlertCount: number;
  addAlert: (alert: FlightAlert, push?: boolean) => void;
  markAlertRead: (id: string) => void;
  markAllAlertsRead: () => void;
  recents: RecentSearch[];
  addRecent: (flight: Flight) => void;
  deleteRecent: (flightNumber: string, flightDate?: string) => void;
  clearRecents: () => void;
  account: UserAccount;
  authBusy: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  offlineMode: boolean;
  toggleOffline: () => void;
  refreshData: () => Promise<void>;
  refreshWatchlistFlights: () => Promise<{
    refreshed: number;
    failed: number;
    skipped: number;
  }>;
  syncing: boolean;
  dataSourceMode: DataSourceMode;
  setQuotaFallback: () => void;
  setLiveRecovered: () => void;
  aeroConfigured: boolean;
  toasts: Toast[];
  notify: (message: string, kind?: ToastKind) => void;
  dismissToast: (id: string) => void;
  enableBrowserNotifications: () => Promise<void>;
  notificationPermission: NotificationPermission | "unsupported";
  supabaseReady: boolean;
  webPushSupported: boolean;
  webPushConfigured: boolean;
  webPushSubscribed: boolean;
  enableWebPush: () => Promise<void>;
  accountUsage: AccountUsage | null;
  refreshUsage: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  startUpgrade: (target: "PLUS" | "PRO") => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

const GUEST_ACCOUNT: UserAccount = {
  name: "Guest Aviator",
  email: "Sign in with Google to sync",
  avatarInitial: "G",
  isSignedIn: false,
  isOfflineMode: false,
  lastSyncTime: "No live data loaded",
  uid: null,
};

const defaultPersisted: PersistedState = {
  flights: [],
  alerts: [],
  recents: [],
  offlineMode: false,
};

/** Cap so watchlist/flights/alerts cannot grow a device's storage unbounded. */
const MAX_PERSISTED_FLIGHTS = 100;
const MAX_PERSISTED_ALERTS = 200;

/**
 * Local storage is namespaced per Supabase uid: signing out switches to the
 * guest namespace instead of leaving one user's watchlist/notes visible to
 * the next person on a shared device.
 */
function storageKeyFor(uid: string | null | undefined): string {
  return uid ? `${STORAGE_KEY}.${uid}` : STORAGE_KEY;
}

function readPersisted(key: string): PersistedState {
  if (typeof window === "undefined") {
    return { ...defaultPersisted };
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { ...defaultPersisted };
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      flights: Array.isArray(parsed.flights)
        ? (parsed.flights as unknown[])
            .map(normalizePersistedFlight)
            .filter((flight) => {
              // Privacy policy promises a 7-day purge. Records without a
              // timestamp are kept but must render as "age unknown" rather
              // than current.
              if (!flight.fetchedAt) return true;
              const fetchedMs = Date.parse(flight.fetchedAt);
              return (
                !Number.isFinite(fetchedMs) ||
                Date.now() - fetchedMs <= 7 * 24 * 60 * 60_000
              );
            })
            .slice(0, MAX_PERSISTED_FLIGHTS)
        : [],
      alerts: Array.isArray(parsed.alerts) ? parsed.alerts.slice(0, MAX_PERSISTED_ALERTS) : [],
      recents: Array.isArray(parsed.recents) ? parsed.recents.slice(0, 5) : [],
      offlineMode: parsed.offlineMode ?? false,
    };
  } catch {
    return { ...defaultPersisted };
  }
}

function normalizePersistedFlight(value: unknown): Flight {
  const flight = value as Flight & {
    isFavorite?: boolean;
    isTracked?: boolean;
    isWatchlisted?: boolean;
  };
  return {
    ...flight,
    isWatchlisted: Boolean(
      flight.isWatchlisted ?? flight.isFavorite ?? flight.isTracked,
    ),
  };
}

export function flightKey(flight: Pick<Flight, "flightNumber" | "flightDate">) {
  const number = normalizeFlightNumber(flight.flightNumber).toLowerCase();
  return flight.flightDate ? `${number}|${flight.flightDate}` : `${number}|any`;
}

export function buildChangeAlerts(previous: Flight, next: Flight): FlightAlert[] {
  const alerts: FlightAlert[] = [];
  // Timestamps are stored as ISO instants (the alert engine writes the same);
  // the UI renders them relative-to-now with formatAlertTimestamp().
  const now = new Date().toISOString();

  if (
    previous.gateDeparture !== next.gateDeparture &&
    previous.gateDeparture !== "Gate TBD" &&
    next.gateDeparture !== "Gate TBD"
  ) {
    alerts.push({
      id: uid("alert"),
      flightNumber: next.flightNumber,
      flightDate: next.flightDate,
      type: "GATE_CHANGE",
      title: `Gate change · ${next.flightNumber}`,
      message: `${next.airline} ${next.flightNumber} departure gate changed from ${previous.gateDeparture} to ${next.gateDeparture} (Terminal ${next.terminalDeparture}).`,
      timestamp: now,
      isRead: false,
    });
  }

  if (
    next.statusReported &&
    next.status === "CANCELLED" &&
    previous.status !== "CANCELLED"
  ) {
    alerts.push({
      id: uid("alert"),
      flightNumber: next.flightNumber,
      flightDate: next.flightDate,
      type: "CANCELLATION",
      title: `Flight cancelled · ${next.flightNumber}`,
      message: `${next.flightNumber} (${next.origin.code} → ${next.destination.code}) has been cancelled. ${next.delayReason ?? "Contact your airline for rebooking."}`,
      timestamp: now,
      isRead: false,
    });
  } else if (
    next.statusReported &&
    ((next.delayReported &&
      next.delayMinutes > 0 &&
      (!previous.delayReported ||
        next.delayMinutes > previous.delayMinutes)) ||
      (next.status === "DELAYED" && previous.status !== "DELAYED"))
  ) {
    alerts.push({
      id: uid("alert"),
      flightNumber: next.flightNumber,
      flightDate: next.flightDate,
      type: "DELAY",
      title: `Delay update · ${next.flightNumber}`,
      message: next.delayReported
        ? `${next.flightNumber} is now delayed by ${next.delayMinutes} minutes. Estimated departure ${next.departureTimeEstimated}. ${next.delayReason ?? ""}`.trim()
        : `${next.flightNumber} is reported delayed. The provider did not report a duration. Estimated departure ${next.departureTimeEstimated}.` ,
      timestamp: now,
      isRead: false,
    });
  }

  if (
    next.statusReported &&
    next.status === "BOARDING" &&
    previous.status !== "BOARDING"
  ) {
    alerts.push({
      id: uid("alert"),
      flightNumber: next.flightNumber,
      flightDate: next.flightDate,
      type: "BOARDING",
      title: `Boarding · ${next.flightNumber}`,
      message: `Boarding has started for ${next.flightNumber} at ${next.gateDeparture}, Terminal ${next.terminalDeparture}.`,
      timestamp: now,
      isRead: false,
    });
  }

  if (
    next.statusReported &&
    next.status === "LANDED" &&
    previous.baggageCarousel !== next.baggageCarousel &&
    next.baggageCarousel &&
    next.baggageCarousel !== "Carousel TBD"
  ) {
    alerts.push({
      id: uid("alert"),
      flightNumber: next.flightNumber,
      flightDate: next.flightDate,
      type: "BAGGAGE",
      title: `Baggage update · ${next.flightNumber}`,
      message: `Baggage for ${next.flightNumber} is assigned to ${next.baggageCarousel} at ${next.destination.code}.`,
      timestamp: now,
      isRead: false,
    });
  }

  return alerts;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [alerts, setAlerts] = useState<FlightAlert[]>([]);
  const [recents, setRecents] = useState<RecentSearch[]>([]);
  const [offlineMode, setOfflineMode] = useState(false);
  const [account, setAccount] = useState<UserAccount>(GUEST_ACCOUNT);
  const [authBusy, setAuthBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [dataSourceMode, setDataSourceMode] =
    useState<DataSourceMode>("NOT_CONFIGURED");
  const [aeroConfigured, setAeroConfigured] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const [supabaseReady, setSupabaseReady] = useState(false);
  const [watchEngineEnabled, setWatchEngineEnabled] = useState(false);
  const [webPushSubscribed, setWebPushSubscribed] = useState(false);
  const flightsRef = useRef<Flight[]>([]);
  const alertsRef = useRef<FlightAlert[]>([]);
  const refreshingRef = useRef(false);
  // The namespace whose state is currently in memory; swapped per uid.
  const storageKeyRef = useRef<string>(STORAGE_KEY);

  useEffect(() => {
    flightsRef.current = flights;
  }, [flights]);

  useEffect(() => {
    alertsRef.current = alerts;
  }, [alerts]);

  useEffect(() => {
    const key = storageKeyFor(null);
    storageKeyRef.current = key;
    const persisted = readPersisted(key);
    setOfflineMode(persisted.offlineMode);
    setFlights(persisted.flights);
    flightsRef.current = persisted.flights;
    setAlerts(persisted.alerts);
    alertsRef.current = persisted.alerts;
    setRecents(persisted.recents);
    setHydrated(true);
  }, []);

  // Swap the persisted namespace when the signed-in user changes (P1 E11).
  useEffect(() => {
    if (!hydrated) return;
    const key = storageKeyFor(account.uid);
    if (storageKeyRef.current === key) return;
    storageKeyRef.current = key;
    const persisted = readPersisted(key);
    setOfflineMode(persisted.offlineMode);
    flightsRef.current = persisted.flights;
    setFlights(persisted.flights);
    alertsRef.current = persisted.alerts;
    setAlerts(persisted.alerts);
    setRecents(persisted.recents);
  }, [hydrated, account.uid]);

  useEffect(() => {
    fetch("/api/status")
      .then((response) => response.json())
      .then(
        (data: {
          aeroDataBoxConfigured?: boolean;
          watchEngine?: { enabled?: boolean } | null;
        }) => {
          setAeroConfigured(Boolean(data.aeroDataBoxConfigured));
          setWatchEngineEnabled(Boolean(data.watchEngine?.enabled));
        },
      )
      .catch(() => {});
    if (typeof Notification === "undefined") {
      setNotificationPermission("unsupported");
    } else {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    if (offlineMode) {
      setDataSourceMode("OFFLINE_CACHE");
    } else if (aeroConfigured) {
      // Configuration is not proof of a live response. Keep a successful
      // LIVE state if one was already observed; otherwise show "provider
      // ready, no recent response".
      setDataSourceMode((current) =>
        current === "LIVE_AERODATABOX" ? current : "CONFIGURED_IDLE",
      );
    } else {
      setDataSourceMode("NOT_CONFIGURED");
    }
  }, [offlineMode, aeroConfigured]);

  // Persist real cached data for offline mode, scoped to the active user
  // namespace. No demo records are ever seeded. Quota errors are logged and
  // never break rendering.
  useEffect(() => {
    if (!hydrated) return;
    try {
      const value: PersistedState = {
        flights: flights.slice(0, MAX_PERSISTED_FLIGHTS),
        alerts: alerts.slice(0, MAX_PERSISTED_ALERTS),
        recents,
        offlineMode,
      };
      window.localStorage.setItem(storageKeyRef.current, JSON.stringify(value));
    } catch (error) {
      console.warn("local cache persist failed (storage may be full)", error);
    }
  }, [hydrated, flights, alerts, recents, offlineMode]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback((message: string, kind: ToastKind = "info") => {
    const id = uid("toast");
    setToasts((prev) => [...prev.slice(-3), { id, message, kind }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 4600);
  }, []);

  const addAlert = useCallback(
    (alert: FlightAlert, push = true) => {
      setAlerts((prev) => [alert, ...prev.filter((item) => item.id !== alert.id)]);
      // Alerts are server-owned. Engine-written rows arrive through Realtime;
      // writing client-generated alerts here would duplicate them and make
      // them eligible for push delivery a second time.
      if (push) {
        notify(alert.title, "alert");
        if (
          typeof Notification !== "undefined" &&
          Notification.permission === "granted"
        ) {
          try {
            new Notification(`AeroQuest · ${alert.flightNumber}`, {
              body: alert.message,
              tag: alert.id,
            });
          } catch {
            // Browser notifications are optional.
          }
        }
      }
    },
    [notify],
  );

  const upsertFlights = useCallback(
    (incoming: Flight[], options?: { source?: "live" | "cloud" }) => {
      // Cloud merges carry a snapshot the server watch engine already wrote
      // alerts for; diffing again here would double-fire every alert.
      const source = options?.source ?? "live";
      if (!incoming.length) return;
      const map = new Map(flightsRef.current.map((flight) => [flightKey(flight), flight]));
      const newAlerts: FlightAlert[] = [];

      for (const flight of incoming) {
        const key = flightKey(flight);
        const existing = map.get(key);
        if (existing) {
          const preserveLocal = source !== "cloud";
          const merged: Flight = {
            ...flight,
            isWatchlisted: preserveLocal
              ? existing.isWatchlisted
              : (flight.isWatchlisted ?? existing.isWatchlisted),
            customNotes: preserveLocal
              ? existing.customNotes
              : (flight.customNotes || existing.customNotes),
            // Keep the freshest live location if one source has it.
            telemetry: {
              ...flight.telemetry,
              hasLiveLocation:
                flight.telemetry.hasLiveLocation ??
                existing.telemetry.hasLiveLocation,
            },
          };
          // Alerts are server-owned when Supabase/watch-engine is connected.
          // Only generate local fallback alerts in purely offline/guest mode to avoid
          // duplicate notifications alongside server Realtime events.
          if (existing.isWatchlisted && source !== "cloud" && !supabaseReady && !account.isSignedIn) {
            newAlerts.push(...buildChangeAlerts(existing, merged));
          }
          map.set(key, merged);
        } else {
          map.set(key, flight);
        }
      }

      const updated = [...map.values()];
      flightsRef.current = updated;
      setFlights(updated);
      newAlerts.forEach((alert) => addAlert(alert, true));
    },
    [account.isSignedIn, addAlert, supabaseReady],
  );

  const mergeCloudWatchlist = useCallback(
    async (uid: string) => {
      const records = await fetchCloudWatchlist(uid);
      if (!records) return;
      const cloudByNumber = new Map(
        records.map((record) => [
          `${normalizeFlightNumber(record.flightNumber).toLowerCase()}|${record.flightDate ?? "any"}`,
          record,
        ]),
      );
      const fetched: Flight[] = [];
      let liveLookups = 0;

      for (const record of records) {
        // The server watch engine keeps `snapshot` fresh; hydrating from it
        // costs zero provider units and is the only way cross-device status
        // updates reach an already-cached flight.
        if (record.snapshot) {
          fetched.push({
            ...record.snapshot,
            isWatchlisted: true,
            customNotes: record.customNotes || record.snapshot.customNotes || "",
          });
          continue;
        }

        const key = `${normalizeFlightNumber(record.flightNumber).toLowerCase()}|${record.flightDate ?? "any"}`;
        const normalizedNum = normalizeFlightNumber(record.flightNumber).toLowerCase();
        const alreadyCached = flightsRef.current.some(
          (flight) =>
            flightKey(flight) === key ||
            normalizeFlightNumber(flight.flightNumber).toLowerCase() === normalizedNum,
        );
        if (alreadyCached || liveLookups >= 8) continue;

        // A pruned/missing snapshot needs one live lookup to rehydrate.
        liveLookups += 1;
        try {
          const url = new URL("/api/flights/search", window.location.origin);
          url.searchParams.set(
            "flight",
            normalizeFlightNumber(record.flightNumber),
          );
          if (record.flightDate) url.searchParams.set("date", record.flightDate);
          const response = await authFetch(url, { cache: "no-store" });
          const data = (await response.json()) as { flights?: Flight[] };
          // Only flights on the saved operating date count for this entry.
          fetched.push(
            ...(data.flights ?? []).filter(
              (flight) =>
                (flight.flightDate ?? "any") === (record.flightDate ?? "any"),
            ),
          );
        } catch {
          // A missing cloud flight is retried on the next sync.
        }
      }

      if (fetched.length) upsertFlights(fetched, { source: "cloud" });

      // Reconcile local flags with the cloud list: re-flag matches and clear
      // entries removed on another device. A failed fetch returns null above
      // and never reaches this authoritative pass.
      upsertFlights(
        flightsRef.current.map((flight) => {
          const key = flightKey(flight);
          const num = normalizeFlightNumber(flight.flightNumber).toLowerCase();
          const record =
            cloudByNumber.get(key) ??
            (!flight.flightDate ? cloudByNumber.get(`${num}|any`) : undefined);
          if (!record) {
            return flight.isWatchlisted
              ? { ...flight, isWatchlisted: false }
              : flight;
          }
          return {
            ...flight,
            isWatchlisted: true,
            customNotes: record.customNotes || flight.customNotes,
          };
        }),
        { source: "cloud" },
      );
    },
    [upsertFlights],
  );

  const mergeCloudAlerts = useCallback(async (uid: string) => {
    const remote = await fetchCloudAlerts(uid);
    if (!remote.length) return;
    setAlerts((current) => {
      const byId = new Map(current.map((alert) => [alert.id, alert]));
      for (const alert of remote) byId.set(alert.id, alert);
      return [...byId.values()].sort((a, b) =>
        b.timestamp.localeCompare(a.timestamp),
      );
    });
  }, []);

  const updateAccountSync = useCallback(() => {
    setAccount((current) => ({
      ...current,
      lastSyncTime: `Synced at ${new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })}`,
    }));
  }, []);

  const refreshWatchlistFlights = useCallback(async (): Promise<{
    refreshed: number;
    failed: number;
    skipped: number;
  }> => {
    if (offlineMode || !aeroConfigured || refreshingRef.current) {
      return { refreshed: 0, failed: 0, skipped: 0 };
    }
    const targets = flightsRef.current.filter((flight) => flight.isWatchlisted);
    if (!targets.length) return { refreshed: 0, failed: 0, skipped: 0 };
    refreshingRef.current = true;
    setSyncing(true);
    try {
      let failed = 0;
      const results = await Promise.all(
        targets.slice(0, 8).map(async (flight) => {
          try {
            const url = new URL("/api/flights/search", window.location.origin);
            url.searchParams.set(
              "flight",
              flight.flightNumber.replace(/\s+/g, ""),
            );
            if (flight.flightDate) url.searchParams.set("date", flight.flightDate);
            const response = await authFetch(url, { cache: "no-store" });
            const data = (await response.json().catch(() => null)) as
              | { mode?: string; flights?: Flight[]; error?: string }
              | null;
            if (!response.ok || data?.error || !Array.isArray(data?.flights)) {
              failed += 1;
              if (data?.mode === "QUOTA_FALLBACK") {
                setDataSourceMode("QUOTA_FALLBACK");
              }
              return [];
            }
            if (data.mode === "QUOTA_FALLBACK") {
              setDataSourceMode("QUOTA_FALLBACK");
            } else if (data.mode === "LIVE_AERODATABOX") {
              setDataSourceMode("LIVE_AERODATABOX");
            }
            return data.flights;
          } catch {
            failed += 1;
            return [];
          }
        }),
      );
      const merged = results.flat();
      if (merged.length) upsertFlights(merged);
      return {
        refreshed: merged.length,
        failed,
        skipped: Math.max(0, targets.length - 8),
      };
    } finally {
      refreshingRef.current = false;
      setSyncing(false);
    }
  }, [aeroConfigured, offlineMode, upsertFlights]);

  // The server watch engine pushes status changes via Realtime, so browser
  // polling is a fallback only: a safety net at a long interval when the
  // engine is on, and the old 5-minute cadence when it is not. Hidden tabs
  // never spend provider units either way.
  const watchlistPollMs = watchEngineEnabled ? 30 * 60 * 1000 : 5 * 60 * 1000;

  useEffect(() => {
    if (!hydrated || !aeroConfigured || offlineMode) return;
    const poll = () => {
      if (watchEngineEnabled && document.hidden) return;
      void refreshWatchlistFlights();
    };
    poll();
    const timer = window.setInterval(poll, watchlistPollMs);
    return () => window.clearInterval(timer);
  }, [
    hydrated,
    aeroConfigured,
    offlineMode,
    watchEngineEnabled,
    watchlistPollMs,
    refreshWatchlistFlights,
  ]);

  // Supabase auth observer. Demo accounts are never substituted.
  useEffect(() => {
    if (!supabaseEnabled) return;
    const unsubscribe = observeSupabaseAuth((next, uidValue, event) => {
      setSupabaseReady(true);
      if (next && uidValue) {
        setAccount((current) => ({ ...next, isOfflineMode: current.isOfflineMode }));
        // Profiles are written when authentication actually establishes or
        // re-establishes a session — not on every token refresh.
        if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "USER_UPDATED") {
          void saveUserProfile(next, uidValue);
        }
        void mergeCloudWatchlist(uidValue);
        void mergeCloudAlerts(uidValue);
      } else {
        setAccount((current) => ({ ...GUEST_ACCOUNT, isOfflineMode: current.isOfflineMode }));
      }
    });
    return () => unsubscribe?.();
  }, [mergeCloudAlerts, mergeCloudWatchlist]);

  useEffect(() => {
    const uid = account.uid;
    if (!supabaseEnabled || !uid) return;
    return subscribeToUserData(uid, {
      onTrackedFlights: () => void mergeCloudWatchlist(uid),
      onAlerts: () => void mergeCloudAlerts(uid),
    });
  }, [account.uid, mergeCloudAlerts, mergeCloudWatchlist]);

  // Detect any existing Web Push subscription on this device so the UI can
  // show accurate status. No token is fabricated for unsupported browsers.
  useEffect(() => {
    let cancelled = false;
    async function detectSubscription() {
      try {
        const subscribed = await hasWebPushSubscription();
        if (!cancelled) setWebPushSubscribed(subscribed);
      } catch {
        // Push visibility is cosmetic; failures are surfaced by the dialog.
      }
    }
    detectSubscription();
    return () => {
      cancelled = true;
    };
  }, []);

  const enableWebPush = useCallback(async () => {
    const result = await enableWebPushSubscription();
    if (result.ok) {
      setWebPushSubscribed(true);
      notify("Push notifications enabled for this device.", "success");
    } else if (result.reason === "not_signed_in") {
      notify("Notification permission was not granted.", "warning");
    } else if (result.reason === "unsupported" || result.reason === "not_configured") {
      notify("Web Push isn't available in this environment yet.", "warning");
    } else {
      notify("Could not enable push. In-app alerts still work.", "warning");
    }
  }, [notify]);

  // Account beat (Track I): plan tier, tracking limit, watchlist size, and
  // the month-to-date provider-unit budget, fetched from /v1/me through the
  // gateway. Fetched on demand (account dialog) and on user change.
  const [accountUsage, setAccountUsage] = useState<AccountUsage | null>(null);
  const refreshUsage = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !account.uid) {
      setAccountUsage(null);
      return;
    }
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setAccountUsage(null);
        return;
      }
      const response = await fetch("/api/me", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessToken: token }),
      });
      setAccountUsage(response.ok ? ((await response.json()) as AccountUsage) : null);
    } catch {
      setAccountUsage(null);
    }
  }, [account.uid]);

  // Opens the hosted Lemon Squeezy checkout for a plan upgrade. Card data
  // never touches AeroQuest; the webhook assigns profiles.plan after payment.
  const startUpgrade = useCallback(
    async (target: "PLUS" | "PRO") => {
      const supabase = getSupabase();
      if (!supabase || !account.uid) {
        notify("Sign in to upgrade your plan.", "warning");
        return;
      }
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        notify("Sign out and sign in again to refresh your session.", "warning");
        return;
      }
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessToken: token, target }),
      });
      const payload = (await response.json().catch(() => null)) as {
        url?: string;
        message?: string;
      } | null;
      if (response.ok && payload?.url) {
        window.location.assign(payload.url);
        return;
      }
      notify(
        payload?.message ??
          "Billing isn't connected yet. Plans are assigned manually for early users.",
        "info",
      );
    },
    [account.uid, notify],
  );

  const deleteAccount = useCallback(async () => {
    const supabase = getSupabase();
    const uid = account.uid;
    if (!supabase || !uid) return;
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        notify("Sign out and sign in again, then delete from the account dialog.", "warning");
        return;
      }
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessToken: token }),
      });
      if (!response.ok) {
        notify("Account deletion could not be completed. Please try again.", "warning");
        return;
      }
      // Purge the device-local namespace; nothing user-owned lingers.
      try {
        window.localStorage.removeItem(storageKeyFor(uid));
      } catch {
        // Storage cleanup is best-effort.
      }
      await signOutSupabase();
      setAccount({ ...GUEST_ACCOUNT, isOfflineMode: false });
      setAccountUsage(null);
      notify("Account deleted. Your data has been erased from AeroQuest.", "success");
    } catch {
      notify("Account deletion could not be completed. Please try again.", "warning");
    }
  }, [account.uid, notify]);

  const toggleWatchlist = useCallback(
    (flight: Flight, notes = "") => {
      const targetKey = flightKey(flight);
      const current = flightsRef.current.find(
        (item) => flightKey(item) === targetKey,
      );
      if (!current) {
        const newFlight: Flight = {
          ...flight,
          isWatchlisted: true,
          customNotes: notes || flight.customNotes,
        };
        const updated = [newFlight, ...flightsRef.current];
        flightsRef.current = updated;
        setFlights(updated);
        if (account.uid) {
          void saveWatchlistItemCloud(account.uid, newFlight);
        }
        notify(
          `Added ${flight.flightNumber} to your watchlist. Live status changes will create alerts.`,
          "success",
        );
        return;
      }
      const willWatch = !current.isWatchlisted;
      let foundTarget = false;
      const updated = flightsRef.current.map((item) => {
        if (flightKey(item) === targetKey) {
          foundTarget = true;
          return {
            ...item,
            isWatchlisted: willWatch,
            customNotes: notes || item.customNotes,
          };
        }
        return item;
      });
      if (!foundTarget) {
        updated.unshift({
          ...flight,
          isWatchlisted: willWatch,
          customNotes: notes || flight.customNotes,
        });
      }
      flightsRef.current = updated;
      setFlights(updated);
      const nextFlight =
        updated.find((item) => flightKey(item) === targetKey) ?? updated[0];
      if (nextFlight && account.uid) {
        if (nextFlight.isWatchlisted) {
          void saveWatchlistItemCloud(account.uid, nextFlight);
        } else {
          // Deletes are date-scoped: removing one operating date leaves the
          // other dates of the same flight number untouched.
          void deleteWatchlistItemCloud(account.uid, watchRowId(nextFlight));
        }
      }
      notify(
        willWatch
          ? `Added ${flight.flightNumber} to your watchlist. Live status changes will create alerts.`
          : `Removed ${flight.flightNumber} from your watchlist.`,
        willWatch ? "success" : "info",
      );
    },
    [account.uid, notify],
  );

  const updateNotes = useCallback(
    (flightNumber: string, notes: string, flightDate?: string) => {
      const match = normalizeFlightNumber(flightNumber);
      const targetKey = `${match.toLowerCase()}|${flightDate ?? "any"}`;
      const updated = flightsRef.current.map((flight) =>
        flightKey(flight) === targetKey
          ? { ...flight, customNotes: notes }
          : flight,
      );
      flightsRef.current = updated;
      setFlights(updated);
      const flight = updated.find((item) => flightKey(item) === targetKey);
      if (flight && account.uid && flight.isWatchlisted) {
        void saveWatchlistItemCloud(account.uid, {
          ...flight,
          customNotes: notes,
        });
      }
    },
    [account.uid],
  );

  const markAlertRead = useCallback((id: string) => {
    setAlerts((prev) =>
      prev.map((alert) => (alert.id === id ? { ...alert, isRead: true } : alert)),
    );
    setAccount((current) => {
      if (current.uid) void markAlertReadCloud(current.uid, id);
      return current;
    });
  }, []);

  const markAllAlertsRead = useCallback(() => {
    const unread = alertsRef.current.filter((alert) => !alert.isRead);
    setAlerts((prev) => prev.map((alert) => ({ ...alert, isRead: true })));
    if (account.uid) {
      unread.forEach((alert) => void markAlertReadCloud(account.uid!, alert.id));
    }
  }, [account.uid]);

  const addRecent = useCallback((flight: Flight) => {
    setRecents((prev) => {
      const next: RecentSearch = {
        flightNumber: flight.flightNumber,
        flightDate: flight.flightDate,
        airline: flight.airline,
        originCode: flight.origin.code,
        originCity: flight.origin.city,
        destCode: flight.destination.code,
        destCity: flight.destination.city,
        status: flight.status,
        searchTimestamp: Date.now(),
      };
      return [
        next,
        ...prev.filter(
          (item) =>
            item.flightNumber !== flight.flightNumber ||
            item.flightDate !== flight.flightDate,
        ),
      ].slice(0, 5);
    });
  }, []);

  const deleteRecent = useCallback(
    (flightNumber: string, flightDate?: string) => {
      setRecents((prev) =>
        prev.filter(
          (item) =>
            item.flightNumber !== flightNumber ||
            item.flightDate !== flightDate,
        ),
      );
    },
    [],
  );

  const clearRecents = useCallback(() => setRecents([]), []);

  const signIn = useCallback(async () => {
    if (!supabaseEnabled) {
      notify(
        "Sign-in isn\u2019t connected in this build. Your data stays safely on this device.",
        "warning",
      );
      return;
    }
    setAuthBusy(true);
    try {
      await signInWithGoogleSupabase();
      notify("Google Sign-In connected. Sync is active.", "success");
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Google Sign-In failed or was cancelled.",
        "warning",
      );
    } finally {
      setAuthBusy(false);
    }
  }, [notify]);

  const signOut = useCallback(async () => {
    if (supabaseEnabled && account.uid) {
      // Stop this device from receiving the previous account's alerts.
      await disableWebPush().catch(() => {});
      await signOutSupabase().catch(() => {});
    }
    setWebPushSubscribed(false);
    setAccount({ ...GUEST_ACCOUNT, isOfflineMode: offlineMode });
    notify("Signed out. Your saved data stays on this device.", "info");
  }, [account.uid, notify, offlineMode]);

  const toggleOffline = useCallback(() => {
    setOfflineMode((prev) => {
      const next = !prev;
      setAccount((current) => ({
        ...current,
        isOfflineMode: next,
        lastSyncTime: next
          ? "Offline · saved data"
          : "Online · live data enabled",
      }));
      notify(
        next
          ? "Offline mode enabled — live lookups paused."
          : "Back online — live lookups resumed.",
        next ? "warning" : "success",
      );
      return next;
    });
  }, [notify]);

  const setQuotaFallback = useCallback(() => {
    if (!offlineMode) setDataSourceMode("QUOTA_FALLBACK");
  }, [offlineMode]);

  // The quota fallback used to stick until reload; clearing it on the next
  // successful live response keeps the banner honest across outages.
  const setLiveRecovered = useCallback(() => {
    // Called only after a successful live response, so this is the one place
    // allowed to promote the global state to LIVE.
    if (!offlineMode && aeroConfigured) {
      setDataSourceMode("LIVE_AERODATABOX");
    }
  }, [offlineMode, aeroConfigured]);

  const refreshData = useCallback(async () => {
    setSyncing(true);
    try {
      const response = await fetch("/api/status", { cache: "no-store" });
      if (response.ok) {
        const data = (await response.json()) as {
          aeroDataBoxConfigured?: boolean;
          watchEngine?: { enabled?: boolean } | null;
        };
        setAeroConfigured(Boolean(data.aeroDataBoxConfigured));
        setWatchEngineEnabled(Boolean(data.watchEngine?.enabled));
      }
      const result = await refreshWatchlistFlights();
      if (result.refreshed > 0 && result.failed === 0) {
        updateAccountSync();
        notify(
          `Refreshed ${result.refreshed} watchlisted flight${
            result.refreshed === 1 ? "" : "s"
          }.`,
          "success",
        );
      } else if (result.refreshed > 0) {
        updateAccountSync();
        notify(
          `Refreshed ${result.refreshed} flight${
            result.refreshed === 1 ? "" : "s"
          }; ${result.failed} failed. Saved data may be stale.`,
          "warning",
        );
      } else if (result.failed > 0) {
        notify(
          "Live refresh failed. Saved flight records may be stale.",
          "warning",
        );
      } else {
        notify(
          "No watchlisted flights to refresh. Saved data may be stale.",
          "info",
        );
      }
    } catch {
      notify("Live refresh failed. Saved flight records may be stale.", "warning");
    } finally {
      setSyncing(false);
    }
  }, [notify, refreshWatchlistFlights, updateAccountSync]);

  const enableBrowserNotifications = useCallback(async () => {
    if (typeof Notification === "undefined") {
      setNotificationPermission("unsupported");
      notify("Browser notifications are not supported in this browser.", "warning");
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    notify(
      permission === "granted"
        ? "Desktop notifications enabled."
        : "Notification permission was not granted.",
      permission === "granted" ? "success" : "warning",
    );
  }, [notify]);

  const watchlist = useMemo(
    () => flights.filter((flight) => flight.isWatchlisted),
    [flights],
  );
  const unreadAlertCount = useMemo(
    () => alerts.filter((alert) => !alert.isRead).length,
    [alerts],
  );

  const value: AppContextValue = {
    hydrated,
    flights,
    watchlist,
    upsertFlights,
    toggleWatchlist,
    updateNotes,
    alerts,
    unreadAlertCount,
    addAlert,
    markAlertRead,
    markAllAlertsRead,
    recents,
    addRecent,
    deleteRecent,
    clearRecents,
    account,
    authBusy,
    signIn,
    signOut,
    offlineMode,
    toggleOffline,
    refreshData,
    refreshWatchlistFlights,
    syncing,
    dataSourceMode,
    setQuotaFallback,
    setLiveRecovered,
    aeroConfigured,
    toasts,
    notify,
    dismissToast,
    enableBrowserNotifications,
    notificationPermission,
    supabaseReady,
    webPushSupported: webPushSupportedCheck(),
    webPushConfigured: webPushConfiguredCheck(),
    webPushSubscribed,
    enableWebPush,
    accountUsage,
    refreshUsage,
    deleteAccount,
    startUpgrade,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used inside AppProvider");
  return context;
}
