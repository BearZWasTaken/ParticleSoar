import assert from "node:assert/strict";
import {
  CONTENT_CATALOG_FORMAT,
  ContentCatalog,
  normalizeContentCatalog
} from "../src/content-catalog.js";
import { LocalPlayerProgressStore } from "../src/player-progress.js";

const source = {
  format: CONTENT_CATALOG_FORMAT,
  entrypoints: { default: "map:one" },
  nodes: {
    "map:one": {
      type: "map",
      presentation: { mode: "map" },
      entries: [{ target: "song:test", position: [4, 8] }]
    },
    library: {
      type: "collection",
      entries: ["song:test"]
    },
    "song:test": {
      type: "song",
      manifest: "../charts/test/meta.json",
      summary: { title: "Test" }
    }
  }
};

const normalized = normalizeContentCatalog(source);
assert.equal(normalized.nodes.get("map:one").presentation.mode, "map");
assert.deepEqual(normalized.nodes.get("library").entries, [{ target: "song:test" }]);
assert.throws(
  () => normalizeContentCatalog({
    ...source,
    nodes: { ...source.nodes, library: { type: "collection", entries: ["missing"] } }
  }),
  /missing node/
);
assert.throws(
  () => normalizeContentCatalog({
    ...source,
    nodes: {
      ...source.nodes,
      "map:one": {
        ...source.nodes["map:one"],
        presentation: { mode: "constellation" },
        entries: [{ target: "song:test" }]
      }
    }
  }),
  /explicit \[x, y\]/
);

let fetchCount = 0;
let lastFetchInit;
const fakeFetch = async (url, init) => {
  fetchCount += 1;
  lastFetchInit = init;
  assert.equal(url, "https://game.test/charts/test/meta.json");
  return {
    ok: true,
    json: async () => ({
      format: "particlesoar-song@1",
      title: "Test",
      audio: "song.ogg",
      charts: [{ file: "hd.json", difficultyLabel: "HD", level: 12 }]
    })
  };
};

const catalog = new ContentCatalog(
  source,
  "https://game.test/content/catalog.json",
  fakeFetch,
  { cache: "no-store" }
);
assert.equal(catalog.getEntrypoint().id, "map:one");
assert.equal(catalog.resolveEntries("map:one")[0].node.id, "song:test");
assert.equal(catalog.getNodesByType("song").length, 1);

const [manifestA, manifestB] = await Promise.all([
  catalog.loadSongManifest("song:test"),
  catalog.loadSongManifest("song:test")
]);
assert.equal(fetchCount, 1, "song manifests should be cached");
assert.deepEqual(lastFetchInit, { cache: "no-store" });
assert.equal(manifestA, manifestB);
assert.equal(manifestA.audioUrl, "https://game.test/charts/test/song.ogg");
assert.equal(manifestA.charts[0].url, "https://game.test/charts/test/hd.json");

console.log("content catalog tests passed");

const storageData = new Map();
const storage = {
  getItem: (key) => storageData.get(key) ?? null,
  setItem: (key, value) => storageData.set(key, value)
};
const progressStore = new LocalPlayerProgressStore(storage, "test-progress");
const chapter = {
  entries: [
    { target: "song:a", unlock: { initial: true } },
    { target: "song:b" }
  ],
  links: [{ from: "song:a", to: "song:b" }]
};
let progress = await progressStore.initializeChapter(chapter);
assert.deepEqual(progress.unlocked, ["song:a"]);
await progressStore.recordClear("song:a", "hd.json", { score: 900000 });
progress = await progressStore.applyChapterUnlocks(chapter);
assert.deepEqual(new Set(progress.unlocked), new Set(["song:a", "song:b"]));
assert.equal(progress.clears["song:a"].charts["hd.json"].bestScore, 900000);

console.log("player progress tests passed");
