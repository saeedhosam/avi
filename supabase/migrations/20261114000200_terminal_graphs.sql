-- OSM indoor graphs. Curated terminal plans remain the deterministic fallback;
-- the Overpass ingest script writes surveyed graphs here with explicit source.
create table if not exists public.terminal_graphs (
  airport_code text not null check (airport_code ~ '^[A-Z]{3}$'),
  terminal_id text not null check (char_length(terminal_id) between 1 and 32),
  graph jsonb not null,
  source text not null default 'osm_indoor'
    check (source in ('osm_indoor', 'curated', 'parametric')),
  fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (airport_code, terminal_id)
);

create index if not exists terminal_graphs_updated_idx
  on public.terminal_graphs (updated_at desc);

alter table public.terminal_graphs enable row level security;

drop policy if exists "terminal_graphs_read" on public.terminal_graphs;
create policy "terminal_graphs_read"
  on public.terminal_graphs for select
  to anon, authenticated
  using (true);

grant select on public.terminal_graphs to anon, authenticated;
