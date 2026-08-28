import assert from "node:assert/strict";
import { hitSoundKeyForJudgement } from "../src/hit-sounds.js";

assert.equal(hitSoundKeyForJudgement("flawless"), "prime");
assert.equal(hitSoundKeyForJudgement("prime"), "prime");
assert.equal(hitSoundKeyForJudgement("decent"), "decent");
assert.equal(hitSoundKeyForJudgement("loose"), null);
assert.equal(hitSoundKeyForJudgement("hollow"), null);

console.log("hit sound tests passed");
