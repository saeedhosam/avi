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
7. `unify_watchlist` - `watchlist_items` replaces `tracked_flights`
8. `watchlist_flight_date` - date-scoped watchlist entries
9. `plans_and_watchlist_identity` - `profiles.plan` (backend-only writes), column-level client grants, date-scoped `flight_id` backfill
10. `push_delivery` - `flight_alerts.delivered_at` watermark for the Web Push loop

## Client boundary

- Web and mobile use the **publishable** key and RLS.
- The API uses the **secret** key or service role only for server-owned caches,
  snapshots, alert generation, plan reads, and push delivery.
- The secret key must never be shipped in an APK, IPA, or web bundle.
- `profiles.plan` is enforced server-side (`FREE`/`PLUS`/`PRO` concurrency
  limits of 3/15/50 tracked flights); authenticated clients hold only
  column-level UPDATE/INSERT grants, so they cannot self-upgrade.

## Data model

User-owned:

- `profiles` (plan tier, backend-written)
- `watchlist_items` (PK `user_id, flight_id`; `flight_id` is date-scoped:
  `<COMPACT>-<YYYY-MM-DD>`)
- `flight_alerts` (engine-written, `delivered_at` push watermark)
- `device_tokens`
- `push_subscriptions`

Server-owned (RLS enabled, no client policies):

- `flight_snapshots`
- `provider_cache`
- `airport_maps` (public read, service-role write)
- `osm_ingest_runs`

## Watch engine & alerts

`services/api/src/engine` runs a per-flight lifecycle scheduler
(far-out entries free; operational windows get tight cadence) and writes
merged snapshots + change alerts. Realtime keeps open clients live; the
`delivered_at` watermark + VAPID keys power Web Push.

## Smoke test

A temporary auth user was created through the admin API, signed in with the publishable key, upserted its own profile, and inserted/read a tracked flight and alert. The user was deleted afterwards. This verifies the auth trigger and the RLS/grant path used by web and Android.

## Google OAuth

The Supabase Google provider still requires the Google Cloud OAuth client ID and secret. Configure it in Supabase Dashboard → Authentication → Providers → Google, then add the web and mobile redirect URLs:

- `http://localhost:3000/auth/callback`
- `https://app.2-31-110-53.sslip.io/auth/callback`
- production domain callback
- Android deep link / iOS URL scheme

Email magic-link auth remains available for testing until Google is configured.
