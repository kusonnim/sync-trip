// Temporary engine that lets the frontend build routes before /api/optimize is available.
// Request and response shapes match PROJECT.md section 4.3. When the backend is ready,
// USE_MOCK in api.js is disabled and this file is no longer used.
//
// It follows the PROJECT.md section 5 Track 1 rules without calling a live routing API.

import { toMinutes, toHHMM, daysBetween, listDates } from './time.js';

const DETOUR = 1.3;
const SPEED = { car: 40, transit: 22 }; // km/h
const WAIT = { car: 0, transit: 8 }; // minutes
const LUNCH = [toMinutes('11:30'), toMinutes('13:30')];
const DINNER = [toMinutes('17:30'), toMinutes('19:30')];
const MAX_PER_DAY = 4;

// PROJECT.md section 5.3: min_time prioritizes travel time; min_cost prioritizes cost.
const OBJECTIVES = [
  { type: 'min_time', label: '최소 시간', wt: 1.0, wc: 0.0 },
  { type: 'min_cost', label: '최소 비용', wt: 0.2, wc: 0.1 },
];
const PREFERENCE_WEIGHT = 3;
const WAIT_WEIGHT = 0.5; // Count one waiting minute as half a travelling minute.

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
  // Transit charges a base fare for the first 10 km, then 100 won per whole 5 km step.
  // Driving charges nothing: fuel is the group's own car, and only a routing
  // provider knows the toll, which this local engine never calls.
  const cost = mode === 'transit'
    ? 1400 + Math.ceil(Math.max(0, km - 10) / 5) * 100
    : 0;
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

/**
 * When the visit can begin, or null if it cannot happen at all. Arriving early
 * means waiting, not failing: waiting for the doors to open, for a reservation,
 * or for a meal window. Mirrors resolve_visit_start in the backend.
 */
function resolveVisitStart(place, arrive) {
  const open = toMinutes(place.open_time);
  const close = toMinutes(place.close_time);
  const window = place.hard_constraint;
  const earliest = Math.max(arrive, open, window ? toMinutes(window.start) : 0);
  // The whole minimum stay has to fit before closing, and a reservation caps the start.
  const latest = Math.min(close - place.stay_time_min, window ? toMinutes(window.end) : close);

  if (place.category !== 'restaurant') return earliest <= latest ? earliest : null;

  for (const [mealStart, mealEnd] of [LUNCH, DINNER]) {
    const candidate = Math.max(earliest, mealStart);
    if (candidate <= mealEnd && candidate <= latest) return candidate;
  }
  return null;
}

function instructionFor(mode) {
  // The real backend puts a route name such as "Line 2: Konkuk Univ. to Seongsu" here.
  // Duration travels in its own field, so it does not belong in this text.
  return mode === 'transit' ? '대중교통' : '자차';
}

// Simulate one permutation and return null when it violates a constraint.
function simulate(order, ctx, anchors) {
  const { mode, startAt, deadline } = ctx;
  const [origin, destination] = anchors;
  const timeline = [{ type: 'place', name: origin.name, time: toHHMM(startAt) }];
  let cursor = startAt;
  let prev = origin;
  let totalTime = 0;
  let totalCost = 0;
  let totalWait = 0;

  for (const place of order) {
    const move = leg(prev, place, mode);
    const arrive = cursor + move.minutes;
    const window = place.hard_constraint;
    const start = resolveVisitStart(place, arrive);
    if (start === null) return null;

    const stay = place.stay_time_min;
    timeline.push({
      type: 'transit',
      mode,
      instruction: instructionFor(mode),
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
    totalWait += start - arrive;
    cursor = start + stay;
    prev = place;
  }

  const back = leg(prev, destination, mode);
  const finish = cursor + back.minutes;
  if (finish > deadline) return null; // Past the daily deadline.

  timeline.push({
    type: 'transit',
    mode,
    instruction: instructionFor(mode),
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
    total_wait: totalWait,
    preference: order.reduce((sum, p) => sum + (p.preference_score ?? 0), 0),
  };
}

/**
 * PROJECT.md section 5.4. Checking only pairs with reservations is much cheaper than
 * permutation search, so run this first.
 */
export function findConflicts(places, mode) {
  const fixed = places.filter((p) => p.hard_constraint);
  const out = [];
  for (let i = 0; i < fixed.length; i += 1) {
    for (let j = i + 1; j < fixed.length; j += 1) {
      const a = fixed[i];
      const b = fixed[j];
      const [early, late] =
        toMinutes(a.hard_constraint.start) <= toMinutes(b.hard_constraint.start) ? [a, b] : [b, a];
      const available = toMinutes(late.hard_constraint.end) - toMinutes(early.hard_constraint.start);
      const need = early.stay_time_min + leg(early, late, mode).minutes;
      if (available < need) {
        out.push({
          place_ids: [early.place_id, late.place_id],
          message:
            `${early.name} ${early.hard_constraint.start} 방문과 ` +
            `${late.name} ${late.hard_constraint.start} 방문은 ` +
            `머무는 시간과 이동에 ${need}분이 필요해 함께 갈 수 없습니다. ` +
            `둘 중 한 곳의 시간을 조정해 주세요.`,
        });
      }
    }
  }
  return out;
}

// PROJECT.md section 5.0. Split by coordinates across trip days without exceeding daily capacity.
// There is one bucket per travel day even when there are fewer places than days.
// A day with nothing to visit still exists: it runs from that day's start anchor to
// its end anchor, which is how a night at an accommodation stays in the itinerary.
function splitByDay(places, dayCount) {
  if (dayCount <= 1) return [places];
  const buckets = Array.from({ length: dayCount }, () => []);
  if (!places.length) return buckets;

  const seeds = [places[0]];
  while (seeds.length < Math.min(dayCount, places.length)) {
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
  seeds.forEach((seed, index) => buckets[index].push(seed));

  const capacity = Math.max(1, Math.min(MAX_PER_DAY, Math.ceil(places.length / dayCount)));
  places
    .filter((p) => !seeds.includes(p))
    .forEach((p) => {
      // Rank against the seeds, not the buckets: a day without a seed has no
      // coordinate to measure against.
      const ranked = seeds
        .map((seed, i) => ({ i, d: haversine(seed, p) }))
        .sort((a, b) => a.d - b.d);
      const target = ranked.find((r) => buckets[r.i].length < capacity) ?? ranked[0];
      buckets[target.i].push(p);
    });
  return buckets;
}

/**
 * Where each day begins and ends. The trip starts at the departure point and
 * finishes at the arrival point; every night in between is spent at an
 * accommodation, so one day ends where the next begins.
 * One accommodation covers every night; more are used in order, one per night.
 */
function dayAnchors(settings, dayCount) {
  const nights = dayCount - 1;
  if (nights <= 0) return [[settings.start_location, settings.end_location]];
  const stays = settings.accommodations ?? [];
  const nightly = Array.from({ length: nights }, (_, night) => stays[Math.min(night, stays.length - 1)]);
  const anchors = [[settings.start_location, nightly[0]]];
  for (let night = 1; night < nights; night += 1) anchors.push([nightly[night - 1], nightly[night]]);
  anchors.push([nightly[nights - 1], settings.end_location]);
  return anchors;
}

/**
 * @param {object} body Request body from PROJECT.md section 4.3
 * @returns Response from PROJECT.md section 4.3
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
  if (dates.length > 1 && !(settings.accommodations ?? []).length) {
    return {
      status: 'error',
      code: 'NO_ROUTE',
      message: '숙소가 없어 중간 날의 시작과 끝을 정할 수 없습니다. 여행 설정에서 숙소를 입력해 주세요.',
      place_ids: [],
    };
  }
  const buckets = splitByDay([...places], dates.length);
  const ctx = {
    mode,
    startAt: toMinutes(settings.start_time),
    deadline: toMinutes(settings.end_deadline),
  };
  const anchors = dayAnchors(settings, dates.length);

  const perDay = buckets.map((bucket, dayIndex) =>
    permutations(bucket.slice(0, 6))
      .map((order) => simulate(order, ctx, anchors[dayIndex]))
      .filter(Boolean),
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
      // Waiting counts alongside travelling. An order that burns hours waiting for a
      // reservation must not win just because its travel time is short.
      const cost = (c) =>
        obj.wt * (c.total_time + c.total_wait * WAIT_WEIGHT) +
        obj.wc * c.total_cost -
        c.preference * PREFERENCE_WEIGHT;
      const ranked = [...candidates].sort((a, b) => cost(a) - cost(b));
      // If both objectives choose the same order, use the runner-up to keep the options distinct.
      const pick = ranked.find((c) => !used.has(`${dayIndex}:${c.order}`)) ?? ranked[0];
      used.add(`${dayIndex}:${pick.order}`);
      return {
        date: dates[dayIndex],
        total_time: pick.total_time,
        total_cost: pick.total_cost,
        total_wait: pick.total_wait,
        timeline: pick.timeline,
      };
    });

    return {
      type: obj.type,
      label: obj.label,
      total_time: days.reduce((s, d) => s + d.total_time, 0),
      total_cost: days.reduce((s, d) => s + d.total_cost, 0),
      total_wait: days.reduce((s, d) => s + d.total_wait, 0),
      days,
    };
  });

  // When constraints are tight both objectives can land on the same order, leaving one
  // real option. Return it once instead of showing the user two identical cards.
  const signature = (r) =>
    r.days.map((d) => d.timeline.filter((t) => t.place_id).map((t) => t.place_id).join('>')).join('|');
  const unique = routes.filter(
    (r, i) => routes.findIndex((other) => signature(other) === signature(r)) === i,
  );

  return { status: 'success', routes: unique };
}
