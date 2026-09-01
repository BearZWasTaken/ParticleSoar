import assert from "node:assert/strict";
import {
  LEGACY_PROGRESS_STORAGE_KEY,
  LocalPlayerProfileRepository,
  PlayerProfileStore
} from "../src/player-profile.js";

const data = new Map();
const storage = {
  getItem: (key) => data.get(key) ?? null,
  setItem: (key, value) => data.set(key, value)
};
data.set(LEGACY_PROGRESS_STORAGE_KEY, JSON.stringify({
  unlocked: ["song:legacy"],
  clears: { "song:legacy": { count: 1, bestScore: 800000, charts: {} } }
}));

const repository = new LocalPlayerProfileRepository(storage, "test-profile");
const store = new PlayerProfileStore(repository);
let profile = await store.load();
assert.deepEqual(profile.progression.unlocked, ["song:legacy"]);
assert.equal(profile.records["song:legacy"].bestScore, 800000);

const chapter = {
  entries: [
    { target: "song:a", unlock: { initial: true } },
    { target: "song:b" }
  ],
  links: [{ from: "song:a", to: "song:b" }]
};
profile = await store.initializeChapter(chapter);
assert.ok(profile.progression.unlocked.includes("song:a"));
await store.recordResult("song:a", "hd.json", { score: 799999, maxCombo: 42 });
profile = await store.applyChapterUnlocks(chapter);
assert.ok(!profile.progression.unlocked.includes("song:b"));
await store.recordResult("song:a", "hd.json", { score: 800000, maxCombo: 42 });
profile = await store.applyChapterUnlocks(chapter);
assert.ok(profile.progression.unlocked.includes("song:b"));
assert.equal(profile.records["song:a"].charts["hd.json"].bestScore, 800000);
assert.equal(profile.records["song:a"].charts["hd.json"].lastResult.maxCombo, 42);

await store.recordResult("song:a", "hd.json", {
  score: 900000,
  maxCombo: 4,
  counts: { flawless: 1, prime: 2, decent: 1, loose: 0, hollow: 0 }
});
profile = await store.load();
assert.equal(profile.records["song:a"].charts["hd.json"].bestResult.maxCombo, 4);
assert.equal(profile.records["song:a"].charts["hd.json"].bestResult.counts.prime, 2);

profile = await store.updateSettings({ inputDelayMs: 18, hitSoundVolume: 0.4 });
assert.equal(profile.settings.inputDelayMs, 18);
assert.equal(profile.settings.hitSoundVolume, 0.4);

console.log("player profile tests passed");
