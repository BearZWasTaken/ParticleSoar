export const DIFFICULTY_COLORS = Object.freeze({
  QT: "#ffaec9",
  LD: "#22b14c",
  HS: "#00a2e8",
  BT: "#ed1c24",
  SS: "#974497",
  VD: "#1e1e1e"
});

export function difficultyColor(label) {
  return DIFFICULTY_COLORS[String(label ?? "").trim().toUpperCase()] ?? "#82909a";
}
