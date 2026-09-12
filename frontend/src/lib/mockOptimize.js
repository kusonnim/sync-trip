// 백엔드 /api/optimize 가 붙기 전까지 프론트 혼자 경로를 만들어내는 임시 엔진.
// 요청과 응답 모양은 PROJECT.md 4절 ③ 과 똑같다. 백엔드가 준비되면
// api.js 의 USE_MOCK 이 꺼지면서 이 파일은 더 이상 쓰이지 않는다.
//
// PROJECT.md 5절 Track 1 과 같은 규칙을 쓰되 실제 길찾기 API 는 부르지 않는다.

import { toMinutes, toHHMM, durationText, daysBetween, listDates } from './time.js';

const DETOUR = 1.3;
const SPEED = { car: 40, transit: 22 }; // km/h
const WAIT = { car: 0, transit: 8 }; // 분
const LUNCH = [toMinutes('11:30'), toMinutes('13:30')];
const DINNER = [toMinutes('17:30'), toMinutes('19:30')];
const MAX_PER_DAY = 4;

// PROJECT.md 5절 3번. min_time 은 이동 시간, min_cost 는 비용을 먼저 본다.
const OBJECTIVES = [
  { type: 'min_time', label: '최소 시간', wt: 1.0, wc: 0.0 },
  { type: 'min_cost', label: '최소 비용', wt: 0.2, wc: 0.1 },
];
const PREFERENCE_WEIGHT = 3;

function haversine(a, b) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function leg(a, b, mode) {
  const km = haversine(a, b) * DETOUR;
  const minutes = Math.max(
    mode === 'transit' ? 10 : 5,
    Math.round((km / SPEED[mode]) * 60) + WAIT[mode],
  );
  const cost = mode === 'transit'
    ? 1400 + Math.max(0, Math.ceil(km - 10)) * 100
    : Math.round(km * 140);
  return { minutes, cost };
}

function permutations(items) {
  if (items.length <= 1) return [items];
  const out = [];
  items.forEach((item, i) => {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    permutations(rest).forEach((p) => out.push([item, ...p]));
  });
  return out;
}

// 식사 시작 시각이 점심 또는 저녁 창 안에 들어와야 한다.
// 창 끝에 몇 분만 걸치는 배치를 막으려고 겹침이 아니라 시작 시각으로 판정한다.
function inMealSlot(start) {
  const within = ([from, to]) => start >= from && start <= to;
  return within(LUNCH) || within(DINNER);
}

function instructionFor(mode, minutes) {
  return `${mode === 'transit' ? '대중교통' : '자차'} ${durationText(minutes)}`;
}

// 순열 하나를 시뮬레이션한다. 제약을 어기면 null 을 돌려준다.
function simulate(order, ctx) {
  const { origin, destination, mode, startAt, deadline } = ctx;
  const timeline = [{ type: 'place', name: origin.name, time: toHHMM(startAt) }];
  let cursor = startAt;
  let prev = origin;
  let totalTime = 0;
  let totalCost = 0;

  for (const place of order) {
    const move = leg(prev, place, mode);
    const arrive = cursor + move.minutes;
    const open = toMinutes(place.open_time);
    const close = toMinutes(place.close_time);
    const window = place.hard_constraint;

    // 예약 창을 못 맞추면 폐기한다
    if (window && arrive > toMinutes(window.end)) return null;
    const start = Math.max(arrive, open, window ? toMinutes(window.start) : 0);
    if (window && start > toMinutes(window.end)) return null;
    // 영업 종료 전에 최소 체류를 못 채우면 폐기한다
    if (start + place.stay_time_min > close) return null;
    if (place.category === 'restaurant' && !inMealSlot(start)) return null;

    const stay = place.stay_time_min;
    timeline.push({
      type: 'transit',
      mode,
      instruction: instructionFor(mode, move.minutes),
      time: `${toHHMM(cursor)} ~ ${toHHMM(arrive)}`,
      duration: move.minutes,
      cost: move.cost,
    });
    timeline.push({
      type: 'place',
      place_id: place.place_id,
      name: place.name,
      category: place.category,
      time: `${toHHMM(start)} ~ ${toHHMM(start + stay)}`,
      stay_duration: stay,
      wait_duration: start - arrive,
      hard_constraint: window ?? null,
    });

    totalTime += move.minutes;
    totalCost += move.cost;
    cursor = start + stay;
    prev = place;
  }

  const back = leg(prev, destination, mode);
  const finish = cursor + back.minutes;
  if (finish > deadline) return null; // 해산 시각 초과

  timeline.push({
    type: 'transit',
    mode,
    instruction: instructionFor(mode, back.minutes),
    time: `${toHHMM(cursor)} ~ ${toHHMM(finish)}`,
    duration: back.minutes,
    cost: back.cost,
  });
  timeline.push({ type: 'place', name: destination.name, time: toHHMM(finish) });

  return {
    order: order.map((p) => p.place_id).join('>'),
    timeline,
    total_time: totalTime + back.minutes,
    total_cost: totalCost + back.cost,
    preference: order.reduce((sum, p) => sum + (p.preference_score ?? 0), 0),
  };
}

/**
 * PROJECT.md 5절 4번. 예약이 있는 장소 쌍만 검사하므로 순열 탐색보다 훨씬 싸다.
 * 그래서 탐색 전에 먼저 돌린다.
 */
export function findConflicts(places, mode) {
  const fixed = places.filter((p) => p.hard_constraint);
  const out = [];
  for (let i = 0; i < fixed.length; i += 1) {
    for (let j = i + 1; j < fixed.length; j += 1) {
      const a = fixed[i];
      const b = fixed[j];
      const gap = Math.abs(toMinutes(b.hard_constraint.start) - toMinutes(a.hard_constraint.start));
      const need = leg(a, b, mode).minutes + a.stay_time_min;
      if (gap < need) {
        const [early, late] =
          toMinutes(a.hard_constraint.start) <= toMinutes(b.hard_constraint.start) ? [a, b] : [b, a];
        out.push({
          place_ids: [early.place_id, late.place_id],
          message:
            `${early.name} ${early.hard_constraint.start} 예약과 ` +
            `${late.name} ${late.hard_constraint.start} 예약은 ` +
            `머무는 시간과 이동에 ${need}분이 필요해 함께 갈 수 없습니다. ` +
            `둘 중 한 곳의 시간을 조정해 주세요.`,
        });
      }
    }
  }
  return out;
}

// PROJECT.md 5절 0번. 좌표로 날짜 수만큼 나누고 하루 정원을 넘기지 않게 채운다.
function splitByDay(places, dayCount) {
  if (dayCount <= 1) return [places];
  const seeds = [places[0]];
  while (seeds.length < dayCount) {
    let best = null;
    let bestDist = -1;
    places.forEach((p) => {
      if (seeds.includes(p)) return;
      const d = Math.min(...seeds.map((s) => haversine(s, p)));
      if (d > bestDist) { bestDist = d; best = p; }
    });
    if (!best) break;
    seeds.push(best);
  }

  const buckets = seeds.map((s) => [s]);
  const capacity = Math.max(1, Math.min(MAX_PER_DAY, Math.ceil(places.length / dayCount)));
  places
    .filter((p) => !seeds.includes(p))
    .forEach((p) => {
      const ranked = buckets
        .map((b, i) => ({ i, d: haversine(seeds[i], p) }))
        .sort((a, b) => a.d - b.d);
      const target = ranked.find((r) => buckets[r.i].length < capacity) ?? ranked[0];
      buckets[target.i].push(p);
    });
  return buckets;
}

/**
 * @param {object} body PROJECT.md 4절 ③ 의 요청 본문
 * @returns PROJECT.md 4절 ③ 의 응답
 */
export function optimizeLocally(body) {
  const { settings, places } = body;
  const mode = settings.transport_mode;

  const conflicts = findConflicts(places, mode);
  if (conflicts.length) {
    return {
      status: 'error',
      code: 'TIME_CONFLICT',
      message: conflicts[0].message,
      place_ids: conflicts[0].place_ids,
    };
  }

  const dates = listDates(settings.start_date, daysBetween(settings.start_date, settings.end_date));
  const buckets = splitByDay([...places], dates.length);
  const ctx = {
    origin: settings.start_location,
    destination: settings.end_location,
    mode,
    startAt: toMinutes(settings.start_time),
    deadline: toMinutes(settings.end_deadline),
  };

  const perDay = buckets.map((bucket) =>
    permutations(bucket.slice(0, 6)).map((order) => simulate(order, ctx)).filter(Boolean),
  );

  if (perDay.some((c) => c.length === 0)) {
    return {
      status: 'error',
      code: 'NO_ROUTE',
      message:
        '영업시간과 해산 시각 안에 들어가는 순서를 찾지 못했습니다. ' +
        '장소를 줄이거나 해산 시각을 늦춰 주세요.',
      place_ids: [],
    };
  }

  const used = new Set();
  const routes = OBJECTIVES.map((obj) => {
    const days = perDay.map((candidates, dayIndex) => {
      const ranked = [...candidates].sort(
        (a, b) =>
          (obj.wt * a.total_time + obj.wc * a.total_cost - a.preference * PREFERENCE_WEIGHT) -
          (obj.wt * b.total_time + obj.wc * b.total_cost - b.preference * PREFERENCE_WEIGHT),
      );
      // 두 안의 순서가 같아지면 차순위로 대체해 항상 서로 다른 선택지를 준다.
      const pick = ranked.find((c) => !used.has(`${dayIndex}:${c.order}`)) ?? ranked[0];
      used.add(`${dayIndex}:${pick.order}`);
      return {
        date: dates[dayIndex],
        total_time: pick.total_time,
        total_cost: pick.total_cost,
        timeline: pick.timeline,
      };
    });

    return {
      type: obj.type,
      label: obj.label,
      total_time: days.reduce((s, d) => s + d.total_time, 0),
      total_cost: days.reduce((s, d) => s + d.total_cost, 0),
      days,
    };
  });

  return { status: 'success', routes };
}
