// Category defaults used when Google Places business hours are unavailable.
// These values match the table in PRD section 5.

export const CATEGORY_DEFAULTS = {
  restaurant: { label: 'Restaurant', open: '11:00', close: '21:00', stay: 60 },
  cafe: { label: 'Cafe', open: '10:00', close: '22:00', stay: 50 },
  attraction: { label: 'Attraction', open: '09:00', close: '18:00', stay: 90 },
  museum: { label: 'Museum', open: '10:00', close: '18:00', stay: 80 },
  shopping: { label: 'Shopping', open: '10:30', close: '21:00', stay: 70 },
};

export const CATEGORY_ORDER = Object.keys(CATEGORY_DEFAULTS);

export function categoryLabel(key) {
  return CATEGORY_DEFAULTS[key]?.label ?? 'Other';
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
