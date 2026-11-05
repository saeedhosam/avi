-- Row-level security and explicit API grants.

alter table public.profiles enable row level security;
alter table public.tracked_flights enable row level security;
alter table public.flight_alerts enable row level security;
alter table public.device_tokens enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.flight_snapshots enable row level security;
alter table public.provider_cache enable row level security;
alter table public.airport_maps enable row level security;
alter table public.osm_ingest_runs enable row level security;
alter table public.legacy_imports enable row level security;

-- Profiles: owners read and update their own profile. Inserts come from the auth trigger.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Tracked flights: owners have full access to their own rows.
drop policy if exists "tracked_flights_own" on public.tracked_flights;
create policy "tracked_flights_own"
  on public.tracked_flights for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Alerts: owners read and mark their own alerts; the backend writes through service role.
drop policy if exists "flight_alerts_select_own" on public.flight_alerts;
create policy "flight_alerts_select_own"
  on public.flight_alerts for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "flight_alerts_update_own" on public.flight_alerts;
create policy "flight_alerts_update_own"
  on public.flight_alerts for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "flight_alerts_delete_own" on public.flight_alerts;
create policy "flight_alerts_delete_own"
  on public.flight_alerts for delete
  to authenticated
  using (auth.uid() = user_id);

-- Device tokens and web-push subscriptions.
drop policy if exists "device_tokens_own" on public.device_tokens;
create policy "device_tokens_own"
  on public.device_tokens for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "push_subscriptions_own" on public.push_subscriptions;
create policy "push_subscriptions_own"
  on public.push_subscriptions for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Map data is public reference data; writes remain service-role only.
drop policy if exists "airport_maps_public_read" on public.airport_maps;
create policy "airport_maps_public_read"
  on public.airport_maps for select
  to anon, authenticated
  using (true);

-- Server-owned tables have RLS enabled with no client policies:
-- flight_snapshots, provider_cache, osm_ingest_runs, legacy_imports.

-- Explicit privileges (the project has auto-expose enabled, but this keeps intent clear).
grant usage on schema public to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.tracked_flights to authenticated;
grant select, update, delete on public.flight_alerts to authenticated;
grant select, insert, update, delete on public.device_tokens to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select on public.airport_maps to anon, authenticated;
