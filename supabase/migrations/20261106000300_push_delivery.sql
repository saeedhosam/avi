-- Push delivery groundwork (P1 Track C).

-- Alerts are consumed once by the gateway push delivery loop; delivered_at
-- doubles as the watermark so each alert is sent at most one cycle.
alter table public.flight_alerts
  add column if not exists delivered_at timestamptz;

create index if not exists flight_alerts_undelivered_idx
  on public.flight_alerts (created_at)
  where delivered_at is null;

-- Service-role writes only; the RLS policies from the initial schema already
-- gate client access to device tokens and subscriptions.
