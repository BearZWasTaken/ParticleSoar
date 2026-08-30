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

export function resultNoteCount(result) {
  const counts = result?.counts ?? {};
  return RESULT_JUDGEMENTS.reduce((sum, name) => sum + (Number(counts[name]) || 0), 0);
}

export function resultIsFullCombo(result) {
  const total = resultNoteCount(result);
  return total > 0 && Number(result?.maxCombo) === total;
}

export function resultGrade(result) {
  const score = Math.max(0, Number(result?.score) || 0);
  if (score >= 1002000) return { label: "◇", tone: "iridescent" };
  if (score >= 1000000) return { label: "◇", tone: "gold" };

  let label = "☹";
  let tone = "gray";
  if (score >= 975000) label = "W!";
  else if (score >= 950000) label = "W";
  else if (score >= 900000) label = "S";
  else if (score >= 850000) label = "A";
  else if (score >= 800000) label = "B";
  else if (score >= 700000) label = "C";
  else if (score >= 600000) label = "D";

  if (label !== "☹") tone = "white";
  if (resultIsFullCombo(result)) tone = "pink";
  return { label, tone };
}

export function resultCompletionLabel(result) {
  const counts = result?.counts ?? {};
  const total = resultNoteCount(result);
  if (total > 0 && Number(counts.flawless) === total) return "ALL FLAWLESS";
  if (
    total > 0
    && Number(counts.flawless) + Number(counts.prime) === total
  ) return "ALL PRIME";
  if (resultIsFullCombo(result)) return "FULL COMBO";
  return "COMPLETE";
}
