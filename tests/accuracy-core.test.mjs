import assert from "node:assert/strict";
import {
  accuracyHistogram,
  accuracyTickPositions,
  meanAbsoluteTimingError,
  successfulTimingOffsets,
  timingWindowsMilliseconds
} from "../src/accuracy-core.js";

const windows = timingWindowsMilliseconds({ flawless: 0.04, prime: 0.075, decent: 0.15 });
assert.deepEqual(windows, { flawless: 40, prime: 75, decent: 150 });
assert.deepEqual(accuracyTickPositions(windows).map(({ offsetMs }) => offsetMs), [-150, -75, -40, 0, 40, 75, 150]);

const offsets = [
  -150, -100, -70, -50, -30, 0, 30, -40, 40, 50, 70, 100, 150,
  -112.5, -75, -57.5, -20, 20, 57.5, 75, 112.5
];
assert.deepEqual(accuracyHistogram(offsets, windows), [1, 2, 2, 2, 2, 3, 2, 2, 2, 2, 1]);
assert.equal(meanAbsoluteTimingError([-10, 20, -30]), 20);
assert.deepEqual(successfulTimingOffsets([
  { judgement: "flawless", offsetMs: -4 },
  { judgement: "loose", offsetMs: -160 },
  { judgement: "decent", offsetMs: 120 },
  { judgement: "hollow", offsetMs: null }
]), [-4, 120]);

console.log("accuracy core tests passed");
