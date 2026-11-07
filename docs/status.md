# Avi status

Updated: 2026-11-07

## Corrective pass (2026-11-07)

- Provider routes now carry Supabase identity + per-user quotas; design and
  rollout in `docs/provider-quota.md` (still `PROVIDER_AUTH_MODE=log` until
  the log window is clean).
- Polar webhooks now verify the Standard Webhooks headers/signature and use
  `external_customer_id` for identity; plan writes retry on failure.
- Web Push subscriptions are queried by `user_id` (the previous query used the
  subscription id, so nothing was ever delivered).
- Alert dedup is per user, so every watcher of a flight receives changes.
- Purged snapshots are recoverable from `flight_number`/`flight_date`; no
  long-lead watchlist entry is permanently stranded.
- Web merges engine snapshots into existing flights and reconciles removals.
- Android decodes additive snapshots (`ignoreUnknownKeys`) and keeps
  `flightDate`; fabricated telemetry and synthetic cloud alerts were removed.
- The web no longer falls back to a second provider key in production.
- Server-owned fields are protected: clients cannot rewrite snapshots/status or
  insert alerts; they can still edit notes and mark alerts read.
- Provider-backed routes are rate-limited and share the monthly unit budget.

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
- Google Maps removed from Android: the flight map is now MapLibre Compose (`org.maplibre.compose:maplibre-compose:0.20.0`, OpenGL runtime) using the same Positron light/dark styles as web, copied from `packages/map-style` into assets at build time (`copyAviMapStyles` task). Theme-following, great-circle arcs, traveled path, heading vector, IATA halo labels, and camera fit mirror the web flight map. `play-services-maps`, `maps-compose`, and `MAPS_API_KEY` are gone.
- Toolchain refreshed 2026-11-06: AGP 9.5.1 / Gradle 9.8.2 / built-in Kotlin 2.4.21, compileSdk 37, Compose BOM 2026.09.00, KSP 2.3.13, Room 2.8.5, Supabase BOM 3.9.0, Ktor 3.6.1, OkHttp 5.5.1, Retrofit 3.0.0.
- Android debug build and unit tests pass locally; CI builds with the same Gradle version.

### API

- Fastify `avi-api` deployed at `https://api.2-31-110-53.sslip.io`.
- `GET /healthz`, `GET /v1/status`, `GET /v1/flights/search?number=`.
- OpenAPI generated at `packages/contracts/openapi.json`.
- AeroDataBox provider + in-memory cache + quota fallback.
- Supabase server key loaded (status reports `configured`).
- AeroDataBox direct API configured (`https://api.aerodatabox.com`, `X-Api-Key`); live flight search, FIDS, airport search, and daily routes verified.
- Direct Starter plan: 40,000 API units/month at 5 req/s. Flight status/FIDS/search cost 2 units; daily routes cost 6.

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
| AeroDataBox unit headroom / Growth plan | Higher monthly quota if app usage grows |
| Real domain + DNS | Production HTTPS, shared links, OAuth redirects |
| Firebase service account (optional) | Legacy Firestore user-data export/import |
| FCM `google-services.json` (optional) | Android push |
| Apple Developer account + macOS | Real iOS build/TestFlight |

## Next implementation phases

1. **Google OAuth dev setup** — add the Web/Android OAuth clients and verify web + Android sign-in.
2. **Android internal watchlist cleanup** — collapse the remaining `isFavorite`/`isTracked` duality and Room tracked/favorite tables into one cached watchlist.
3. **Backend provider parity** — move flight mapping/boards/routes/weather from Next API routes into `services/api`; point web and Android at the shared API.
4. **Indoor + AMDB** — Overpass ingestion job, curated floorplan georeferencing, routing graph, `/v1/airports/{iata}/map/*` endpoints, web/Android indoor UI.
5. **Push** — Web Push VAPID, FCM HTTP v1, APNs, alert engine.
6. **iOS implementation** beyond the placeholder.

## Known limitations

- The web still uses its Next.js API routes for airport/weather data; the shared `avi-api` currently covers flight search and status.
- Android still carries internal `isFavorite`/`isTracked` flags and separate Room tracked/favorite tables behind the unified UI.
- Web Google OAuth works; Android Google sign-in remains deferred until the Android OAuth client, SHA fingerprints, and `GOOGLE_WEB_CLIENT_ID` are added.
- Indoor/AMDB data and routing are not implemented yet.
- No production domain is connected; `sslip.io` is staging only.
- The direct Starter plan has a 40,000 unit/month cap with no paid overage, so watchlist refresh frequency and route browsing must stay within budget.
- Map styles are bundled into the Android APK from `packages/map-style` at build time; keep that package as the single source of truth. The web route-map contract (hide base labels when a hub/route is selected) is not yet mirrored on Android.
- TypeScript stays on 5.9.x; the npm `latest` is TS 7 (the Go rewrite) — ecosystem (Next typegen, ESLint configs) is not aligned on it yet.
