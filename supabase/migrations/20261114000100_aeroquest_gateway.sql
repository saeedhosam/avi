-- AeroQuest: terminal-change alerts, cabin layout cache, Starter gateway cache,
-- trip-pass expiry, and fog-of-war passport visits.

-- 1. Terminal changes are a distinct operational event (separate from gate).
alter table public.flight_alerts
  drop constraint if exists flight_alerts_alert_type_check;
alter table public.flight_alerts
  add constraint flight_alerts_alert_type_check
  check (alert_type in (
    'GATE_CHANGE',
    'TERMINAL_CHANGE',
    'DELAY',
    'BOARDING',
    'CANCELLATION',
    'BAGGAGE'
  ));

-- 2. Trip pass is a time-boxed entitlement; plan remains FREE/PLUS/PRO.
alter table public.profiles
  add column if not exists trip_pass_expires_at timestamptz;

-- 3. Resolved cabin layouts are shared across users and devices.
create table if not exists public.cabin_layouts (
  aircraft_type text primary key check (char_length(aircraft_type) between 2 and 12),
  layout jsonb not null,
  source text not null default 'PARAMETRIC'
    check (source in ('CURATED', 'PARAMETRIC', 'SUPABASE_CACHE')),
  fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cabin_layouts_updated_idx
  on public.cabin_layouts (updated_at desc);

alter table public.cabin_layouts enable row level security;

drop policy if exists "cabin_layouts_read" on public.cabin_layouts;
create policy "cabin_layouts_read"
  on public.cabin_layouts for select
  to anon, authenticated
  using (true);

grant select on public.cabin_layouts to anon, authenticated;

-- 4. Optional Postgres tier for gateway payloads. Redis remains the hot cache;
-- this table keeps long-lived route/aircraft payloads across restarts.
create table if not exists public.gateway_cache (
  cache_key text primary key check (char_length(cache_key) <= 512),
  payload jsonb not null,
  source text not null check (source in ('AERODATABOX', 'OPEN_METEO', 'SUPABASE')),
  fetched_at timestamptz not null default now(),
  fresh_until timestamptz not null,
  expires_at timestamptz not null
);

create index if not exists gateway_cache_expires_idx
  on public.gateway_cache (expires_at);

alter table public.gateway_cache enable row level security;
-- No client policies: service-role only.

-- 5. Fog-of-war passport. Terminal visits are unique per user/level; aircraft
-- visits are tracked separately because one walk can add an aircraft type.
create table if not exists public.passport_visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  airport_code text not null check (airport_code ~ '^[A-Z]{3}$'),
  terminal_id text not null check (char_length(terminal_id) between 1 and 32),
  level integer not null check (level between 0 and 9),
  aircraft_type text check (aircraft_type is null or char_length(aircraft_type) <= 12),
  first_visited_at timestamptz not null default now(),
  last_visited_at timestamptz not null default now(),
  unique (user_id, airport_code, terminal_id, level)
);

create table if not exists public.passport_aircraft_visits (
  user_id uuid not null references auth.users (id) on delete cascade,
  aircraft_type text not null check (char_length(aircraft_type) between 2 and 12),
  first_visited_at timestamptz not null default now(),
  last_visited_at timestamptz not null default now(),
  primary key (user_id, aircraft_type)
);

alter table public.passport_visits enable row level security;
alter table public.passport_aircraft_visits enable row level security;

drop policy if exists "passport_visits_own" on public.passport_visits;
create policy "passport_visits_own"
  on public.passport_visits for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "passport_aircraft_own" on public.passport_aircraft_visits;
create policy "passport_aircraft_own"
  on public.passport_aircraft_visits for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.passport_visits to authenticated;
grant select, insert, update, delete on public.passport_aircraft_visits to authenticated;
