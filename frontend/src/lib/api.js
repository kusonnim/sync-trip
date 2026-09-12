// Centralize backend calls. Request and response shapes follow the PROJECT.md section 4 contract.
// Setting VITE_API_BASE in .env disables USE_MOCK and calls the real backend.
//
// Keep all external API keys in the backend. Never add Kakao, ODsay, or Google keys here.

import { searchMockPlaces } from './mockPlaces.js';
import { optimizeLocally } from './mockOptimize.js';
import { applyCategoryDefaults } from './categories.js';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';
export const USE_MOCK = !API_BASE;

async function request(path, options) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`${path} failed (${res.status})`);
  return res.json();
}

/** PROJECT.md ① GET /api/search?keyword= */
export async function searchPlaces(keyword) {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 180));
    return searchMockPlaces(keyword).map(applyCategoryDefaults);
  }
  const body = await request(`/api/search?keyword=${encodeURIComponent(keyword)}`);
  return body.data.map((p) =>
    applyCategoryDefaults({
      id: p.place_id,
      name: p.name,
      address: p.address,
      lat: p.lat,
      lng: p.lng,
      category: p.category ?? 'attraction',
    }),
  );
}

/** PROJECT.md ② GET /api/place/details?name= */
export async function fetchPlaceHours(name) {
  if (USE_MOCK) return null; // The mock keeps the category defaults.
  try {
    const body = await request(`/api/place/details?name=${encodeURIComponent(name)}`);
    if (body.status !== 'success') return null;
    return { openTime: body.data.open_time, closeTime: body.data.close_time };
  } catch {
    return null; // Itinerary creation must continue when business hours are unavailable.
  }
}

/**
 * Convert room state and candidate places into the PROJECT.md section 3 request body.
 * The UI uses camelCase and the backend accepts snake_case, so conversion happens only here.
 */
export function buildOptimizeBody(room, candidates) {
  return {
    settings: {
      transport_mode: room.transportMode,
      start_date: room.startDate,
      end_date: room.endDate,
      start_location: room.origin,
      end_location: room.destination,
      start_time: room.dailyStart,
      end_deadline: room.dailyEnd,
    },
    places: candidates.map((p) => ({
      place_id: p.id,
      name: p.name,
      category: p.category,
      lat: p.lat,
      lng: p.lng,
      stay_time_min: p.minStay,
      stay_time_max: p.maxStay,
      open_time: p.openTime,
      close_time: p.closeTime,
      // Pass the scheduled visit window straight through. When only a start was entered,
      // start and end are equal. fixedTime is the legacy field kept for older rooms.
      hard_constraint:
        p.visitWindow ?? (p.fixedTime ? { start: p.fixedTime, end: p.fixedTime } : null),
      preference_score: p.score ?? 0,
    })),
  };
}

/** PROJECT.md ③ POST /api/optimize */
export async function optimize(body) {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 900));
    return optimizeLocally(body);
  }
  return request('/api/optimize', { method: 'POST', body: JSON.stringify(body) });
}
