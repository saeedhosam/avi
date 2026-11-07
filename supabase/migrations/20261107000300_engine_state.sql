-- Engine durable state (P2 Track B).
--
-- The flight watch engine moves out of the gateway process into a dedicated
-- worker. Restarting or scaling the gateway no longer loses poll ladders or
-- re-emits alerts: the ladder lives in Postgres, and alert writes dedupe on a
-- unique index via `ON CONFLICT DO NOTHING`.

alter table public.watchlist_items
  add column if not exists next_poll_at timestamptz,
  add column if not exists poll_priority smallint;

comment on column public.watchlist_items.next_poll_at is
  'When the engine should poll this row again; engine-owned, cleared to NULL when settled.';
comment on column public.watchlist_items.poll_priority is
  'Engine priority band (1 = operational window, 9 = far-future).';

-- The first tick adopts every existing row; afterwards the ladder writes both
-- columns per row, so the engine only ever sees rows that are due.
update public.watchlist_items
set next_poll_at = now(), poll_priority = 5;

create index if not exists watchlist_items_next_poll_at_idx
  on public.watchlist_items (next_poll_at);

-- Alert replay safety: deduplication leaves in-memory `seenAlerts` and moves
-- to Postgres so restarts / dual writers cannot produce the same alert twice.
-- Existing duplicates are collapsed, keeping the earliest row.
delete from public.flight_alerts a
using public.flight_alerts b
where a.user_id = b.user_id
  and a.flight_number = b.flight_number
  and a.alert_type = b.alert_type
  and a.message = b.message
  and (a.created_at, a.ctid) > (b.created_at, b.ctid);

create unique index if not exists flight_alerts_replay_idx
  on public.flight_alerts (user_id, flight_number, alert_type, message);
