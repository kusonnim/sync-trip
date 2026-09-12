import {
  collection, deleteDoc, doc, getDoc, onSnapshot, runTransaction,
  serverTimestamp, setDoc, updateDoc, writeBatch,
} from 'firebase/firestore';
import { getDatabase } from './firebase.js';
import { SYNC_MODE } from './runtimeConfig.js';

const FIRESTORE_OPS = {
  collection, deleteDoc, doc, getDoc, onSnapshot, runTransaction,
  serverTimestamp, setDoc, updateDoc, writeBatch,
};

const ROOM_PREFIX = 'synctrip:mock-room:';
const MEMBER_KEY = 'synctrip:member-id';
const HOST_PREFIX = 'synctrip:host-token:';
const CHANNEL = 'synctrip:mock-changed';
const LOCK_STALE_MS = 2 * 60 * 1000;
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function storage() {
  if (typeof window === 'undefined') throw new Error('Room storage requires a browser.');
  return window.localStorage;
}

function randomId(bytes = 18) {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('');
}

export function normalizeRoomCode(code) {
  return String(code ?? '').trim().toUpperCase();
}

export function makeRoomCode() {
  const values = new Uint8Array(4);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => ROOM_ALPHABET[value % ROOM_ALPHABET.length]).join('');
}

function memberId() {
  let id = storage().getItem(MEMBER_KEY);
  if (!id) {
    id = `m-${randomId(12)}`;
    storage().setItem(MEMBER_KEY, id);
  }
  return id;
}

function hostToken(code) { return storage().getItem(HOST_PREFIX + normalizeRoomCode(code)); }
function rememberHost(code, token) { storage().setItem(HOST_PREFIX + normalizeRoomCode(code), token); }

export function getMyId() { return memberId(); }
export function setMyId(_code, id) { if (id) storage().setItem(MEMBER_KEY, id); }

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

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value === 'number') return value;
  return new Date(value).getTime() || 0;
}

export class FirestoreAdapter {
  constructor(database = getDatabase(), operations = FIRESTORE_OPS) { this.db = database; this.ops = operations; }
  roomRef(code) { return this.ops.doc(this.db, 'rooms', code); }
  childRef(code, group, id) { return this.ops.doc(this.db, 'rooms', code, group, id); }

  async create(meta) {
    const hostId = memberId();
    const token = randomId(24);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = makeRoomCode();
      const created = await this.ops.runTransaction(this.db, async (transaction) => {
        const ref = this.roomRef(code);
        if ((await transaction.get(ref)).exists()) return false;
        transaction.set(ref, { ...roomRecord(meta, code, hostId, token), createdAt: this.ops.serverTimestamp() });
        transaction.set(this.childRef(code, 'members', hostId), {
          nickname: meta.hostNickname, joinedAt: this.ops.serverTimestamp(), submitted: false, isHost: true,
        });
        return true;
      });
      if (created) {
        rememberHost(code, token);
        return publicRoom(code, {
          ...roomRecord(meta, code, hostId, token),
          members: [{ id: hostId, nickname: meta.hostNickname, submitted: false, isHost: true }],
        });
      }
    }
    throw new Error('Could not allocate a room code. Please try again.');
  }

  async read(code) {
    const normalized = normalizeRoomCode(code);
    const snapshot = await this.ops.getDoc(this.roomRef(normalized));
    return snapshot.exists() ? publicRoom(normalized, snapshot.data()) : null;
  }

  subscribe(code, callback, onError) {
    const normalized = normalizeRoomCode(code);
    const state = { room: null, members: [], places: [], preferences: {}, routes: [], error: null, finalVotes: {} };
    const seen = new Set();
    const expected = ['room', 'members', 'places', 'preferences', 'routes', 'error', 'finalVotes'];
    const emit = () => {
      if (!seen.has('room')) return;
      if (!state.room) { callback(null); return; }
      if (expected.every((key) => seen.has(key))) {
        const { room, ...children } = state;
        callback(publicRoom(normalized, { ...room, ...children }));
      }
    };
    const fail = (error) => onError?.(new Error(error?.message || 'Room synchronization failed.'));
    const watchDoc = (key, ref, select) => this.ops.onSnapshot(ref, (snapshot) => {
      state[key] = snapshot.exists() ? select(snapshot.data()) : select(null);
      seen.add(key); emit();
    }, fail);
    const watchCollection = (key, ref, select) => this.ops.onSnapshot(ref, (snapshot) => {
      state[key] = select(snapshot.docs); seen.add(key); emit();
    }, fail);
    const unsubscribers = [
      watchDoc('room', this.roomRef(normalized), (value) => value),
      watchCollection('members', this.ops.collection(this.db, 'rooms', normalized, 'members'), (docs) => docs.map((item) => ({ id: item.id, ...item.data() }))),
      watchCollection('places', this.ops.collection(this.db, 'rooms', normalized, 'places'), (docs) => docs.map((item) => ({ id: item.id, ...item.data() }))),
      watchCollection('preferences', this.ops.collection(this.db, 'rooms', normalized, 'preferences'), (docs) => Object.fromEntries(docs.map((item) => [item.id, item.data().ranking ?? []]))),
      watchDoc('routes', this.childRef(normalized, 'routes', 'current'), (value) => value?.items ?? []),
      watchDoc('error', this.childRef(normalized, 'errors', 'current'), (value) => value),
      watchCollection('finalVotes', this.ops.collection(this.db, 'rooms', normalized, 'finalVotes'), (docs) => Object.fromEntries(docs.map((item) => [item.id, item.data().routeId]))),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }

  async join(code, nickname) {
    const normalized = normalizeRoomCode(code);
    const id = memberId();
    await this.ops.runTransaction(this.db, async (transaction) => {
      if (!(await transaction.get(this.roomRef(normalized))).exists()) throw new Error('Room not found.');
      transaction.set(this.childRef(normalized, 'members', id), {
        nickname, joinedAt: this.ops.serverTimestamp(), submitted: false, isHost: false,
      }, { merge: true });
    });
    return id;
  }

  async patch(code, patch) {
    if (typeof patch === 'function') throw new Error('Functional room patches are not supported in Firestore mode.');
    const normalized = normalizeRoomCode(code);
    if ('status' in patch) {
      const localToken = hostToken(normalized);
      await this.ops.runTransaction(this.db, async (transaction) => {
        const ref = this.roomRef(normalized);
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) throw new Error('Room not found.');
        if (!localToken || snapshot.data().hostToken !== localToken) throw new Error('Only the host can change the room state.');
        transaction.update(ref, { ...patch, updatedAt: this.ops.serverTimestamp() });
      });
      return;
    }
    await this.ops.updateDoc(this.roomRef(normalized), { ...patch, updatedAt: this.ops.serverTimestamp() });
  }
  async addPlace(code, place) { await this.ops.setDoc(this.childRef(normalizeRoomCode(code), 'places', place.id), { ...place, updatedAt: this.ops.serverTimestamp() }); }
  async updatePlace(code, placeId, patch) { await this.ops.updateDoc(this.childRef(normalizeRoomCode(code), 'places', placeId), { ...patch, updatedAt: this.ops.serverTimestamp() }); }
  async removePlace(code, placeId) { await this.ops.deleteDoc(this.childRef(normalizeRoomCode(code), 'places', placeId)); }
  async submitRanking(code, id, ranking) {
    const normalized = normalizeRoomCode(code);
    const batch = this.ops.writeBatch(this.db);
    batch.set(this.childRef(normalized, 'preferences', id), { ranking, updatedAt: this.ops.serverTimestamp() });
    batch.update(this.childRef(normalized, 'members', id), { submitted: true });
    await batch.commit();
  }
  async castVote(code, id, routeId) { await this.ops.setDoc(this.childRef(normalizeRoomCode(code), 'finalVotes', id), { routeId, updatedAt: this.ops.serverTimestamp() }); }

  async claimOptimization(code, id) {
    const normalized = normalizeRoomCode(code);
    const localToken = hostToken(normalized);
    if (!localToken) return false;
    const runId = randomId(12);
    return this.ops.runTransaction(this.db, async (transaction) => {
      const ref = this.roomRef(normalized);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) return false;
      const room = snapshot.data();
      const stale = Date.now() - toMillis(room.optimizationStartedAt) > LOCK_STALE_MS;
      if (room.status !== 'analyzing' || room.hostId !== id || room.hostToken !== localToken) return false;
      if (room.optimizationState === 'running' && !stale) return false;
      transaction.update(ref, { optimizationState: 'running', optimizationOwner: id, optimizationRunId: runId, optimizationStartedAt: this.ops.serverTimestamp() });
      return runId;
    });
  }

  async finishOptimization(code, result, runId) {
    const normalized = normalizeRoomCode(code);
    await this.ops.runTransaction(this.db, async (transaction) => {
      const roomRef = this.roomRef(normalized);
      const roomSnapshot = await transaction.get(roomRef);
      if (!roomSnapshot.exists() || !runId || roomSnapshot.data().optimizationRunId !== runId) {
        throw new Error('This optimization run no longer owns the room lock.');
      }
      if (result.status === 'success') {
        transaction.set(this.childRef(normalized, 'routes', 'current'), { items: result.routes, updatedAt: this.ops.serverTimestamp() });
        transaction.delete(this.childRef(normalized, 'errors', 'current'));
      } else {
        transaction.delete(this.childRef(normalized, 'routes', 'current'));
        transaction.set(this.childRef(normalized, 'errors', 'current'), {
          code: result.code, message: result.message,
          placeIds: result.place_ids ?? result.placeIds ?? [], updatedAt: this.ops.serverTimestamp(),
        });
      }
      transaction.update(roomRef, { status: 'voting', optimizationState: 'complete', optimizationFinishedAt: this.ops.serverTimestamp() });
    });
  }
}

export class LocalAdapter {
  key(code) { return ROOM_PREFIX + normalizeRoomCode(code); }
  load(code) { const raw = storage().getItem(this.key(code)); return raw ? JSON.parse(raw) : null; }
  save(code, room) {
    storage().setItem(this.key(code), JSON.stringify(room));
    window.dispatchEvent(new CustomEvent(CHANNEL, { detail: { code: normalizeRoomCode(code) } }));
  }
  async create(meta) {
    const code = makeRoomCode(); const id = memberId(); const token = randomId(24);
    const room = publicRoom(code, { ...roomRecord(meta, code, id, token), createdAt: Date.now(), members: [{ id, nickname: meta.hostNickname, isHost: true, submitted: false }] });
    rememberHost(code, token); this.save(code, room); return room;
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
    const id = memberId(); const existing = room.members.find((item) => item.id === id);
    room.members = existing ? room.members.map((item) => item.id === id ? { ...item, nickname } : item) : [...room.members, { id, nickname, isHost: false, submitted: false }];
    this.save(code, room); return id;
  }
  async patch(code, patch) {
    const room = this.load(code); if (!room) throw new Error('Room not found.');
    if ('status' in patch && room.hostToken !== hostToken(code)) throw new Error('Only the host can change the room state.');
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
    if (!room || room.status !== 'analyzing' || room.hostId !== id || room.hostToken !== hostToken(code)) return false;
    if (room.optimizationState === 'running' && Date.now() - (room.optimizationStartedAt ?? 0) <= LOCK_STALE_MS) return false;
    const runId = randomId(12);
    this.save(code, { ...room, optimizationState: 'running', optimizationOwner: id, optimizationRunId: runId, optimizationStartedAt: Date.now() }); return runId;
  }
  async finishOptimization(code, result, runId) {
    const room = this.load(code); const success = result.status === 'success';
    if (!runId || room.optimizationRunId !== runId) throw new Error('This optimization run no longer owns the room lock.');
    this.save(code, { ...room, routes: success ? result.routes : [], error: success ? null : { code: result.code, message: result.message, placeIds: result.place_ids ?? [] }, status: 'voting', optimizationState: 'complete' });
  }
}

let selectedAdapter;
function getAdapter() {
  selectedAdapter ??= SYNC_MODE === 'firestore' ? new FirestoreAdapter() : new LocalAdapter();
  return selectedAdapter;
}

export const readRoom = async (code) => getAdapter().read(normalizeRoomCode(code));
export function subscribe(code, callback, onError) {
  try { return getAdapter().subscribe(normalizeRoomCode(code), callback, onError); }
  catch (error) { onError?.(error); return () => {}; }
}
export const createRoom = async (meta) => getAdapter().create(meta);
export const joinRoom = async (code, nickname) => getAdapter().join(normalizeRoomCode(code), nickname);
export const patchRoom = async (code, patch) => getAdapter().patch(normalizeRoomCode(code), patch);
export const addPlace = async (code, place) => getAdapter().addPlace(normalizeRoomCode(code), place);
export const updatePlace = async (code, placeId, patch) => getAdapter().updatePlace(normalizeRoomCode(code), placeId, patch);
export const removePlace = async (code, placeId) => getAdapter().removePlace(normalizeRoomCode(code), placeId);
export const submitRanking = async (code, id, ranking) => getAdapter().submitRanking(normalizeRoomCode(code), id, ranking);
export const castVote = async (code, id, routeId) => getAdapter().castVote(normalizeRoomCode(code), id, routeId);
export const claimOptimization = async (code, id) => getAdapter().claimOptimization(normalizeRoomCode(code), id);
export const finishOptimization = async (code, result, runId) => getAdapter().finishOptimization(normalizeRoomCode(code), result, runId);

export function resetLocalRooms() {
  Object.keys(storage()).filter((key) => key.startsWith(ROOM_PREFIX) || key.startsWith(HOST_PREFIX) || key === MEMBER_KEY).forEach((key) => storage().removeItem(key));
}
