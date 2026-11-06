"use client";

import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import type { Database, Json } from "./database.types";
import type { Flight, FlightAlert, UserAccount } from "./types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabaseEnabled = Boolean(supabaseUrl && supabaseKey);

let browserClient: SupabaseClient<Database> | null = null;

export function getSupabase(): SupabaseClient<Database> | null {
  if (!supabaseEnabled || !supabaseUrl || !supabaseKey) return null;
  if (!browserClient) {
    browserClient = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    });
  }
  return browserClient;
}

function toAccount(user: User): UserAccount {
  const name =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    `Capt. ${user.email?.split("@")[0] ?? "Aviator"}`;
  const initial = (name.trim()[0] ?? "A").toUpperCase();
  return {
    name,
    email: user.email ?? "pilot@aviation.aero",
    avatarInitial: initial,
    photoUrl:
      (user.user_metadata?.avatar_url as string | undefined) ?? null,
    isSignedIn: true,
    isOfflineMode: false,
    lastSyncTime: "Cloud Sync Active (Supabase)",
    uid: user.id,
    provider: "Google",
  };
}

export function observeSupabaseAuth(
  callback: (account: UserAccount | null, uid: string | null) => void,
) {
  const supabase = getSupabase();
  if (!supabase) return () => {};

  const emit = (user: User | null) => {
    if (!user) {
      callback(null, null);
      return;
    }
    callback(toAccount(user), user.id);
  };

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    emit(session?.user ?? null);
  });

  void supabase.auth.getSession().then(({ data }) => {
    emit(data.session?.user ?? null);
  });

  return () => subscription.unsubscribe();
}

export async function signInWithGoogleSupabase() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error) throw error;
}

export async function signOutSupabase() {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function saveUserProfile(account: UserAccount, uid: string) {
  const supabase = getSupabase();
  if (!supabase) return;
  try {
    await supabase.from("profiles").upsert(
      {
        id: uid,
        display_name: account.name.slice(0, 100) || "Aviation Navigator",
        email: account.email.slice(0, 150),
        photo_url: account.photoUrl ?? null,
        home_airport: "JFK",
        theme_preference: "SYSTEM",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  } catch (error) {
    console.warn("Supabase profile sync failed", error);
  }
}

export async function saveWatchlistItemCloud(
  uid: string,
  flight: Flight,
) {
  const supabase = getSupabase();
  if (!supabase) return;
  try {
    await supabase.from("watchlist_items").upsert(
      {
        user_id: uid,
        flight_id: flight.id,
        flight_number: flight.flightNumber,
        flight_date: flight.flightDate ?? null,
        airline: flight.airline.slice(0, 100),
        origin_code: flight.origin.code,
        dest_code: flight.destination.code,
        status: flight.status,
        notes: (flight.customNotes ?? "").slice(0, 500),
        snapshot: flight as unknown as Json,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,flight_id" },
    );
  } catch (error) {
    console.warn("Supabase watchlist sync failed", error);
  }
}

export async function deleteWatchlistItemCloud(uid: string, flightId: string) {
  const supabase = getSupabase();
  if (!supabase) return;
  try {
    await supabase
      .from("watchlist_items")
      .delete()
      .eq("user_id", uid)
      .eq("flight_id", flightId);
  } catch (error) {
    console.warn("Supabase watchlist delete failed", error);
  }
}

export async function saveAlertCloud(uid: string, alert: FlightAlert) {
  const supabase = getSupabase();
  if (!supabase) return;
  try {
    await supabase.from("flight_alerts").upsert(
      {
        id: alert.id,
        user_id: uid,
        flight_number: alert.flightNumber,
        alert_type: alert.type,
        title: alert.title.slice(0, 200),
        message: alert.message.slice(0, 1000),
        is_read: alert.isRead,
        created_at: alert.timestamp,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  } catch (error) {
    console.warn("Supabase alert sync failed", error);
  }
}

export async function markAlertReadCloud(uid: string, alertId: string) {
  const supabase = getSupabase();
  if (!supabase) return;
  try {
    await supabase
      .from("flight_alerts")
      .update({ is_read: true, updated_at: new Date().toISOString() })
      .eq("user_id", uid)
      .eq("id", alertId);
  } catch (error) {
    console.warn("Supabase alert update failed", error);
  }
}

export async function fetchCloudAlerts(uid: string): Promise<FlightAlert[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("flight_alerts")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data ?? []).map((record) => ({
      id: record.id,
      flightNumber: record.flight_number,
      type: record.alert_type as FlightAlert["type"],
      title: record.title,
      message: record.message,
      timestamp: record.created_at,
      isRead: record.is_read,
    }));
  } catch (error) {
    console.warn("Supabase alerts fetch failed", error);
    return [];
  }
}

export async function fetchCloudWatchlist(uid: string) {
  const supabase = getSupabase();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("watchlist_items")
      .select("*")
      .eq("user_id", uid);
    if (error) throw error;
    return (data ?? []).map((record) => ({
      flightId: record.flight_id,
      flightNumber: record.flight_number,
      flightDate: record.flight_date ?? undefined,
      airline: record.airline,
      originCode: record.origin_code,
      destCode: record.dest_code,
      status: record.status,
      customNotes: record.notes,
      isWatchlisted: true,
      snapshot: record.snapshot,
    }));
  } catch (error) {
    console.warn("Supabase watchlist fetch failed", error);
    return [];
  }
}

export function subscribeToUserData(
  uid: string,
  handlers: {
    onTrackedFlights: () => void;
    onAlerts: () => void;
  },
) {
  const supabase = getSupabase();
  if (!supabase) return () => {};

  const channel = supabase
    .channel(`avi-user-${uid}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "watchlist_items",
        filter: `user_id=eq.${uid}`,
      },
      () => handlers.onTrackedFlights(),
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "flight_alerts",
        filter: `user_id=eq.${uid}`,
      },
      () => handlers.onAlerts(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

// Web Push is implemented in the next phase; keep the current UI contract stable.
export async function requestFcmToken(): Promise<string | null> {
  return null;
}
