-- Protect the engine poll ladder from authenticated client writes.
--
-- Clients own membership, notes, and the client-side snapshot/status payload.
-- They must not be able to write next_poll_at / poll_priority: clearing both is
-- exactly the row shape the engine adopts as a legacy row and re-polls on every
-- tick, and supplying them on insert can force an immediate provider poll
-- (denial-of-wallet).
--
-- Column-level privileges are the primary guard for both INSERT and UPDATE.
-- The server-owned-fields trigger remains as defense-in-depth for updates: if
-- authenticated ever receives a broader grant, it restores the server values.
-- Service-role/engine table-level access is unchanged.

create or replace function public.preserve_watchlist_server_fields()
returns trigger
language plpgsql
as $$
begin
  -- PostgREST sets the JWT role for client requests. Service-role/engine
  -- writes bypass this branch and may update the snapshot, status, and ladder.
  if coalesce(auth.role(), '') = 'authenticated' then
    new.snapshot := old.snapshot;
    new.status := old.status;
    new.next_poll_at := old.next_poll_at;
    new.poll_priority := old.poll_priority;
  end if;
  return new;
end;
$$;

-- Replace the table-wide client grants with the exact columns the web and
-- Android upserts send. The poll ladder columns are deliberately absent.
revoke insert, update on public.watchlist_items from authenticated;

grant insert (
  user_id,
  flight_id,
  flight_number,
  flight_date,
  airline,
  origin_code,
  dest_code,
  status,
  notes,
  snapshot,
  updated_at
) on public.watchlist_items to authenticated;

grant update (
  user_id,
  flight_id,
  flight_number,
  flight_date,
  airline,
  origin_code,
  dest_code,
  status,
  notes,
  snapshot,
  updated_at
) on public.watchlist_items to authenticated;
