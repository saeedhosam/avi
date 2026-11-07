-- Billing webhook idempotency. Provider event ids are recorded after a
-- successful plan write so provider retries do not regrant/downgrade twice.

create table if not exists public.billing_events (
  provider text not null,
  event_id text not null,
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);

alter table public.billing_events enable row level security;
-- Service-role only: no client policies or grants.
grant select, insert on public.billing_events to service_role;
