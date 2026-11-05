begin;

select plan(5);

-- RLS must be enabled on every user-owned table.
select is(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  true,
  'profiles has RLS enabled'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.tracked_flights'::regclass),
  true,
  'tracked_flights has RLS enabled'
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

select * from finish();
rollback;
