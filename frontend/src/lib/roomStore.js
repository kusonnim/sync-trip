// 방 상태 저장소. 지금은 localStorage 로 동작하고 같은 브라우저의 다른 탭끼리 동기화된다.
// 백엔드 담당이 Firestore 를 붙일 때 이 파일의 함수 본문만 교체하면 화면 코드는 그대로 둔다.
//
// Firestore 로 옮길 때 대응 관계
//   readRoom  -> getDoc(doc(db, 'rooms', code))
//   subscribe -> onSnapshot(doc(db, 'rooms', code))
//   patchRoom -> updateDoc(...)

const PREFIX = 'synctrip:room:';
const ME = 'synctrip:me:';
const CHANNEL = 'synctrip:changed';

function key(code) {
  return PREFIX + code;
}

function emit(code) {
  window.dispatchEvent(new CustomEvent(CHANNEL, { detail: { code } }));
}

export function makeRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function readRoom(code) {
  if (!code) return null;
  try {
    const raw = localStorage.getItem(key(code));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeRoom(code, room) {
  localStorage.setItem(key(code), JSON.stringify(room));
  emit(code);
}

export function patchRoom(code, patch) {
  const room = readRoom(code);
  if (!room) return null;
  const next = typeof patch === 'function' ? patch(room) : { ...room, ...patch };
  writeRoom(code, next);
  return next;
}

export function subscribe(code, callback) {
  const fire = () => callback(readRoom(code));
  const onCustom = (e) => { if (e.detail?.code === code) fire(); };
  const onStorage = (e) => { if (e.key === key(code)) fire(); };
  window.addEventListener(CHANNEL, onCustom);
  window.addEventListener('storage', onStorage);
  fire();
  return () => {
    window.removeEventListener(CHANNEL, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}

export function createRoom(meta) {
  const code = makeRoomCode();
  const hostId = uid('m');
  const room = {
    code,
    status: 'setup', // setup -> collecting -> analyzing -> voting -> confirmed
    createdAt: Date.now(),
    hostId,
    ...meta,
    members: [{ id: hostId, nickname: meta.hostNickname, isHost: true, submitted: false }],
    places: [],
    preferences: {},
    routes: [],
    error: null,
    finalVotes: {},
    confirmedRouteId: null,
  };
  writeRoom(code, room);
  setMyId(code, hostId);
  return room;
}

export function joinRoom(code, nickname) {
  const room = readRoom(code);
  if (!room) return null;
  const id = uid('m');
  patchRoom(code, (r) => ({
    ...r,
    members: [...r.members, { id, nickname, isHost: false, submitted: false }],
  }));
  setMyId(code, id);
  return id;
}

export function getMyId(code) {
  return localStorage.getItem(ME + code);
}

export function setMyId(code, id) {
  localStorage.setItem(ME + code, id);
}

export function addPlace(code, place) {
  patchRoom(code, (r) =>
    r.places.some((p) => p.id === place.id) ? r : { ...r, places: [...r.places, place] },
  );
}

export function updatePlace(code, placeId, patch) {
  patchRoom(code, (r) => ({
    ...r,
    places: r.places.map((p) => (p.id === placeId ? { ...p, ...patch } : p)),
  }));
}

export function removePlace(code, placeId) {
  patchRoom(code, (r) => ({
    ...r,
    places: r.places.filter((p) => p.id !== placeId),
    preferences: Object.fromEntries(
      Object.entries(r.preferences).map(([mid, list]) => [mid, list.filter((id) => id !== placeId)]),
    ),
  }));
}

export function submitRanking(code, memberId, ranking) {
  patchRoom(code, (r) => ({
    ...r,
    preferences: { ...r.preferences, [memberId]: ranking },
    members: r.members.map((m) => (m.id === memberId ? { ...m, submitted: true } : m)),
  }));
}

export function castVote(code, memberId, routeId) {
  patchRoom(code, (r) => ({ ...r, finalVotes: { ...r.finalVotes, [memberId]: routeId } }));
}

export function resetLocalRooms() {
  Object.keys(localStorage)
    .filter((k) => k.startsWith(PREFIX) || k.startsWith(ME))
    .forEach((k) => localStorage.removeItem(k));
}
