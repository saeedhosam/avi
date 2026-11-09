begin;

select plan(18);

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

-- The poll ladder is engine-owned: clients must not be able to seed it on
-- insert or rewrite it on update (either would force paid provider polls).
select is(
  has_column_privilege('authenticated', 'public.watchlist_items', 'next_poll_at', 'INSERT'),
  false,
  'clients cannot set next_poll_at on insert'
);

select is(
  has_column_privilege('authenticated', 'public.watchlist_items', 'next_poll_at', 'UPDATE'),
  false,
  'clients cannot rewrite next_poll_at'
);

select is(
  has_column_privilege('authenticated', 'public.watchlist_items', 'poll_priority', 'INSERT'),
  false,
  'clients cannot set poll_priority on insert'
);

select is(
  has_column_privilege('authenticated', 'public.watchlist_items', 'poll_priority', 'UPDATE'),
  false,
  'clients cannot rewrite poll_priority'
);

-- The client-owned upsert columns must remain writable, otherwise saving a
-- watchlist entry breaks even though the poll ladder is protected.
select is(
  has_column_privilege('authenticated', 'public.watchlist_items', 'notes', 'UPDATE'),
  true,
  'clients can still edit notes'
);

select is(
  has_column_privilege('authenticated', 'public.watchlist_items', 'notes', 'INSERT'),
  true,
  'clients can still insert notes'
);

select is(
  has_column_privilege('authenticated', 'public.watchlist_items', 'snapshot', 'INSERT'),
  true,
  'clients can still insert the snapshot payload'
);

select is(
  has_column_privilege('authenticated', 'public.watchlist_items', 'snapshot', 'UPDATE'),
  true,
  'clients can still send the snapshot payload on upsert (trigger restores it)'
);

select is(
  has_column_privilege('authenticated', 'public.watchlist_items', 'status', 'INSERT'),
  true,
  'clients can still insert the status payload'
);

select is(
  has_column_privilege('authenticated', 'public.watchlist_items', 'status', 'UPDATE'),
  true,
  'clients can still send the status payload on upsert (trigger restores it)'
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
