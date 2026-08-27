import assert from "node:assert/strict";
import {
  createDefaultChart,
  findDuplicateNotePlacement,
  findDuplicateTimelineEvent,
  normalizeChart
} from "../src/chart-core.js";

const chart = createDefaultChart();
chart.notes = [
  { type: "m", hitTime: 1, wPos: 0.25 },
  { type: "middle", hitTime: 1, wPos: 0.25 },
  { type: "l", hitTime: 1 },
  { type: "r", hitTime: 1 },
  { type: "s", hitTime: 1 },
  { type: "u", hitTime: 1 }
];

assert.ok(findDuplicateNotePlacement(chart.notes), "duplicate middle placement should be detected");
const normalized = normalizeChart(chart);
assert.equal(normalized.notes.length, 5, "normalization should remove only the duplicate placement");
assert.deepEqual(
  new Set(normalized.notes.map((note) => note.type)),
  new Set(["middle", "left", "right", "space", "top"]),
  "distinct fixed lanes at the same time must remain valid"
);

normalized.timelines.moveSpeed.push({ time: 2, value: 10 });
normalized.timelines.moveSpeed.push({ time: 2, value: 10 });
const duplicateEvent = findDuplicateTimelineEvent(normalized.timelines);
assert.equal(duplicateEvent?.timelineId, "moveSpeed");
assert.equal(duplicateEvent?.duplicate.time, 2);
assert.equal(duplicateEvent?.duplicate.value, 10);

console.log("chart validation tests passed");
