"use client";

import { getSupabase, supabaseEnabled } from "./supabase";

/**
 * One token per page load; failures are not retried so a distributor-server
 * outage never floods Supabase.
 */
let anonymousAttempted = false;

/** Token for gateway calls: existing session, or one anonymous guest session. */
export async function ensureSupabaseToken(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) return data.session.access_token;
    if (anonymousAttempted) return null;
    anonymousAttempted = true;
    const { data: anon, error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.warn("anonymous sign-in unavailable", error.message);
      return null;
    }
    return anon.session?.access_token ?? null;
  } catch (error) {
    console.warn("could not resolve a gateway token", error);
    return null;
  }
}

/**
 * `fetch` that carries the caller's Supabase access token so the gateway can
 * apply per-user provider quoting. Falls back to a plain request when no
 * token is available; the gateway still serves in log mode.
 */
export async function authFetch(
  input: URL | RequestInfo,
  init?: RequestInit | undefined,
): Promise<Response> {
  if (!supabaseEnabled) return fetch(input, init);

  const token = await ensureSupabaseToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
