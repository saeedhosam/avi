# Avi status

Updated: 2026-11-05

## Working now

### Platform

- Single monorepo at `saeedhosam/avi` with both histories preserved.
- `avi-desktop` GitHub repository archived; its history is in `apps/web`.
- GitHub Actions:
  - `CI` — Node/web/API/packages + Android debug build.
  - `Deploy` — Supabase migrations, image builds, SSH rollout to Hetzner.
  - `iOS` — manual macOS build workflow.
- Hetzner production server:
  - Ubuntu 26.04.1 LTS, Docker, Caddy, Redis.
  - HTTPS hostnames:
    - `https://app.2-31-110-53.sslip.io`
    - `https://api.2-31-110-53.sslip.io`
  - UFW, fail2ban, key-only SSH, unattended upgrades.
  - Caddy only exposes 80/443; web/API/Redis stay on the internal Docker network.

### Supabase

- Project `uiabvbndrpscsscvwofc` (`avi`, eu-west-1).
- Migrations applied:
  - profiles, watchlist items, alerts, device tokens, push subscriptions
  - flight snapshots, provider cache, map cache, OSM ingest runs
  - RLS policies and Realtime publication
- `watchlist_items` replaces the old tracked/favorite split; migration copies legacy rows and updates RLS/grants/Realtime.
- Legacy Firestore import staging and `claim_legacy_data()` removed.
- Auth trigger + RLS smoke test passed (temporary user created, profile and watchlist item inserted/read, user deleted).
- TypeScript database types generated into `apps/web/src/lib/database.types.ts`.

### Web

- Next.js 16 production image deployed.
- Google Maps JS and Leaflet removed.
- MapLibre GL JS + custom Positron styles deployed for:
  - route network
  - flight dossier map
  - full-screen flight map
- Light and dark map styles (`style.json` / `style-dark.json`) auto-follow the app theme.
- Routes map hides base-map place labels while a hub or route is selected so IATA/route labels stay readable.
- MapLibre worker served from `/maplibre/maplibre-gl-worker.mjs`.
- Routes and aircraft symbols render; flight arcs, traveled path, IATA badges, and aircraft heading verified in headless Chrome.
- Live Radar page removed; flight maps were kept.
- Firebase Auth/Firestore removed from web; Supabase browser client wired for auth, profile, watchlist, and alerts.
- One Watchlist action/list replaces tracked + favorites.
- Supabase Realtime subscriptions merge watchlist items and alerts across sessions/devices.

### Android

- Supabase-kt auth, Postgrest, and Realtime wired.
- Firebase Auth, Firestore, App Check, Google Services plugin, and FCM service removed.
- Credential Manager Google ID token exchanged through Supabase `IDToken`.
- Room remains the offline cache; cloud watchlist items with snapshots and alerts are merged on sign-in.
- Live Radar screen/tab removed; the flight detail map is kept.
- User-facing watchlist is unified to one action/list; Supabase calls use `watchlist_items` and `notes`.
- Android debug build passes in CI against compileSdk 36 with Supabase 3.1.4 / Ktor 3.1.3.

### API

- Fastify `avi-api` deployed at `https://api.2-31-110-53.sslip.io`.
- `GET /healthz`, `GET /v1/status`, `GET /v1/flights/search?number=`.
- OpenAPI generated at `packages/contracts/openapi.json`.
- AeroDataBox provider + in-memory cache + quota fallback.
- Supabase server key loaded (status reports `configured`).
- AeroDataBox key configured; live flight search currently returns `quota_fallback` because RapidAPI responds 429.

### iOS

- XcodeGen SwiftUI placeholder committed.
- Tabs: Search, Routes, Airports, Terminals, Watchlist, Account (Radar tab removed).
- MapLibre preview and Supabase Swift client bootstrap.
- Manual GitHub Actions build workflow; macOS build not yet verified.

## Needs credentials / decisions

| Item | Needed for |
| --- | --- |
| Google OAuth client ID + secret | Supabase Google sign-in on web/Android/iOS (still not configured) |
| Android SHA-1/SHA-256 fingerprints | Google sign-in on Android |
| AeroDataBox quota/plan (or rotated key) | Live flights, boards, routes |
| Real domain + DNS | Production HTTPS, shared links, OAuth redirects |
| Firebase service account (optional) | Legacy Firestore user-data export/import |
| FCM `google-services.json` (optional) | Android push |
| Apple Developer account + macOS | Real iOS build/TestFlight |

## Next implementation phases

1. **Google OAuth dev setup** — add the Web/Android OAuth clients and verify web + Android sign-in.
2. **Android MapLibre migration** — remove Play Services Maps/maps-compose, add MapLibre Compose, reuse shared light/dark styles and selected-hub label hiding.
3. **Android internal watchlist cleanup** — collapse the remaining `isFavorite`/`isTracked` duality and Room tracked/favorite tables into one cached watchlist.
4. **Backend provider parity** — move flight mapping/boards/routes/weather from Next API routes into `services/api`; point web and Android at the shared API.
5. **Indoor + AMDB** — Overpass ingestion job, curated floorplan georeferencing, routing graph, `/v1/airports/{iata}/map/*` endpoints, web/Android indoor UI.
6. **Push** — Web Push VAPID, FCM HTTP v1, APNs, alert engine.
7. **iOS implementation** beyond the placeholder.

## Known limitations

- The web still uses its Next.js API routes for airport/weather data; the shared `avi-api` currently covers flight search and status.
- Android still uses Google Maps until its MapLibre phase lands.
- Android still carries internal `isFavorite`/`isTracked` flags and separate Room tracked/favorite tables behind the unified UI.
- Web Google OAuth works; Android Google sign-in remains deferred until the Android OAuth client, SHA fingerprints, and `GOOGLE_WEB_CLIENT_ID` are added.
- Indoor/AMDB data and routing are not implemented yet.
- No production domain is connected; `sslip.io` is staging only.
- Live flights and airport boards remain on quota fallback until the AeroDataBox RapidAPI plan or key is fixed.
