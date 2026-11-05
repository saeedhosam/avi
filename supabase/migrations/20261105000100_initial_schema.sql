-- Avi core schema: user-owned data plus server-owned provider/map caches.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 100),
  email text not null default '' check (char_length(email) <= 150),
  photo_url text,
  home_airport text check (home_airport is null or char_length(home_airport) <= 10),
  theme_preference text not null default 'SYSTEM'
    check (theme_preference in ('SYSTEM', 'LIGHT', 'DARK')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tracked_flights (
  user_id uuid not null references auth.users (id) on delete cascade,
  flight_id text not null check (char_length(flight_id) between 1 and 80),
  flight_number text not null check (char_length(flight_number) between 1 and 20),
  airline text not null default '' check (char_length(airline) <= 100),
  origin_code text not null default '' check (char_length(origin_code) <= 10),
  dest_code text not null default '' check (char_length(dest_code) <= 10),
  status text not null default '' check (char_length(status) <= 30),
  custom_notes text not null default '' check (char_length(custom_notes) <= 500),
  is_favorite boolean not null default false,
  snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, flight_id)
);

create table if not exists public.flight_alerts (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references auth.users (id) on delete cascade,
  flight_number text not null check (char_length(flight_number) between 1 and 20),
  alert_type text not null
    check (alert_type in ('GATE_CHANGE', 'DELAY', 'BOARDING', 'CANCELLATION', 'BAGGAGE')),
  title text not null check (char_length(title) between 1 and 200),
  message text not null check (char_length(message) between 1 and 1000),
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists flight_alerts_user_created_idx
  on public.flight_alerts (user_id, created_at desc);
create index if not exists flight_alerts_user_unread_idx
  on public.flight_alerts (user_id)
  where is_read = false;

create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('android', 'ios', 'web')),
  token text not null check (char_length(token) between 8 and 4096),
  app_version text check (app_version is null or char_length(app_version) <= 40),
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (platform, token)
);

create index if not exists device_tokens_user_idx
  on public.device_tokens (user_id);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 2048),
  p256dh text not null,
  auth text not null,
  platform text not null default 'web' check (platform in ('web', 'ios', 'android')),
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

-- Shared, server-owned flight snapshots. Clients read the backend API instead.
create table if not exists public.flight_snapshots (
  flight_key text primary key,
  flight_number text not null,
  snapshot jsonb not null,
  provider text not null default 'aerodatabox',
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists flight_snapshots_expires_idx
  on public.flight_snapshots (expires_at);

-- Provider responses are cached in Postgres so every app instance shares them.
create table if not exists public.provider_cache (
  cache_key text primary key,
  payload jsonb not null,
  status integer not null default 200,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists provider_cache_expires_idx
  on public.provider_cache (expires_at);

-- Normalized Overpass + curated map payloads, one row per airport.
create table if not exists public.airport_maps (
  iata text primary key check (iata ~ '^[A-Z]{3}$'),
  airfield jsonb,
  indoor jsonb,
  routing jsonb,
  source text not null default 'curated',
  osm_fetched_at timestamptz,
  curated_version text,
  updated_at timestamptz not null default now()
);

create table if not exists public.osm_ingest_runs (
  id uuid primary key default gen_random_uuid(),
  iata text not null,
  status text not null check (status in ('running', 'success', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error text
);

create index if not exists osm_ingest_runs_iata_idx
  on public.osm_ingest_runs (iata, started_at desc);

-- One-time migration staging from Firebase. Service-role only.
create table if not exists public.legacy_imports (
  email text primary key,
  profile jsonb not null default '{}'::jsonb,
  tracked_flights jsonb not null default '[]'::jsonb,
  alerts jsonb not null default '[]'::jsonb,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Keep updated_at accurate without client trust.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists tracked_flights_set_updated_at on public.tracked_flights;
create trigger tracked_flights_set_updated_at
  before update on public.tracked_flights
  for each row execute function public.set_updated_at();

drop trigger if exists flight_alerts_set_updated_at on public.flight_alerts;
create trigger flight_alerts_set_updated_at
  before update on public.flight_alerts
  for each row execute function public.set_updated_at();

-- Create a profile for every Supabase Auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email, photo_url)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Aviator'
    ),
    coalesce(new.email, ''),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
