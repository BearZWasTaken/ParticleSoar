import assert from "node:assert/strict";
import { HitSoundPlayer, hitSoundKeyForJudgement } from "../src/hit-sounds.js";

assert.equal(hitSoundKeyForJudgement("flawless"), "prime");
assert.equal(hitSoundKeyForJudgement("prime"), "prime");
assert.equal(hitSoundKeyForJudgement("decent"), "decent");
assert.equal(hitSoundKeyForJudgement("loose"), null);
assert.equal(hitSoundKeyForJudgement("hollow"), null);

const starts = [];
let stops = 0;
const source = {
  connect(node) { return node; },
  start(time) { starts.push(time); },
  stop() { stops += 1; }
};
const context = {
  currentTime: 2,
  destination: {},
  createBufferSource: () => source,
  createGain: () => ({ gain: { value: 0 }, connect() {} })
};
const player = new HitSoundPlayer({ urls: {}, volume: 0.5 });
player.context = context;
player.buffers.set("prime", {});

assert.equal(player.playJudgement("prime", 2.125), true);
assert.deepEqual(starts, [2.125]);
player.stopAll();
assert.equal(stops, 1);

console.log("hit sound tests passed");
