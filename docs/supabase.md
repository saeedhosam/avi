# Supabase

Project: **avi** (`uiabvbndrpscsscvwofc`, `eu-west-1`, Postgres 17).

## Migrations

SQL migrations live in `supabase/migrations` and are the source of truth.

```bash
supabase link --project-ref uiabvbndrpscsscvwofc
supabase db push
```

Applied migrations:

1. `initial_schema` - profiles, tracked flights, alerts, push tokens, provider/map caches, triggers
2. `rls` - RLS policies and explicit grants
3. `legacy_import` - historical Firestore staging path (removed in `drop_legacy_import`)
4. `realtime` - Realtime publication for tracked flights and alerts
5. `drop_legacy_import` - no legacy data is being migrated
6. `client_write_policies` - owner insert policies for profiles and alerts

## Client boundary

- Web and mobile use the **publishable** key and RLS.
- The API uses the **secret** key or service role only for server-owned caches, snapshots, alert generation, and push delivery.
- The secret key must never be shipped in an APK, IPA, or web bundle.

## Data model

User-owned:

- `profiles`
- `tracked_flights`
- `flight_alerts`
- `device_tokens`
- `push_subscriptions`

Server-owned (RLS enabled, no client policies):

- `flight_snapshots`
- `provider_cache`
- `airport_maps` (public read, service-role write)
- `osm_ingest_runs`

## Smoke test

A temporary auth user was created through the admin API, signed in with the publishable key, upserted its own profile, and inserted/read a tracked flight and alert. The user was deleted afterwards. This verifies the auth trigger and the RLS/grant path used by web and Android.

## Google OAuth

The Supabase Google provider still requires the Google Cloud OAuth client ID and secret. Configure it in Supabase Dashboard → Authentication → Providers → Google, then add the web and mobile redirect URLs:

- `http://localhost:3000/auth/callback`
- `https://app.2-31-110-53.sslip.io/auth/callback`
- production domain callback
- Android deep link / iOS URL scheme

Email magic-link auth remains available for testing until Google is configured.
