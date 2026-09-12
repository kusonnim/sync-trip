// Pre-filled room for demos and testing.
// Five members have each submitted a top 3, so the host can build routes immediately.
// The button that calls this only appears in debug mode.

import { MOCK_PLACES } from './mockPlaces.js';
import { applyCategoryDefaults } from './categories.js';
import { makeRoomCode, patchRoom, setMyId } from './roomStore.js';

const NICKNAMES = ['재은', '지훈', '수민', '예린', '도현'];

// The rankings overlap on purpose. Overlap spreads the Borda scores apart
// and makes the aggregation step visible.
const RANKINGS = [
  ['p-gyeongbok', 'p-gwangjang', 'p-bukchon'],
  ['p-gwangjang', 'p-ikseon', 'p-gyeongbok'],
  ['p-bukchon', 'p-gyeongbok', 'p-ddp'],
  ['p-ikseon', 'p-gwangjang', 'p-seoul-forest'],
  ['p-gyeongbok', 'p-ddp', 'p-seongsu-cafe'],
];

function today() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export function createSeededRoom() {
  const code = makeRoomCode();
  const members = NICKNAMES.map((nickname, i) => ({
    id: `m-seed-${i}`,
    nickname,
    isHost: i === 0,
    submitted: true,
  }));

  const pickedIds = [...new Set(RANKINGS.flat())];
  const places = pickedIds
    .map((id) => MOCK_PLACES.find((p) => p.id === id))
    .filter(Boolean)
    .map((p) => applyCategoryDefaults({ ...p, addedBy: 'm-seed-0', isFixed: false, visitWindow: null }));

  const seoulStation = { name: '서울역', lat: 37.5547, lng: 126.9707 };
  const room = {
    code,
    status: 'collecting',
    createdAt: Date.now(),
    hostId: members[0].id,
    title: '우리 여행',
    startDate: today(),
    endDate: today(),
    dailyStart: '10:00',
    dailyEnd: '21:00',
    headcount: NICKNAMES.length,
    transportMode: 'transit',
    origin: seoulStation,
    destination: seoulStation,
    members,
    places,
    preferences: Object.fromEntries(members.map((m, i) => [m.id, RANKINGS[i]])),
    routes: [],
    error: null,
    finalVotes: {},
    confirmedRouteId: null,
  };

  localStorage.setItem(`synctrip:room:${code}`, JSON.stringify(room));
  patchRoom(code, {}); // Notify any screen already subscribed.
  setMyId(code, members[0].id); // This tab enters as the host.
  return room;
}
