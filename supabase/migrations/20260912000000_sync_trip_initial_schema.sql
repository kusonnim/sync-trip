create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code varchar(4) not null unique check (code ~ '^[A-HJ-NP-Z2-9]{4}$'),
  status text not null default 'setup' check (status in ('setup', 'collecting', 'analyzing', 'voting', 'confirmed')),
  title varchar(100) not null check (length(trim(title)) > 0),
  host_member_id varchar(80) not null check (host_member_id ~ '^m-[a-f0-9]{24}$'),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  daily_start time not null,
  daily_end time not null,
  headcount integer not null check (headcount between 2 and 12),
  transport_mode text not null check (transport_mode in ('car', 'transit')),
  origin jsonb not null check (jsonb_typeof(origin) = 'object'),
  destination jsonb not null check (jsonb_typeof(destination) = 'object'),
  optimization_state text not null default 'idle' check (optimization_state in ('idle', 'running', 'complete')),
  optimization_owner varchar(80),
  optimization_nonce uuid,
  optimization_started_at timestamptz,
  optimization_finished_at timestamptz,
  confirmed_route_type text check (confirmed_route_type is null or confirmed_route_type in ('min_time', 'min_cost')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Host proofs are intentionally excluded from client-selectable and Realtime tables.
create table public.room_host_secrets (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  token_hash text not null check (length(token_hash) = 64)
);

create table public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  member_id varchar(80) not null check (member_id ~ '^m-[a-f0-9]{24}$'),
  nickname varchar(40) not null check (length(trim(nickname)) > 0),
  is_host boolean not null default false,
  submitted boolean not null default false,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (room_id, member_id)
);

alter table public.rooms add constraint rooms_host_member_fk
foreign key (id, host_member_id) references public.room_members(room_id, member_id)
deferrable initially deferred;

alter table public.rooms add constraint rooms_optimization_owner_fk
foreign key (id, optimization_owner) references public.room_members(room_id, member_id)
deferrable initially deferred;

create table public.room_places (
  room_id uuid not null references public.rooms(id) on delete cascade,
  place_id varchar(200) not null,
  name varchar(200) not null check (length(trim(name)) > 0),
  category text not null check (category in ('restaurant', 'cafe', 'attraction', 'museum', 'shopping')),
  address text not null default '',
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  stay_time_min integer not null check (stay_time_min > 0),
  stay_time_max integer not null check (stay_time_max >= stay_time_min),
  open_time time,
  close_time time,
  hard_constraint jsonb check (hard_constraint is null or jsonb_typeof(hard_constraint) = 'object'),
  best_time time,
  required boolean not null default false,
  kakao_id text,
  added_by varchar(80),
  hours_source text check (hours_source is null or hours_source in ('google', 'default', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (room_id, place_id),
  foreign key (room_id, added_by) references public.room_members(room_id, member_id)
);

create table public.room_preferences (
  room_id uuid not null references public.rooms(id) on delete cascade,
  member_id varchar(80) not null,
  ranking jsonb not null check (jsonb_typeof(ranking) = 'array' and jsonb_array_length(ranking) <= 10),
  updated_at timestamptz not null default now(),
  primary key (room_id, member_id),
  foreign key (room_id, member_id) references public.room_members(room_id, member_id) on delete cascade
);

create table public.room_routes (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  optimization_nonce uuid not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'array' and jsonb_array_length(payload) <= 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.room_errors (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  optimization_nonce uuid not null,
  code varchar(80) not null,
  message varchar(500) not null,
  place_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(place_ids) = 'array' and jsonb_array_length(place_ids) <= 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.room_final_votes (
  room_id uuid not null references public.rooms(id) on delete cascade,
  member_id varchar(80) not null,
  route_type text not null check (route_type in ('min_time', 'min_cost')),
  updated_at timestamptz not null default now(),
  primary key (room_id, member_id),
  foreign key (room_id, member_id) references public.room_members(room_id, member_id) on delete cascade
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

create trigger rooms_set_updated_at before update on public.rooms
for each row execute function public.set_updated_at();
create trigger members_set_updated_at before update on public.room_members
for each row execute function public.set_updated_at();
create trigger places_set_updated_at before update on public.room_places
for each row execute function public.set_updated_at();
create trigger preferences_set_updated_at before update on public.room_preferences
for each row execute function public.set_updated_at();
create trigger routes_set_updated_at before update on public.room_routes
for each row execute function public.set_updated_at();
create trigger errors_set_updated_at before update on public.room_errors
for each row execute function public.set_updated_at();
create trigger votes_set_updated_at before update on public.room_final_votes
for each row execute function public.set_updated_at();

create or replace function public.sync_trip_token_hash(p_token text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select pg_catalog.encode(extensions.digest(pg_catalog.convert_to(p_token, 'UTF8'), 'sha256'), 'hex');
$$;

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
        'fixedTime', p.hard_constraint ->> 'start',
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

create or replace function public.create_room(
  p_code text, p_host_member_id text, p_host_token text, p_host_nickname text,
  p_title text, p_start_date date, p_end_date date, p_daily_start time,
  p_daily_end time, p_headcount integer, p_transport_mode text,
  p_origin jsonb, p_destination jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room_id uuid;
  v_code text := pg_catalog.upper(pg_catalog.btrim(p_code));
begin
  if length(p_host_token) < 32 then
    raise exception using errcode = '22023', message = 'Host token is invalid.';
  end if;
  insert into public.rooms (
    code, title, host_member_id, start_date, end_date, daily_start, daily_end,
    headcount, transport_mode, origin, destination
  ) values (
    v_code, p_title, p_host_member_id, p_start_date, p_end_date, p_daily_start, p_daily_end,
    p_headcount, p_transport_mode, p_origin, p_destination
  ) returning id into v_room_id;
  insert into public.room_host_secrets (room_id, token_hash)
  values (v_room_id, public.sync_trip_token_hash(p_host_token));
  insert into public.room_members (room_id, member_id, nickname, is_host)
  values (v_room_id, p_host_member_id, p_host_nickname, true);
  return public.get_room_snapshot(v_code);
end;
$$;

create or replace function public.join_room(p_room_code text, p_member_id text, p_nickname text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room_id uuid;
  v_headcount integer;
begin
  select id, headcount into v_room_id, v_headcount from public.rooms
  where code = pg_catalog.upper(pg_catalog.btrim(p_room_code))
  for update;
  if v_room_id is null then return false; end if;
  if not exists (
    select 1 from public.room_members where room_id = v_room_id and member_id = p_member_id
  ) and (select count(*) from public.room_members where room_id = v_room_id) >= v_headcount then
    raise exception using errcode = '22023', message = 'This room already has its configured number of members.';
  end if;
  insert into public.room_members (room_id, member_id, nickname, is_host)
  values (v_room_id, p_member_id, p_nickname, false)
  on conflict (room_id, member_id) do update
  set nickname = excluded.nickname;
  return true;
end;
$$;

create or replace function public.update_room_state(
  p_room_code text, p_host_token text, p_status text,
  p_confirmed_route_type text default null, p_reset_optimization boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
begin
  select r.* into v_room
  from public.rooms r
  join public.room_host_secrets s on s.room_id = r.id
  where r.code = pg_catalog.upper(pg_catalog.btrim(p_room_code))
    and s.token_hash = public.sync_trip_token_hash(p_host_token)
  for update of r;
  if not found then return false; end if;
  if not ((v_room.status = 'setup' and p_status = 'collecting')
    or (v_room.status = 'collecting' and p_status = 'analyzing')
    or (v_room.status = 'voting' and p_status in ('collecting', 'confirmed'))) then
    raise exception using errcode = '22023', message = 'Invalid room state transition.';
  end if;
  if p_status = 'confirmed' and (p_confirmed_route_type is null or not exists (
    select 1 from public.room_routes rr, pg_catalog.jsonb_array_elements(rr.payload) route
    where rr.room_id = v_room.id and route ->> 'type' = p_confirmed_route_type
  )) then
    raise exception using errcode = '22023', message = 'Confirmed route is invalid.';
  end if;
  update public.rooms set
    status = p_status,
    confirmed_route_type = case when p_status = 'confirmed' then p_confirmed_route_type else confirmed_route_type end,
    optimization_state = case when p_reset_optimization then 'idle' else optimization_state end,
    optimization_owner = case when p_reset_optimization then null else optimization_owner end,
    optimization_nonce = case when p_reset_optimization then null else optimization_nonce end,
    optimization_started_at = case when p_reset_optimization then null else optimization_started_at end,
    optimization_finished_at = case when p_reset_optimization then null else optimization_finished_at end
  where id = v_room.id;
  if p_reset_optimization then
    delete from public.room_final_votes where room_id = v_room.id;
  end if;
  return true;
end;
$$;

create or replace function public.upsert_room_place(
  p_room_code text, p_place_id text, p_name text, p_category text, p_address text,
  p_lat double precision, p_lng double precision, p_stay_time_min integer,
  p_stay_time_max integer, p_open_time time, p_close_time time, p_fixed_time time,
  p_best_time time, p_required boolean, p_kakao_id text, p_added_by text, p_hours_source text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_room_id uuid;
begin
  select id into v_room_id from public.rooms
  where code = pg_catalog.upper(pg_catalog.btrim(p_room_code)) and status = 'collecting'
  for share;
  if v_room_id is null then return false; end if;
  insert into public.room_places (
    room_id, place_id, name, category, address, lat, lng, stay_time_min, stay_time_max,
    open_time, close_time, hard_constraint, best_time, required, kakao_id, added_by, hours_source
  ) values (
    v_room_id, p_place_id, p_name, p_category, coalesce(p_address, ''), p_lat, p_lng,
    p_stay_time_min, p_stay_time_max, p_open_time, p_close_time,
    case when p_fixed_time is null then null else pg_catalog.jsonb_build_object('start', pg_catalog.to_char(p_fixed_time, 'HH24:MI'), 'end', pg_catalog.to_char(p_fixed_time, 'HH24:MI')) end,
    p_best_time, coalesce(p_required, false), p_kakao_id, p_added_by, p_hours_source
  ) on conflict (room_id, place_id) do nothing;
  return true;
end;
$$;

create or replace function public.patch_room_place(p_room_code text, p_host_token text, p_place_id text, p_patch jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_room_id uuid;
begin
  if exists (
    select 1 from pg_catalog.jsonb_object_keys(p_patch) key
    where key not in ('openTime', 'closeTime', 'fixedTime', 'bestTime', 'minStay', 'maxStay', 'isFixed', 'hoursSource')
  ) then
    raise exception using errcode = '22023', message = 'Unsupported place patch.';
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
    hard_constraint = case when p_patch ? 'fixedTime' then
      case when nullif(p_patch ->> 'fixedTime', '') is null then null else pg_catalog.jsonb_build_object('start', p_patch ->> 'fixedTime', 'end', p_patch ->> 'fixedTime') end
      else hard_constraint end,
    best_time = case when p_patch ? 'bestTime' then nullif(p_patch ->> 'bestTime', '')::time else best_time end,
    stay_time_min = case when p_patch ? 'minStay' then (p_patch ->> 'minStay')::integer else stay_time_min end,
    stay_time_max = case when p_patch ? 'maxStay' then (p_patch ->> 'maxStay')::integer else stay_time_max end,
    required = case when p_patch ? 'isFixed' then (p_patch ->> 'isFixed')::boolean else required end,
    hours_source = case when p_patch ? 'hoursSource' then p_patch ->> 'hoursSource' else hours_source end
  where room_id = v_room_id and place_id = p_place_id;
  return found;
end;
$$;

create or replace function public.remove_room_place(p_room_code text, p_host_token text, p_place_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_room_id uuid;
begin
  select r.id into v_room_id
  from public.rooms r join public.room_host_secrets s on s.room_id = r.id
  where r.code = pg_catalog.upper(pg_catalog.btrim(p_room_code))
    and r.status = 'collecting'
    and s.token_hash = public.sync_trip_token_hash(p_host_token)
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

create or replace function public.submit_room_ranking(p_room_code text, p_member_id text, p_ranking jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_room_id uuid;
begin
  if pg_catalog.jsonb_typeof(p_ranking) <> 'array' or pg_catalog.jsonb_array_length(p_ranking) > 10 then
    raise exception using errcode = '22023', message = 'Ranking is invalid.';
  end if;
  if (select count(*) from pg_catalog.jsonb_array_elements_text(p_ranking)) <>
     (select count(distinct item.value) from pg_catalog.jsonb_array_elements_text(p_ranking) item) then
    raise exception using errcode = '22023', message = 'Ranking contains a duplicate place.';
  end if;
  select id into v_room_id from public.rooms
  where code = pg_catalog.upper(pg_catalog.btrim(p_room_code)) and status = 'collecting'
  for share;
  if not exists (select 1 from public.room_members where room_id = v_room_id and member_id = p_member_id) then return false; end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements_text(p_ranking) item
    where not exists (select 1 from public.room_places where room_id = v_room_id and place_id = item.value)
  ) then raise exception using errcode = '22023', message = 'Ranking contains an unknown place.'; end if;
  insert into public.room_preferences (room_id, member_id, ranking)
  values (v_room_id, p_member_id, p_ranking)
  on conflict (room_id, member_id) do update set ranking = excluded.ranking;
  update public.room_members set submitted = true where room_id = v_room_id and member_id = p_member_id;
  return true;
end;
$$;

create or replace function public.cast_room_vote(p_room_code text, p_member_id text, p_route_type text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_room_id uuid;
begin
  select id into v_room_id from public.rooms
  where code = pg_catalog.upper(pg_catalog.btrim(p_room_code)) and status = 'voting'
  for share;
  if not exists (select 1 from public.room_members where room_id = v_room_id and member_id = p_member_id) then return false; end if;
  if not exists (
    select 1 from public.room_routes rr, pg_catalog.jsonb_array_elements(rr.payload) route
    where rr.room_id = v_room_id and route ->> 'type' = p_route_type
  ) then return false; end if;
  insert into public.room_final_votes (room_id, member_id, route_type)
  values (v_room_id, p_member_id, p_route_type)
  on conflict (room_id, member_id) do update set route_type = excluded.route_type;
  return true;
end;
$$;

create or replace function public.acquire_optimization_lock(
  p_room_code text, p_member_id text, p_host_token text, p_nonce uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_updated integer;
begin
  update public.rooms r set
    optimization_state = 'running', optimization_owner = p_member_id,
    optimization_nonce = p_nonce, optimization_started_at = pg_catalog.now(),
    optimization_finished_at = null
  from public.room_host_secrets s
  where s.room_id = r.id
    and r.code = pg_catalog.upper(pg_catalog.btrim(p_room_code))
    and r.status = 'analyzing'
    and r.host_member_id = p_member_id
    and s.token_hash = public.sync_trip_token_hash(p_host_token)
    and (r.optimization_state <> 'running' or r.optimization_started_at < pg_catalog.now() - interval '2 minutes');
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.complete_optimization(
  p_room_code text, p_member_id text, p_host_token text, p_nonce uuid, p_routes jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_room_id uuid;
begin
  update public.rooms r set status = 'voting', optimization_state = 'complete', optimization_finished_at = pg_catalog.now()
  from public.room_host_secrets s
  where s.room_id = r.id and r.code = pg_catalog.upper(pg_catalog.btrim(p_room_code))
    and r.host_member_id = p_member_id and s.token_hash = public.sync_trip_token_hash(p_host_token)
    and r.optimization_state = 'running' and r.optimization_owner = p_member_id
    and r.optimization_nonce = p_nonce
  returning r.id into v_room_id;
  if v_room_id is null then raise exception using errcode = 'P0001', message = 'Optimization lock is no longer owned by this run.'; end if;
  insert into public.room_routes (room_id, optimization_nonce, payload)
  values (v_room_id, p_nonce, p_routes)
  on conflict (room_id) do update set optimization_nonce = excluded.optimization_nonce, payload = excluded.payload;
  delete from public.room_errors where room_id = v_room_id;
  return true;
end;
$$;

create or replace function public.fail_optimization(
  p_room_code text, p_member_id text, p_host_token text, p_nonce uuid,
  p_code text, p_message text, p_place_ids jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_room_id uuid;
begin
  update public.rooms r set status = 'voting', optimization_state = 'complete', optimization_finished_at = pg_catalog.now()
  from public.room_host_secrets s
  where s.room_id = r.id and r.code = pg_catalog.upper(pg_catalog.btrim(p_room_code))
    and r.host_member_id = p_member_id and s.token_hash = public.sync_trip_token_hash(p_host_token)
    and r.optimization_state = 'running' and r.optimization_owner = p_member_id
    and r.optimization_nonce = p_nonce
  returning r.id into v_room_id;
  if v_room_id is null then raise exception using errcode = 'P0001', message = 'Optimization lock is no longer owned by this run.'; end if;
  insert into public.room_errors (room_id, optimization_nonce, code, message, place_ids)
  values (v_room_id, p_nonce, p_code, p_message, coalesce(p_place_ids, '[]'::jsonb))
  on conflict (room_id) do update set
    optimization_nonce = excluded.optimization_nonce, code = excluded.code,
    message = excluded.message, place_ids = excluded.place_ids;
  delete from public.room_routes where room_id = v_room_id;
  return true;
end;
$$;

alter table public.rooms enable row level security;
alter table public.room_host_secrets enable row level security;
alter table public.room_members enable row level security;
alter table public.room_places enable row level security;
alter table public.room_preferences enable row level security;
alter table public.room_routes enable row level security;
alter table public.room_errors enable row level security;
alter table public.room_final_votes enable row level security;

-- Accountless Realtime requires SELECT visibility. These policies are intentionally
-- read-only; all writes go through validated RPCs. A room code is the MVP access secret.
create policy rooms_accountless_read on public.rooms for select to anon, authenticated
using (code ~ '^[A-HJ-NP-Z2-9]{4}$');
create policy members_accountless_read on public.room_members for select to anon, authenticated
using (exists (select 1 from public.rooms r where r.id = room_id and r.code ~ '^[A-HJ-NP-Z2-9]{4}$'));
create policy places_accountless_read on public.room_places for select to anon, authenticated
using (exists (select 1 from public.rooms r where r.id = room_id and r.code ~ '^[A-HJ-NP-Z2-9]{4}$'));
create policy preferences_accountless_read on public.room_preferences for select to anon, authenticated
using (exists (select 1 from public.rooms r where r.id = room_id and r.code ~ '^[A-HJ-NP-Z2-9]{4}$'));
create policy routes_accountless_read on public.room_routes for select to anon, authenticated
using (exists (select 1 from public.rooms r where r.id = room_id and r.code ~ '^[A-HJ-NP-Z2-9]{4}$'));
create policy errors_accountless_read on public.room_errors for select to anon, authenticated
using (exists (select 1 from public.rooms r where r.id = room_id and r.code ~ '^[A-HJ-NP-Z2-9]{4}$'));
create policy votes_accountless_read on public.room_final_votes for select to anon, authenticated
using (exists (select 1 from public.rooms r where r.id = room_id and r.code ~ '^[A-HJ-NP-Z2-9]{4}$'));

revoke all on public.rooms, public.room_host_secrets, public.room_members, public.room_places,
  public.room_preferences, public.room_routes, public.room_errors, public.room_final_votes
  from anon, authenticated;
grant select on public.rooms, public.room_members, public.room_places, public.room_preferences,
  public.room_routes, public.room_errors, public.room_final_votes to anon, authenticated;

revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.sync_trip_token_hash(text) from public, anon, authenticated;
revoke execute on function public.get_room_snapshot(text) from public, anon, authenticated;
revoke execute on function public.create_room(text, text, text, text, text, date, date, time, time, integer, text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.join_room(text, text, text) from public, anon, authenticated;
revoke execute on function public.update_room_state(text, text, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.upsert_room_place(text, text, text, text, text, double precision, double precision, integer, integer, time, time, time, time, boolean, text, text, text) from public, anon, authenticated;
revoke execute on function public.patch_room_place(text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.remove_room_place(text, text, text) from public, anon, authenticated;
revoke execute on function public.submit_room_ranking(text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.cast_room_vote(text, text, text) from public, anon, authenticated;
revoke execute on function public.acquire_optimization_lock(text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.complete_optimization(text, text, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.fail_optimization(text, text, text, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.get_room_snapshot(text) to anon, authenticated;
grant execute on function public.create_room(text, text, text, text, text, date, date, time, time, integer, text, jsonb, jsonb) to anon, authenticated;
grant execute on function public.join_room(text, text, text) to anon, authenticated;
grant execute on function public.update_room_state(text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.upsert_room_place(text, text, text, text, text, double precision, double precision, integer, integer, time, time, time, time, boolean, text, text, text) to anon, authenticated;
grant execute on function public.patch_room_place(text, text, text, jsonb) to anon, authenticated;
grant execute on function public.remove_room_place(text, text, text) to anon, authenticated;
grant execute on function public.submit_room_ranking(text, text, jsonb) to anon, authenticated;
grant execute on function public.cast_room_vote(text, text, text) to anon, authenticated;
grant execute on function public.acquire_optimization_lock(text, text, text, uuid) to anon, authenticated;
grant execute on function public.complete_optimization(text, text, text, uuid, jsonb) to anon, authenticated;
grant execute on function public.fail_optimization(text, text, text, uuid, text, text, jsonb) to anon, authenticated;

alter table public.rooms replica identity full;
alter table public.room_members replica identity full;
alter table public.room_places replica identity full;
alter table public.room_preferences replica identity full;
alter table public.room_routes replica identity full;
alter table public.room_errors replica identity full;
alter table public.room_final_votes replica identity full;

do $$
declare v_table text;
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
    foreach v_table in array array['rooms', 'room_members', 'room_places', 'room_preferences', 'room_routes', 'room_errors', 'room_final_votes']
    loop
      if not exists (
        select 1 from pg_catalog.pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
      ) then
        execute pg_catalog.format('alter publication supabase_realtime add table public.%I', v_table);
      end if;
    end loop;
  end if;
end;
$$;
