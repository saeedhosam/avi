-- Scope flight_alerts deduplication to flight_date (P3 Quality Pass).
--
-- The previous replay index on (user_id, flight_number, alert_type, message)
-- lacked flight_date or temporal window, permanently dropping legitimate
-- alerts for daily/recurring flights or repeated operational revisions.

alter table public.flight_alerts
  add column if not exists flight_date text
  check (flight_date is null or flight_date ~ '^\d{4}-\d{2}-\d{2}$');

comment on column public.flight_alerts.flight_date is
  'ISO YYYY-MM-DD operating date of the flight; scopes alerts so recurring numbers receive alerts per flight leg.';

-- Backfill existing rows from watchlist_items if available, or created_at date (formatted in UTC)
update public.flight_alerts fa
set flight_date = coalesce(
  fa.flight_date,
  (
    select wi.flight_date::text
    from public.watchlist_items wi
    where wi.user_id = fa.user_id
      and (wi.flight_number = fa.flight_number or replace(wi.flight_number, ' ', '') = replace(fa.flight_number, ' ', ''))
      and wi.flight_date is not null
    order by wi.updated_at desc
    limit 1
  ),
  substring((fa.created_at at time zone 'UTC')::text from 1 for 10)
)
where fa.flight_date is null;

-- Recreate the unique replay index with flight_date included
drop index if exists public.flight_alerts_replay_idx;

create unique index if not exists flight_alerts_replay_idx
  on public.flight_alerts (user_id, flight_number, coalesce(flight_date, ''), alert_type, message);

-- Add retention cleanup helper for alerts older than 30 days
create or replace function public.prune_stale_alerts(days_retention integer default 30)
returns integer
language plpgsql
security definer
as $$
declare
  purged_count integer;
begin
  delete from public.flight_alerts
  where created_at < now() - (days_retention || ' days')::interval;
  get diagnostics purged_count = row_count;
  return purged_count;
end;
$$;
