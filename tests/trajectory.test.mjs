import assert from "node:assert/strict";
import { buildReceiverTrajectory } from "../src/chart-core.js";

const chart = {
  timing: { duration: 1 },
  playfield: { origin: [0, 0, 0], sideLaneOffset: 4 },
  timelines: {
    moveYaw: [{ time: 0, value: 0 }],
    movePitch: [{ time: 0, value: 0 }],
    moveSpeed: [{ time: 0, value: 10 }],
    moveStrafeSpeed: [{ time: 0, value: 0 }]
  }
};

const normal = buildReceiverTrajectory(chart, 0.25, 1);
const doubled = buildReceiverTrajectory(chart, 0.25, 2);
assert.ok(Math.abs(normal.at(-1).position[0] - 10) < 0.0001);
assert.ok(Math.abs(doubled.at(-1).position[0] - 20) < 0.0001);
assert.ok(Math.abs(doubled.at(-1).speed - normal.at(-1).speed * 2) < 0.0001);

const reverseChart = structuredClone(chart);
reverseChart.timelines.moveSpeed[0].value = -10;
const reversed = buildReceiverTrajectory(reverseChart, 0.25, 1);
const reversedDoubled = buildReceiverTrajectory(reverseChart, 0.25, 2);
assert.ok(Math.abs(reversed.at(-1).position[0] + 10) < 0.0001);
assert.ok(Math.abs(reversedDoubled.at(-1).position[0] + 20) < 0.0001);
assert.equal(reversed.at(-1).forwardSpeed, -10);
assert.equal(reversed.at(-1).speed, 10);
assert.deepEqual(reversed.at(-1).direction, normal.at(-1).direction);

const sharpTurnChart = structuredClone(chart);
sharpTurnChart.timing.duration = 0.1;
sharpTurnChart.timelines.moveYaw = [
  { time: 0, value: 0, easing: "cubicInOut" },
  { time: 0.05, value: 90, easing: "cubicInOut" },
  { time: 0.1, value: 180, easing: "linear" }
];
const sharpTurn = buildReceiverTrajectory(sharpTurnChart, 0.1, 1);
assert.ok(sharpTurn.some((sample) => Math.abs(sample.time - 0.05) < 1e-9));
assert.ok(sharpTurn.length > 3, "rapid turns should receive adaptive trajectory samples");

console.log("trajectory tests passed");
