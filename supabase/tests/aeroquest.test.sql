begin;

select plan(12);

-- AeroQuest tables must all have RLS enabled.
select is(
  (select relrowsecurity from pg_class where oid = 'public.cabin_layouts'::regclass),
  true,
  'cabin_layouts has RLS enabled'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.terminal_graphs'::regclass),
  true,
  'terminal_graphs has RLS enabled'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.gateway_cache'::regclass),
  true,
  'gateway_cache has RLS enabled'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.passport_visits'::regclass),
  true,
  'passport_visits has RLS enabled'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.passport_aircraft_visits'::regclass),
  true,
  'passport_aircraft_visits has RLS enabled'
);

-- Reference data is intentionally public.
select is(
  has_table_privilege('anon', 'public.cabin_layouts', 'SELECT'),
  true,
  'anon can read cabin layouts'
);

select is(
  has_table_privilege('anon', 'public.terminal_graphs', 'SELECT'),
  true,
  'anon can read ingested terminal graphs'
);

-- Gateway cache is service-role only.
select is(
  has_table_privilege('authenticated', 'public.gateway_cache', 'SELECT'),
  false,
  'authenticated cannot read the provider cache'
);

select is(
  has_table_privilege('anon', 'public.gateway_cache', 'SELECT'),
  false,
  'anon cannot read the provider cache'
);

-- Passport writes belong to the authenticated owner via RLS.
select is(
  has_table_privilege('authenticated', 'public.passport_visits', 'INSERT'),
  true,
  'authenticated can insert their own passport visit subject to RLS'
);

select is(
  has_column_privilege('authenticated', 'public.profiles', 'trip_pass_expires_at', 'UPDATE'),
  false,
  'clients cannot grant themselves a trip pass'
);

select ok(
  (select pg_get_constraintdef(oid)
   from pg_constraint
   where conrelid = 'public.flight_alerts'::regclass
     and conname = 'flight_alerts_alert_type_check') like '%TERMINAL_CHANGE%',
  'flight_alerts accepts TERMINAL_CHANGE alongside existing alert types'
);

select * from finish();
rollback;
