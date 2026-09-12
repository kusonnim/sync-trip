// Validate the PROJECT.md section 5 constraints against the temporary frontend engine.
// Run: npm run check
// The request and response shapes match PROJECT.md section 4.3, so the backend engine
// must pass the same checks once it is connected.

import { optimizeLocally, findConflicts } from '../src/lib/mockOptimize.js';
import { picksPerPerson, scorePlaces, pickCandidates } from '../src/lib/preference.js';
import { toMinutes } from '../src/lib/time.js';

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

function settings(extra = {}) {
  return {
    transport_mode: 'transit',
    start_date: '2026-09-19',
    end_date: '2026-09-19',
    start_location: SEOUL,
    end_location: SEOUL,
    start_time: '10:00',
    end_deadline: '21:30',
    ...extra,
  };
}

const stopsOf = (route) =>
  route.days.flatMap((d) => d.timeline.filter((t) => t.type === 'place' && t.place_id));

// 1. A place with a reservation window must be visited within that window.
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
  check('Visit starts within reservation window', ok, `${res.routes?.length ?? 0} routes generated`);
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

// 4. Two conflicting reservations return TIME_CONFLICT and identify both places.
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
    days.every((d) => d.timeline.at(0).name === SEOUL.name && d.timeline.at(-1).name === SEOUL.name);
  check('Split a two-day itinerary by date', ok, days.map((d) => d.date).join(', '));
  check('Dates begin on the requested start date', days[0].date === '2026-09-19' && days[1].date === '2026-09-20',
    days.map((d) => d.date).join(', '));
  check('Daily totals equal the route total',
    res.routes[0].total_time === days.reduce((s, d) => s + d.total_time, 0));
}

// 7. Picks per person and preference-score aggregation.
{
  check('Picks per person (1 day, 4 people)', picksPerPerson(1, 4) === 3, `${picksPerPerson(1, 4)} places`);
  check('Picks per person (3 days, 4 people)', picksPerPerson(3, 4) === 5, `${picksPerPerson(3, 4)} places`);
  const scored = scorePlaces(
    [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    { m1: ['b', 'a'], m2: ['b'] },
    3,
  );
  const top = pickCandidates(scored, 1)[0];
  check('Highest preference score is selected first', top.id === 'b', `${top.id} (${top.score} points)`);
}

console.log(failed ? `\n${failed} checks failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
