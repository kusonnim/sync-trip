import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const listeners = new Map();
const localStorage = new MemoryStorage();
globalThis.__SYNCTRIP_SYNC_MODE__ = 'mock';
globalThis.__SYNCTRIP_API_MODE__ = 'mock';
globalThis.window = {
  localStorage,
  addEventListener(type, listener) {
    const group = listeners.get(type) ?? new Set(); group.add(listener); listeners.set(type, group);
  },
  removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
  dispatchEvent(event) { listeners.get(event.type)?.forEach((listener) => listener(event)); },
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

const room = await store.createRoom(meta);
assert.match(room.code, /^[A-HJ-NP-Z2-9]{4}$/);
assert.equal((await store.readRoom(room.code)).status, 'setup');
const hostId = room.hostId;

let events = 0;
const dispose = store.subscribe(room.code, () => { events += 1; });
assert.equal(events, 1, 'subscription emits an initial snapshot');

localStorage.removeItem('synctrip:member-id');
const guestId = await store.joinRoom(room.code, 'Guest');
assert.notEqual(guestId, hostId);
assert.equal((await store.readRoom(room.code)).members.length, 2);

const place = {
  id: 'p1', name: 'Museum', address: 'Seoul', category: 'museum', lat: 37.57, lng: 126.98,
  openTime: '10:00', closeTime: '18:00', minStay: 60, maxStay: 90, hoursSource: 'default',
};
await store.addPlace(room.code, place);
await store.updatePlace(room.code, place.id, { isFixed: true });
assert.equal((await store.readRoom(room.code)).places[0].isFixed, true);
await store.submitRanking(room.code, guestId, [place.id]);
assert.deepEqual((await store.readRoom(room.code)).preferences[guestId], [place.id]);

await store.castVote(room.code, guestId, 'min_time');
await store.castVote(room.code, guestId, 'min_cost');
assert.deepEqual((await store.readRoom(room.code)).finalVotes, { [guestId]: 'min_cost' }, 'a replacement vote overwrites the member document');

const beforeDispose = events;
dispose();
await store.updatePlace(room.code, place.id, { minStay: 70 });
assert.equal(events, beforeDispose, 'disposed listeners do not receive updates');

localStorage.setItem('synctrip:member-id', hostId);
await store.patchRoom(room.code, { status: 'collecting' });
await store.patchRoom(room.code, { status: 'analyzing', optimizationState: 'idle' });
const localRunId = await store.claimOptimization(room.code, hostId);
assert.ok(localRunId);
assert.equal(await store.claimOptimization(room.code, hostId), false, 'a running optimization cannot be claimed twice');

const routes = [{ type: 'min_time', label: 'Fastest Route', total_time: 10, total_cost: 1000, days: [] }];
await store.finishOptimization(room.code, { status: 'success', routes }, localRunId);
assert.deepEqual((await store.readRoom(room.code)).routes, routes);
await store.patchRoom(room.code, { status: 'confirmed', confirmedRouteId: 'min_time' });
assert.equal((await store.readRoom(room.code)).confirmedRouteId, 'min_time');

await store.patchRoom(room.code, { status: 'analyzing', optimizationState: 'idle' });
const localErrorRunId = await store.claimOptimization(room.code, hostId);
assert.ok(localErrorRunId);
await store.finishOptimization(room.code, { status: 'error', code: 'NO_ROUTE', message: 'No route fits.', place_ids: ['p1'] }, localErrorRunId);
assert.deepEqual((await store.readRoom(room.code)).error.placeIds, ['p1']);

const body = buildOptimizeBody(await store.readRoom(room.code), [{ ...place, score: 7 }]);
assert.equal(body.settings.transport_mode, 'transit');
assert.equal(body.places[0].preference_score, 7);
assert.equal(body.places[0].place_id, 'p1');

function createMockFirestore() {
  const documents = new Map();
  const subscriptions = new Set();
  const ref = (kind, parts) => ({ kind, path: parts.join('/') });
  const snapshot = (documentRef) => ({
    id: documentRef.path.split('/').at(-1),
    exists: () => documents.has(documentRef.path),
    data: () => documents.get(documentRef.path),
  });
  const querySnapshot = (collectionRef) => {
    const prefix = `${collectionRef.path}/`;
    const depth = collectionRef.path.split('/').length + 1;
    return {
      docs: [...documents.keys()]
        .filter((path) => path.startsWith(prefix) && path.split('/').length === depth)
        .map((path) => snapshot(ref('doc', path.split('/')))),
    };
  };
  const emit = () => subscriptions.forEach(({ target, next }) => next(target.kind === 'doc' ? snapshot(target) : querySnapshot(target)));
  const put = (target, value, options) => {
    documents.set(target.path, options?.merge ? { ...(documents.get(target.path) ?? {}), ...value } : { ...value }); emit();
  };
  const update = (target, value) => {
    if (!documents.has(target.path)) throw new Error('Document not found.');
    documents.set(target.path, { ...documents.get(target.path), ...value }); emit();
  };
  const remove = (target) => { documents.delete(target.path); emit(); };
  const transaction = {
    get: async (target) => snapshot(target),
    set: (target, value, options) => put(target, value, options),
    update,
    delete: remove,
  };
  return {
    ops: {
      doc: (_db, ...parts) => ref('doc', parts),
      collection: (_db, ...parts) => ref('collection', parts),
      getDoc: async (target) => snapshot(target),
      onSnapshot(target, next) {
        const item = { target, next }; subscriptions.add(item);
        next(target.kind === 'doc' ? snapshot(target) : querySnapshot(target));
        return () => subscriptions.delete(item);
      },
      runTransaction: async (_db, callback) => callback(transaction),
      serverTimestamp: () => Date.now(),
      setDoc: async (target, value, options) => put(target, value, options),
      updateDoc: async (target, value) => update(target, value),
      deleteDoc: async (target) => remove(target),
      writeBatch: () => {
        const actions = [];
        return {
          set: (...args) => actions.push(() => put(...args)),
          update: (...args) => actions.push(() => update(...args)),
          delete: (...args) => actions.push(() => remove(...args)),
          commit: async () => actions.forEach((action) => action()),
        };
      },
    },
    subscriptionCount: () => subscriptions.size,
  };
}

// Exercise the production adapter with a deterministic mock of Firebase's modular SDK.
localStorage.removeItem('synctrip:member-id');
const mockFirebase = createMockFirestore();
const firestoreStore = new store.FirestoreAdapter({}, mockFirebase.ops);
const firestoreRoom = await firestoreStore.create(meta);
const firestoreHostId = firestoreRoom.hostId;
let latestFirestoreRoom;
const unsubscribeFirestore = firestoreStore.subscribe(firestoreRoom.code, (next) => { latestFirestoreRoom = next; });
assert.equal(mockFirebase.subscriptionCount(), 7);
assert.equal(latestFirestoreRoom.members.length, 1);

localStorage.removeItem('synctrip:member-id');
const firestoreGuestId = await firestoreStore.join(firestoreRoom.code, 'Remote Guest');
await firestoreStore.addPlace(firestoreRoom.code, place);
await firestoreStore.submitRanking(firestoreRoom.code, firestoreGuestId, [place.id]);
await firestoreStore.castVote(firestoreRoom.code, firestoreGuestId, 'min_time');
await firestoreStore.castVote(firestoreRoom.code, firestoreGuestId, 'min_cost');
assert.equal(latestFirestoreRoom.members.length, 2);
assert.deepEqual(latestFirestoreRoom.preferences[firestoreGuestId], [place.id]);
assert.equal(latestFirestoreRoom.finalVotes[firestoreGuestId], 'min_cost');

localStorage.setItem('synctrip:member-id', firestoreHostId);
await firestoreStore.patch(firestoreRoom.code, { status: 'analyzing', optimizationState: 'idle' });
const abandonedRunId = await firestoreStore.claimOptimization(firestoreRoom.code, firestoreHostId);
assert.ok(abandonedRunId);
assert.equal(await firestoreStore.claimOptimization(firestoreRoom.code, firestoreHostId), false);
await firestoreStore.patch(firestoreRoom.code, { optimizationStartedAt: Date.now() - 121_000 });
const recoveredRunId = await firestoreStore.claimOptimization(firestoreRoom.code, firestoreHostId);
assert.ok(recoveredRunId, 'a stale optimization lock can be recovered');
await assert.rejects(() => firestoreStore.finishOptimization(firestoreRoom.code, { status: 'success', routes: [] }, abandonedRunId));
await firestoreStore.finishOptimization(firestoreRoom.code, { status: 'success', routes }, recoveredRunId);
assert.deepEqual(latestFirestoreRoom.routes, routes);
await firestoreStore.patch(firestoreRoom.code, { status: 'confirmed', confirmedRouteId: 'min_time' });
assert.equal(latestFirestoreRoom.confirmedRouteId, 'min_time');

await firestoreStore.patch(firestoreRoom.code, { status: 'analyzing', optimizationState: 'idle' });
const firestoreErrorRunId = await firestoreStore.claimOptimization(firestoreRoom.code, firestoreHostId);
assert.ok(firestoreErrorRunId);
await firestoreStore.finishOptimization(firestoreRoom.code, { status: 'error', code: 'NO_ROUTE', message: 'No route fits.', place_ids: ['p1'] }, firestoreErrorRunId);
assert.deepEqual(latestFirestoreRoom.error.placeIds, ['p1']);
unsubscribeFirestore();
assert.equal(mockFirebase.subscriptionCount(), 0, 'all seven Firestore listeners are disposed');

console.log('All mocked local/Firestore room-store and frontend/backend contract checks passed');
