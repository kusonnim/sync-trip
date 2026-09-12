// 백엔드 호출을 한곳에 모은다. 요청과 응답 모양은 PROJECT.md 4절 규약을 따른다.
// .env 에 VITE_API_BASE 를 넣으면 USE_MOCK 이 꺼지고 실제 백엔드를 부른다.
//
// 외부 API 키는 전부 백엔드에만 둔다. 여기에 카카오·ODsay·구글 키를 넣지 않는다.

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
  if (!res.ok) throw new Error(`${path} 실패 (${res.status})`);
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
  if (USE_MOCK) return null; // 목업에서는 카테고리 기본값을 그대로 쓴다
  try {
    const body = await request(`/api/place/details?name=${encodeURIComponent(name)}`);
    if (body.status !== 'success') return null;
    return { openTime: body.data.open_time, closeTime: body.data.close_time };
  } catch {
    return null; // 영업시간을 못 받아도 일정 생성은 계속되어야 한다
  }
}

/**
 * 방 상태와 후보 장소를 PROJECT.md ③ 의 요청 본문으로 바꾼다.
 * 화면은 camelCase 로 다루고 백엔드는 snake_case 로 받으므로 변환은 여기서만 한다.
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
      // 화면에서는 예약 시각 하나만 입력받고, 규약의 창 모양으로 넓혀 보낸다.
      hard_constraint: p.fixedTime ? { start: p.fixedTime, end: p.fixedTime } : null,
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
