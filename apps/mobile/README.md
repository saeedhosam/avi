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
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL (optional until sign-in is wired) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable/anon key |

Never put `AERODATABOX_API_KEY` or a Supabase secret key in the mobile bundle.

## Screens

| Route | Feature |
| --- | --- |
| `/` | Acquisition hub and home-airport picker |
| `/explore/[iata]` | World route map, airline/haul filters, destination weather |
| `/terminal/[iata]` | Isometric terminal radar, quick POI filters, sprint HUD |
| `/cabin/[type]/[seat]` | 3D cabin and seat twin (R3F + expo-gl) |
| `/scan` | On-device PDF417/Aztec/QR BCBP parser + gateway status |
| `/bag` | Camera overlay + overhead-bin fit check |
| `/hud` | Barometer-driven offline in-flight HUD |

Sprint Mode requires query params `arrivalGate`, `departureGate`,
`arrivalTime`, and `boardingTime`; the app never fabricates a connection.

## Builds

Native binaries are produced with EAS (see `eas.json`). Push registration uses
`expo-notifications`; a real EAS project ID must be configured before tokens can
be issued.
