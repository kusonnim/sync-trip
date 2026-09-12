const MEMBER_KEY = 'synctrip:member-id';
const HOST_PREFIX = 'synctrip:host-token:';
export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function storage() {
  if (typeof window === 'undefined') throw new Error('Room storage requires a browser.');
  return window.localStorage;
}

export function normalizeRoomCode(code) {
  return String(code ?? '').trim().toUpperCase();
}

export function randomHex(bytes = 18) {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('');
}

export function makeRoomCode() {
  const values = new Uint8Array(4);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => ROOM_ALPHABET[value % ROOM_ALPHABET.length]).join('');
}

export function getMemberId() {
  let id = storage().getItem(MEMBER_KEY);
  if (!id) {
    id = `m-${randomHex(12)}`;
    storage().setItem(MEMBER_KEY, id);
  }
  return id;
}

export function setMemberId(id) {
  if (id) storage().setItem(MEMBER_KEY, id);
}

export function getHostToken(code) {
  return storage().getItem(HOST_PREFIX + normalizeRoomCode(code));
}

export function rememberHost(code, token) {
  storage().setItem(HOST_PREFIX + normalizeRoomCode(code), token);
}

export function resetIdentity() {
  Object.keys(storage())
    .filter((key) => key.startsWith(HOST_PREFIX) || key === MEMBER_KEY)
    .forEach((key) => storage().removeItem(key));
}
