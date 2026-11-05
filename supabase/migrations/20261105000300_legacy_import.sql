-- Claim legacy Firestore data after the user signs in with Supabase.
-- Legacy rows are keyed by email because Firebase and Supabase user IDs differ.

create or replace function public.claim_legacy_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_legacy public.legacy_imports%rowtype;
  v_profile jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select email into v_email
  from auth.users
  where id = auth.uid();

  if v_email is null or v_email = '' then
    return;
  end if;

  select * into v_legacy
  from public.legacy_imports
  where lower(email) = lower(v_email)
    and claimed_at is null
  for update;

  if not found then
    return;
  end if;

  v_profile := coalesce(v_legacy.profile, '{}'::jsonb);

  insert into public.profiles (
    id, display_name, email, photo_url, home_airport, theme_preference
  )
  values (
    auth.uid(),
    left(
      coalesce(
        nullif(v_profile ->> 'displayName', ''),
        split_part(v_email, '@', 1),
        'Aviator'
      ),
      100
    ),
    left(v_email, 150),
    nullif(v_profile ->> 'photoUrl', ''),
    nullif(left(coalesce(v_profile ->> 'homeAirport', ''), 10), ''),
    case
      when v_profile ->> 'themePreference' in ('SYSTEM', 'LIGHT', 'DARK')
        then v_profile ->> 'themePreference'
      else 'SYSTEM'
    end
  )
  on conflict (id) do update
  set
    display_name = excluded.display_name,
    email = excluded.email,
    photo_url = excluded.photo_url,
    home_airport = excluded.home_airport,
    theme_preference = excluded.theme_preference,
    updated_at = now();

  insert into public.tracked_flights (
    user_id,
    flight_id,
    flight_number,
    airline,
    origin_code,
    dest_code,
    status,
    custom_notes,
    is_favorite,
    created_at,
    updated_at
  )
  select
    auth.uid(),
    left(coalesce(item ->> 'flightId', item ->> 'flightNumber'), 80),
    left(coalesce(item ->> 'flightNumber', item ->> 'flightId'), 20),
    left(coalesce(item ->> 'airline', ''), 100),
    left(coalesce(item ->> 'originCode', ''), 10),
    left(coalesce(item ->> 'destCode', ''), 10),
    left(coalesce(item ->> 'status', ''), 30),
    left(coalesce(item ->> 'customNotes', ''), 500),
    coalesce((item ->> 'isFavorite')::boolean, false),
    coalesce((item ->> 'createdAt')::timestamptz, now()),
    coalesce((item ->> 'updatedAt')::timestamptz, now())
  from jsonb_array_elements(coalesce(v_legacy.tracked_flights, '[]'::jsonb)) as item
  where coalesce(item ->> 'flightId', item ->> 'flightNumber') is not null
  on conflict (user_id, flight_id) do update
  set
    flight_number = excluded.flight_number,
    airline = excluded.airline,
    origin_code = excluded.origin_code,
    dest_code = excluded.dest_code,
    status = excluded.status,
    custom_notes = excluded.custom_notes,
    is_favorite = excluded.is_favorite,
    updated_at = now();

  insert into public.flight_alerts (
    id,
    user_id,
    flight_number,
    alert_type,
    title,
    message,
    is_read,
    created_at
  )
  select
    gen_random_uuid()::text,
    auth.uid(),
    left(coalesce(item ->> 'flightNumber', ''), 20),
    item ->> 'alertType',
    left(coalesce(item ->> 'title', 'Flight alert'), 200),
    left(coalesce(item ->> 'message', ''), 1000),
    coalesce((item ->> 'isRead')::boolean, false),
    coalesce((item ->> 'createdAt')::timestamptz, now())
  from jsonb_array_elements(coalesce(v_legacy.alerts, '[]'::jsonb)) as item
  where item ->> 'alertType' in (
    'GATE_CHANGE', 'DELAY', 'BOARDING', 'CANCELLATION', 'BAGGAGE'
  );

  update public.legacy_imports
  set claimed_at = now()
  where email = v_legacy.email;
end;
$$;

revoke all on function public.claim_legacy_data() from public;
grant execute on function public.claim_legacy_data() to authenticated;
