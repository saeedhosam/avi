import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const key =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

export const supabaseConfigured = Boolean(url && key);

/**
 * Mobile Supabase client with device-persisted sessions. Null when the public
 * environment is not configured; callers must show an explicit sign-in
 * unavailable state rather than falling back to demo data.
 */
export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url!, key!, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

/** Current persisted session, or null when Supabase is unavailable/signed out. */
export async function getStoredSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/**
 * Access token for gateway requests. Returns null when the app is signed out;
 * callers must not invent an identity or fall back to demo credentials.
 */
export async function getAccessToken(): Promise<string | null> {
  const session = await getStoredSession();
  return session?.access_token ?? null;
}

export async function getCurrentUserId(): Promise<string | null> {
  const session = await getStoredSession();
  return session?.user.id ?? null;
}
