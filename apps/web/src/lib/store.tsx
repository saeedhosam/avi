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
  ThemeMode,
  UserAccount,
} from "./types";
import type { DataSourceMode } from "./data-source";
import { normalizeFlightNumber, uid } from "./utils";
import {
  deleteWatchlistItemCloud,
  fetchCloudAlerts,
  fetchCloudWatchlist,
  markAlertReadCloud,
  observeSupabaseAuth,
  requestFcmToken,
  saveAlertCloud,
  saveUserProfile,
  saveWatchlistItemCloud,
  signInWithGoogleSupabase,
  signOutSupabase,
  subscribeToUserData,
  supabaseEnabled,
} from "./supabase";

const STORAGE_KEY = "skytrack.desktop.live.v1";
const FCM_TOKEN_KEY = "skytrack.fcm.token";

type ToastKind = "info" | "success" | "warning" | "alert";

export interface Toast {
  id: string;
  message: string;
  kind: ToastKind;
}

interface PersistedState {
  flights: Flight[];
  alerts: FlightAlert[];
  recents: RecentSearch[];
  themeMode: ThemeMode;
  offlineMode: boolean;
}

interface AppContextValue {
  hydrated: boolean;
  themeMode: ThemeMode;
  resolvedTheme: "light" | "dark";
  setThemeMode: (mode: ThemeMode) => void;
  flights: Flight[];
  watchlist: Flight[];
  upsertFlights: (incoming: Flight[]) => void;
  toggleWatchlist: (flight: Flight, notes?: string) => void;
  updateNotes: (flightNumber: string, notes: string) => void;
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
  refreshWatchlistFlights: () => Promise<void>;
  syncing: boolean;
  dataSourceMode: DataSourceMode;
  setQuotaFallback: () => void;
  aeroConfigured: boolean;
  toasts: Toast[];
  notify: (message: string, kind?: ToastKind) => void;
  dismissToast: (id: string) => void;
  fcmToken: string;
  enableBrowserNotifications: () => Promise<void>;
  notificationPermission: NotificationPermission | "unsupported";
  supabaseReady: boolean;
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
  themeMode: "SYSTEM",
  offlineMode: false,
};

function readPersisted(): PersistedState {
  if (typeof window === "undefined") return defaultPersisted;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPersisted;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      flights: Array.isArray(parsed.flights)
        ? (parsed.flights as unknown[]).map(normalizePersistedFlight)
        : [],
      alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
      recents: Array.isArray(parsed.recents) ? parsed.recents : [],
      themeMode: parsed.themeMode ?? "SYSTEM",
      offlineMode: parsed.offlineMode ?? false,
    };
  } catch {
    return defaultPersisted;
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

function flightKey(flight: Pick<Flight, "flightNumber" | "flightDate">) {
  const number = normalizeFlightNumber(flight.flightNumber).toLowerCase();
  return flight.flightDate ? `${number}|${flight.flightDate}` : `${number}|any`;
}

function buildChangeAlerts(previous: Flight, next: Flight): FlightAlert[] {
  const alerts: FlightAlert[] = [];
  const now = "Just now";

  if (previous.gateDeparture !== next.gateDeparture) {
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

  if (next.status === "CANCELLED" && previous.status !== "CANCELLED") {
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
    next.delayMinutes > previous.delayMinutes ||
    (next.status === "DELAYED" && previous.status !== "DELAYED")
  ) {
    alerts.push({
      id: uid("alert"),
      flightNumber: next.flightNumber,
      flightDate: next.flightDate,
      type: "DELAY",
      title: `Delay update · ${next.flightNumber}`,
      message: `${next.flightNumber} is now delayed by ${next.delayMinutes} minutes. Estimated departure ${next.departureTimeEstimated}. ${next.delayReason ?? ""}`.trim(),
      timestamp: now,
      isRead: false,
    });
  }

  if (next.status === "BOARDING" && previous.status !== "BOARDING") {
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
  const [themeMode, setThemeModeState] = useState<ThemeMode>("SYSTEM");
  const [systemDark, setSystemDark] = useState(true);
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
  const [fcmToken, setFcmToken] = useState("");
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const [supabaseReady, setSupabaseReady] = useState(false);
  const flightsRef = useRef<Flight[]>([]);
  const alertsRef = useRef<FlightAlert[]>([]);
  const refreshingRef = useRef(false);

  useEffect(() => {
    flightsRef.current = flights;
  }, [flights]);

  useEffect(() => {
    alertsRef.current = alerts;
  }, [alerts]);

  const resolvedTheme: "light" | "dark" =
    themeMode === "SYSTEM"
      ? systemDark
        ? "dark"
        : "light"
      : themeMode === "DARK"
        ? "dark"
        : "light";

  useEffect(() => {
    const persisted = readPersisted();
    setThemeModeState(persisted.themeMode);
    setOfflineMode(persisted.offlineMode);
    setFlights(persisted.flights);
    flightsRef.current = persisted.flights;
    setAlerts(persisted.alerts);
    alertsRef.current = persisted.alerts;
    setRecents(persisted.recents);
    setFcmToken(window.localStorage.getItem(FCM_TOKEN_KEY) ?? "");
    setHydrated(true);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(media.matches);
    const listener = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    fetch("/api/status")
      .then((response) => response.json())
      .then((data: { aeroDataBoxConfigured?: boolean }) => {
        setAeroConfigured(Boolean(data.aeroDataBoxConfigured));
      })
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
      setDataSourceMode("LIVE_AERODATABOX");
    } else {
      setDataSourceMode("NOT_CONFIGURED");
    }
  }, [offlineMode, aeroConfigured]);

  // Persist real cached data for offline mode. No demo records are ever seeded.
  useEffect(() => {
    if (!hydrated) return;
    const value: PersistedState = {
      flights,
      alerts,
      recents,
      themeMode,
      offlineMode,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  }, [hydrated, flights, alerts, recents, themeMode, offlineMode]);

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
      setAccount((current) => {
        if (current.uid) void saveAlertCloud(current.uid, alert);
        return current;
      });
      if (push) {
        notify(alert.title, "alert");
        if (
          typeof Notification !== "undefined" &&
          Notification.permission === "granted"
        ) {
          try {
            new Notification(`Avi · ${alert.flightNumber}`, {
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
    (incoming: Flight[]) => {
      if (!incoming.length) return;
      const map = new Map(flightsRef.current.map((flight) => [flightKey(flight), flight]));
      const newAlerts: FlightAlert[] = [];

      for (const flight of incoming) {
        const key = flightKey(flight);
        const existing = map.get(key);
        if (existing) {
          const merged: Flight = {
            ...flight,
            isWatchlisted: existing.isWatchlisted,
            customNotes: existing.customNotes,
            // Keep the freshest live location if one source has it.
            telemetry: {
              ...flight.telemetry,
              hasLiveLocation:
                flight.telemetry.hasLiveLocation ??
                existing.telemetry.hasLiveLocation,
            },
          };
          if (existing.isWatchlisted) {
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
    [addAlert],
  );

  const mergeCloudWatchlist = useCallback(
    async (uid: string) => {
      const records = await fetchCloudWatchlist(uid);
      if (!records.length) return;
      const cloudByNumber = new Map(
        records.map((record) => [
          `${String(record.flightNumber).toLowerCase()}|${record.flightDate ?? "any"}`,
          record,
        ]),
      );
      const missing = [...cloudByNumber.keys()].filter(
        (key) => !flightsRef.current.some((flight) => flightKey(flight) === key),
      );
      const fetched: Flight[] = [];
      for (const key of missing.slice(0, 8)) {
        const record = cloudByNumber.get(key);
        if (!record) continue;
        try {
          const url = new URL("/api/flights/search", window.location.origin);
          url.searchParams.set(
            "flight",
            String(record.flightNumber).replace(/\s+/g, ""),
          );
          if (record.flightDate) url.searchParams.set("date", record.flightDate);
          const response = await fetch(url, { cache: "no-store" });
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
      const merged = fetched.map((flight) => {
        const record = cloudByNumber.get(flightKey(flight));
        return {
          ...flight,
          isWatchlisted: true,
          customNotes: String(record?.customNotes ?? ""),
        };
      });
      if (merged.length) upsertFlights(merged);
      // Re-flag anything already in the local cache that matches a cloud row.
      upsertFlights(
        flightsRef.current.map((flight) => {
          const record = cloudByNumber.get(flightKey(flight));
          if (!record) return flight;
          return {
            ...flight,
            isWatchlisted: true,
            customNotes: String(record.customNotes ?? flight.customNotes),
          };
        }),
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

  const refreshWatchlistFlights = useCallback(async () => {
    if (offlineMode || !aeroConfigured || refreshingRef.current) return;
    const targets = flightsRef.current.filter((flight) => flight.isWatchlisted);
    if (!targets.length) return;
    refreshingRef.current = true;
    setSyncing(true);
    try {
      const results = await Promise.all(
        targets.slice(0, 8).map(async (flight) => {
          try {
            const url = new URL("/api/flights/search", window.location.origin);
            url.searchParams.set(
              "flight",
              flight.flightNumber.replace(/\s+/g, ""),
            );
            if (flight.flightDate) url.searchParams.set("date", flight.flightDate);
            const response = await fetch(url, { cache: "no-store" });
            const data = (await response.json()) as {
              mode: string;
              flights?: Flight[];
            };
            if (data.mode === "QUOTA_FALLBACK") setDataSourceMode("QUOTA_FALLBACK");
            return data.flights ?? [];
          } catch {
            return [];
          }
        }),
      );
      const merged = results.flat();
      if (merged.length) upsertFlights(merged);
      updateAccountSync();
    } finally {
      refreshingRef.current = false;
      setSyncing(false);
    }
  }, [aeroConfigured, offlineMode, updateAccountSync, upsertFlights]);

  // Refresh watchlisted flights when live data is available.
  useEffect(() => {
    if (!hydrated || !aeroConfigured || offlineMode) return;
    void refreshWatchlistFlights();
    const timer = window.setInterval(
      () => void refreshWatchlistFlights(),
      5 * 60 * 1000,
    );
    return () => window.clearInterval(timer);
  }, [hydrated, aeroConfigured, offlineMode, refreshWatchlistFlights]);

  // Supabase auth observer. Demo accounts are never substituted.
  useEffect(() => {
    if (!supabaseEnabled) return;
    const unsubscribe = observeSupabaseAuth((next, uidValue) => {
      setSupabaseReady(true);
      if (next && uidValue) {
        setAccount((current) => ({ ...next, isOfflineMode: current.isOfflineMode }));
        void saveUserProfile(next, uidValue);
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

  useEffect(() => {
    if (!supabaseEnabled) return;
    let cancelled = false;
    async function loadToken() {
      const existing = window.localStorage.getItem(FCM_TOKEN_KEY);
      if (existing) {
        setFcmToken(existing);
        return;
      }
      const remote = await requestFcmToken();
      if (cancelled || !remote) return;
      window.localStorage.setItem(FCM_TOKEN_KEY, remote);
      setFcmToken(remote);
    }
    loadToken();
    return () => {
      cancelled = true;
    };
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
  }, []);

  const toggleWatchlist = useCallback(
    (flight: Flight, notes = "") => {
      const targetKey = flightKey(flight);
      const current = flightsRef.current.find(
        (item) => flightKey(item) === targetKey,
      );
      if (!current) return;
      const willWatch = !current.isWatchlisted;
      const updated = flightsRef.current.map((item) =>
        flightKey(item) === targetKey
          ? {
              ...item,
              isWatchlisted: willWatch,
              customNotes: notes || item.customNotes,
            }
          : item,
      );
      flightsRef.current = updated;
      setFlights(updated);
      const nextFlight = updated.find((item) => flightKey(item) === targetKey);
      if (nextFlight && account.uid) {
        if (nextFlight.isWatchlisted) {
          void saveWatchlistItemCloud(account.uid, nextFlight);
        } else {
          void deleteWatchlistItemCloud(account.uid, nextFlight.id);
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
    (flightNumber: string, notes: string) => {
      const match = normalizeFlightNumber(flightNumber);
      const updated = flightsRef.current.map((flight) =>
        normalizeFlightNumber(flight.flightNumber) === match
          ? { ...flight, customNotes: notes }
          : flight,
      );
      flightsRef.current = updated;
      setFlights(updated);
      const flight = updated.find((item) =>
        normalizeFlightNumber(item.flightNumber) === match,
      );
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
      await signOutSupabase().catch(() => {});
    }
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

  const refreshData = useCallback(async () => {
    setSyncing(true);
    try {
      const response = await fetch("/api/status", { cache: "no-store" });
      if (response.ok) {
        const data = (await response.json()) as { aeroDataBoxConfigured?: boolean };
        setAeroConfigured(Boolean(data.aeroDataBoxConfigured));
      }
      await refreshWatchlistFlights();
      updateAccountSync();
      notify("Live flight data refreshed.", "success");
    } catch {
      notify("Live refresh failed. Cached results remain available.", "warning");
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
    themeMode,
    resolvedTheme,
    setThemeMode,
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
    aeroConfigured,
    toasts,
    notify,
    dismissToast,
    fcmToken,
    enableBrowserNotifications,
    notificationPermission,
    supabaseReady,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used inside AppProvider");
  return context;
}
