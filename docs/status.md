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
  - profiles, tracked flights, alerts, device tokens, push subscriptions
  - flight snapshots, provider cache, map cache, OSM ingest runs
  - legacy Firestore import staging + `claim_legacy_data()`
  - RLS policies and Realtime publication
- Auth trigger + RLS smoke test passed (temporary user created, profile and tracked flight inserted/read, user deleted).
- TypeScript database types generated into `apps/web/src/lib/database.types.ts`.

### Web

- Next.js 16 production image deployed.
- Google Maps JS and Leaflet removed.
- MapLibre GL JS + Positron style deployed for:
  - route network
  - radar
  - flight dossier map
  - full-screen flight map
- MapLibre worker served from `/maplibre/maplibre-gl-worker.mjs`.
- Routes and aircraft symbols render; flight arcs, traveled path, IATA badges, and aircraft heading verified in headless Chrome.
- Firebase Auth/Firestore removed from web; Supabase browser client wired for auth, profile, tracked flights, and alerts.
- Supabase Realtime subscriptions merge tracked flights and alerts across sessions/devices.

### Android

- Supabase-kt auth, Postgrest, and Realtime wired.
- Firebase Auth, Firestore, App Check, Google Services plugin, and FCM service removed.
- Credential Manager Google ID token exchanged through Supabase `IDToken`.
- Room remains the offline cache; cloud tracked flights with snapshots and alerts are merged on sign-in.
- Android debug build passes in CI against compileSdk 36 with Supabase 3.1.4 / Ktor 3.1.3.

### API

- Fastify `avi-api` deployed at `https://api.2-31-110-53.sslip.io`.
- `GET /healthz`, `GET /v1/status`, `GET /v1/flights/search?number=`.
- OpenAPI generated at `packages/contracts/openapi.json`.
- AeroDataBox provider + in-memory cache + quota fallback.
- Supabase server key loaded (status reports `configured`).

### iOS

- XcodeGen SwiftUI placeholder committed.
- Tabs: Search, Radar, Routes, Airports, Terminals, Watchlist, Account.
- MapLibre preview and Supabase Swift client bootstrap.
- Manual GitHub Actions build workflow; macOS build not yet verified.

## Needs credentials / decisions

| Item | Needed for |
| --- | --- |
| Google OAuth client ID + secret | Supabase Google sign-in on web/Android/iOS (still not configured) |
| Android SHA-1/SHA-256 fingerprints | Google sign-in on Android |
| Rotated AeroDataBox RapidAPI key | Live flights, boards, routes |
| Real domain + DNS | Production HTTPS, shared links, OAuth redirects |
| Firebase service account (optional) | Legacy Firestore user-data export/import |
| FCM `google-services.json` (optional) | Android push |
| Apple Developer account + macOS | Real iOS build/TestFlight |

## Next implementation phases

1. **Google OAuth dev setup** — add the Web/Android OAuth clients and verify web + Android sign-in.
2. **Android MapLibre migration** — remove Play Services Maps/maps-compose, add MapLibre Compose, reuse shared style/GeoJSON, delete Canvas radar/route renderers.
3. **Backend provider parity** — move flight mapping/boards/routes/weather from Next API routes into `services/api`; point web and Android at the shared API.
4. **Indoor + AMDB** — Overpass ingestion job, curated floorplan georeferencing, routing graph, `/v1/airports/{iata}/map/*` endpoints, web/Android indoor UI.
5. **Push** — Web Push VAPID, FCM HTTP v1, APNs, alert engine.
6. **iOS implementation** beyond the placeholder.

## Known limitations

- The web still uses its Next.js API routes for airport/weather data; the shared `avi-api` currently covers flight search and status.
- Android still uses Google Maps until its MapLibre phase lands.
- Google OAuth provider is not configured yet; web/Android sign-in cannot complete until the client ID/secret and Android SHA are added.
- Indoor/AMDB data and routing are not implemented yet.
- No production domain is connected; `sslip.io` is staging only.
- Live flights and airport boards report `NOT_CONFIGURED` until a valid AeroDataBox key is set on the server.
