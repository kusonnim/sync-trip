import { MockRoomAdapter, resetMockRooms } from './mockRoomStore.js';
import { SupabaseRoomAdapter } from './supabaseRoomStore.js';
import {
  getMemberId, makeRoomCode, normalizeRoomCode, resetIdentity, setMemberId,
} from './roomIdentity.js';
import { SYNC_MODE } from './runtimeConfig.js';

let selectedAdapter;
function getAdapter() {
  selectedAdapter ??= SYNC_MODE === 'supabase' ? new SupabaseRoomAdapter() : new MockRoomAdapter();
  return selectedAdapter;
}

export { makeRoomCode, normalizeRoomCode, MockRoomAdapter, SupabaseRoomAdapter };
export const getMyId = (code) => getMemberId(code);
export const setMyId = (code, id) => setMemberId(code, id);
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
export const finishOptimization = async (code, result, nonce) => getAdapter().finishOptimization(normalizeRoomCode(code), result, nonce);

export function resetLocalRooms() {
  resetMockRooms();
  resetIdentity();
}
