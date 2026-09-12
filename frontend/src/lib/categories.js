// Category defaults used when Google Places business hours are unavailable.
// These values match the table in PRD section 5.

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

/**
 * Fill in category defaults when a place is added.
 * Real business hours from Google overwrite these once they arrive; if the lookup
 * fails, these values remain so itinerary creation never stalls.
 * Fields that already hold a value are left untouched.
 */
export function applyCategoryDefaults(place) {
  const base = CATEGORY_DEFAULTS[place.category] ?? CATEGORY_DEFAULTS.attraction;
  const filled = { ...place };
  if (!filled.openTime) { filled.openTime = base.open; filled.hoursSource = 'default'; }
  if (!filled.closeTime) { filled.closeTime = base.close; filled.hoursSource = 'default'; }
  if (!filled.minStay) filled.minStay = base.stay;
  if (!filled.maxStay) filled.maxStay = base.stay + 30;
  if (!filled.hoursSource) filled.hoursSource = 'default';
  if (filled.visitWindow === undefined) filled.visitWindow = null;
  return filled;
}
