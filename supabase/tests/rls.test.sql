begin;

select plan(8);

-- RLS must be enabled on every user-owned table.
select is(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  true,
  'profiles has RLS enabled'
);

-- The plan column must be backend-only: after column-level grants the
-- authenticated role must not hold table-wide UPDATE (which would cover plan).
select is(
  has_table_privilege('authenticated', 'public.profiles', 'UPDATE'),
  false,
  'authenticated cannot update arbitrary profile columns (plan is protected)'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.watchlist_items'::regclass),
  true,
  'watchlist_items has RLS enabled'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.flight_alerts'::regclass),
  true,
  'flight_alerts has RLS enabled'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.device_tokens'::regclass),
  true,
  'device_tokens has RLS enabled'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.push_subscriptions'::regclass),
  true,
  'push_subscriptions has RLS enabled'
);

select is(
  has_table_privilege('authenticated', 'public.flight_alerts', 'INSERT'),
  false,
  'alerts are engine-owned (clients cannot insert)'
);

select is(
  has_column_privilege('authenticated', 'public.flight_alerts', 'message', 'UPDATE'),
  false,
  'clients cannot rewrite alert content'
);

select * from finish();
rollback;
