// Combine individual rankings into a group preference score using the PRD section 1 rules.
//
//   Places per day = 4
//   Total slots S = 4 * trip days
//   Picks per person k = clamp(ceil(S * 1.5 / headcount), 3, 10)
//   Rank r weight = k - r + 1 (Borda)

export const SLOTS_PER_DAY = 4;

export function picksPerPerson(dayCount, headcount) {
  const slots = SLOTS_PER_DAY * dayCount;
  const raw = Math.ceil((slots * 1.5) / Math.max(1, headcount));
  return Math.min(10, Math.max(3, raw));
}

export function scorePlaces(places, preferences, k) {
  const score = new Map(places.map((p) => [p.id, 0]));
  Object.values(preferences).forEach((ranking) => {
    ranking.forEach((placeId, index) => {
      if (!score.has(placeId)) return;
      score.set(placeId, score.get(placeId) + Math.max(1, k - index));
    });
  });
  return places.map((p) => ({ ...p, score: score.get(p.id) ?? 0 }));
}

/** Always include required places, then fill remaining slots by descending score. */
export function pickCandidates(scored, dayCount) {
  const slots = SLOTS_PER_DAY * dayCount;
  const fixed = scored.filter((p) => p.isFixed);
  const rest = scored
    .filter((p) => !p.isFixed)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, slots - fixed.length));
  return [...fixed, ...rest];
}
