// Temporary engine that lets the frontend build routes before /api/optimize is available.
// Request and response shapes match PROJECT.md section 4.3. When the backend is ready,
// USE_MOCK in api.js is disabled and this file is no longer used.
//
// It follows the PROJECT.md section 5 Track 1 rules without calling a live routing API.

import { toMinutes, toHHMM, durationText, daysBetween, listDates } from './time.js';

const DETOUR = 1.3;
const SPEED = { car: 40, transit: 22 }; // km/h
const WAIT = { car: 0, transit: 8 }; // minutes
const LUNCH = [toMinutes('11:30'), toMinutes('13:30')];
const DINNER = [toMinutes('17:30'), toMinutes('19:30')];
const MAX_PER_DAY = 4;

// PROJECT.md section 5.3: min_time prioritizes travel time; min_cost prioritizes cost.
const OBJECTIVES = [
  { type: 'min_time', label: 'Fastest Route', wt: 1.0, wc: 0.0 },
  { type: 'min_cost', label: 'Lowest-Cost Route', wt: 0.2, wc: 0.1 },
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

// A meal must start within the lunch or dinner window.
// Check the start time, not overlap, to prevent visits that only catch the end of a window.
function inMealSlot(start) {
  const within = ([from, to]) => start >= from && start <= to;
  return within(LUNCH) || within(DINNER);
}

function instructionFor(mode, minutes) {
  return `${mode === 'transit' ? 'Public transit' : 'Drive'} ${durationText(minutes)}`;
}

// Simulate one permutation and return null when it violates a constraint.
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

    // Reject routes that miss the reservation window.
    if (window && arrive > toMinutes(window.end)) return null;
    const start = Math.max(arrive, open, window ? toMinutes(window.start) : 0);
    if (window && start > toMinutes(window.end)) return null;
    // Reject routes that cannot fit the minimum stay before closing.
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
  if (finish > deadline) return null; // Past the daily deadline.

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
      const gap = Math.abs(toMinutes(b.hard_constraint.start) - toMinutes(a.hard_constraint.start));
      const need = leg(a, b, mode).minutes + a.stay_time_min;
      if (gap < need) {
        const [early, late] =
          toMinutes(a.hard_constraint.start) <= toMinutes(b.hard_constraint.start) ? [a, b] : [b, a];
        out.push({
          place_ids: [early.place_id, late.place_id],
          message:
            `The ${early.hard_constraint.start} reservation at ${early.name} conflicts with ` +
            `the ${late.hard_constraint.start} reservation at ${late.name}. ` +
            `The stay and travel require ${need} minutes. Adjust the time for one of these places.`,
        });
      }
    }
  }
  return out;
}

// PROJECT.md section 5.0. Split by coordinates across trip days without exceeding daily capacity.
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
        'No route fits within the business hours and daily deadline. ' +
        'Remove a place or choose a later deadline.',
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
      // If both objectives choose the same order, use the runner-up to keep the options distinct.
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
