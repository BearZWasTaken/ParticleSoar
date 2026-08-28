const DEFAULT_PRIORITY = ["middle", "left", "right", "top"];

const PRIORITY_EXCEPTIONS = Object.freeze({
  KeyS: ["left", "middle", "right", "top"],
  KeyL: ["right", "middle", "left", "top"]
});

export function createInputMap(inputConfig) {
  const keySets = Object.fromEntries(
    Object.entries(inputConfig).map(([type, codes]) => [type, new Set(codes)])
  );
  const keyCodes = new Set(Object.values(inputConfig).flat());

  return Object.freeze({
    keyCodes,
    inputTypesForCode(code) {
      if (keySets.space?.has(code)) return ["space"];
      const priority = PRIORITY_EXCEPTIONS[code] ?? DEFAULT_PRIORITY;
      return priority.filter((type) => keySets[type]?.has(code));
    }
  });
}
