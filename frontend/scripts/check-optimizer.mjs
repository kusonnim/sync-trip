// PROJECT.md 5절의 제약을 프론트 임시 엔진에 대해 검증한다.
// 실행: npm run check
// 요청과 응답 모양이 PROJECT.md 4절 ③ 과 같으므로,
// 백엔드 엔진이 붙으면 같은 항목을 파이썬 쪽에서도 통과시켜야 한다.

import { optimizeLocally, findConflicts } from '../src/lib/mockOptimize.js';
import { picksPerPerson, scorePlaces, pickCandidates } from '../src/lib/preference.js';
import { toMinutes } from '../src/lib/time.js';

let failed = 0;

function check(name, condition, detail = '') {
  if (!condition) failed += 1;
  console.log(`[${condition ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
}

const SEOUL = { name: '서울역', lat: 37.5547, lng: 126.9707 };

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

// 1. 예약 창이 있는 장소는 그 창 안에 방문이 시작되어야 한다
{
  const places = [
    place('a', '경복궁', 'attraction', 37.5796, 126.9770),
    place('b', '광장시장', 'restaurant', 37.5701, 126.9996, {
      hard_constraint: { start: '18:00', end: '18:00' },
    }),
    place('c', '북촌한옥마을', 'attraction', 37.5826, 126.9830),
  ];
  const res = optimizeLocally({ settings: settings(), places });
  const ok =
    res.status === 'success' &&
    res.routes.every((r) =>
      stopsOf(r).every((s) => !s.hard_constraint || s.time.startsWith(s.hard_constraint.start)));
  check('예약 창 안에서 방문 시작', ok, `${res.routes?.length ?? 0}개 안 생성`);
}

// 2. 영업 종료 전에 최소 체류를 못 채우는 순열은 폐기된다
{
  const places = [
    place('a', '리움미술관', 'museum', 37.5384, 126.9990, { close_time: '11:00', stay_time_min: 80 }),
    place('b', 'N서울타워', 'attraction', 37.5512, 126.9882),
  ];
  const res = optimizeLocally({ settings: settings(), places });
  check('영업 종료 위반 순열 폐기', res.status === 'error' && res.code === 'NO_ROUTE', res.code ?? '해가 생겼음');
}

// 3. 식당은 점심 또는 저녁 슬롯에 시작해야 한다
{
  const places = [
    place('a', '광장시장', 'restaurant', 37.5701, 126.9996),
    place('b', '경복궁', 'attraction', 37.5796, 126.9770),
    place('c', 'DDP', 'museum', 37.5665, 127.0092),
  ];
  const res = optimizeLocally({ settings: settings(), places });
  const meals = res.routes.flatMap(stopsOf).filter((s) => s.category === 'restaurant');
  const ok = meals.length > 0 && meals.every((s) => {
    const start = toMinutes(s.time.slice(0, 5));
    const within = ([f, t]) => start >= f && start <= t;
    return within([toMinutes('11:30'), toMinutes('13:30')]) || within([toMinutes('17:30'), toMinutes('19:30')]);
  });
  check('식당은 식사 슬롯에만 배치', ok, meals.map((s) => s.time).join(', '));
}

// 4. 충돌하는 예약 두 건이면 TIME_CONFLICT 와 함께 두 장소를 짚어준다
{
  const places = [
    place('a', '광장시장', 'restaurant', 37.5701, 126.9996, {
      hard_constraint: { start: '18:00', end: '18:00' },
    }),
    place('b', 'N서울타워', 'attraction', 37.5512, 126.9882, {
      hard_constraint: { start: '18:10', end: '18:10' },
    }),
  ];
  const res = optimizeLocally({ settings: settings(), places });
  const ok =
    res.status === 'error' &&
    res.code === 'TIME_CONFLICT' &&
    res.place_ids.length === 2 &&
    res.message.includes('광장시장') &&
    res.message.includes('N서울타워');
  check('충돌 지점을 짚은 안내', ok, res.message ?? '충돌을 못 찾음');
  check('충돌 진단이 쌍 단위로 동작', findConflicts(places, 'transit').length === 1);
}

// 5. 2안이 서로 다르고 min_time 의 총 이동 시간이 더 짧다
{
  const places = [
    place('a', '경복궁', 'attraction', 37.5796, 126.9770),
    place('b', '광장시장', 'restaurant', 37.5701, 126.9996),
    place('c', 'DDP', 'museum', 37.5665, 127.0092),
    place('d', '서울숲', 'attraction', 37.5443, 127.0374),
  ];
  const res = optimizeLocally({ settings: settings(), places });
  const orders = res.routes.map((r) => stopsOf(r).map((s) => s.place_id).join('>'));
  const types = res.routes.map((r) => r.type).join(', ');
  const minTime = res.routes.find((r) => r.type === 'min_time');
  const minCost = res.routes.find((r) => r.type === 'min_cost');

  check('2안이 반환됨', res.routes.length === 2, types);
  check('2안이 서로 다른 순서', new Set(orders).size === 2, orders.join(' | '));
  check('min_time 이 더 짧음', minTime.total_time <= minCost.total_time,
    `min_time ${minTime.total_time}분 / min_cost ${minCost.total_time}분`);
}

// 6. N일이면 날짜 수만큼 나뉘고 각 날이 출발지에서 시작해 도착지에서 끝난다
{
  const places = [
    place('a', '경복궁', 'attraction', 37.5796, 126.9770),
    place('b', '광장시장', 'restaurant', 37.5701, 126.9996),
    place('c', '서울숲', 'attraction', 37.5443, 127.0374),
    place('d', '홍대', 'shopping', 37.5563, 126.9236),
  ];
  const res = optimizeLocally({
    settings: settings({ start_date: '2026-09-19', end_date: '2026-09-20' }),
    places,
  });
  const days = res.routes[0].days;
  const ok =
    days.length === 2 &&
    days.every((d) => d.timeline.at(0).name === SEOUL.name && d.timeline.at(-1).name === SEOUL.name);
  check('2일 일정이 날짜별로 나뉨', ok, days.map((d) => d.date).join(', '));
  check('날짜가 입력한 시작일부터 시작', days[0].date === '2026-09-19' && days[1].date === '2026-09-20',
    days.map((d) => d.date).join(', '));
  check('날짜별 합이 총합과 일치',
    res.routes[0].total_time === days.reduce((s, d) => s + d.total_time, 0));
}

// 7. 1인당 입력 개수와 선호 점수 집계
{
  check('1인당 입력 개수 (1일 4명)', picksPerPerson(1, 4) === 3, `${picksPerPerson(1, 4)}곳`);
  check('1인당 입력 개수 (3일 4명)', picksPerPerson(3, 4) === 5, `${picksPerPerson(3, 4)}곳`);
  const scored = scorePlaces(
    [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    { m1: ['b', 'a'], m2: ['b'] },
    3,
  );
  const top = pickCandidates(scored, 1)[0];
  check('선호 점수 상위가 먼저 뽑힘', top.id === 'b', `${top.id} (${top.score}점)`);
}

console.log(failed ? `\n${failed}개 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
