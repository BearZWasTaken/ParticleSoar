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

const offsets = [-150, -112, -76, -75, -21, -20, 0, 20, 21, 75, 76, 113, 150];
assert.deepEqual(accuracyHistogram(offsets, windows), [1, 2, 2, 3, 2, 1, 2]);
assert.equal(meanAbsoluteTimingError([-10, 20, -30]), 20);
assert.deepEqual(successfulTimingOffsets([
  { judgement: "flawless", offsetMs: -4 },
  { judgement: "loose", offsetMs: -160 },
  { judgement: "decent", offsetMs: 120 },
  { judgement: "hollow", offsetMs: null }
]), [-4, 120]);

console.log("accuracy core tests passed");
