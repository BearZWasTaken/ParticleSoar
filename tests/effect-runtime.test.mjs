import assert from "node:assert/strict";
import { createDefaultChart } from "../src/chart-core.js";
import { ChartEffectRuntime } from "../src/effects/effect-runtime.js";

class Group {
  constructor() {
    this.children = [];
  }

  add(child) {
    child.parent = this;
    this.children.push(child);
  }

  removeFromParent() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = null;
  }

  traverse(callback) {
    callback(this);
    this.children.forEach((child) => child.traverse?.(callback));
  }
}

const calls = [];
const chart = createDefaultChart();
chart.timing.duration = 2;
chart.timing.bpmKeys[0].bpm = 120;
chart.timing.bpmKeys[0].beatsPerBar = 2;
chart.fx = [{ time: 0.75, target: "planet", action: "pulse", params: { amount: 3 } }];

const runtime = new ChartEffectRuntime({
  THREE: { Group },
  root: new Group(),
  getReceiverPose: (time) => ({ time }),
  moduleLoader: async () => ({
    default: {
      create: (context) => calls.push(["create", context.module.id]),
      reset: () => calls.push(["reset"]),
      update: (context) => calls.push(["update", context.time.chartTime]),
      onBeat: (_context, event) => calls.push(["beat", event.time]),
      onBar: (_context, event) => calls.push(["bar", event.time]),
      actions: {
        pulse: (_context, params) => calls.push(["pulse", params.amount])
      },
      dispose: () => calls.push(["dispose"])
    }
  })
});

await runtime.configure({
  chart,
  modules: [{ id: "planet", url: "https://example.test/planet.effect.js", order: 10 }]
});
runtime.update(1.1);

assert.deepEqual(
  calls.filter(([name]) => name === "beat").map(([, time]) => time),
  [0, 0.5, 1],
  "every crossed beat must be delivered even when a frame spans several boundaries"
);
assert.deepEqual(calls.filter(([name]) => name === "bar").map(([, time]) => time), [0, 1]);
assert.deepEqual(calls.find(([name]) => name === "pulse"), ["pulse", 3]);

const resetCount = calls.filter(([name]) => name === "reset").length;
runtime.update(0.8);
assert.equal(calls.filter(([name]) => name === "reset").length, resetCount + 1, "backward time must reset and replay effects");
assert.equal(calls.filter(([name]) => name === "pulse").length, 2, "cues must replay after a backward seek");

await runtime.dispose();
assert.equal(calls.at(-1)[0], "dispose");

console.log("effect runtime tests passed");
