-- The screens gained step-back controls, but the room state machine only moved
-- forward, so every one of them failed on a rejected transition. Allow the three
-- backward moves the UI offers, and clear the confirmed route when a room leaves
-- 'confirmed' so a reopened vote does not carry the old winner.

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
    or (v_room.status = 'collecting' and p_status in ('setup', 'analyzing'))
    or (v_room.status = 'analyzing' and p_status = 'collecting')
    or (v_room.status = 'voting' and p_status in ('collecting', 'confirmed'))
    or (v_room.status = 'confirmed' and p_status = 'voting')) then
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
    confirmed_route_type = case when p_status = 'confirmed' then p_confirmed_route_type else null end,
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

revoke execute on function public.update_room_state(text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.update_room_state(text, text, text, text, boolean) to anon, authenticated;
