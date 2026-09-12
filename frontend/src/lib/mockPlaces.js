// Temporary place list used until the backend Kakao Local search proxy is connected.
// It is no longer used when USE_MOCK in api.js becomes false.

export const MOCK_PLACES = [
  { id: 'p-seoul-station', name: 'Seoul Station', category: 'attraction', lat: 37.5547, lng: 126.9707, address: '405 Hangang-daero, Yongsan-gu, Seoul' },
  { id: 'p-seongsu-cafe', name: 'Daelim Warehouse Seongsu', category: 'cafe', lat: 37.5445, lng: 127.0557, address: '78 Seongsui-ro, Seongdong-gu, Seoul' },
  { id: 'p-seoul-forest', name: 'Seoul Forest', category: 'attraction', lat: 37.5443, lng: 127.0374, address: '273 Ttukseom-ro, Seongdong-gu, Seoul' },
  { id: 'p-namsan', name: 'N Seoul Tower', category: 'attraction', lat: 37.5512, lng: 126.9882, address: '105 Namsangongwon-gil, Yongsan-gu, Seoul' },
  { id: 'p-gwangjang', name: 'Gwangjang Market', category: 'restaurant', lat: 37.5701, lng: 126.9996, address: '88 Changgyeonggung-ro, Jongno-gu, Seoul' },
  { id: 'p-ddp', name: 'Dongdaemun Design Plaza', category: 'museum', lat: 37.5665, lng: 127.0092, address: '281 Eulji-ro, Jung-gu, Seoul' },
  { id: 'p-gyeongbok', name: 'Gyeongbokgung Palace', category: 'attraction', lat: 37.5796, lng: 126.9770, address: '161 Sajik-ro, Jongno-gu, Seoul' },
  { id: 'p-ikseon', name: 'Ikseon-dong Hanok Street', category: 'cafe', lat: 37.5744, lng: 126.9910, address: 'Supyo-ro 28-gil, Jongno-gu, Seoul' },
  { id: 'p-hongdae', name: 'Hongdae Walking Street', category: 'shopping', lat: 37.5563, lng: 126.9236, address: 'Eoulmadang-ro, Mapo-gu, Seoul' },
  { id: 'p-yeouido', name: 'Yeouido Hangang Park', category: 'attraction', lat: 37.5285, lng: 126.9327, address: '330 Yeouidong-ro, Yeongdeungpo-gu, Seoul' },
  { id: 'p-leeum', name: 'Leeum Museum of Art', category: 'museum', lat: 37.5384, lng: 126.9990, address: '60 Itaewon-ro 55-gil, Yongsan-gu, Seoul' },
  { id: 'p-mangwon', name: 'Mangwon Market', category: 'restaurant', lat: 37.5560, lng: 126.9026, address: '14 Poeun-ro 8-gil, Mapo-gu, Seoul' },
  { id: 'p-starfield', name: 'Starfield COEX Mall', category: 'shopping', lat: 37.5126, lng: 127.0590, address: '513 Yeongdong-daero, Gangnam-gu, Seoul' },
  { id: 'p-bukchon', name: 'Bukchon Hanok Village', category: 'attraction', lat: 37.5826, lng: 126.9830, address: '37 Gyedong-gil, Jongno-gu, Seoul' },
  { id: 'p-noryangjin', name: 'Noryangjin Fish Market', category: 'restaurant', lat: 37.5148, lng: 126.9540, address: '674 Nodeul-ro, Dongjak-gu, Seoul' },
  { id: 'p-lotte-tower', name: 'Seoul Sky at Lotte World Tower', category: 'attraction', lat: 37.5125, lng: 127.1025, address: '300 Olympic-ro, Songpa-gu, Seoul' },
  { id: 'p-anguk-bap', name: 'Anguk Home-Style Restaurant', category: 'restaurant', lat: 37.5760, lng: 126.9855, address: '6 Bukchon-ro, Jongno-gu, Seoul' },
];

export function searchMockPlaces(query) {
  const q = query.trim();
  if (!q) return [];
  return MOCK_PLACES.filter(
    (p) => p.name.includes(q) || p.address.includes(q),
  ).slice(0, 8);
}
