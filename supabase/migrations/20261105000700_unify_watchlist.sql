-- Unify "favorite" and "tracked" into a single watchlist concept.
-- Existing tracked flights are preserved as watchlist items.

create table if not exists public.watchlist_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  flight_id text not null check (char_length(flight_id) between 1 and 80),
  flight_number text not null check (char_length(flight_number) between 1 and 20),
  airline text not null default '' check (char_length(airline) <= 100),
  origin_code text not null default '' check (char_length(origin_code) <= 10),
  dest_code text not null default '' check (char_length(dest_code) <= 10),
  status text not null default '' check (char_length(status) <= 30),
  notes text not null default '' check (char_length(notes) <= 500),
  snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, flight_id)
);

insert into public.watchlist_items (
  user_id, flight_id, flight_number, airline, origin_code, dest_code,
  status, notes, snapshot, created_at, updated_at
)
select
  user_id, flight_id, flight_number, airline, origin_code, dest_code,
  status, custom_notes, snapshot, created_at, updated_at
from public.tracked_flights
on conflict (user_id, flight_id) do nothing;

-- Remove the old publication entry before dropping the table.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tracked_flights'
  ) then
    alter publication supabase_realtime drop table public.tracked_flights;
  end if;
end;
$$;

drop table if exists public.tracked_flights cascade;

alter table public.watchlist_items enable row level security;

drop policy if exists "watchlist_items_own" on public.watchlist_items;
create policy "watchlist_items_own"
  on public.watchlist_items for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.watchlist_items to authenticated;

drop trigger if exists watchlist_items_set_updated_at on public.watchlist_items;
create trigger watchlist_items_set_updated_at
  before update on public.watchlist_items
  for each row execute function public.set_updated_at();

create index if not exists watchlist_items_user_updated_idx
  on public.watchlist_items (user_id, updated_at desc);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'watchlist_items'
  ) then
    alter publication supabase_realtime add table public.watchlist_items;
  end if;
end;
$$;
