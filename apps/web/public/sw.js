/* Avi service worker: Web Push delivery + low-zoom map tile caching. */

const ICON_URL = "/icon.jpg";
const MAP_TILE_HOST = "tiles.openfreemap.org";
const MAP_TILE_CACHE_PREFIX = "avi-map-tiles-";
const MAP_TILE_CACHE = `${MAP_TILE_CACHE_PREFIX}v1`;
const MAP_TILE_MAX_ZOOM = 4;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter(
                (key) =>
                  key.startsWith(MAP_TILE_CACHE_PREFIX) &&
                  key !== MAP_TILE_CACHE,
              )
              .map((key) => caches.delete(key)),
          ),
        ),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.hostname !== MAP_TILE_HOST) return;

  // TileJSON is tiny; serve it from cache immediately and refresh in the
  // background so repeat globe visits do not wait on it.
  if (url.pathname === "/planet") {
    event.respondWith(
      caches.open(MAP_TILE_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then(async (response) => {
            if (response.ok) {
              await cache.put(request, response.clone()).catch(() => {});
            }
            return response;
          })
          .catch(() => cached || Response.error());
        return cached || network;
      }),
    );
    return;
  }

  const tileMatch = url.pathname.match(
    /\/planet\/[^/]+\/(\d+)\/[^/]+\/[^/]+\.pbf$/,
  );
  if (!tileMatch) return;

  const zoom = Number(tileMatch[1]);
  if (!Number.isFinite(zoom) || zoom > MAP_TILE_MAX_ZOOM) return;

  event.respondWith(
    caches.open(MAP_TILE_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;

      try {
        const response = await fetch(request);
        if (response.ok) {
          await cache.put(request, response.clone()).catch(() => {});
        }
        return response;
      } catch {
        return Response.error();
      }
    }),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const title = payload.title || "Avi";
  const body = payload.message || payload.body || "Live flight update";
  const tag = payload.tag || payload.alertId;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: tag || undefined,
      icon: ICON_URL,
      badge: ICON_URL,
      data: { url: payload.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target =
    (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windowClients) {
        if ("focus" in client) {
          await client.focus();
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(target);
      }
    })(),
  );
});
