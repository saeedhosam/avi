/* SkyTrack web push service worker.
 * Receives FCM payloads in the background and shows a native notification.
 * Foreground alerts are handled by the app's notification pipeline.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { notification: { body: event.data ? event.data.text() : "" } };
  }

  const notification = payload.notification || {};
  const data = payload.data || {};
  const title = notification.title || data.title || "SkyTrack flight alert";
  const body =
    notification.body ||
    data.message ||
    "A tracked flight has a new operational update.";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon.jpg",
      badge: "/icon.jpg",
      tag: data.tag || data.flightNumber || "skytrack-alert",
      data: {
        url: data.url || (data.flightNumber ? `/flight/${data.flightNumber}` : "/watchlist"),
      },
      vibrate: [120, 60, 120],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/watchlist";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
