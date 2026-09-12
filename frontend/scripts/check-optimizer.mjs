// Validate the PROJECT.md section 5 constraints against the temporary frontend engine.
// Run: npm run check
// The request and response shapes match PROJECT.md section 4.3, so the backend engine
// must pass the same checks once it is connected.

import { optimizeLocally, findConflicts } from '../src/lib/mockOptimize.js';
import { TOP_N, scorePlaces, pickCandidates } from '../src/lib/preference.js';
import { toMinutes, daysBetween } from '../src/lib/time.js';

let failed = 0;

function check(name, condition, detail = '') {
  if (!condition) failed += 1;
  console.log(`[${condition ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
}

const SEOUL = { name: 'Seoul Station', lat: 37.5547, lng: 126.9707 };

function place(id, name, category, lat, lng, extra = {}) {
  const stay = category === 'restaurant' ? 60 : 80;
  return {
    place_id: id,
    name,
    category,
    lat,
    lng,
    stay_time_min: stay,
    stay_time_max: stay + 30,
    open_time: '09:00',
    close_time: '21:00',
    hard_constraint: null,
    preference_score: 5,
    ...extra,
  };
}

const HOTEL = { name: 'Myeongdong Hotel', lat: 37.5636, lng: 126.9827 };

function settings(extra = {}) {
  const base = {
    transport_mode: 'transit',
    start_date: '2026-09-19',
    end_date: '2026-09-19',
    start_location: SEOUL,
    end_location: SEOUL,
    start_time: '10:00',
    end_deadline: '21:30',
    ...extra,
  };
  // Every night is spent at an accommodation unless a case names its own.
  if (!base.accommodations) {
    const nights = daysBetween(base.start_date, base.end_date) - 1;
    base.accommodations = nights > 0 ? [HOTEL] : [];
  }
  return base;
}

const stopsOf = (route) =>
  route.days.flatMap((d) => d.timeline.filter((t) => t.type === 'place' && t.place_id));

// 1. A place with a scheduled visit window must be visited within that window.
{
  const places = [
    place('a', 'Gyeongbokgung Palace', 'attraction', 37.5796, 126.9770),
    place('b', 'Gwangjang Market', 'restaurant', 37.5701, 126.9996, {
      hard_constraint: { start: '18:00', end: '18:00' },
    }),
    place('c', 'Bukchon Hanok Village', 'attraction', 37.5826, 126.9830),
  ];
  const res = optimizeLocally({ settings: settings(), places });
  const ok =
    res.status === 'success' &&
    res.routes.every((r) =>
      stopsOf(r).every((s) => !s.hard_constraint || s.time.startsWith(s.hard_constraint.start)));
  check('Visit starts within its scheduled window', ok, `${res.routes?.length ?? 0} routes generated`);
}

// 2. Reject permutations that cannot fit the minimum stay before closing.
{
  const places = [
    place('a', 'Leeum Museum of Art', 'museum', 37.5384, 126.9990, { close_time: '11:00', stay_time_min: 80 }),
    place('b', 'N Seoul Tower', 'attraction', 37.5512, 126.9882),
  ];
  const res = optimizeLocally({ settings: settings(), places });
  check('Reject permutation that violates closing time', res.status === 'error' && res.code === 'NO_ROUTE', res.code ?? 'A route was found');
}

// 3. A restaurant visit must start within the lunch or dinner window.
{
  const places = [
    place('a', 'Gwangjang Market', 'restaurant', 37.5701, 126.9996),
    place('b', 'Gyeongbokgung Palace', 'attraction', 37.5796, 126.9770),
    place('c', 'DDP', 'museum', 37.5665, 127.0092),
  ];
  const res = optimizeLocally({ settings: settings(), places });
  const meals = res.routes.flatMap(stopsOf).filter((s) => s.category === 'restaurant');
  const ok = meals.length > 0 && meals.every((s) => {
    const start = toMinutes(s.time.slice(0, 5));
    const within = ([f, t]) => start >= f && start <= t;
    return within([toMinutes('11:30'), toMinutes('13:30')]) || within([toMinutes('17:30'), toMinutes('19:30')]);
  });
  check('Place restaurants only in meal windows', ok, meals.map((s) => s.time).join(', '));
}

// 3b. Arriving before a meal window means waiting for it, not failing the whole day.
// A restaurant reached at opening time is the ordinary case on a one-restaurant day.
{
  const places = [place('a', 'Gwangjang Market', 'restaurant', 37.5701, 126.9996)];
  const res = optimizeLocally({ settings: settings(), places });
  const meal = res.status === 'success' ? stopsOf(res.routes[0])[0] : null;
  check(
    'Wait for the lunch window instead of rejecting the day',
    meal !== null && toMinutes(meal.time.slice(0, 5)) >= toMinutes('11:30'),
    meal ? `${meal.time} (대기 ${meal.wait_duration}분)` : res.code,
  );
}

// 3c. Driving has no fare of its own. Only a routing provider knows the toll.
{
  const places = [
    place('a', 'Gyeongbokgung Palace', 'attraction', 37.5796, 126.9770),
    place('b', 'Seoul Forest', 'attraction', 37.5443, 127.0374),
  ];
  const res = optimizeLocally({ settings: settings({ transport_mode: 'car' }), places });
  const legs = res.routes.flatMap((r) => r.days.flatMap((d) => d.timeline.filter((t) => t.type === 'transit')));
  check(
    'Driving legs carry no fuel cost',
    res.status === 'success' && legs.length > 0 && legs.every((t) => t.cost === 0),
    `${legs.length}개 구간, 총 ${res.routes[0]?.total_cost}원`,
  );
}

// 4. Two conflicting scheduled visits return TIME_CONFLICT and identify both places.
{
  const places = [
    place('a', 'Gwangjang Market', 'restaurant', 37.5701, 126.9996, {
      hard_constraint: { start: '18:00', end: '18:00' },
    }),
    place('b', 'N Seoul Tower', 'attraction', 37.5512, 126.9882, {
      hard_constraint: { start: '18:10', end: '18:10' },
    }),
  ];
  const res = optimizeLocally({ settings: settings(), places });
  const ok =
    res.status === 'error' &&
    res.code === 'TIME_CONFLICT' &&
    res.place_ids.length === 2 &&
    res.message.includes('Gwangjang Market') &&
    res.message.includes('N Seoul Tower');
  check('Conflict message identifies both places', ok, res.message ?? 'Conflict not found');
  check('Conflict detection operates on pairs', findConflicts(places, 'transit').length === 1);
}

// 5. The two routes differ, and min_time has the shorter total travel time.
{
  const places = [
    place('a', 'Gyeongbokgung Palace', 'attraction', 37.5796, 126.9770),
    place('b', 'Gwangjang Market', 'restaurant', 37.5701, 126.9996),
    place('c', 'DDP', 'museum', 37.5665, 127.0092),
    place('d', 'Seoul Forest', 'attraction', 37.5443, 127.0374),
  ];
  const res = optimizeLocally({ settings: settings(), places });
  const orders = res.routes.map((r) => stopsOf(r).map((s) => s.place_id).join('>'));
  const types = res.routes.map((r) => r.type).join(', ');
  const minTime = res.routes.find((r) => r.type === 'min_time');
  const minCost = res.routes.find((r) => r.type === 'min_cost');

  check('Return two route options', res.routes.length === 2, types);
  check('Route options use different orders', new Set(orders).size === 2, orders.join(' | '));
  check('min_time is faster', minTime.total_time <= minCost.total_time,
    `min_time ${minTime.total_time} min / min_cost ${minCost.total_time} min`);
}

// 6. An N-day trip has N daily routes, each starting and ending at the configured locations.
{
  const places = [
    place('a', 'Gyeongbokgung Palace', 'attraction', 37.5796, 126.9770),
    place('b', 'Gwangjang Market', 'restaurant', 37.5701, 126.9996),
    place('c', 'Seoul Forest', 'attraction', 37.5443, 127.0374),
    place('d', 'Hongdae', 'shopping', 37.5563, 126.9236),
  ];
  const res = optimizeLocally({
    settings: settings({ start_date: '2026-09-19', end_date: '2026-09-20' }),
    places,
  });
  const days = res.routes[0].days;
  const ok =
    days.length === 2 &&
    days[0].timeline.at(0).name === SEOUL.name &&
    days[0].timeline.at(-1).name === HOTEL.name &&
    days[1].timeline.at(0).name === HOTEL.name &&
    days[1].timeline.at(-1).name === SEOUL.name;
  check('Split a two-day itinerary by date', ok, days.map((d) => d.date).join(', '));
  check('A night is spent at the accommodation',
    days[0].timeline.at(-1).name === HOTEL.name && days[1].timeline.at(0).name === HOTEL.name,
    `${days[0].timeline.at(-1).name} → ${days[1].timeline.at(0).name}`);
  check('Dates begin on the requested start date', days[0].date === '2026-09-19' && days[1].date === '2026-09-20',
    days.map((d) => d.date).join(', '));
  check('Daily totals equal the route total',
    res.routes[0].total_time === days.reduce((s, d) => s + d.total_time, 0));
}

// 6b. Fewer places than travel days still produces one day per date, and the last
// day still ends at the arrival point rather than stopping at an accommodation.
{
  const places = [
    place('a', 'Gyeongbokgung Palace', 'attraction', 37.5796, 126.9770),
    place('b', 'Seoul Forest', 'attraction', 37.5443, 127.0374),
  ];
  const res = optimizeLocally({
    settings: settings({ start_date: '2026-09-19', end_date: '2026-09-21' }),
    places,
  });
  const days = res.status === 'success' ? res.routes[0].days : [];
  const ends = days.map((d) => d.timeline.at(-1).name);
  check('Every travel day appears even with fewer places than days', days.length === 3,
    `${days.length}일 / 3일`);
  check('The last day still returns to the arrival point',
    ends.at(-1) === SEOUL.name, ends.join(' | '));
  check('A day with nothing to visit still runs between its anchors',
    days.length === 3 && days[1].timeline.at(0).name === HOTEL.name
      && days[1].timeline.at(-1).name === HOTEL.name,
    days.length === 3 ? `${days[1].timeline.at(0).name} → ${days[1].timeline.at(-1).name}` : '-');
}

// 6c. A trip with a night but no accommodation has no anchor for the middle days.
{
  const places = [place('a', 'Gyeongbokgung Palace', 'attraction', 37.5796, 126.9770)];
  const res = optimizeLocally({
    settings: settings({ start_date: '2026-09-19', end_date: '2026-09-20', accommodations: [] }),
    places,
  });
  check('Say why a multi-day trip without an accommodation cannot be routed',
    res.status === 'error' && res.code === 'NO_ROUTE' && res.message.includes('숙소'),
    res.message ?? res.status);
}

// 7. Preference scoring. First choice 3, second 2, third 1, unranked 0.
{
  const pool = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase() }));
  const scored = scorePlaces(pool, {
    m1: ['b', 'a', 'c'],   // b 3, a 2, c 1
    m2: ['b', 'c', 'a'],   // b 3, c 2, a 1
  });
  const by = Object.fromEntries(scored.map((p) => [p.id, p.score]));
  check('Borda scores are summed', by.b === 6 && by.a === 3 && by.c === 3, JSON.stringify(by));
  check('An unranked place scores zero', by.d === 0, `d ${by.d} points`);

  // A place that was only added can still fill a leftover candidate slot.
  const top = pickCandidates(scored, 1)[0];
  check('Highest preference score is selected first', top.id === 'b', `${top.id} (${top.score} points)`);

  // Entries past the top 3 are ignored even if submitted.
  const over = scorePlaces(pool, { m1: ['a', 'b', 'c', 'd'] });
  const overBy = Object.fromEntries(over.map((p) => [p.id, p.score]));
  check(`Entries beyond the top ${TOP_N} are ignored`, overBy.d === 0, `d ${overBy.d} points`);
}

// The singular `accommodation` and `hotel` fields are read as a one-entry list,
// so a request using either still anchors its middle days at the stay.
{
  const places = [
    place('a', 'Gyeongbokgung Palace', 'attraction', 37.5796, 126.9770),
    place('b', 'Seoul Forest', 'attraction', 37.5443, 127.0374),
  ];
  for (const field of ['accommodation', 'hotel']) {
    const base = settings({ start_date: '2026-09-19', end_date: '2026-09-21' });
    delete base.accommodations;
    const res = optimizeLocally({ settings: { ...base, [field]: HOTEL }, places });
    const days = res.status === 'success' ? res.routes[0].days : [];
    check(`A singular ${field} anchors the middle day`,
      days.length === 3
        && days[1].timeline.at(0).name === HOTEL.name
        && days[1].timeline.at(-1).name === HOTEL.name,
      res.status === 'success' ? `${days[1].timeline.at(0).name} → ${days[1].timeline.at(-1).name}` : res.code);
  }
}

console.log(failed ? `\n${failed} checks failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
