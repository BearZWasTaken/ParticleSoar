import assert from "node:assert/strict";
import {
  JUDGEMENT_QUALITY_ORDER,
  selectBestJudgementCandidate
} from "../src/judgement-selection.js";

assert.deepEqual(JUDGEMENT_QUALITY_ORDER, ["flawless", "prime", "decent", "loose"]);

const leftDecent = { inputType: "left", judgement: "decent" };
const middlePrime = { inputType: "middle", judgement: "prime" };
assert.equal(
  selectBestJudgementCandidate([leftDecent, middlePrime]),
  middlePrime,
  "the better judgement must override key-region priority"
);

const middleDecent = { inputType: "middle", judgement: "decent" };
assert.equal(
  selectBestJudgementCandidate([leftDecent, middleDecent]),
  leftDecent,
  "equal judgements must preserve the existing input-region order"
);

const middleLoose = { inputType: "middle", judgement: "loose" };
assert.equal(selectBestJudgementCandidate([middleLoose, leftDecent]), leftDecent);
assert.equal(selectBestJudgementCandidate([]), null);

console.log("judgement selection tests passed");
