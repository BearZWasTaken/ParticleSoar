export const RESULT_SESSION_KEY = "particlesoar.last-result";
export const RESULT_JUDGEMENTS = Object.freeze(["flawless", "prime", "decent", "loose", "hollow"]);

export function parseResultSession(serialized) {
  try {
    const value = JSON.parse(serialized);
    if (!value?.songId || !value?.chart || !value?.result) return null;
    return value;
  } catch {
    return null;
  }
}

export function paddedResultScore(value) {
  return String(Math.max(0, Math.round(Number(value) || 0))).padStart(7, "0");
}

export function resultCompletionLabel(result) {
  const counts = result?.counts ?? {};
  const total = RESULT_JUDGEMENTS.reduce((sum, name) => sum + (Number(counts[name]) || 0), 0);
  if (total > 0 && Number(counts.flawless) === total) return "ALL FLAWLESS";
  if (
    total > 0
    && Number(counts.flawless) + Number(counts.prime) === total
  ) return "ALL PRIME";
  if (total > 0 && Number(result?.maxCombo) === total) return "FULL COMBO";
  return "COMPLETE";
}
