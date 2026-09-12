const MEMBER_PREFIX = 'synctrip:member-id:';
const HOST_PREFIX = 'synctrip:host-token:';
export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function storage() {
  if (typeof window === 'undefined') throw new Error('Room storage requires a browser.');
  return window.localStorage;
}

function identityStorage() {
  if (typeof window === 'undefined') throw new Error('Room identity requires a browser.');
  return window.sessionStorage;
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

export function makeMemberId() {
  return `m-${randomHex(12)}`;
}

export function getMemberId(code) {
  if (!code) return null;
  return identityStorage().getItem(MEMBER_PREFIX + normalizeRoomCode(code));
}

export function ensureMemberId(code) {
  let id = getMemberId(code);
  if (!id) {
    id = makeMemberId();
    setMemberId(code, id);
  }
  return id;
}

export function setMemberId(code, id) {
  if (code && id) identityStorage().setItem(MEMBER_PREFIX + normalizeRoomCode(code), id);
}

export function getHostToken(code) {
  return storage().getItem(HOST_PREFIX + normalizeRoomCode(code));
}

export function rememberHost(code, token) {
  storage().setItem(HOST_PREFIX + normalizeRoomCode(code), token);
}

export function resetIdentity() {
  const shared = storage();
  const hostKeys = Array.from({ length: shared.length }, (_, index) => shared.key(index))
    .filter((key) => key?.startsWith(HOST_PREFIX));
  hostKeys.forEach((key) => shared.removeItem(key));
  const scoped = identityStorage();
  const memberKeys = Array.from({ length: scoped.length }, (_, index) => scoped.key(index))
    .filter((key) => key?.startsWith(MEMBER_PREFIX));
  memberKeys.forEach((key) => scoped.removeItem(key));
}
