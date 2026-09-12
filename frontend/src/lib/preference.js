// Combine individual rankings into a group preference score.
//
// There is no limit on how many places a member may add. From those, each member
// ranks a top 3. Rank r weight = TOP_N - r + 1, so first place scores 3, second 2, third 1.
// A place that was only added and never ranked scores 0, which separates
// "here is an option" from "I want to go here".

export const SLOTS_PER_DAY = 4;
export const TOP_N = 3;

export function scorePlaces(places, preferences, topN = TOP_N) {
  const score = new Map(places.map((p) => [p.id, 0]));
  Object.values(preferences).forEach((ranking) => {
    ranking.slice(0, topN).forEach((placeId, index) => {
      if (!score.has(placeId)) return;
      score.set(placeId, score.get(placeId) + (topN - index));
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
