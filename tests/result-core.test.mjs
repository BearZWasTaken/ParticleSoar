import assert from "node:assert/strict";
import {
  paddedResultScore,
  parseResultSession,
  resultGrade,
  resultCompletionLabel
} from "../src/result-core.js";

assert.equal(paddedResultScore(1234.4), "0001234");
assert.equal(paddedResultScore(-4), "0000000");
assert.equal(resultCompletionLabel({
  maxCombo: 3,
  counts: { flawless: 3, prime: 0, decent: 0, loose: 0, hollow: 0 }
}), "ALL FLAWLESS");
assert.equal(resultCompletionLabel({
  maxCombo: 3,
  counts: { flawless: 1, prime: 2, decent: 0, loose: 0, hollow: 0 }
}), "ALL PRIME");
assert.equal(resultCompletionLabel({
  maxCombo: 3,
  counts: { flawless: 1, prime: 1, decent: 1, loose: 0, hollow: 0 }
}), "FULL COMBO");
assert.equal(resultCompletionLabel({
  maxCombo: 1,
  counts: { flawless: 1, prime: 0, decent: 0, loose: 1, hollow: 1 }
}), "COMPLETE");
assert.equal(parseResultSession("not json"), null);
assert.equal(parseResultSession(JSON.stringify({ songId: "song:a", chart: "a.json", result: {} })).songId, "song:a");

const resultAt = (score, maxCombo = 0) => ({
  score,
  maxCombo,
  counts: { flawless: 2, prime: 1, decent: 1, loose: 0, hollow: 0 }
});
assert.deepEqual(resultGrade(resultAt(0)), { label: "☹", tone: "gray" });
assert.deepEqual(resultGrade(resultAt(600000)), { label: "D", tone: "white" });
assert.deepEqual(resultGrade(resultAt(700000)), { label: "C", tone: "white" });
assert.deepEqual(resultGrade(resultAt(800000)), { label: "B", tone: "white" });
assert.deepEqual(resultGrade(resultAt(850000)), { label: "A", tone: "white" });
assert.deepEqual(resultGrade(resultAt(900000)), { label: "S", tone: "white" });
assert.deepEqual(resultGrade(resultAt(950000)), { label: "W", tone: "white" });
assert.deepEqual(resultGrade(resultAt(975000)), { label: "W!", tone: "white" });
assert.deepEqual(resultGrade(resultAt(999999, 4)), { label: "W!", tone: "pink" });
assert.deepEqual(resultGrade(resultAt(1000000, 4)), { label: "◇", tone: "gold" });
assert.deepEqual(resultGrade(resultAt(1002000, 4)), { label: "◇", tone: "iridescent" });

console.log("result core tests passed");
