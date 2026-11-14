import type { Session, User } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
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
import { AppState } from "react-native";
import {
  registerAndSavePush,
  SIGNED_OUT_PUSH_STATUS,
  type PushStatus,
} from "./push";
import { supabase, supabaseConfigured } from "./supabase";
import { syncTrackedFlights } from "./trackedFlights";

export interface AuthActionResult {
  ok: boolean;
  message?: string;
}

interface AuthContextValue {
  configured: boolean;
  ready: boolean;
  session: Session | null;
  user: User | null;
  pushStatus: PushStatus;
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
  signUp: (email: string, password: string) => Promise<AuthActionResult>;
  signOut: () => Promise<AuthActionResult>;
  refreshSession: () => Promise<AuthActionResult>;
  registerPush: () => Promise<PushStatus>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabaseConfigured);
  const [pushStatus, setPushStatus] = useState<PushStatus>(SIGNED_OUT_PUSH_STATUS);
  const activeUserId = useRef<string | null>(null);

  const applyPushStatus = useCallback((userId: string, next: PushStatus) => {
    if (activeUserId.current === userId) setPushStatus(next);
  }, []);

  const runPushRegistration = useCallback(
    async (userId: string, requestPermission: boolean): Promise<PushStatus> => {
      if (activeUserId.current === userId) {
        setPushStatus({
          state: "registering",
          message: "Registering this device with Expo Push…",
          permission: "undetermined",
        });
      }
      const status = await registerAndSavePush(userId, { requestPermission });
      applyPushStatus(userId, status);
      return status;
    },
    [applyPushStatus],
  );

  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }
    const client = supabase;
    let cancelled = false;

    const restore = async () => {
      try {
        const { data, error } = await client.auth.getSession();
        if (cancelled) return;
        if (error) {
          setPushStatus({
            state: "error",
            message: `Could not restore the saved session: ${error.message}`,
            permission: "undetermined",
          });
        }
        const restoredUser = data.session?.user ?? null;
        activeUserId.current = restoredUser?.id ?? null;
        setSession(data.session);
        setReady(true);
        if (restoredUser) {
          // Restore the token association and mirror any local cache without
          // re-prompting for notification permission.
          void syncTrackedFlights();
          void runPushRegistration(restoredUser.id, false);
        }
      } catch (cause) {
        if (cancelled) return;
        setReady(true);
        setPushStatus({
          state: "error",
          message:
            cause instanceof Error
              ? `Could not restore the saved session: ${cause.message}`
              : "Could not restore the saved session.",
          permission: "undetermined",
        });
      }
    };

    void restore();

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (cancelled) return;
      const nextUser = nextSession?.user ?? null;
      activeUserId.current = nextUser?.id ?? null;
      setSession(nextSession);
      setReady(true);
      if (!nextUser) {
        setPushStatus(SIGNED_OUT_PUSH_STATUS);
      }
    });

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void client.auth.startAutoRefresh();
      } else {
        void client.auth.stopAutoRefresh();
      }
    });
    void client.auth.startAutoRefresh();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      appStateSubscription.remove();
      void client.auth.stopAutoRefresh();
    };
  }, [runPushRegistration]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<AuthActionResult> => {
      if (!supabase) {
        return {
          ok: false,
          message:
            "Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.",
        };
      }
      const normalizedEmail = normalizeEmail(email);
      if (!normalizedEmail || !password) {
        return { ok: false, message: "Enter both your email address and password." };
      }
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (error) return { ok: false, message: error.message };
      activeUserId.current = data.user?.id ?? null;
      setSession(data.session);
      if (data.user) {
        void syncTrackedFlights();
        void runPushRegistration(data.user.id, true);
      }
      return { ok: true };
    },
    [runPushRegistration],
  );

  const signUp = useCallback(
    async (email: string, password: string): Promise<AuthActionResult> => {
      if (!supabase) {
        return {
          ok: false,
          message:
            "Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.",
        };
      }
      const normalizedEmail = normalizeEmail(email);
      if (!normalizedEmail || !password) {
        return { ok: false, message: "Enter both your email address and password." };
      }
      if (password.length < 8) {
        return {
          ok: false,
          message: "Use at least 8 characters for a new account password.",
        };
      }
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: { emailRedirectTo: Linking.createURL("/auth") },
      });
      if (error) return { ok: false, message: error.message };
      if (data.session?.user) {
        activeUserId.current = data.session.user.id;
        setSession(data.session);
        void syncTrackedFlights();
        void runPushRegistration(data.session.user.id, true);
        return {
          ok: true,
          message: "Account created and signed in.",
        };
      }
      return {
        ok: true,
        message:
          "Account created. Check your email to confirm it, then sign in here.",
      };
    },
    [runPushRegistration],
  );

  const signOut = useCallback(async (): Promise<AuthActionResult> => {
    if (!supabase) {
      return { ok: false, message: "Supabase is not configured." };
    }
    const { error } = await supabase.auth.signOut();
    if (error) return { ok: false, message: error.message };
    activeUserId.current = null;
    setSession(null);
    setPushStatus(SIGNED_OUT_PUSH_STATUS);
    return { ok: true };
  }, []);

  const refreshSession = useCallback(async (): Promise<AuthActionResult> => {
    if (!supabase) {
      return { ok: false, message: "Supabase is not configured." };
    }
    const { data, error } = await supabase.auth.refreshSession();
    if (error) return { ok: false, message: error.message };
    setSession(data.session);
    return {
      ok: true,
      message: data.session ? "Session refreshed." : "No session to refresh.",
    };
  }, []);

  const registerPush = useCallback(async (): Promise<PushStatus> => {
    const userId = activeUserId.current;
    if (!userId) {
      const status: PushStatus = {
        ...SIGNED_OUT_PUSH_STATUS,
        message: "Sign in before registering push alerts.",
      };
      setPushStatus(status);
      return status;
    }
    return runPushRegistration(userId, true);
  }, [runPushRegistration]);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: supabaseConfigured,
      ready,
      session,
      user: session?.user ?? null,
      pushStatus,
      signIn,
      signUp,
      signOut,
      refreshSession,
      registerPush,
    }),
    [
      ready,
      session,
      pushStatus,
      signIn,
      signUp,
      signOut,
      refreshSession,
      registerPush,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
