export function hitSoundKeyForJudgement(judgement) {
  if (judgement === "flawless" || judgement === "prime") return "prime";
  if (judgement === "decent") return "decent";
  return null;
}

export class HitSoundPlayer {
  constructor({ urls, volume = 1, fetchImpl } = {}) {
    this.urls = { ...urls };
    this.volume = volume;
    this.fetchImpl = fetchImpl ?? globalThis.fetch?.bind(globalThis);
    this.context = null;
    this.buffers = new Map();
    this.preloadPromise = null;
  }

  ensureContext() {
    if (this.context) return this.context;
    const AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!AudioContextClass) return null;
    this.context = new AudioContextClass({ latencyHint: "interactive" });
    return this.context;
  }

  preload() {
    if (this.preloadPromise) return this.preloadPromise;
    const context = this.ensureContext();
    if (!context) return Promise.resolve();
    if (!this.fetchImpl) return Promise.resolve();
    this.preloadPromise = Promise.all(Object.entries(this.urls).map(async ([key, url]) => {
      const response = await this.fetchImpl(url, { cache: "force-cache" });
      if (!response.ok) throw new Error(`Failed to load hit sound (${response.status}): ${url}`);
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      this.buffers.set(key, buffer);
    })).then(() => undefined).catch((error) => {
      console.warn("Hit sounds could not be preloaded.", error);
    });
    return this.preloadPromise;
  }

  async unlock() {
    const context = this.ensureContext();
    if (context?.state === "suspended") await context.resume();
  }

  playJudgement(judgement) {
    const key = hitSoundKeyForJudgement(judgement);
    const context = this.ensureContext();
    const buffer = key ? this.buffers.get(key) : null;
    if (!context || !buffer) return false;

    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = this.volume;
    source.connect(gain).connect(context.destination);
    source.start();
    return true;
  }
}
