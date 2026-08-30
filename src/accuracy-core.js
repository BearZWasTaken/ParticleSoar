export const ACCURACY_JUDGEMENTS = Object.freeze(["flawless", "prime", "decent"]);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function timingWindowsMilliseconds(windows = {}) {
  return {
    flawless: Math.max(0, finite(windows.flawless) * 1000),
    prime: Math.max(0, finite(windows.prime) * 1000),
    decent: Math.max(0, finite(windows.decent) * 1000)
  };
}

export function successfulTimingOffsets(samples = []) {
  return samples
    .filter((sample) => ACCURACY_JUDGEMENTS.includes(sample?.judgement))
    .map((sample) => sample.offsetMs === null ? NaN : finite(sample.offsetMs, NaN))
    .filter(Number.isFinite);
}

export function meanAbsoluteTimingError(offsetsMs = []) {
  if (offsetsMs.length === 0) return 0;
  return offsetsMs.reduce((sum, offset) => sum + Math.abs(finite(offset)), 0) / offsetsMs.length;
}

export function accuracyHistogram(offsetsMs = [], windowsMs = {}) {
  const flawless = Math.max(0, finite(windowsMs.flawless));
  const prime = Math.max(flawless, finite(windowsMs.prime));
  const decent = Math.max(prime, finite(windowsMs.decent));
  const flawlessHalf = flawless / 2;
  const flawlessPrimeMiddle = (flawless + prime) / 2;
  const primeDecentMiddle = (prime + decent) / 2;
  const thresholds = [flawless, flawlessPrimeMiddle, prime, primeDecentMiddle, decent];
  const centerIndex = thresholds.length;
  const bins = Array(thresholds.length * 2 + 1).fill(0);

  offsetsMs.forEach((rawOffset) => {
    const offset = finite(rawOffset, NaN);
    if (!Number.isFinite(offset) || Math.abs(offset) > decent) return;
    const magnitude = Math.abs(offset);
    if (magnitude <= flawlessHalf) {
      bins[centerIndex] += 1;
      return;
    }
    const distanceBand = thresholds.findIndex((threshold) => magnitude <= threshold) + 1;
    bins[offset < 0 ? centerIndex - distanceBand : centerIndex + distanceBand] += 1;
  });

  return bins;
}

export function accuracyTickPositions(windowsMs = {}) {
  const flawless = Math.max(0, finite(windowsMs.flawless));
  const prime = Math.max(flawless, finite(windowsMs.prime));
  const decent = Math.max(prime, finite(windowsMs.decent, 1));
  const toPercent = (offset) => 50 + offset / (decent * 2) * 100;
  return [
    { label: "-DECENT", offsetMs: -decent, percent: 0 },
    { label: "-PRIME", offsetMs: -prime, percent: toPercent(-prime) },
    { label: "-FLAWLESS", offsetMs: -flawless, percent: toPercent(-flawless) },
    { label: "0", offsetMs: 0, percent: 50 },
    { label: "FLAWLESS", offsetMs: flawless, percent: toPercent(flawless) },
    { label: "PRIME", offsetMs: prime, percent: toPercent(prime) },
    { label: "DECENT", offsetMs: decent, percent: 100 }
  ];
}
