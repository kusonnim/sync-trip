// 구글 Places 영업시간을 못 받았을 때 즉시 대체하는 카테고리 기본값.
// PRD 5절의 표와 같은 값이다.

export const CATEGORY_DEFAULTS = {
  restaurant: { label: '식당', open: '11:00', close: '21:00', stay: 60 },
  cafe: { label: '카페', open: '10:00', close: '22:00', stay: 50 },
  attraction: { label: '관광지', open: '09:00', close: '18:00', stay: 90 },
  museum: { label: '미술관·박물관', open: '10:00', close: '18:00', stay: 80 },
  shopping: { label: '쇼핑', open: '10:30', close: '21:00', stay: 70 },
};

export const CATEGORY_ORDER = Object.keys(CATEGORY_DEFAULTS);

export function categoryLabel(key) {
  return CATEGORY_DEFAULTS[key]?.label ?? '기타';
}

export function applyCategoryDefaults(place) {
  const base = CATEGORY_DEFAULTS[place.category] ?? CATEGORY_DEFAULTS.attraction;
  return {
    openTime: base.open,
    closeTime: base.close,
    minStay: base.stay,
    maxStay: base.stay + 30,
    hoursSource: 'default',
    ...place,
  };
}
