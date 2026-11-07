import { getSupabase } from "./supabase";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export function webPushConfigured(): boolean {
  return Boolean(VAPID_PUBLIC_KEY && VAPID_PUBLIC_KEY.length >= 60);
}

export function webPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined"
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }
  return output;
}

/** Registers the push service worker (idempotent). */
export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!webPushSupported()) return null;
  try {
    await navigator.serviceWorker.register("/sw.js");
    return await navigator.serviceWorker.ready;
  } catch (error) {
    console.warn("service worker registration failed", error);
    return null;
  }
}

/** True when this device already has a stored push subscription. */
export async function hasWebPushSubscription(): Promise<boolean> {
  const registration = await registerPushServiceWorker();
  if (!registration || !VAPID_PUBLIC_KEY) return false;
  const existing = await registration.pushManager.getSubscription();
  return Boolean(existing);
}

/**
 * Asks permission, subscribes through the service worker, and persists the
 * endpoint to push_subscriptions for the gateway delivery loop. Web Push
 * requires a web app manifest + service worker to work on iOS.
 */
export async function enableWebPush(): Promise<{ ok: boolean; reason?: string }> {
  if (!webPushSupported()) return { ok: false, reason: "unsupported" };
  if (!webPushConfigured()) {
    return { ok: false, reason: "not_configured" };
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, reason: `permission_${permission}` };
  }
  const registration = await registerPushServiceWorker();
  if (!registration) return { ok: false, reason: "no_service_worker" };

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY as string),
    });
  }

  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: "supabase_unavailable" };
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { ok: false, reason: "not_signed_in" };
  }
  const { error: saveError } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: data.user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.toJSON().keys?.p256dh ?? "",
      auth: subscription.toJSON().keys?.auth ?? "",
      platform: "web" as const,
      last_seen: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  if (saveError) {
    console.warn("push subscription save failed", saveError);
    return { ok: false, reason: "save_failed" };
  }
  return { ok: true };
}

/**
 * Removes this browser's push endpoint both server-side and in the browser.
 * Called on sign-out so the previous user does not keep receiving alerts on a
 * shared device.
 */
export async function disableWebPush(): Promise<void> {
  if (!webPushSupported()) return;
  const supabase = getSupabase();
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    if (supabase) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .eq("endpoint", subscription.endpoint);
    }
    await subscription.unsubscribe();
  } catch (error) {
    console.warn("push unsubscribe failed", error);
  }
}
