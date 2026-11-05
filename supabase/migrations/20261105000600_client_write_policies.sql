-- Clients create their own profile with an upsert after the auth trigger has run.
-- Alerts are also written by clients today; the backend alert engine comes later.

grant insert on public.profiles to authenticated;

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

grant insert on public.flight_alerts to authenticated;

drop policy if exists "flight_alerts_insert_own" on public.flight_alerts;
create policy "flight_alerts_insert_own"
  on public.flight_alerts for insert
  to authenticated
  with check (auth.uid() = user_id);
