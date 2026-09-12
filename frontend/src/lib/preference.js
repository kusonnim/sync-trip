// 개인별 순위를 팀 선호 점수로 합산한다. PRD 1절 규칙과 같다.
//
//   하루 방문 가능 장소 = 4
//   총 슬롯 S = 4 * 여행일수
//   1인당 입력 개수 k = clamp(ceil(S * 1.5 / 인원수), 3, 10)
//   순위 r 의 가중치 = k - r + 1  (Borda)

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

/** 고정 여행지는 무조건 넣고, 나머지 슬롯을 점수 상위순으로 채운다. */
export function pickCandidates(scored, dayCount) {
  const slots = SLOTS_PER_DAY * dayCount;
  const fixed = scored.filter((p) => p.isFixed);
  const rest = scored
    .filter((p) => !p.isFixed)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, slots - fixed.length));
  return [...fixed, ...rest];
}
