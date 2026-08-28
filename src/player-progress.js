export const PLAYER_PROGRESS_FORMAT = "ParticleSoarProgress/v1";
export const PLAYER_PROGRESS_STORAGE_KEY = "particlesoar.player-progress.v1";

function emptyProgress() {
  return {
    format: PLAYER_PROGRESS_FORMAT,
    unlocked: [],
    clears: {},
    updatedAt: null
  };
}

function normalizeProgress(source) {
  const progress = source && typeof source === "object" ? structuredClone(source) : emptyProgress();
  progress.format = PLAYER_PROGRESS_FORMAT;
  progress.unlocked = [...new Set(Array.isArray(progress.unlocked) ? progress.unlocked.map(String) : [])];
  progress.clears = progress.clears && typeof progress.clears === "object" ? progress.clears : {};
  progress.updatedAt = progress.updatedAt ?? null;
  return progress;
}

function chapterInitialUnlocks(chapter) {
  return (chapter?.entries ?? [])
    .filter((entry) => entry.unlock?.initial === true)
    .map((entry) => entry.target);
}

function unlockedByClears(chapter, clearedIds) {
  const unlocked = new Set();
  for (const link of chapter?.links ?? []) {
    if (clearedIds.has(link.from)) unlocked.add(link.to);
  }
  return unlocked;
}

export class LocalPlayerProgressStore {
  constructor(storage = globalThis.localStorage, storageKey = PLAYER_PROGRESS_STORAGE_KEY) {
    this.storage = storage;
    this.storageKey = storageKey;
  }

  async load() {
    if (!this.storage) return emptyProgress();
    try {
      return normalizeProgress(JSON.parse(this.storage.getItem(this.storageKey)));
    } catch {
      return emptyProgress();
    }
  }

  async save(progress) {
    const normalized = normalizeProgress(progress);
    normalized.updatedAt = new Date().toISOString();
    this.storage?.setItem(this.storageKey, JSON.stringify(normalized));
    return normalized;
  }

  async initializeChapter(chapter) {
    const progress = await this.load();
    const unlocked = new Set(progress.unlocked);
    chapterInitialUnlocks(chapter).forEach((id) => unlocked.add(id));
    const clearedIds = new Set(Object.keys(progress.clears));
    unlockedByClears(chapter, clearedIds).forEach((id) => unlocked.add(id));
    progress.unlocked = [...unlocked];
    return this.save(progress);
  }

  async recordClear(songId, chartId, result = {}) {
    const progress = await this.load();
    const previous = progress.clears[songId] ?? { count: 0, charts: {} };
    const chartKey = chartId || "default";
    const previousChart = previous.charts?.[chartKey] ?? {};
    progress.clears[songId] = {
      ...previous,
      count: previous.count + 1,
      lastClearedAt: new Date().toISOString(),
      bestScore: Math.max(Number(previous.bestScore) || 0, Number(result.score) || 0),
      charts: {
        ...previous.charts,
        [chartKey]: {
          ...previousChart,
          clearCount: (previousChart.clearCount ?? 0) + 1,
          bestScore: Math.max(Number(previousChart.bestScore) || 0, Number(result.score) || 0),
          lastResult: structuredClone(result)
        }
      }
    };
    return this.save(progress);
  }

  async applyChapterUnlocks(chapter) {
    const progress = await this.load();
    const unlocked = new Set(progress.unlocked);
    const clearedIds = new Set(Object.keys(progress.clears));
    chapterInitialUnlocks(chapter).forEach((id) => unlocked.add(id));
    unlockedByClears(chapter, clearedIds).forEach((id) => unlocked.add(id));
    progress.unlocked = [...unlocked];
    return this.save(progress);
  }
}
