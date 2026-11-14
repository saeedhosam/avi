# AeroQuest Mobile

Expo Router client for AeroQuest. The app is a thin UI over `@avi/shared`; all
flight data goes through the Hetzner caching gateway.

## Run

```bash
cp .env.example .env
pnpm --filter @avi/shared build
pnpm --filter @avi/ui build
pnpm --filter @avi/mobile start
```

The `start`/`android`/`ios` scripts build the workspace packages first.

## Environment

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_AEROQUEST_API_URL` | Hetzner gateway origin, e.g. `https://api.2-31-110-53.sslip.io` |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL (optional; auth/sync/status stay disabled without it) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable/anon key (or `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) |

Never put `AERODATABOX_API_KEY` or a Supabase secret key in the mobile bundle.

## Screens

| Route | Feature |
| --- | --- |
| `/` | Acquisition hub, account status, home-airport picker |
| `/auth` | Supabase email/password sign-in, sign-up, session refresh, sign-out, push status |
| `/flights` | Flight-number search, airport board, tracked-flight offline cache |
| `/flight/[id]` | Live/cached flight detail, gates, aircraft, terminal + HUD actions |
| `/explore/[iata]` | World route map, airline/haul filters, destination weather |
| `/terminal/[iata]` | Isometric terminal radar, quick POI filters, sprint HUD |
| `/cabin/[type]/[seat]` | 3D cabin and seat twin (R3F + expo-gl) |
| `/scan` | On-device PDF417/Aztec/QR BCBP parser + gateway status |
| `/bag` | Camera overlay + overhead-bin fit check |
| `/hud` | Barometer-driven offline in-flight HUD with cached-flight context |

Sprint Mode requires query params `arrivalGate`, `departureGate`,
`arrivalTime`, and `boardingTime`; the app never fabricates a connection. A
tracked flight may supply its own departure gate, but the inbound gate and both
times must be explicit.

Tracked-flight snapshots are stored locally in AsyncStorage. Signed-in users get
a best-effort mirror to Supabase `watchlist_items`; network failures never block
or delete the local cache.

## Builds

Native binaries are produced with EAS (see `eas.json`). Push registration uses
`expo-notifications` and the foreground notification handler. A real EAS
project ID (`expo.extra.eas.projectId`) must be configured before tokens can be
issued; without it the Account screen explains that no token was requested.
