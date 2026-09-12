// Stand-in place list used until the backend's Kakao Local search proxy exists.
// Once USE_MOCK in api.js turns false this file is no longer used.
// Names and addresses stay in Korean because the product serves Korean travelers.

export const MOCK_PLACES = [
  { id: 'p-seoul-station', name: '서울역', category: 'attraction', lat: 37.5547, lng: 126.9707, address: '서울 용산구 한강대로 405' },
  { id: 'p-seongsu-cafe', name: '성수동 대림창고', category: 'cafe', lat: 37.5445, lng: 127.0557, address: '서울 성동구 성수이로 78' },
  { id: 'p-seoul-forest', name: '서울숲', category: 'attraction', lat: 37.5443, lng: 127.0374, address: '서울 성동구 뚝섬로 273' },
  { id: 'p-namsan', name: 'N서울타워', category: 'attraction', lat: 37.5512, lng: 126.9882, address: '서울 용산구 남산공원길 105' },
  { id: 'p-gwangjang', name: '광장시장', category: 'restaurant', lat: 37.5701, lng: 126.9996, address: '서울 종로구 창경궁로 88' },
  { id: 'p-ddp', name: 'DDP 동대문디자인플라자', category: 'museum', lat: 37.5665, lng: 127.0092, address: '서울 중구 을지로 281' },
  { id: 'p-gyeongbok', name: '경복궁', category: 'attraction', lat: 37.5796, lng: 126.9770, address: '서울 종로구 사직로 161' },
  { id: 'p-ikseon', name: '익선동 한옥거리', category: 'cafe', lat: 37.5744, lng: 126.9910, address: '서울 종로구 수표로28길' },
  { id: 'p-hongdae', name: '홍대 걷고싶은거리', category: 'shopping', lat: 37.5563, lng: 126.9236, address: '서울 마포구 어울마당로' },
  { id: 'p-yeouido', name: '여의도 한강공원', category: 'attraction', lat: 37.5285, lng: 126.9327, address: '서울 영등포구 여의동로 330' },
  { id: 'p-leeum', name: '리움미술관', category: 'museum', lat: 37.5384, lng: 126.9990, address: '서울 용산구 이태원로55길 60' },
  { id: 'p-mangwon', name: '망원시장', category: 'restaurant', lat: 37.5560, lng: 126.9026, address: '서울 마포구 포은로8길 14' },
  { id: 'p-starfield', name: '스타필드 코엑스몰', category: 'shopping', lat: 37.5126, lng: 127.0590, address: '서울 강남구 영동대로 513' },
  { id: 'p-bukchon', name: '북촌한옥마을', category: 'attraction', lat: 37.5826, lng: 126.9830, address: '서울 종로구 계동길 37' },
  { id: 'p-noryangjin', name: '노량진 수산시장', category: 'restaurant', lat: 37.5148, lng: 126.9540, address: '서울 동작구 노들로 674' },
  { id: 'p-lotte-tower', name: '롯데월드타워 서울스카이', category: 'attraction', lat: 37.5125, lng: 127.1025, address: '서울 송파구 올림픽로 300' },
  { id: 'p-anguk-bap', name: '안국 백반집', category: 'restaurant', lat: 37.5760, lng: 126.9855, address: '서울 종로구 북촌로 6' },
];

export function searchMockPlaces(query) {
  const q = query.trim();
  if (!q) return [];
  return MOCK_PLACES.filter(
    (p) => p.name.includes(q) || p.address.includes(q),
  ).slice(0, 8);
}
