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

console.log("trajectory tests passed");
