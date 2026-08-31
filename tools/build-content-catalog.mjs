import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const chartsDirectory = path.join(root, "public", "charts");
const contentDirectory = path.join(root, "public", "content");
const structurePath = path.join(contentDirectory, "structure.json");
const catalogPath = path.join(contentDirectory, "catalog.json");

function songId(directoryName) {
  const slug = directoryName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) throw new Error(`Cannot create song id from directory: ${directoryName}`);
  return `song:${slug}`;
}

function songSummary(meta) {
  return {
    title: meta.title,
    composer: meta.composer,
    illustrator: meta.illustrator,
    ...(meta.cover ? { cover: meta.cover } : {}),
    charts: meta.charts.map((chart) => ({
      file: chart.file,
      difficultyLabel: chart.difficultyLabel,
      level: chart.level,
      ...(chart.charter ? { charter: chart.charter } : {})
    }))
  };
}

async function discoverSongs() {
  const entries = await readdir(chartsDirectory, { withFileTypes: true });
  const songs = [];
  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const metaPath = path.join(chartsDirectory, entry.name, "meta.json");
    let meta;
    try {
      meta = JSON.parse(await readFile(metaPath, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw new Error(`Cannot read ${metaPath}: ${error.message}`);
    }
    if (meta.format !== "particlesoar-song@1") throw new Error(`Unsupported song manifest: ${metaPath}`);
    if (!Array.isArray(meta.charts) || meta.charts.length === 0) throw new Error(`Song has no charts: ${metaPath}`);
    if (typeof meta.cover !== "string" || !meta.cover.trim()) throw new Error(`Song has no cover: ${metaPath}`);
    songs.push([songId(entry.name), {
      type: "song",
      manifest: `../charts/${entry.name}/meta.json`,
      summary: songSummary(meta)
    }]);
  }
  return songs;
}

const structure = JSON.parse(await readFile(structurePath, "utf8"));
if (structure.format !== "ParticleSoarContentStructure/v1") {
  throw new Error(`Unsupported content structure format: ${structure.format ?? "missing"}`);
}

const songNodes = Object.fromEntries(await discoverSongs());
const catalog = {
  format: "ParticleSoarContent/v1",
  entrypoints: structure.entrypoints,
  nodes: {
    ...structure.nodes,
    ...songNodes
  }
};

await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Wrote ${catalogPath} with ${Object.keys(songNodes).length} song(s)`);
