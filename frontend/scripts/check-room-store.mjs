import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const browserListeners = new Map();
const localStorage = new MemoryStorage();
const sessionStorage = new MemoryStorage();
globalThis.__SYNCTRIP_SYNC_MODE__ = 'mock';
globalThis.__SYNCTRIP_API_MODE__ = 'mock';
globalThis.window = {
  localStorage,
  sessionStorage,
  addEventListener(type, listener) {
    const group = browserListeners.get(type) ?? new Set(); group.add(listener); browserListeners.set(type, group);
  },
  removeEventListener(type, listener) { browserListeners.get(type)?.delete(listener); },
  dispatchEvent(event) { browserListeners.get(event.type)?.forEach((listener) => listener(event)); },
};
if (!globalThis.CustomEvent) {
  globalThis.CustomEvent = class CustomEvent extends Event {
    constructor(type, init) { super(type); this.detail = init?.detail; }
  };
}

const store = await import('../src/lib/roomStore.js');
const { buildOptimizeBody } = await import('../src/lib/api.js');
const meta = {
  hostNickname: 'Host', title: 'Integration Trip', startDate: '2026-09-19', endDate: '2026-09-19',
  dailyStart: '10:00', dailyEnd: '21:00', headcount: 2, transportMode: 'transit',
  origin: { name: 'Seoul Station', lat: 37.5547, lng: 126.9707 },
  destination: { name: 'Seoul Station', lat: 37.5547, lng: 126.9707 },
};
const place = {
  id: 'p1', name: 'Museum', address: 'Seoul', category: 'museum', lat: 37.57, lng: 126.98,
  openTime: '10:00', closeTime: '18:00', minStay: 60, maxStay: 90, hoursSource: 'default',
};
const routes = [{ type: 'min_time', label: 'Fastest Route', total_time: 10, total_cost: 1000, days: [] }];

// The explicit local adapter remains a deterministic demo fallback.
const mockAdapter = new store.MockRoomAdapter();
const mockRoom = await mockAdapter.create(meta);
assert.match(mockRoom.code, /^[A-HJ-NP-Z2-9]{4}$/);
let mockEvents = 0;
const disposeMock = mockAdapter.subscribe(mockRoom.code, () => { mockEvents += 1; });
await mockAdapter.addPlace(mockRoom.code, place);
disposeMock();
const mockEventsAtDispose = mockEvents;
await mockAdapter.updatePlace(mockRoom.code, place.id, { minStay: 70 });
assert.equal(mockEvents, mockEventsAtDispose);

function clone(value) { return value == null ? value : structuredClone(value); }

function createMockSupabase() {
  const rooms = new Map();
  const channels = new Set();
  let collisionPending = true;
  let createCalls = 0;

  function room(code) { return rooms.get(String(code).trim().toUpperCase()); }
  function response(data = null, error = null) { return Promise.resolve({ data: clone(data), error }); }
  function validHost(target, args) {
    return target && target.hostId === args.p_member_id && target.hostToken === args.p_host_token;
  }

  const client = {
    rpc(name, args) {
      if (name === 'create_room') {
        createCalls += 1;
        if (collisionPending) { collisionPending = false; return response(null, { code: '23505' }); }
        const value = {
          roomId: crypto.randomUUID(), code: args.p_code, status: 'setup', title: args.p_title,
          hostId: args.p_host_member_id, hostToken: args.p_host_token,
          startDate: args.p_start_date, endDate: args.p_end_date,
          dailyStart: args.p_daily_start, dailyEnd: args.p_daily_end,
          headcount: args.p_headcount, transportMode: args.p_transport_mode,
          origin: args.p_origin, destination: args.p_destination,
          optimizationState: 'idle', optimizationOwner: null, optimizationRunId: null,
          optimizationStartedAt: null, confirmedRouteId: null,
          members: [{ id: args.p_host_member_id, nickname: args.p_host_nickname, isHost: true, submitted: false }],
          places: [], preferences: {}, routes: [], error: null, finalVotes: {},
        };
        rooms.set(value.code, value);
        return response({ ...value, hostToken: undefined });
      }
      if (name === 'get_room_snapshot') {
        const value = room(args.p_room_code);
        if (!value) return response(null);
        const copy = clone(value); delete copy.hostToken;
        return response(copy);
      }
      const target = room(args.p_room_code);
      if (name === 'join_room') {
        if (!target) return response(false);
        const current = target.members.find((member) => member.id === args.p_member_id);
        if (current) current.nickname = args.p_nickname;
        else target.members.push({ id: args.p_member_id, nickname: args.p_nickname, isHost: false, submitted: false });
        return response(true);
      }
      if (name === 'update_room_state') {
        if (!target || target.hostToken !== args.p_host_token) return response(false);
        target.status = args.p_status;
        if (args.p_confirmed_route_type) target.confirmedRouteId = args.p_confirmed_route_type;
        if (args.p_reset_optimization) {
          target.optimizationState = 'idle'; target.optimizationOwner = null;
          target.optimizationRunId = null; target.optimizationStartedAt = null;
          target.finalVotes = {};
        }
        return response(true);
      }
      if (name === 'upsert_room_place') {
        if (!target) return response(false);
        if (!target.places.some((item) => item.id === args.p_place_id)) target.places.push({
          id: args.p_place_id, name: args.p_name, category: args.p_category, address: args.p_address,
          lat: args.p_lat, lng: args.p_lng, minStay: args.p_stay_time_min, maxStay: args.p_stay_time_max,
          openTime: args.p_open_time, closeTime: args.p_close_time, fixedTime: args.p_fixed_time,
          bestTime: args.p_best_time, isFixed: args.p_required, kakaoId: args.p_kakao_id,
          addedBy: args.p_added_by, hoursSource: args.p_hours_source,
        });
        return response(true);
      }
      if (name === 'patch_room_place') {
        const current = target?.places.find((item) => item.id === args.p_place_id);
        if (!current) return response(false);
        Object.assign(current, args.p_patch); return response(true);
      }
      if (name === 'remove_room_place') {
        target.places = target.places.filter((item) => item.id !== args.p_place_id);
        Object.keys(target.preferences).forEach((id) => { target.preferences[id] = target.preferences[id].filter((item) => item !== args.p_place_id); });
        return response(true);
      }
      if (name === 'submit_room_ranking') {
        const member = target?.members.find((item) => item.id === args.p_member_id);
        if (!member) return response(false);
        target.preferences[args.p_member_id] = clone(args.p_ranking); member.submitted = true;
        return response(true);
      }
      if (name === 'cast_room_vote') {
        if (!target?.members.some((item) => item.id === args.p_member_id)) return response(false);
        target.finalVotes[args.p_member_id] = args.p_route_type; return response(true);
      }
      if (name === 'acquire_optimization_lock') {
        const stale = Date.now() - (target?.optimizationStartedAt ?? 0) > 120_000;
        if (!validHost(target, args) || target.status !== 'analyzing' || (target.optimizationState === 'running' && !stale)) return response(false);
        target.optimizationState = 'running'; target.optimizationOwner = args.p_member_id;
        target.optimizationRunId = args.p_nonce; target.optimizationStartedAt = Date.now();
        return response(true);
      }
      if (name === 'complete_optimization' || name === 'fail_optimization') {
        if (!validHost(target, args) || target.optimizationRunId !== args.p_nonce) return response(null, { code: 'P0001' });
        target.status = 'voting'; target.optimizationState = 'complete';
        if (name === 'complete_optimization') { target.routes = clone(args.p_routes); target.error = null; }
        else { target.routes = []; target.error = { code: args.p_code, message: args.p_message, placeIds: clone(args.p_place_ids) }; }
        return response(true);
      }
      throw new Error(`Unexpected RPC: ${name}`);
    },
    channel(name) {
      const bindings = [];
      const channel = {
        name, bindings,
        on(_kind, filter, callback) { bindings.push({ filter, callback }); return channel; },
        subscribe(callback) { channel.status = callback; channels.add(channel); callback?.('SUBSCRIBED'); return channel; },
      };
      return channel;
    },
    async removeChannel(channel) { channels.delete(channel); },
    trigger(table) { channels.forEach((channel) => channel.bindings.filter((item) => item.filter.table === table).forEach((item) => item.callback({}))); },
  };
  return {
    client,
    createCalls: () => createCalls,
    channels: () => channels,
    makeLockStale(code) { room(code).optimizationStartedAt = Date.now() - 121_000; },
  };
}

// Exercise the production Supabase adapter through RPC and Realtime mocks.
const supabaseMock = createMockSupabase();
const supabaseStore = new store.SupabaseRoomAdapter(supabaseMock.client);
const room = await supabaseStore.create(meta);
assert.equal(supabaseMock.createCalls(), 2, 'a unique-code collision is retried');
assert.match(room.code, /^[A-HJ-NP-Z2-9]{4}$/);
const hostId = room.hostId;

let realtimeRoom;
const unsubscribe = supabaseStore.subscribe(room.code, (next) => { realtimeRoom = next; });
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(supabaseMock.channels().size, 1, 'one room channel is created');
assert.equal([...supabaseMock.channels()][0].bindings.length, 7, 'all seven tables are room-scoped');

sessionStorage.removeItem(`synctrip:member-id:${room.code}`);
const guestId = await supabaseStore.join(room.code, 'Guest');
await supabaseStore.join(room.code, 'Renamed Guest');
assert.equal((await supabaseStore.read(room.code)).members.filter((item) => item.id === guestId).length, 1, 'member join uses upsert semantics');
assert.equal((await supabaseStore.read(room.code)).members.find((item) => item.id === guestId).nickname, 'Renamed Guest');

await supabaseStore.addPlace(room.code, place);
await supabaseStore.updatePlace(room.code, place.id, { isFixed: true });
await supabaseStore.updatePlace(room.code, place.id, { visitWindow: { start: '13:00', end: '13:30' } });
assert.deepEqual((await supabaseStore.read(room.code)).places[0].visitWindow, { start: '13:00', end: '13:30' });
await supabaseStore.submitRanking(room.code, guestId, [place.id]);
await supabaseStore.submitRanking(room.code, guestId, []);
assert.deepEqual((await supabaseStore.read(room.code)).preferences[guestId], [], 'ranking replacement is atomic per member');

sessionStorage.setItem(`synctrip:member-id:${room.code}`, hostId);
await supabaseStore.patch(room.code, { status: 'collecting' });
await supabaseStore.patch(room.code, { status: 'analyzing', optimizationState: 'idle' });
const lockResults = await Promise.all([
  supabaseStore.claimOptimization(room.code, hostId),
  supabaseStore.claimOptimization(room.code, hostId),
]);
assert.equal(lockResults.filter(Boolean).length, 1, 'simultaneous lock acquisition has one winner');
const abandonedNonce = lockResults.find(Boolean);
supabaseMock.makeLockStale(room.code);
const recoveredNonce = await supabaseStore.claimOptimization(room.code, hostId);
assert.ok(recoveredNonce && recoveredNonce !== abandonedNonce, 'a stale lock is recovered with a new nonce');
await assert.rejects(() => supabaseStore.finishOptimization(room.code, { status: 'success', routes: [] }, abandonedNonce));
await supabaseStore.finishOptimization(room.code, { status: 'success', routes }, recoveredNonce);
assert.deepEqual((await supabaseStore.read(room.code)).routes, routes);
await supabaseStore.castVote(room.code, guestId, 'min_time');
await supabaseStore.castVote(room.code, guestId, 'min_cost');
assert.deepEqual((await supabaseStore.read(room.code)).finalVotes, { [guestId]: 'min_cost' }, 'one member has one replacement vote');

await supabaseStore.patch(room.code, { status: 'collecting', optimizationState: 'idle' });
assert.deepEqual((await supabaseStore.read(room.code)).finalVotes, {}, 'retrying optimization clears prior votes');
await supabaseStore.patch(room.code, { status: 'analyzing', optimizationState: 'idle' });
const errorNonce = await supabaseStore.claimOptimization(room.code, hostId);
await supabaseStore.finishOptimization(room.code, { status: 'error', code: 'NO_ROUTE', message: 'No route fits.', place_ids: ['p1'] }, errorNonce);
assert.deepEqual((await supabaseStore.read(room.code)).error.placeIds, ['p1']);

supabaseMock.client.trigger('room_errors');
await new Promise((resolve) => setTimeout(resolve, 30));
assert.deepEqual(realtimeRoom.error.placeIds, ['p1'], 'Realtime refresh reconstructs the room snapshot');

await supabaseStore.patch(room.code, { status: 'collecting', optimizationState: 'idle' });
await supabaseStore.patch(room.code, { status: 'analyzing', optimizationState: 'idle' });
const finalNonce = await supabaseStore.claimOptimization(room.code, hostId);
await supabaseStore.finishOptimization(room.code, { status: 'success', routes }, finalNonce);
await supabaseStore.patch(room.code, { status: 'confirmed', confirmedRouteId: 'min_time' });
assert.equal((await supabaseStore.read(room.code)).confirmedRouteId, 'min_time');
unsubscribe();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(supabaseMock.channels().size, 0, 'the Realtime channel is removed on cleanup');

const storedPlace = (await supabaseStore.read(room.code)).places[0];
const body = buildOptimizeBody(await supabaseStore.read(room.code), [{ ...storedPlace, score: 7 }]);
assert.equal(body.settings.transport_mode, 'transit');
assert.equal(body.places[0].preference_score, 7);
assert.deepEqual(body.places[0].hard_constraint, { start: '13:00', end: '13:30' });

// Static migration checks keep critical SQL invariants visible without a production project.
const migrationPath = fileURLToPath(new URL('../../supabase/migrations/20260912000000_sync_trip_initial_schema.sql', import.meta.url));
const visitMigrationPath = fileURLToPath(new URL('../../supabase/migrations/20260912010000_add_scheduled_visit_windows.sql', import.meta.url));
const sql = `${readFileSync(migrationPath, 'utf8')}\n${readFileSync(visitMigrationPath, 'utf8')}`;
for (const table of ['rooms', 'room_members', 'room_places', 'room_preferences', 'room_routes', 'room_errors', 'room_final_votes']) {
  assert.match(sql, new RegExp(`create table public\\.${table}`));
  assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
}
assert.match(sql, /primary key \(room_id, member_id\)/);
assert.match(sql, /code varchar\(4\) not null unique/);
assert.ok((sql.match(/references public\.rooms\(id\) on delete cascade/g) ?? []).length >= 7);
assert.match(sql, /alter table public\.room_host_secrets enable row level security/);
assert.match(sql, /acquire_optimization_lock/);
assert.match(sql, /optimization_nonce = p_nonce/);
assert.match(sql, /count\(distinct item\.value\)/, 'rankings reject duplicate place IDs');
assert.match(sql, /configured number of members/, 'room capacity is enforced transactionally');
assert.match(sql, /delete from public\.room_final_votes where room_id = v_room\.id/, 'retrying optimization clears prior votes');
assert.match(sql, /'visitWindow', p\.hard_constraint/, 'snapshots expose scheduled visit windows');
assert.match(sql, /key not in \([^)]*'visitWindow'/, 'place patches accept scheduled visit windows');
assert.equal(
  (sql.match(/security definer/g) ?? []).length,
  (sql.match(/security definer\s+set search_path = ''/g) ?? []).length,
  'every security-definer RPC fixes its search path',
);
assert.match(sql, /supabase_realtime/);
assert.match(sql, /revoke all on public\.rooms/);
assert.doesNotMatch(sql, /grant (insert|update|delete|all).* to anon/i);
assert.doesNotMatch(sql, /using\s*\(\s*true\s*\)/i);

console.log('All mocked Supabase room-store, Realtime, SQL, and frontend/backend contract checks passed');
