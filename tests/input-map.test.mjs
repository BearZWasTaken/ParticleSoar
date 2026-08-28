import assert from "node:assert/strict";
import { CONFIG } from "../src/config.js";
import { createInputMap } from "../src/input-map.js";

const inputMap = createInputMap(CONFIG.game.input);

assert.deepEqual(inputMap.inputTypesForCode("KeyE"), ["middle", "left"]);
assert.deepEqual(inputMap.inputTypesForCode("KeyD"), ["middle", "left"]);
assert.deepEqual(inputMap.inputTypesForCode("KeyO"), ["middle", "right"]);
assert.deepEqual(inputMap.inputTypesForCode("KeyK"), ["middle", "right"]);
assert.deepEqual(inputMap.inputTypesForCode("Comma"), ["middle", "right"]);
assert.deepEqual(inputMap.inputTypesForCode("Digit0"), ["right", "top"]);
assert.deepEqual(inputMap.inputTypesForCode("Digit1"), ["left", "top"]);
assert.deepEqual(inputMap.inputTypesForCode("Minus"), ["right", "top"]);
assert.deepEqual(inputMap.inputTypesForCode("KeyS"), ["left", "middle"]);
assert.deepEqual(inputMap.inputTypesForCode("KeyL"), ["right", "middle"]);
assert.deepEqual(inputMap.inputTypesForCode("Space"), ["space"]);
assert.deepEqual(inputMap.inputTypesForCode("Escape"), []);

console.log("input map tests passed");
