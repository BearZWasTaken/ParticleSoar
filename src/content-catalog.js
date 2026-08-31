export const CONTENT_CATALOG_FORMAT = "ParticleSoarContent/v1";

const clone = (value) => structuredClone(value);

function objectValue(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function nonEmptyString(value, label) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} must be a non-empty string`);
  return text;
}

function normalizeEntry(entry, ownerId, index) {
  if (typeof entry === "string") return { target: nonEmptyString(entry, `${ownerId}.entries[${index}]`) };
  const normalized = clone(objectValue(entry));
  normalized.target = nonEmptyString(normalized.target, `${ownerId}.entries[${index}].target`);
  return normalized;
}

function normalizeNode(id, source) {
  const node = clone(objectValue(source));
  node.id = id;
  node.type = nonEmptyString(node.type, `nodes.${id}.type`);
  if (node.type === "song") {
    node.manifest = nonEmptyString(node.manifest, `nodes.${id}.manifest`);
  }
  if (node.entries !== undefined) {
    if (!Array.isArray(node.entries)) throw new Error(`nodes.${id}.entries must be an array`);
    node.entries = node.entries.map((entry, index) => normalizeEntry(entry, id, index));
  }
  if (node.links !== undefined) {
    if (!Array.isArray(node.links)) throw new Error(`nodes.${id}.links must be an array`);
    node.links = node.links.map((link, index) => {
      const normalized = clone(objectValue(link));
      normalized.from = nonEmptyString(normalized.from, `${id}.links[${index}].from`);
      normalized.to = nonEmptyString(normalized.to, `${id}.links[${index}].to`);
      return normalized;
    });
  }
  if (node.presentation?.mode === "constellation") {
    for (const [index, entry] of (node.entries ?? []).entries()) {
      if (
        !Array.isArray(entry.position)
        || entry.position.length !== 2
        || entry.position.some((value) => !Number.isFinite(Number(value)))
      ) {
        throw new Error(`${id}.entries[${index}].position must be an explicit [x, y] coordinate`);
      }
      entry.position = entry.position.map(Number);
    }
  }
  return node;
}

export function normalizeContentCatalog(source) {
  const catalog = clone(objectValue(source));
  if (catalog.format !== CONTENT_CATALOG_FORMAT) {
    throw new Error(`Unsupported content catalog format: ${catalog.format ?? "missing"}`);
  }

  const sourceNodes = objectValue(catalog.nodes);
  const nodes = new Map(
    Object.entries(sourceNodes).map(([rawId, node]) => {
      const id = nonEmptyString(rawId, "node id");
      return [id, normalizeNode(id, node)];
    })
  );
  if (nodes.size === 0) throw new Error("Content catalog has no nodes");

  const entrypoints = new Map(
    Object.entries(objectValue(catalog.entrypoints)).map(([name, target]) => [
      nonEmptyString(name, "entrypoint name"),
      nonEmptyString(target, `entrypoints.${name}`)
    ])
  );
  if (entrypoints.size === 0) throw new Error("Content catalog has no entrypoints");

  for (const [name, target] of entrypoints) {
    if (!nodes.has(target)) throw new Error(`Entrypoint ${name} references missing node ${target}`);
  }
  for (const node of nodes.values()) {
    for (const entry of node.entries ?? []) {
      if (!nodes.has(entry.target)) {
        throw new Error(`Node ${node.id} references missing node ${entry.target}`);
      }
    }
    for (const link of node.links ?? []) {
      if (!nodes.has(link.from) || !nodes.has(link.to)) {
        throw new Error(`Node ${node.id} has a link with a missing endpoint`);
      }
    }
  }

  return { format: CONTENT_CATALOG_FORMAT, entrypoints, nodes };
}

function resolveOptionalUrl(path, baseUrl) {
  return path ? new URL(path, baseUrl).href : null;
}

export class ContentCatalog {
  constructor(source, catalogUrl, fetchImpl = globalThis.fetch, requestInit = {}) {
    const normalized = normalizeContentCatalog(source);
    this.format = normalized.format;
    this.entrypoints = normalized.entrypoints;
    this.nodes = normalized.nodes;
    this.catalogUrl = new URL(catalogUrl, globalThis.location?.href ?? "http://localhost/");
    this.fetchImpl = (...args) => fetchImpl(...args);
    this.requestInit = { ...requestInit };
    this.songManifestCache = new Map();
  }

  getNode(id) {
    return this.nodes.get(id) ?? null;
  }

  getEntrypoint(name = "default") {
    const target = this.entrypoints.get(name);
    return target ? this.getNode(target) : null;
  }

  getNodesByType(type) {
    return [...this.nodes.values()].filter((node) => node.type === type);
  }

  resolveEntries(nodeOrId) {
    const node = typeof nodeOrId === "string" ? this.getNode(nodeOrId) : nodeOrId;
    if (!node) return [];
    return (node.entries ?? []).map((entry) => ({
      ...clone(entry),
      node: this.getNode(entry.target)
    }));
  }

  resolveSongAsset(songOrId, path) {
    const song = typeof songOrId === "string" ? this.getNode(songOrId) : songOrId;
    if (!song || song.type !== "song" || !path) return null;
    const manifestUrl = new URL(song.manifest, this.catalogUrl);
    return new URL(path, manifestUrl).href;
  }

  async loadSongManifest(songOrId) {
    const song = typeof songOrId === "string" ? this.getNode(songOrId) : songOrId;
    if (!song || song.type !== "song") throw new Error("Song node not found");
    if (this.songManifestCache.has(song.id)) return this.songManifestCache.get(song.id);

    const promise = this.#fetchSongManifest(song).catch((error) => {
      this.songManifestCache.delete(song.id);
      throw error;
    });
    this.songManifestCache.set(song.id, promise);
    return promise;
  }

  async #fetchSongManifest(song) {
    if (typeof this.fetchImpl !== "function") throw new Error("No fetch implementation available");
    const manifestUrl = new URL(song.manifest, this.catalogUrl);
    const response = await this.fetchImpl(manifestUrl.href, this.requestInit);
    if (!response.ok) throw new Error(`Failed to load song manifest (${response.status}): ${manifestUrl.href}`);
    const manifest = await response.json();
    if (manifest?.format !== "particlesoar-song@1") {
      throw new Error(`Unsupported song manifest format: ${manifest?.format ?? "missing"}`);
    }
    if (!Array.isArray(manifest.charts) || manifest.charts.length === 0) {
      throw new Error(`Song manifest ${song.id} has no charts`);
    }
    const cover = nonEmptyString(manifest.cover, `${song.id}.cover`);

    return {
      ...manifest,
      id: song.id,
      manifestUrl: manifestUrl.href,
      audioUrl: resolveOptionalUrl(manifest.audio, manifestUrl),
      coverUrl: resolveOptionalUrl(cover, manifestUrl),
      charts: manifest.charts.map((chart) => ({
        ...chart,
        url: new URL(nonEmptyString(chart.file, `${song.id}.charts.file`), manifestUrl).href
      }))
    };
  }
}

export async function loadContentCatalog(
  catalogUrl = "./public/content/catalog.json",
  fetchImpl = globalThis.fetch,
  requestInit = {}
) {
  if (typeof fetchImpl !== "function") throw new Error("No fetch implementation available");
  const absoluteUrl = new URL(catalogUrl, globalThis.location?.href ?? "http://localhost/");
  const response = await fetchImpl(absoluteUrl.href, requestInit);
  if (!response.ok) throw new Error(`Failed to load content catalog (${response.status}): ${absoluteUrl.href}`);
  return new ContentCatalog(await response.json(), absoluteUrl, fetchImpl, requestInit);
}
