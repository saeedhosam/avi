-- Enable Realtime for user-owned rows that benefit from live cross-device sync.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tracked_flights'
  ) then
    alter publication supabase_realtime add table public.tracked_flights;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'flight_alerts'
  ) then
    alter publication supabase_realtime add table public.flight_alerts;
  end if;
end;
$$;
