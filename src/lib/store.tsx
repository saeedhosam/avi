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
  AlertType,
  Flight,
  FlightAlert,
  RecentSearch,
  ScheduledAlert,
  ThemeMode,
  UserAccount,
} from "./types";
import { initialFlights, sampleAlerts } from "./data";
import type { DataSourceMode } from "./data-source";
import { uid } from "./utils";
import {
  deleteTrackedFlightCloud,
  fetchCloudWatchlist,
  firebaseEnabled,
  markAlertReadCloud,
  observeFirebaseAuth,
  requestFcmToken,
  saveAlertCloud,
  saveTrackedFlightCloud,
  saveUserProfile,
  signInWithGoogleFirebase,
  signOutFirebase,
} from "./firebase";

const STORAGE_KEY = "skytrack.desktop.v1";
const FCM_TOKEN_KEY = "skytrack.fcm.token";

type ToastKind = "info" | "success" | "warning" | "alert";

export interface Toast {
  id: string;
  message: string;
  kind: ToastKind;
}

interface PersistedState {
  flightFlags: Record<
    string,
    { isFavorite: boolean; isTracked: boolean; customNotes: string }
  >;
  alerts: FlightAlert[];
  scheduledAlerts: ScheduledAlert[];
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
  favorites: Flight[];
  tracked: Flight[];
  toggleFavorite: (flightNumber: string, notes?: string) => void;
  toggleTrack: (flight: Flight, notes?: string) => void;
  updateNotes: (flightNumber: string, notes: string) => void;
  alerts: FlightAlert[];
  unreadAlertCount: number;
  addAlert: (alert: FlightAlert, push?: boolean) => void;
  markAlertRead: (id: string) => void;
  markAllAlertsRead: () => void;
  scheduledAlerts: ScheduledAlert[];
  scheduleAlert: (
    flightNumber: string,
    type: AlertType,
    title: string,
    message: string,
    delaySeconds: number,
  ) => string;
  cancelScheduledAlert: (id: string) => void;
  simulateAlert: (flightNumber: string, type: AlertType) => void;
  recents: RecentSearch[];
  addRecent: (flight: Flight) => void;
  deleteRecent: (flightNumber: string) => void;
  clearRecents: () => void;
  account: UserAccount;
  authBusy: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  offlineMode: boolean;
  toggleOffline: () => void;
  refreshData: () => Promise<void>;
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
  firebaseReady: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

const GUEST_ACCOUNT: UserAccount = {
  name: "Guest Aviator",
  email: "Sign in with Google to sync",
  avatarInitial: "G",
  isSignedIn: false,
  isOfflineMode: false,
  lastSyncTime: "Local Browser Cache Active",
  uid: null,
};

const defaultPersisted: PersistedState = {
  flightFlags: {},
  alerts: sampleAlerts,
  scheduledAlerts: [],
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
      flightFlags: parsed.flightFlags ?? {},
      alerts: parsed.alerts ?? sampleAlerts,
      scheduledAlerts: parsed.scheduledAlerts ?? [],
      recents: parsed.recents ?? [],
      themeMode: parsed.themeMode ?? "SYSTEM",
      offlineMode: parsed.offlineMode ?? false,
    };
  } catch {
    return defaultPersisted;
  }
}

function applyFlags(flights: Flight[], persisted: PersistedState) {
  return flights.map((flight) => {
    const flags = persisted.flightFlags[flight.id];
    if (!flags) return flight;
    return {
      ...flight,
      isFavorite: flags.isFavorite,
      isTracked: flags.isTracked,
      customNotes: flags.customNotes || flight.customNotes,
    };
  });
}

export function AppProvider({ children }: { children: ReactNode }) {
  const persistedRef = useRef<PersistedState>(defaultPersisted);
  const [hydrated, setHydrated] = useState(false);
  const [themeMode, setThemeModeState] = useState<ThemeMode>("SYSTEM");
  const [systemDark, setSystemDark] = useState(true);
  const [flights, setFlights] = useState<Flight[]>(initialFlights);
  const [alerts, setAlerts] = useState<FlightAlert[]>(sampleAlerts);
  const [scheduledAlerts, setScheduledAlerts] = useState<ScheduledAlert[]>([]);
  const [recents, setRecents] = useState<RecentSearch[]>([]);
  const [offlineMode, setOfflineMode] = useState(false);
  const [account, setAccount] = useState<UserAccount>(GUEST_ACCOUNT);
  const [authBusy, setAuthBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [dataSourceMode, setDataSourceMode] =
    useState<DataSourceMode>("DEMO_CACHE_NO_KEY");
  const [aeroConfigured, setAeroConfigured] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [fcmToken, setFcmToken] = useState("");
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const [firebaseReady, setFirebaseReady] = useState(false);
  const flightsRef = useRef<Flight[]>(initialFlights);

  useEffect(() => {
    flightsRef.current = flights;
  }, [flights]);

  const resolvedTheme: "light" | "dark" =
    themeMode === "SYSTEM" ? (systemDark ? "dark" : "light") : themeMode === "DARK" ? "dark" : "light";

  // Hydrate persisted local state after the first paint.
  useEffect(() => {
    const persisted = readPersisted();
    persistedRef.current = persisted;
    setThemeModeState(persisted.themeMode);
    setOfflineMode(persisted.offlineMode);
    setFlights((prev) => applyFlags(prev, persisted));
    setAlerts(persisted.alerts);
    setScheduledAlerts(persisted.scheduledAlerts);
    setRecents(persisted.recents);
    setFcmToken(window.localStorage.getItem(FCM_TOKEN_KEY) ?? "");
    setHydrated(true);
  }, []);

  // System theme listener.
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(media.matches);
    const listener = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  // Apply the theme to the document.
  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  // Detect server-side API configuration + browser notification support.
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

  // Hydrate the FCM device token; gracefully falls back to a local device id.
  useEffect(() => {
    let cancelled = false;
    async function loadToken() {
      if (offlineMode) return;
      const existing = window.localStorage.getItem(FCM_TOKEN_KEY);
      if (existing) {
        setFcmToken(existing);
        return;
      }
      const remote = await requestFcmToken();
      const token = remote ?? `fcm_skytrack_web_${uid("dev").slice(4, 18)}`;
      if (cancelled) return;
      window.localStorage.setItem(FCM_TOKEN_KEY, token);
      setFcmToken(token);
    }
    loadToken();
    return () => {
      cancelled = true;
    };
  }, [offlineMode]);

  useEffect(() => {
    if (offlineMode) {
      setDataSourceMode("OFFLINE_ROOM_CACHE");
    } else if (aeroConfigured) {
      setDataSourceMode("LIVE_AERODATABOX");
    } else {
      setDataSourceMode("DEMO_CACHE_NO_KEY");
    }
  }, [offlineMode, aeroConfigured]);

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
            new Notification(`SkyTrack · ${alert.flightNumber}`, {
              body: alert.message,
              tag: alert.id,
            });
          } catch {
            // Browser notifications are a progressive enhancement.
          }
        }
      }
    },
    [notify],
  );

  // Persist state changes. Telemetry-only updates are excluded from the signature.
  const flightFlagsSignature = flights
    .map((flight) => `${flight.id}:${flight.isFavorite}:${flight.isTracked}:${flight.customNotes}`)
    .join("|");

  useEffect(() => {
    if (!hydrated) return;
    const flightFlags: PersistedState["flightFlags"] = {};
    for (const flight of flights) {
      flightFlags[flight.id] = {
        isFavorite: flight.isFavorite,
        isTracked: flight.isTracked,
        customNotes: flight.customNotes,
      };
    }
    const value: PersistedState = {
      flightFlags,
      alerts,
      scheduledAlerts,
      recents,
      themeMode,
      offlineMode,
    };
    persistedRef.current = value;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, flightFlagsSignature, alerts, scheduledAlerts, recents, themeMode, offlineMode]);

  // Live airborne telemetry tick, mirroring the Android 4-second refresh.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (offlineMode) return;
      setFlights((prev) =>
        prev.map((flight) => {
          if (flight.status !== "DEPARTED") return flight;
          const currentProgress = flight.telemetry.progressPercent;
          const newProgress = Math.min(0.99, currentProgress + 0.003);
          const newCovered = flight.telemetry.distanceCoveredNm + 4;
          const newRemaining = Math.max(0, flight.telemetry.distanceRemainingNm - 4);
          const newSpeed = Math.min(
            565,
            Math.max(480, flight.telemetry.groundSpeedKnots + Math.floor(Math.random() * 11) - 5),
          );
          const eta = Math.max(1, Math.round(newRemaining / (newSpeed / 60)));
          return {
            ...flight,
            telemetry: {
              ...flight.telemetry,
              currentLatitude:
                flight.telemetry.currentLatitude +
                (flight.destination.latitude - flight.origin.latitude) * 0.003,
              currentLongitude:
                flight.telemetry.currentLongitude +
                (flight.destination.longitude - flight.origin.longitude) * 0.003,
              progressPercent: newProgress,
              groundSpeedKnots: newSpeed,
              distanceCoveredNm: newCovered,
              distanceRemainingNm: newRemaining,
              etaMinutesRemaining: eta,
            },
          };
        }),
      );
    }, 4000);
    return () => window.clearInterval(timer);
  }, [offlineMode]);

  // Fire scheduled alerts when their timer elapses.
  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      const due = scheduledAlerts.filter((item) => item.firesAt <= now);
      if (!due.length) return;
      setScheduledAlerts((prev) => prev.filter((item) => item.firesAt > now));
      for (const item of due) {
        addAlert(
          {
            id: uid("alert"),
            flightNumber: item.flightNumber,
            type: item.type,
            title: item.title,
            message: item.message,
            timestamp: "Just now",
            isRead: false,
          },
          true,
        );
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [hydrated, scheduledAlerts, addAlert]);

  // Firebase auth observer.
  useEffect(() => {
    if (!firebaseEnabled) return;
    let unsubscribe: (() => void) | undefined;
    observeFirebaseAuth((next, uidValue) => {
      setFirebaseReady(true);
      if (next && uidValue) {
        setAccount((current) => ({ ...next, isOfflineMode: current.isOfflineMode }));
        void saveUserProfile(next, uidValue);
        void fetchCloudWatchlist(uidValue).then((records) => {
          if (!records.length) return;
          const cloud = new Map(
            records.map((record) => [String(record.flightNumber), record]),
          );
          setFlights((prev) =>
            prev.map((flight) => {
              const match = cloud.get(flight.flightNumber);
              if (!match) return flight;
              return {
                ...flight,
                isFavorite: Boolean(match.isFavorite) || flight.isFavorite,
                customNotes: String(match.customNotes ?? flight.customNotes),
              };
            }),
          );
        });
      } else {
        setAccount((current) => ({ ...GUEST_ACCOUNT, isOfflineMode: current.isOfflineMode }));
      }
    })
      .then((fn) => {
        unsubscribe = fn;
      })
      .catch(() => {});
    return () => unsubscribe?.();
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
  }, []);

  const toggleFavorite = useCallback(
    (flightNumber: string, notes = "") => {
      const current = flightsRef.current.find(
        (flight) => flight.flightNumber.toLowerCase() === flightNumber.toLowerCase(),
      );
      if (!current) return;
      const newFavorite = !current.isFavorite;
      const updated = flightsRef.current.map((flight) =>
        flight.flightNumber.toLowerCase() === flightNumber.toLowerCase()
          ? {
              ...flight,
              isFavorite: newFavorite,
              customNotes: notes || flight.customNotes,
            }
          : flight,
      );
      flightsRef.current = updated;
      setFlights(updated);
      if (newFavorite) {
        addAlert(
          {
            id: uid("alert"),
            flightNumber,
            type: "BOARDING",
            title: `Saved to Watchlist: ${flightNumber}`,
            message: `Push alerts enabled for gate changes, delays, and boarding calls for ${flightNumber}.`,
            timestamp: "Just now",
            isRead: false,
          },
          true,
        );
      }
      const nextFlight = updated.find(
        (flight) => flight.flightNumber.toLowerCase() === flightNumber.toLowerCase(),
      );
      if (nextFlight && account.uid) {
        if (nextFlight.isFavorite || nextFlight.isTracked) {
          void saveTrackedFlightCloud(account.uid, nextFlight);
        } else {
          void deleteTrackedFlightCloud(account.uid, nextFlight.id);
        }
      }
    },
    [account.uid, addAlert],
  );

  const toggleTrack = useCallback(
    (flight: Flight, notes = "") => {
      const willTrack = !flight.isTracked;
      const updated = flightsRef.current.map((item) =>
        item.flightNumber.toLowerCase() === flight.flightNumber.toLowerCase()
          ? { ...item, isTracked: willTrack, customNotes: notes || item.customNotes }
          : item,
      );
      flightsRef.current = updated;
      setFlights(updated);
      const nextFlight = updated.find(
        (item) => item.flightNumber.toLowerCase() === flight.flightNumber.toLowerCase(),
      );
      if (nextFlight && account.uid) {
        if (nextFlight.isFavorite || nextFlight.isTracked) {
          void saveTrackedFlightCloud(account.uid, nextFlight);
        } else {
          void deleteTrackedFlightCloud(account.uid, nextFlight.id);
        }
      }
      addAlert(
        {
          id: uid("alert"),
          flightNumber: flight.flightNumber,
          type: "BOARDING",
          title: willTrack
            ? `Saved to Local Tracking: ${flight.flightNumber}`
            : `Removed from Tracking: ${flight.flightNumber}`,
          message: willTrack
            ? `Flight ${flight.flightNumber} (${flight.origin.code} ➔ ${flight.destination.code}) is saved for offline monitoring with push alerts active.`
            : `Flight ${flight.flightNumber} has been removed from local tracking.`,
          timestamp: "Just now",
          isRead: false,
        },
        willTrack,
      );
      notify(
        willTrack
          ? `Saved ${flight.flightNumber} to local tracking`
          : `Removed ${flight.flightNumber} from local tracking`,
        willTrack ? "success" : "info",
      );
    },
    [account.uid, addAlert, notify],
  );

  const updateNotes = useCallback(
    (flightNumber: string, notes: string) => {
      const updated = flightsRef.current.map((flight) =>
        flight.flightNumber.toLowerCase() === flightNumber.toLowerCase()
          ? { ...flight, customNotes: notes }
          : flight,
      );
      flightsRef.current = updated;
      setFlights(updated);
      const flight = updated.find(
        (item) => item.flightNumber.toLowerCase() === flightNumber.toLowerCase(),
      );
      if (flight && account.uid) {
        void saveTrackedFlightCloud(account.uid, { ...flight, customNotes: notes });
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
    const unread = alerts.filter((alert) => !alert.isRead);
    setAlerts((prev) => prev.map((alert) => ({ ...alert, isRead: true })));
    if (account.uid) {
      unread.forEach((alert) => void markAlertReadCloud(account.uid!, alert.id));
    }
  }, [account.uid, alerts]);

  const scheduleAlert = useCallback(
    (
      flightNumber: string,
      type: AlertType,
      title: string,
      message: string,
      delaySeconds: number,
    ) => {
      const item: ScheduledAlert = {
        id: uid("schedule"),
        flightNumber,
        type,
        title,
        message,
        firesAt: Date.now() + delaySeconds * 1000,
        createdAt: Date.now(),
      };
      setScheduledAlerts((prev) => [...prev, item]);
      notify(`Alert scheduled for ${flightNumber} in ${delaySeconds}s`, "success");
      return item.id;
    },
    [notify],
  );

  const cancelScheduledAlert = useCallback((id: string) => {
    setScheduledAlerts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const simulateAlert = useCallback(
    (flightNumber: string, type: AlertType) => {
      const flight = flightsRef.current.find(
        (item) => item.flightNumber.toLowerCase() === flightNumber.toLowerCase(),
      );
      if (!flight) return;

      let updatedFlights = flightsRef.current;
      let alert: FlightAlert | null = null;

      if (type === "GATE_CHANGE") {
        const newGate = `Gate B${10 + Math.floor(Math.random() * 36)}`;
        updatedFlights = flightsRef.current.map((item) =>
          item.flightNumber === flightNumber ? { ...item, gateDeparture: newGate } : item,
        );
        alert = {
          id: uid("alert"),
          flightNumber,
          type,
          title: `Gate Change: ${flightNumber}`,
          message: `${flight.airline} ${flightNumber} gate changed to ${newGate} (Terminal ${flight.terminalDeparture}). Please proceed promptly.`,
          timestamp: "Just now",
          isRead: false,
        };
      } else if (type === "DELAY") {
        const extra = [20, 35, 50][Math.floor(Math.random() * 3)];
        updatedFlights = flightsRef.current.map((item) =>
          item.flightNumber === flightNumber
            ? {
                ...item,
                status: "DELAYED",
                delayMinutes: extra,
                delayReason: "ATC Flow Restriction & Thunderstorms",
                statusNote: `Delayed ${extra} mins · ATC flow management`,
              }
            : item,
        );
        alert = {
          id: uid("alert"),
          flightNumber,
          type,
          title: `Schedule Delay Alert: ${flightNumber}`,
          message: `Flight ${flightNumber} has been delayed by ${extra} minutes due to air traffic control metering.`,
          timestamp: "Just now",
          isRead: false,
        };
      } else if (type === "BOARDING") {
        updatedFlights = flightsRef.current.map((item) =>
          item.flightNumber === flightNumber
            ? {
                ...item,
                status: "BOARDING",
                statusNote: `Boarding Group 1 & 2 · Gate ${item.gateDeparture}`,
              }
            : item,
        );
        alert = {
          id: uid("alert"),
          flightNumber,
          type,
          title: `Boarding Now: ${flightNumber}`,
          message: `Priority boarding has commenced for ${flight.airline} ${flightNumber} at ${flight.gateDeparture}.`,
          timestamp: "Just now",
          isRead: false,
        };
      } else if (type === "BAGGAGE") {
        const carousel = `Carousel ${1 + Math.floor(Math.random() * 12)}`;
        updatedFlights = flightsRef.current.map((item) =>
          item.flightNumber === flightNumber ? { ...item, baggageCarousel: carousel } : item,
        );
        alert = {
          id: uid("alert"),
          flightNumber,
          type,
          title: `Baggage Claim Update: ${flightNumber}`,
          message: `Luggage for ${flightNumber} is now arriving on ${carousel} at ${flight.destination.code}.`,
          timestamp: "Just now",
          isRead: false,
        };
      } else if (type === "CANCELLATION") {
        updatedFlights = flightsRef.current.map((item) =>
          item.flightNumber === flightNumber
            ? {
                ...item,
                status: "CANCELLED",
                statusNote: "Cancelled · Technical Inspection Required",
                delayReason: "Aircraft Maintenance",
              }
            : item,
        );
        alert = {
          id: uid("alert"),
          flightNumber,
          type,
          title: `Flight Cancelled: ${flightNumber}`,
          message: `We regret to inform you that ${flightNumber} has been cancelled. Automated rebooking options are ready in the app.`,
          timestamp: "Just now",
          isRead: false,
        };
      }

      flightsRef.current = updatedFlights;
      setFlights(updatedFlights);
      if (alert) addAlert(alert, true);
    },
    [addAlert],
  );

  const addRecent = useCallback((flight: Flight) => {
    setRecents((prev) => {
      const next: RecentSearch = {
        flightNumber: flight.flightNumber,
        airline: flight.airline,
        originCode: flight.origin.code,
        originCity: flight.origin.city,
        destCode: flight.destination.code,
        destCity: flight.destination.city,
        status: flight.status,
        searchTimestamp: Date.now(),
      };
      return [next, ...prev.filter((item) => item.flightNumber !== flight.flightNumber)].slice(0, 5);
    });
  }, []);

  const deleteRecent = useCallback((flightNumber: string) => {
    setRecents((prev) => prev.filter((item) => item.flightNumber !== flightNumber));
  }, []);

  const clearRecents = useCallback(() => setRecents([]), []);

  const signIn = useCallback(async () => {
    setAuthBusy(true);
    try {
      if (firebaseEnabled) {
        await signInWithGoogleFirebase();
        notify("Google Sign-In connected. Firestore sync active.", "success");
      } else {
        setAccount({
          name: "Captain Alex Mercer",
          email: "alex.mercer@aviation.aero",
          avatarInitial: "A",
          isSignedIn: true,
          isOfflineMode: offlineMode,
          lastSyncTime: "Demo session · Firebase env not configured",
          uid: "demo-aviator",
          provider: "Google (demo)",
        });
        notify(
          "Signed in with the demo Google profile. Add Firebase env values for live Firestore sync.",
          "info",
        );
      }
      addAlert(
        {
          id: uid("alert"),
          flightNumber: "ACCOUNT",
          type: "BOARDING",
          title: "Google Sign-In Connected",
          message:
            "Welcome aboard. Your tracked flights and alerts are now backed by Firebase Firestore.",
          timestamp: "Just now",
          isRead: false,
        },
        true,
      );
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Google Sign-In failed or was cancelled.",
        "warning",
      );
    } finally {
      setAuthBusy(false);
    }
  }, [addAlert, notify, offlineMode]);

  const signOut = useCallback(async () => {
    if (firebaseEnabled && account.uid && account.uid !== "demo-aviator") {
      await signOutFirebase().catch(() => {});
    }
    setAccount({ ...GUEST_ACCOUNT, isOfflineMode: offlineMode });
    notify("Signed out. Local cache remains active.", "info");
  }, [account.uid, notify, offlineMode]);

  const toggleOffline = useCallback(() => {
    setOfflineMode((prev) => {
      const next = !prev;
      setAccount((current) => ({
        ...current,
        isOfflineMode: next,
        lastSyncTime: next
          ? "Offline Mode (Local Cache Active)"
          : "Connected (Background Sync Active)",
      }));
      notify(
        next
          ? "Offline mode enabled · serving local cache"
          : "Back online · syncing local cache",
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
      await new Promise((resolve) => window.setTimeout(resolve, 700));
      setAccount((current) => ({
        ...current,
        lastSyncTime: `Synced at ${new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}`,
      }));
      notify("Flight, route, and weather telemetry refreshed.", "success");
    } catch {
      notify("Refresh failed. Serving local cache.", "warning");
    } finally {
      setSyncing(false);
    }
  }, [notify]);

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
        ? "Desktop push notifications enabled."
        : "Notification permission was not granted.",
      permission === "granted" ? "success" : "warning",
    );
  }, [notify]);

  const favorites = useMemo(
    () => flights.filter((flight) => flight.isFavorite),
    [flights],
  );
  const tracked = useMemo(
    () => flights.filter((flight) => flight.isTracked),
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
    favorites,
    tracked,
    toggleFavorite,
    toggleTrack,
    updateNotes,
    alerts,
    unreadAlertCount,
    addAlert,
    markAlertRead,
    markAllAlertsRead,
    scheduledAlerts,
    scheduleAlert,
    cancelScheduledAlert,
    simulateAlert,
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
    firebaseReady,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used inside AppProvider");
  return context;
}
