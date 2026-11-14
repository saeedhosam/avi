# Environment setup

This repository uses three gitignored env files:

| File | Used by |
| --- | --- |
| `apps/web/.env.local` | Next.js web |
| `services/api/.env` | Fastify gateway, watch engine, push |
| `apps/mobile/.env` | Expo client |

Copy the matching `.env.example` if a file is missing. **Never commit these
files or put provider/Supabase secret keys in `NEXT_PUBLIC_*` or `EXPO_PUBLIC_*`
variables.**

---

## Supabase

Already linked: project `avi` (`uiabvbndrpscsscvwofc`).

| Variable | Where to get it | Notes |
| --- | --- | --- |
| `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Project Settings → API | Public project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Dashboard → API → publishable/anon key | Safe in the browser; RLS still applies |
| `SUPABASE_SECRET_KEY` | Dashboard → API → secret/service-role key | **Server only**. Never send to web/mobile |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Same publishable key as web | Mobile uses it for auth |
| `SUPABASE_ACCESS_TOKEN` | Supabase account → Access Tokens | CLI only; not read by the apps |
| `SUPABASE_DB_PASSWORD` | Project database password | CLI only |

Apply migrations:

```bash
npx supabase@3.1.0 db push --remote --yes
```

The two AeroQuest migrations have been applied and verified:
`20261114000100_aeroquest_gateway.sql` and
`20261114000200_terminal_graphs.sql`.

---

## AeroDataBox (server only)

| Variable | Where to get it | Notes |
| --- | --- | --- |
| `AERODATABOX_API_KEY` | AeroDataBox / RapidAPI dashboard | Never expose to web/mobile |
| `AERODATABOX_API_HOST` | `api.aerodatabox.com`, or the RapidAPI host | Must match the key type |

For local web-only work, `apps/web/.env.local` may hold a direct key as a
development fallback. In production, set `AVI_API_BASE_URL` so the web uses the
gateway exclusively.

---

## Gateway and Redis

| Variable | Local value | Production |
| --- | --- | --- |
| `AVI_API_BASE_URL` (web) | `http://localhost:8080` (or `:8180` if 8080 is occupied) | `https://api.codestep.org` or the staging API |
| `EXPO_PUBLIC_AEROQUEST_API_URL` (mobile) | staging/LAN gateway URL | Hetzner gateway HTTPS URL |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated production web origins |
| `PUBLIC_WEB_URL` | `http://localhost:3000` | Production web origin |
| `REDIS_URL` | leave empty for in-process cache | `redis://redis:6379` in Docker |
| `PROVIDER_CACHE_ENABLED` | `true` | `true` |
| `PROVIDER_AUTH_MODE` | `log` | `enforce` after rollout |
| `UNIT_BUDGET_PER_MONTH` | `32000` | Starter-safe monthly cap |

`REDIS_URL` empty means the gateway uses its per-process L1 cache. With Redis
set, all replicas share the cache and single-flight locks.

If port `8080` is already occupied on your machine, change `PORT` in
`services/api/.env` and point `AVI_API_BASE_URL` in `apps/web/.env.local` at the
same port (for example `8180`).

---

## Push

### Web Push (VAPID)

Local VAPID keys are already generated in `apps/web/.env.local` and
`services/api/.env`. For production, generate once:

```bash
npx web-push generate-vapid-keys
```

| Variable | File | Meaning |
| --- | --- | --- |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | web | Public key exposed to the browser |
| `VAPID_PUBLIC_KEY` | API | Same public key |
| `VAPID_PRIVATE_KEY` | API | **Server only** |
| `VAPID_SUBJECT` | API | `mailto:` contact for push services |

### Expo Push

| Variable | File | Meaning |
| --- | --- | --- |
| `EXPO_ACCESS_TOKEN` | API | Optional; required only when Expo push security is enabled |

Native push tokens come from `expo-notifications`; the gateway fans them out
after `flightStateDiffer` detects a gate/terminal/status/baggage change.

---

## EAS project

EAS means **Expo Application Services** — Expo's cloud build, submit, and update
service. An **EAS project** is the cloud record that links this mobile app to
your Expo account. It is identified by a UUID and stored in `app.json`:

```json
{
  "expo": {
    "extra": {
      "eas": { "projectId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" }
    }
  }
}
```

You need it for:

- `expo-notifications` to obtain an Expo push token
  (`getExpoPushTokenAsync({ projectId })`)
- EAS cloud builds (`eas build`)
- EAS Submit / OTA updates

Create it once:

```bash
cd apps/mobile
npx eas-cli login
npx eas-cli init
```

`eas init` creates the project (or links an existing one), writes
`extra.eas.projectId` into `app.json`, and may add an EAS project ID to
`eas.json`. Commit the `app.json` change, but never commit credentials.

Until a valid project ID exists, `registerForPushNotifications()` returns
`null` by design; the rest of the app works normally.

Build profiles are already in `apps/mobile/eas.json`:

```bash
npx eas-cli build --profile development --platform android
npx eas-cli build --profile preview --platform ios
npx eas-cli build --profile production --platform all
```

---

## Affiliate hooks (optional)

| Variable | Where to get it |
| --- | --- |
| `NEXT_PUBLIC_LOUNGE_AFFILIATE_URL` | Your lounge/Priority Pass affiliate link |
| `NEXT_PUBLIC_ESIM_AFFILIATE_URL` | Your Airalo or eSIM affiliate link |

These are used only by the contextual delay/lounge and arrival/eSIM cards. They
are not banner ads and never block flight status.

---

## Billing

| Variable | Meaning |
| --- | --- |
| `BILLING_PROVIDER` | `manual`, `lemon_squeezy`, or `polar` |
| `POLAR_API_KEY`, `POLAR_PRICE_*`, `POLAR_WEBHOOK_SECRET` | Polar MoR checkout/webhook |
| `LEMONSQUEEZY_*` | Legacy Lemon Squeezy adapter |

`profiles.plan` is server-owned (`FREE`/`PLUS`/`PRO`). The `$4.99` trip pass is
represented by `profiles.trip_pass_expires_at`; clients cannot write either
column.

---

## Verify configuration

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
curl -fsS http://localhost:8080/healthz
curl -fsS http://localhost:8080/v1/status | head
```

If `/api/gateway/*` returns `gateway_not_configured`, `AVI_API_BASE_URL` is not
set in the web runtime. If `/v1/me` returns `me_unavailable`, the API is missing
`SUPABASE_URL` or `SUPABASE_SECRET_KEY`.
