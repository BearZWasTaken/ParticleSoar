import assert from "node:assert/strict";
import {
  paddedResultScore,
  parseResultSession,
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

console.log("result core tests passed");
