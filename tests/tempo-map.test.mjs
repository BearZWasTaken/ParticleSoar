import assert from "node:assert/strict";
import {
  beatAt,
  bpmAt,
  buildTempoMap,
  compactChart,
  createDefaultChart,
  gridTimes,
  nearestRampAnchorAtTime,
  normalizeChart,
  snapTime,
  timeAtBeat
} from "../src/chart-core.js";

const closeTo = (actual, expected, tolerance = 1e-7) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);
};

const chart = normalizeChart({
  ...createDefaultChart(),
  timing: {
    duration: 12,
    subdivision: 16,
    wPosDivision: 7,
    bpmKeys: [
      {
        time: 0,
        bpm: 120,
        beatsPerBar: 4,
        ramp: {
          beats: 20,
          anchors: [[1, 2, "b"], [11, 5, "t"]]
        }
      },
      { time: 8, bpm: 180, beatsPerBar: 4 }
    ]
  }
});

const map = buildTempoMap(chart);
closeTo(beatAt(chart, 0, map), 0);
assert.equal(map.issues.length, 0);
closeTo(beatAt(chart, 2, map), 4);
closeTo(beatAt(chart, 5, map), 11);
closeTo(beatAt(chart, 8, map), 20);
closeTo(bpmAt(chart, 0, map), 120);
closeTo(bpmAt(chart, 8, map), 180);

let previousBpm = 0;
for (let time = 0; time <= chart.timing.duration; time += 0.01) {
  const bpm = bpmAt(chart, time, map);
  assert.ok(bpm > 0, `BPM must remain positive at ${time}`);
  assert.ok(bpm >= previousBpm - 1e-7, `BPM must be monotone at ${time}`);
  previousBpm = bpm;
  const beat = beatAt(chart, time, map);
  closeTo(timeAtBeat(chart, beat, map), time, 1e-6);
}

closeTo(snapTime(chart, 1.99), 2, 1e-6);
const grid = gridTimes(chart);
assert.ok(grid.some((line) => Math.abs(line.time - 2) < 1e-6 && line.major));
assert.ok(grid.some((line) => Math.abs(line.time - 5) < 1e-6 && line.beat));

const compacted = compactChart(chart);
assert.deepEqual(compacted.timing.bpmKeys[0].ramp.anchors, [[1, 2, "b"], [11, 5, "t"]]);
const restored = normalizeChart(compacted);
assert.deepEqual(
  restored.timing.bpmKeys[0].ramp.anchors.map(({ kind, position, beat, time }) => [kind, position, beat, time]),
  [["bar", 1, 4, 2], ["beat", 11, 11, 5]]
);

assert.deepEqual(
  nearestRampAnchorAtTime(chart, 0, 2, "beat", map),
  { kind: "beat", position: 4, beat: 4, time: 2 }
);
assert.deepEqual(
  nearestRampAnchorAtTime(chart, 0, 5, "bar", map),
  { kind: "bar", position: 3, beat: 12, time: 5 }
);

const editedEndpoints = structuredClone(chart);
editedEndpoints.timing.bpmKeys[0].bpm = 90;
editedEndpoints.timing.bpmKeys[1].time = 1;
const preservedChart = normalizeChart(editedEndpoints);
const preservedRamp = preservedChart.timing.bpmKeys[0].ramp;
assert.equal(preservedRamp.beats, 20);
assert.deepEqual(
  preservedRamp.anchors.map(({ kind, position, beat, time }) => [kind, position, beat, time]),
  [["bar", 1, 4, 2], ["beat", 11, 11, 5]]
);
assert.equal(buildTempoMap(preservedChart).issues.length, 1);

const hardChangeChart = normalizeChart({
  ...createDefaultChart(),
  timing: {
    duration: 10,
    bpmKeys: [
      { time: 0, bpm: 100, beatsPerBar: 4 },
      { time: 5, bpm: 200, beatsPerBar: 4 }
    ]
  }
});
closeTo(bpmAt(hardChangeChart, 5), 200);

const impossibleEqualEndpoints = normalizeChart({
  ...createDefaultChart(),
  timing: {
    duration: 10,
    bpmKeys: [
      { time: 0, bpm: 120, ramp: { beats: 10 } },
      { time: 5.2, bpm: 120 }
    ]
  }
});
const impossibleMap = buildTempoMap(impossibleEqualEndpoints);
assert.equal(impossibleMap.issues.length, 1);
assert.match(impossibleMap.issues[0].reason, /首尾 BPM 相同/);
closeTo(bpmAt(impossibleEqualEndpoints, 0, impossibleMap), 120);
closeTo(bpmAt(impossibleEqualEndpoints, 5.2, impossibleMap), 120);

const roundedRamp = normalizeChart({
  ...createDefaultChart(),
  timing: {
    duration: 8,
    bpmKeys: [
      { time: 0, bpm: 120, ramp: { beats: 19.6, anchors: [[3.7, 2, "t"]] } },
      { time: 8, bpm: 180 }
    ]
  }
});
assert.equal(roundedRamp.timing.bpmKeys[0].ramp.beats, 20);
assert.equal(roundedRamp.timing.bpmKeys[0].ramp.anchors[0].beat, 4);
assert.equal(roundedRamp.timing.bpmKeys[0].ramp.anchors[0].kind, "beat");

console.log("tempo-map tests passed");
