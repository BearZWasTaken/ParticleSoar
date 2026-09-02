export const JUDGEMENT_QUALITY_ORDER = Object.freeze([
  "flawless",
  "prime",
  "decent",
  "loose"
]);

const judgementRank = new Map(
  JUDGEMENT_QUALITY_ORDER.map((judgement, index) => [judgement, index])
);

export function selectBestJudgementCandidate(candidates) {
  let best = null;
  let bestRank = Infinity;
  for (const candidate of candidates) {
    const rank = judgementRank.get(candidate?.judgement) ?? Infinity;
    if (rank < bestRank) {
      best = candidate;
      bestRank = rank;
    }
  }
  return best;
}
