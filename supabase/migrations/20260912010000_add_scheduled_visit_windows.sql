-- Preserve the latest frontend's scheduled visit window in the existing
-- room_places.hard_constraint JSONB without changing the relational shape.

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

create or replace function public.patch_room_place(
  p_room_code text, p_host_token text, p_place_id text, p_patch jsonb
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
  from public.rooms r join public.room_host_secrets s on s.room_id = r.id
  where r.code = pg_catalog.upper(pg_catalog.btrim(p_room_code))
    and r.status = 'collecting'
    and s.token_hash = public.sync_trip_token_hash(p_host_token)
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

revoke execute on function public.get_room_snapshot(text) from public, anon, authenticated;
revoke execute on function public.patch_room_place(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.get_room_snapshot(text) to anon, authenticated;
grant execute on function public.patch_room_place(text, text, text, jsonb) to anon, authenticated;
