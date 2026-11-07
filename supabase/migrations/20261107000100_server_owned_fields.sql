-- Server-owned watchlist snapshots and alerts.
--
-- Clients own watchlist membership and notes. The watch engine owns the
-- snapshot/status payload so a stale client upsert can never overwrite fresher
-- server data. Alerts are engine-owned as well; clients only read them and
-- mark them read.

create or replace function public.preserve_watchlist_server_fields()
returns trigger
language plpgsql
as $$
begin
  -- PostgREST sets the JWT role for client requests. Service-role/engine
  -- writes bypass this branch and may update the snapshot and status.
  if coalesce(auth.role(), '') = 'authenticated' then
    new.snapshot := old.snapshot;
    new.status := old.status;
  end if;
  return new;
end;
$$;

drop trigger if exists watchlist_items_preserve_server_fields on public.watchlist_items;
create trigger watchlist_items_preserve_server_fields
  before update on public.watchlist_items
  for each row execute function public.preserve_watchlist_server_fields();

-- Alerts are written by the engine (service role) only. Clients may still
-- mark their own alerts read.
drop policy if exists "flight_alerts_insert_own" on public.flight_alerts;
revoke insert on public.flight_alerts from authenticated;

revoke update on public.flight_alerts from authenticated;
grant update (is_read, updated_at) on public.flight_alerts to authenticated;

-- The engine reads the least-recently-updated rows first (round-robin under
-- the row limit) and the daily purge filters on updated_at.
create index if not exists watchlist_items_updated_at_idx
  on public.watchlist_items (updated_at);
