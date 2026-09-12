// Centralize backend calls. Request and response shapes follow the PROJECT.md section 4 contract.
// VITE_API_MODE explicitly selects the backend or local mock implementation.
//
// Keep all external API keys in the backend. Never add Kakao, ODsay, or Google keys here.

import { searchMockPlaces } from './mockPlaces.js';
import { optimizeLocally } from './mockOptimize.js';
import { applyCategoryDefaults } from './categories.js';
import { API_BASE, API_MODE } from './runtimeConfig.js';

export const USE_MOCK = API_MODE === 'mock';

async function request(path, options) {
  if (!USE_MOCK && !API_BASE) {
    throw new Error('Backend configuration is missing. Ask the host to set VITE_API_BASE.');
  }
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message || 'The backend is temporarily unavailable. Please try again.');
  return body;
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
  const body = await request(`/api/place/details?name=${encodeURIComponent(name)}`);
  if (body.status !== 'success') return null;
  return { openTime: body.data.open_time, closeTime: body.data.close_time };
}

/**
 * Convert room state and candidate places into the PROJECT.md section 3 request body.
 * The UI uses camelCase and the backend accepts snake_case, so conversion happens only here.
 */
export function buildOptimizeBody(room, candidates) {
  const accommodations = room.accommodations?.length
    ? room.accommodations
    : (room.accommodation ? [room.accommodation] : (room.hotel ? [room.hotel] : []));
  return {
    settings: {
      transport_mode: room.transportMode,
      start_date: room.startDate,
      end_date: room.endDate,
      start_location: room.origin,
      end_location: room.destination,
      start_time: room.dailyStart,
      end_deadline: room.dailyEnd,
      // One accommodation per night, in order. One entry covers every night.
      accommodations,
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

const stopsOf = (day) => day.timeline.filter((entry) => entry.type === 'place');

/**
 * A router that does not understand `accommodations` ignores the field and sends
 * every day back to the trip's start and end. That reads as a perfectly ordinary
 * itinerary, so nothing downstream notices. Check the answer against the question
 * and say so, rather than showing a plan the group never asked for.
 */
export function findAccommodationMismatch(body, result) {
  const stays = body.settings.accommodations ?? [];
  const days = result.routes?.[0]?.days ?? [];
  if (!stays.length || days.length < 2) return null;

  const stayNames = new Set(stays.map((stay) => stay.name));
  const wrong = days.findIndex((day, index) => {
    const stops = stopsOf(day);
    if (!stops.length) return false;
    const startsAtStay = index > 0 && !stayNames.has(stops[0].name);
    const endsAtStay = index < days.length - 1 && !stayNames.has(stops.at(-1).name);
    return startsAtStay || endsAtStay;
  });
  if (wrong < 0) return null;

  return {
    status: 'error',
    code: 'ACCOMMODATION_IGNORED',
    message:
      '경로 계산 서버가 숙소를 반영하지 않았습니다. ' +
      `${days[wrong].date} 일정이 숙소에서 시작하거나 끝나지 않습니다. ` +
      '서버가 최신 버전인지 확인해 주세요.',
    place_ids: [],
  };
}

/** PROJECT.md ③ POST /api/optimize */
export async function optimize(body) {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, 900));
    return optimizeLocally(body);
  }
  const result = await request('/api/optimize', { method: 'POST', body: JSON.stringify(body) });
  if (result?.status !== 'success') return result;
  return findAccommodationMismatch(body, result) ?? result;
}
