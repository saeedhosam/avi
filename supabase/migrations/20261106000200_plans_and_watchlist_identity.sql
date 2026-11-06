-- Plan tiering (P1 Track A) + date-scoped watchlist identity (P1 Track B).

-- 1. Plans live on profiles; only backend code writes the column.
alter table public.profiles
  add column if not exists plan text not null default 'FREE';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass and conname = 'profiles_plan_check'
  ) then
    alter table public.profiles
      add constraint profiles_plan_check check (plan in ('FREE', 'PLUS', 'PRO'));
  end if;
end;
$$;

-- Column-level grants: clients may still read their profile and update only the
-- fields they own. `plan` becomes tamper-proof for authenticated clients, which
-- matters because the watch engine enforces cadence from this column.
-- (updated_at stays updatable so the set_updated_at trigger can fire.)
revoke update on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, email, photo_url, home_airport, theme_preference, updated_at)
  on public.profiles to authenticated;

revoke insert on public.profiles from authenticated;
grant insert (id, display_name, email, photo_url, home_airport, theme_preference, updated_at)
  on public.profiles to authenticated;

-- 2. Date-scope legacy watchlist rows so the same flight number watched on
-- different operating dates no longer collides on (user_id, flight_id).
-- Rows created by the current client carry `flight_date`; older rows only
-- recorded the operating date inside the snapshot.
update public.watchlist_items
set flight_date = coalesce(flight_date, nullif(snapshot ->> 'flightDate', '')::date)
where flight_date is null
  and snapshot is not null
  and snapshot ->> 'flightDate' ~ '^\d{4}-\d{2}-\d{2}$';

-- Rewrite read-only identity to the date-scoped form the client now writes
-- ("<COMPACT>-<YYYY-MM-DD>"). The NOT LIKE guard makes this idempotent.
update public.watchlist_items
set flight_id = flight_id || '-' || to_char(flight_date, 'YYYY-MM-DD')
where flight_date is not null
  and flight_id not like '%-%';
