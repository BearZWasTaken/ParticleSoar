import { CONFIG } from "./config.js";

export const PLAYER_PROFILE_FORMAT = "ParticleSoarPlayerProfile/v1";
export const PLAYER_PROFILE_STORAGE_KEY = "particlesoar.player-profile.v1";
export const LEGACY_PROGRESS_STORAGE_KEY = "particlesoar.player-progress.v1";
export const DEFAULT_CLEAR_SCORE = 800000;

export const DEFAULT_PLAYER_SETTINGS = CONFIG.player.defaultSettings;

function defaultProfile() {
  return {
    format: PLAYER_PROFILE_FORMAT,
    revision: 0,
    identity: { id: "local", displayName: "LOCAL PROFILE" },
    progression: { unlocked: [] },
    records: {},
    settings: { ...DEFAULT_PLAYER_SETTINGS },
    updatedAt: null
  };
}

function finiteNumber(value, fallback, min = -Infinity, max = Infinity) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

export function normalizePlayerSettings(source = {}) {
  return {
    chartDelayMs: finiteNumber(source.chartDelayMs, DEFAULT_PLAYER_SETTINGS.chartDelayMs, -200, 200),
    inputDelayMs: finiteNumber(source.inputDelayMs, DEFAULT_PLAYER_SETTINGS.inputDelayMs, -200, 200),
    musicVolume: finiteNumber(source.musicVolume, DEFAULT_PLAYER_SETTINGS.musicVolume, 0, 1),
    hitSoundVolume: finiteNumber(source.hitSoundVolume, DEFAULT_PLAYER_SETTINGS.hitSoundVolume, 0, 1),
    flowSpeedMultiplier: finiteNumber(source.flowSpeedMultiplier, DEFAULT_PLAYER_SETTINGS.flowSpeedMultiplier, 0.5, 2),
    autoPauseOnBlur: source.autoPauseOnBlur ?? DEFAULT_PLAYER_SETTINGS.autoPauseOnBlur
  };
}

export function normalizePlayerProfile(source) {
  const profile = source && typeof source === "object" ? structuredClone(source) : defaultProfile();
  profile.format = PLAYER_PROFILE_FORMAT;
  profile.revision = Math.max(0, Math.floor(Number(profile.revision) || 0));
  profile.identity = {
    id: String(profile.identity?.id || "local"),
    displayName: String(profile.identity?.displayName || "LOCAL PROFILE")
  };
  profile.progression = {
    unlocked: [...new Set(
      Array.isArray(profile.progression?.unlocked)
        ? profile.progression.unlocked.map(String)
        : []
    )]
  };
  profile.records = profile.records && typeof profile.records === "object" ? profile.records : {};
  profile.settings = normalizePlayerSettings(profile.settings);
  profile.updatedAt = profile.updatedAt ?? null;
  return profile;
}

function migrateLegacyProgress(source) {
  if (!source || typeof source !== "object") return null;
  const profile = defaultProfile();
  profile.progression.unlocked = Array.isArray(source.unlocked) ? source.unlocked : [];
  profile.records = source.clears && typeof source.clears === "object" ? source.clears : {};
  profile.updatedAt = source.updatedAt ?? null;
  return normalizePlayerProfile(profile);
}

export class PlayerProfileRepository {
  async loadProfile() {
    throw new Error("PlayerProfileRepository.loadProfile() is not implemented");
  }

  async saveProfile() {
    throw new Error("PlayerProfileRepository.saveProfile() is not implemented");
  }
}

export class LocalPlayerProfileRepository extends PlayerProfileRepository {
  constructor(
    storage = globalThis.localStorage,
    storageKey = PLAYER_PROFILE_STORAGE_KEY,
    legacyStorageKey = LEGACY_PROGRESS_STORAGE_KEY
  ) {
    super();
    this.storage = storage;
    this.storageKey = storageKey;
    this.legacyStorageKey = legacyStorageKey;
  }

  async loadProfile() {
    if (!this.storage) return defaultProfile();
    try {
      const current = this.storage.getItem(this.storageKey);
      if (current) return normalizePlayerProfile(JSON.parse(current));
      const legacy = this.storage.getItem(this.legacyStorageKey);
      return migrateLegacyProgress(legacy ? JSON.parse(legacy) : null) ?? defaultProfile();
    } catch {
      return defaultProfile();
    }
  }

  async saveProfile(profile) {
    const normalized = normalizePlayerProfile(profile);
    this.storage?.setItem(this.storageKey, JSON.stringify(normalized));
    return normalized;
  }
}

function chapterInitialUnlocks(chapter) {
  return (chapter?.entries ?? [])
    .filter((entry) => entry.unlock?.initial === true)
    .map((entry) => entry.target);
}

function clearedSongIds(records) {
  return new Set(Object.entries(records)
    .filter(([, record]) => (Number(record?.bestScore) || 0) >= DEFAULT_CLEAR_SCORE)
    .map(([songId]) => songId));
}

function applyUnlockRules(profile, chapter) {
  const unlocked = new Set(profile.progression.unlocked);
  chapterInitialUnlocks(chapter).forEach((songId) => unlocked.add(songId));
  const cleared = clearedSongIds(profile.records);
  for (const link of chapter?.links ?? []) {
    if (cleared.has(link.from)) unlocked.add(link.to);
  }
  profile.progression.unlocked = [...unlocked];
}

export class PlayerProfileStore {
  constructor(repository = new LocalPlayerProfileRepository()) {
    this.repository = repository;
    this.writeQueue = Promise.resolve();
  }

  load() {
    return this.writeQueue.then(() => this.repository.loadProfile());
  }

  mutate(mutator) {
    this.writeQueue = this.writeQueue.then(async () => {
      const profile = normalizePlayerProfile(await this.repository.loadProfile());
      await mutator(profile);
      profile.revision += 1;
      profile.updatedAt = new Date().toISOString();
      return this.repository.saveProfile(profile);
    });
    return this.writeQueue;
  }

  updateSettings(changes) {
    return this.mutate((profile) => {
      profile.settings = normalizePlayerSettings({ ...profile.settings, ...changes });
    });
  }

  initializeChapter(chapter) {
    return this.mutate((profile) => applyUnlockRules(profile, chapter));
  }

  applyChapterUnlocks(chapter) {
    return this.mutate((profile) => applyUnlockRules(profile, chapter));
  }

  recordResult(songId, chartId, result = {}) {
    return this.mutate((profile) => {
      const now = new Date().toISOString();
      const songRecord = profile.records[songId] ?? { playCount: 0, clearCount: 0, charts: {} };
      const chartKey = chartId || "default";
      const chartRecord = songRecord.charts?.[chartKey] ?? { playCount: 0, clearCount: 0 };
      const score = Math.max(0, Math.round(Number(result.score) || 0));
      const cleared = typeof result.cleared === "boolean"
        ? result.cleared
        : score >= DEFAULT_CLEAR_SCORE;
      profile.records[songId] = {
        ...songRecord,
        playCount: (songRecord.playCount ?? songRecord.count ?? 0) + 1,
        clearCount: (songRecord.clearCount ?? songRecord.count ?? 0) + (cleared ? 1 : 0),
        bestScore: Math.max(Number(songRecord.bestScore) || 0, score),
        lastPlayedAt: now,
        ...(cleared ? { lastClearedAt: now } : {}),
        charts: {
          ...songRecord.charts,
          [chartKey]: {
            ...chartRecord,
            playCount: (chartRecord.playCount ?? 0) + 1,
            clearCount: (chartRecord.clearCount ?? 0) + (cleared ? 1 : 0),
            bestScore: Math.max(Number(chartRecord.bestScore) || 0, score),
            lastScore: score,
            bestResult: score >= (Number(chartRecord.bestScore) || 0)
              ? structuredClone(result)
              : chartRecord.bestResult,
            lastResult: structuredClone(result),
            lastPlayedAt: now
          }
        }
      };
    });
  }
}
