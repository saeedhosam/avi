-- Expo push receipts. Ticket ids are returned synchronously by the send
-- endpoint, but DeviceNotRegistered only surfaces asynchronously from
-- /--/api/v2/push/getReceipts. Persisting tickets lets the gateway poll once,
-- prune dead tokens, and never re-poll a ticket that already resolved.
create table if not exists public.expo_push_receipts (
  ticket_id text primary key check (char_length(ticket_id) between 1 and 200),
  token text not null check (char_length(token) between 8 and 4096),
  alert_id text references public.flight_alerts (id) on delete cascade,
  created_at timestamptz not null default now(),
  checked_at timestamptz
);

create index if not exists expo_push_receipts_unchecked_idx
  on public.expo_push_receipts (created_at)
  where checked_at is null;

create index if not exists expo_push_receipts_created_idx
  on public.expo_push_receipts (created_at desc);

alter table public.expo_push_receipts enable row level security;
-- No client policies: the gateway writes and reads this table with the
-- service role only.
