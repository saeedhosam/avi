-- Scope watchlist entries by operating date.
-- flight_date is the scheduled departure date of the flight in the departure
-- airport's local timezone (ISO YYYY-MM-DD). Legacy rows stay NULL, which the
-- web treats as "not date-scoped yet" and resolves to the current schedule.

alter table public.watchlist_items
  add column if not exists flight_date date;

comment on column public.watchlist_items.flight_date is
  'Scheduled departure date (ISO) in the departure airport local time; NULL = not date-scoped (legacy).';

-- Same flight number can be watched on different operating dates.
create index if not exists watchlist_items_flight_date_idx
  on public.watchlist_items (user_id, flight_number, flight_date);
