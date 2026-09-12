-- Three changes the latest UI needs.
--
-- 1. A trip sleeps somewhere. Each night between the first and last day starts and
--    ends at an accommodation instead of returning to the trip's start location.
-- 2. A trip of one is a trip. The two-person floor blocked solo planning outright.
-- 3. Stay time and removal belong to whoever is in the room, not only the host.
--    These functions now take a member ID rather than the host token. The accountless
--    design cannot prove who owns that ID, so this widens write access to anyone
--    holding the room code; it is the same trust boundary the README already
--    describes for adding places and submitting rankings.

alter table public.rooms
  add column if not exists accommodations jsonb not null default '[]'::jsonb;

alter table public.rooms
  drop constraint if exists rooms_accommodations_check;
alter table public.rooms
  add constraint rooms_accommodations_check
  check (jsonb_typeof(accommodations) = 'array' and jsonb_array_length(accommodations) <= 30);

-- No more accommodations than there are nights to spend in them.
alter table public.rooms
  drop constraint if exists rooms_accommodation_nights_check;
alter table public.rooms
  add constraint rooms_accommodation_nights_check
  check (jsonb_array_length(accommodations) <= greatest(0, (end_date - start_date)));

alter table public.rooms drop constraint if exists rooms_headcount_check;
alter table public.rooms add constraint rooms_headcount_check check (headcount between 1 and 12);

drop function if exists public.create_room(text, text, text, text, text, date, date, time, time, integer, text, jsonb, jsonb);

create or replace function public.create_room(
  p_code text, p_host_member_id text, p_host_token text, p_host_nickname text,
  p_title text, p_start_date date, p_end_date date, p_daily_start time,
  p_daily_end time, p_headcount integer, p_transport_mode text,
  p_origin jsonb, p_destination jsonb, p_accommodations jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room_id uuid;
  v_code text := pg_catalog.upper(pg_catalog.btrim(p_code));
  v_nights integer := greatest(0, (p_end_date - p_start_date));
  v_stays jsonb := coalesce(p_accommodations, '[]'::jsonb);
begin
  if length(p_host_token) < 32 then
    raise exception using errcode = '22023', message = 'Host token is invalid.';
  end if;
  if pg_catalog.jsonb_typeof(v_stays) <> 'array' then
    raise exception using errcode = '22023', message = 'Accommodations must be a list.';
  end if;
  if v_nights > 0 and pg_catalog.jsonb_array_length(v_stays) = 0 then
    raise exception using errcode = '22023', message = 'A trip with a night needs an accommodation.';
  end if;
  if pg_catalog.jsonb_array_length(v_stays) > v_nights then
    raise exception using errcode = '22023', message = 'There are more accommodations than nights.';
  end if;
  insert into public.rooms (
    code, title, host_member_id, start_date, end_date, daily_start, daily_end,
    headcount, transport_mode, origin, destination, accommodations
  ) values (
    v_code, p_title, p_host_member_id, p_start_date, p_end_date, p_daily_start, p_daily_end,
    p_headcount, p_transport_mode, p_origin, p_destination, v_stays
  ) returning id into v_room_id;
  insert into public.room_host_secrets (room_id, token_hash)
  values (v_room_id, public.sync_trip_token_hash(p_host_token));
  insert into public.room_members (room_id, member_id, nickname, is_host)
  values (v_room_id, p_host_member_id, p_host_nickname, true);
  return public.get_room_snapshot(v_code);
end;
$$;

-- The snapshot gains the accommodation list; everything else is unchanged.
create or replace function public.get_room_snapshot(p_room_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'roomId', r.id,
    'code', r.code,
    'status', r.status,
    'title', r.title,
    'hostId', r.host_member_id,
    'startDate', r.start_date,
    'endDate', r.end_date,
    'dailyStart', pg_catalog.to_char(r.daily_start, 'HH24:MI'),
    'dailyEnd', pg_catalog.to_char(r.daily_end, 'HH24:MI'),
    'headcount', r.headcount,
    'transportMode', r.transport_mode,
    'origin', r.origin,
    'destination', r.destination,
    'accommodations', r.accommodations,
    'optimizationState', r.optimization_state,
    'optimizationOwner', r.optimization_owner,
    'optimizationRunId', r.optimization_nonce,
    'optimizationStartedAt', r.optimization_started_at,
    'optimizationFinishedAt', r.optimization_finished_at,
    'confirmedRouteId', r.confirmed_route_type,
    'createdAt', r.created_at,
    'updatedAt', r.updated_at,
    'members', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', m.member_id, 'nickname', m.nickname, 'isHost', m.is_host, 'submitted', m.submitted
      ) order by m.joined_at, m.member_id)
      from public.room_members m where m.room_id = r.id
    ), '[]'::jsonb),
    'places', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', p.place_id, 'name', p.name, 'category', p.category, 'address', p.address,
        'lat', p.lat, 'lng', p.lng, 'minStay', p.stay_time_min, 'maxStay', p.stay_time_max,
        'openTime', case when p.open_time is null then null else pg_catalog.to_char(p.open_time, 'HH24:MI') end,
        'closeTime', case when p.close_time is null then null else pg_catalog.to_char(p.close_time, 'HH24:MI') end,
        'visitWindow', p.hard_constraint,
        'fixedTime', case
          when p.hard_constraint ->> 'start' = p.hard_constraint ->> 'end' then p.hard_constraint ->> 'start'
          else null
        end,
        'bestTime', case when p.best_time is null then null else pg_catalog.to_char(p.best_time, 'HH24:MI') end,
        'isFixed', p.required, 'kakaoId', p.kakao_id, 'addedBy', p.added_by, 'hoursSource', p.hours_source
      ) order by p.created_at, p.place_id)
      from public.room_places p where p.room_id = r.id
    ), '[]'::jsonb),
    'preferences', coalesce((
      select pg_catalog.jsonb_object_agg(pr.member_id, pr.ranking)
      from public.room_preferences pr where pr.room_id = r.id
    ), '{}'::jsonb),
    'routes', coalesce((select rr.payload from public.room_routes rr where rr.room_id = r.id), '[]'::jsonb),
    'error', (select pg_catalog.jsonb_build_object(
      'code', e.code, 'message', e.message, 'placeIds', e.place_ids
    ) from public.room_errors e where e.room_id = r.id),
    'finalVotes', coalesce((
      select pg_catalog.jsonb_object_agg(v.member_id, v.route_type)
      from public.room_final_votes v where v.room_id = r.id
    ), '{}'::jsonb)
  )
  from public.rooms r
  where r.code = pg_catalog.upper(pg_catalog.btrim(p_room_code));
$$;

-- Editing times and removing a place move from the host token to room membership.
-- The parameter types are unchanged, so the old definitions are dropped by name first.
drop function if exists public.patch_room_place(text, text, text, jsonb);
drop function if exists public.remove_room_place(text, text, text);

create function public.patch_room_place(
  p_room_code text, p_member_id text, p_place_id text, p_patch jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room_id uuid;
  v_window jsonb;
  v_window_start time;
  v_window_end time;
begin
  if exists (
    select 1 from pg_catalog.jsonb_object_keys(p_patch) key
    where key not in ('openTime', 'closeTime', 'fixedTime', 'visitWindow', 'bestTime', 'minStay', 'maxStay', 'isFixed', 'hoursSource')
  ) then
    raise exception using errcode = '22023', message = 'Unsupported place patch.';
  end if;

  if p_patch ? 'visitWindow' and p_patch -> 'visitWindow' <> 'null'::jsonb then
    v_window := p_patch -> 'visitWindow';
    if pg_catalog.jsonb_typeof(v_window) <> 'object'
      or v_window ->> 'start' is null or v_window ->> 'end' is null then
      raise exception using errcode = '22023', message = 'Visit window is invalid.';
    end if;
    v_window_start := (v_window ->> 'start')::time;
    v_window_end := (v_window ->> 'end')::time;
    if v_window_end < v_window_start then
      raise exception using errcode = '22023', message = 'Visit window ends before it starts.';
    end if;
    v_window := pg_catalog.jsonb_build_object(
      'start', pg_catalog.to_char(v_window_start, 'HH24:MI'),
      'end', pg_catalog.to_char(v_window_end, 'HH24:MI')
    );
  end if;

  select r.id into v_room_id
  from public.rooms r
  where r.code = pg_catalog.upper(pg_catalog.btrim(p_room_code))
    and r.status = 'collecting'
    and exists (
      select 1 from public.room_members m
      where m.room_id = r.id and m.member_id = p_member_id
    )
  for share of r;

  update public.room_places set
    open_time = case when p_patch ? 'openTime' then nullif(p_patch ->> 'openTime', '')::time else open_time end,
    close_time = case when p_patch ? 'closeTime' then nullif(p_patch ->> 'closeTime', '')::time else close_time end,
    hard_constraint = case
      when p_patch ? 'visitWindow' then case when p_patch -> 'visitWindow' = 'null'::jsonb then null else v_window end
      when p_patch ? 'fixedTime' then case
        when nullif(p_patch ->> 'fixedTime', '') is null then null
        else pg_catalog.jsonb_build_object('start', p_patch ->> 'fixedTime', 'end', p_patch ->> 'fixedTime')
      end
      else hard_constraint
    end,
    best_time = case when p_patch ? 'bestTime' then nullif(p_patch ->> 'bestTime', '')::time else best_time end,
    stay_time_min = case when p_patch ? 'minStay' then (p_patch ->> 'minStay')::integer else stay_time_min end,
    stay_time_max = case when p_patch ? 'maxStay' then (p_patch ->> 'maxStay')::integer else stay_time_max end,
    required = case when p_patch ? 'isFixed' then (p_patch ->> 'isFixed')::boolean else required end,
    hours_source = case when p_patch ? 'hoursSource' then p_patch ->> 'hoursSource' else hours_source end
  where room_id = v_room_id and place_id = p_place_id;
  return found;
end;
$$;

create function public.remove_room_place(p_room_code text, p_member_id text, p_place_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_room_id uuid;
begin
  select r.id into v_room_id
  from public.rooms r
  where r.code = pg_catalog.upper(pg_catalog.btrim(p_room_code))
    and r.status = 'collecting'
    and exists (
      select 1 from public.room_members m
      where m.room_id = r.id and m.member_id = p_member_id
    )
  for share of r;
  update public.room_preferences pr set ranking = coalesce((
    select pg_catalog.jsonb_agg(item.value order by item.ordinality)
    from pg_catalog.jsonb_array_elements_text(pr.ranking) with ordinality item(value, ordinality)
    where item.value <> p_place_id
  ), '[]'::jsonb) where pr.room_id = v_room_id and pr.ranking ? p_place_id;
  delete from public.room_places where room_id = v_room_id and place_id = p_place_id;
  return found;
end;
$$;

revoke execute on function public.create_room(text, text, text, text, text, date, date, time, time, integer, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.get_room_snapshot(text) from public, anon, authenticated;
revoke execute on function public.patch_room_place(text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.remove_room_place(text, text, text) from public, anon, authenticated;
grant execute on function public.create_room(text, text, text, text, text, date, date, time, time, integer, text, jsonb, jsonb, jsonb) to anon, authenticated;
grant execute on function public.get_room_snapshot(text) to anon, authenticated;
grant execute on function public.patch_room_place(text, text, text, jsonb) to anon, authenticated;
grant execute on function public.remove_room_place(text, text, text) to anon, authenticated;
