import {
  getHostToken, getMemberId, makeRoomCode, normalizeRoomCode,
  randomHex, rememberHost, storage,
} from './roomIdentity.js';

const ROOM_PREFIX = 'synctrip:mock-room:';
const CHANNEL = 'synctrip:mock-changed';
const LOCK_STALE_MS = 2 * 60 * 1000;

function publicRoom(code, data = {}) {
  return {
    code, ...data,
    members: data.members ?? [], places: data.places ?? [],
    preferences: data.preferences ?? {}, routes: data.routes ?? [],
    error: data.error ?? null, finalVotes: data.finalVotes ?? {},
    confirmedRouteId: data.confirmedRouteId ?? null,
  };
}

function roomRecord(meta, code, hostId, token) {
  return {
    code, status: 'setup', title: meta.title, hostId, hostToken: token,
    startDate: meta.startDate, endDate: meta.endDate,
    dailyStart: meta.dailyStart, dailyEnd: meta.dailyEnd,
    headcount: meta.headcount, transportMode: meta.transportMode,
    origin: meta.origin, destination: meta.destination,
    confirmedRouteId: null, optimizationState: 'idle', optimizationOwner: null, optimizationRunId: null,
  };
}

export class MockRoomAdapter {
  key(code) { return ROOM_PREFIX + normalizeRoomCode(code); }
  load(code) { const raw = storage().getItem(this.key(code)); return raw ? JSON.parse(raw) : null; }
  save(code, room) {
    storage().setItem(this.key(code), JSON.stringify(room));
    window.dispatchEvent(new CustomEvent(CHANNEL, { detail: { code: normalizeRoomCode(code) } }));
  }
  async create(meta) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = makeRoomCode();
      if (this.load(code)) continue;
      const id = getMemberId(); const token = randomHex(24);
      const room = publicRoom(code, { ...roomRecord(meta, code, id, token), createdAt: Date.now(), members: [{ id, nickname: meta.hostNickname, isHost: true, submitted: false }] });
      rememberHost(code, token); this.save(code, room); return room;
    }
    throw new Error('Could not allocate a room code. Please try again.');
  }
  async read(code) { return this.load(code); }
  subscribe(code, callback) {
    const normalized = normalizeRoomCode(code); const fire = () => callback(this.load(normalized));
    const listener = (event) => { if (event.detail?.code === normalized) fire(); };
    window.addEventListener(CHANNEL, listener); fire();
    return () => window.removeEventListener(CHANNEL, listener);
  }
  async join(code, nickname) {
    const room = this.load(code); if (!room) throw new Error('Room not found.');
    const id = getMemberId(); const existing = room.members.find((item) => item.id === id);
    room.members = existing ? room.members.map((item) => item.id === id ? { ...item, nickname } : item) : [...room.members, { id, nickname, isHost: false, submitted: false }];
    this.save(code, room); return id;
  }
  async patch(code, patch) {
    const room = this.load(code); if (!room) throw new Error('Room not found.');
    if ('status' in patch && room.hostToken !== getHostToken(code)) throw new Error('Only the host can change the room state.');
    this.save(code, { ...room, ...patch });
  }
  async addPlace(code, place) { const room = this.load(code); if (!room.places.some((item) => item.id === place.id)) room.places.push(place); this.save(code, room); }
  async updatePlace(code, placeId, patch) { const room = this.load(code); room.places = room.places.map((item) => item.id === placeId ? { ...item, ...patch } : item); this.save(code, room); }
  async removePlace(code, placeId) {
    const room = this.load(code); room.places = room.places.filter((item) => item.id !== placeId);
    room.preferences = Object.fromEntries(Object.entries(room.preferences).map(([id, ranking]) => [id, ranking.filter((item) => item !== placeId)]));
    this.save(code, room);
  }
  async submitRanking(code, id, ranking) { const room = this.load(code); room.preferences[id] = ranking; room.members = room.members.map((item) => item.id === id ? { ...item, submitted: true } : item); this.save(code, room); }
  async castVote(code, id, routeId) { const room = this.load(code); room.finalVotes[id] = routeId; this.save(code, room); }
  async claimOptimization(code, id) {
    const room = this.load(code);
    if (!room || room.status !== 'analyzing' || room.hostId !== id || room.hostToken !== getHostToken(code)) return false;
    if (room.optimizationState === 'running' && Date.now() - (room.optimizationStartedAt ?? 0) <= LOCK_STALE_MS) return false;
    const runId = crypto.randomUUID();
    this.save(code, { ...room, optimizationState: 'running', optimizationOwner: id, optimizationRunId: runId, optimizationStartedAt: Date.now() }); return runId;
  }
  async finishOptimization(code, result, runId) {
    const room = this.load(code); const success = result.status === 'success';
    if (!runId || room.optimizationRunId !== runId) throw new Error('This optimization run no longer owns the room lock.');
    this.save(code, { ...room, routes: success ? result.routes : [], error: success ? null : { code: result.code, message: result.message, placeIds: result.place_ids ?? [] }, status: 'voting', optimizationState: 'complete' });
  }
}

export function resetMockRooms() {
  Object.keys(storage()).filter((key) => key.startsWith(ROOM_PREFIX)).forEach((key) => storage().removeItem(key));
}
