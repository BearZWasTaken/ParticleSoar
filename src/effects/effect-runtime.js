import { beatAt, bpmAt, buildTempoMap, normalizeChart, timeAtBeat } from "../chart-core.js";

const EPSILON = 1e-7;

function lastIndexAtOrBefore(items, time) {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (items[middle].time <= time + EPSILON) low = middle + 1;
    else high = middle;
  }
  return low - 1;
}

function musicalEvents(chart, tempoMap) {
  const events = [];
  let beatIndex = 0;
  let barIndex = 0;
  const keys = chart.timing.bpmKeys;

  keys.forEach((key, keyIndex) => {
    const startBeat = tempoMap.keyBeats[keyIndex] ?? beatAt(chart, key.time, tempoMap);
    const endTime = keys[keyIndex + 1]?.time ?? chart.timing.duration;
    const endBeat = beatAt(chart, endTime, tempoMap);
    const includeEnd = keyIndex === keys.length - 1;
    for (let localBeat = 0; ; localBeat += 1) {
      const absoluteBeat = startBeat + localBeat;
      if (includeEnd ? absoluteBeat > endBeat + EPSILON : absoluteBeat >= endBeat - EPSILON) break;
      const time = timeAtBeat(chart, absoluteBeat, tempoMap);
      if (events.length && Math.abs(events[events.length - 1].time - time) <= EPSILON) continue;
      const isBar = localBeat % key.beatsPerBar === 0;
      events.push({
        kind: "beat",
        time,
        beat: absoluteBeat,
        localBeat,
        beatIndex: beatIndex++,
        barIndex: isBar ? barIndex++ : Math.max(0, barIndex - 1),
        beatsPerBar: key.beatsPerBar,
        bpmKeyIndex: keyIndex,
        isBar
      });
    }
  });
  return events;
}

function normalizeModules(modules = []) {
  const ids = new Set();
  return modules
    .filter((module) => module && module.enabled !== false && module.id && (module.url || module.file))
    .map((module, index) => ({ ...module, order: Number(module.order) || 0, sourceIndex: index }))
    .filter((module) => {
      if (ids.has(module.id)) {
        console.warn(`[ParticleSoar effects] Duplicate module id ignored: ${module.id}`);
        return false;
      }
      ids.add(module.id);
      return true;
    })
    .sort((left, right) => left.order - right.order || left.sourceIndex - right.sourceIndex);
}

function disposeMaterial(material) {
  if (Array.isArray(material)) material.forEach(disposeMaterial);
  else material?.dispose?.();
}

function disposeTree(root) {
  root?.traverse?.((object) => {
    object.geometry?.dispose?.();
    disposeMaterial(object.material);
  });
}

class EffectResources {
  constructor({ THREE, fetchImpl = globalThis.fetch } = {}) {
    this.THREE = THREE;
    this.fetchImpl = fetchImpl;
    this.cache = new Map();
    this.disposers = new Map();
  }

  load(key, loader, disposer = null) {
    if (!this.cache.has(key)) {
      const promise = Promise.resolve().then(loader);
      this.cache.set(key, promise);
      if (disposer) this.disposers.set(key, disposer);
    }
    return this.cache.get(key);
  }

  text(url) {
    return this.load(`text:${url}`, async () => {
      const response = await this.fetchImpl(url);
      if (!response.ok) throw new Error(`Failed to load effect resource (${response.status}): ${url}`);
      return response.text();
    });
  }

  json(url) {
    return this.load(`json:${url}`, async () => JSON.parse(await this.text(url)));
  }

  texture(url) {
    if (!this.THREE?.TextureLoader) throw new Error("THREE.TextureLoader is unavailable");
    return this.load(
      `texture:${url}`,
      () => new this.THREE.TextureLoader().loadAsync(url),
      (texture) => texture?.dispose?.()
    );
  }

  async dispose() {
    for (const [key, promise] of this.cache) {
      const disposer = this.disposers.get(key);
      if (!disposer) continue;
      try { disposer(await promise); } catch { /* A failed resource has nothing to release. */ }
    }
    this.cache.clear();
    this.disposers.clear();
  }
}

export class ChartEffectRuntime {
  constructor({
    THREE,
    root,
    scene,
    camera,
    renderer,
    composer,
    getReceiverPose = () => null,
    moduleLoader = (url) => import(url),
    fetchImpl = globalThis.fetch,
    onError = (error, detail) => console.error("[ParticleSoar effects]", detail, error)
  } = {}) {
    this.THREE = THREE;
    this.root = root;
    this.host = { scene, camera, renderer, composer };
    this.getReceiverPose = getReceiverPose;
    this.moduleLoader = moduleLoader;
    this.fetchImpl = fetchImpl;
    this.onError = onError;
    this.records = [];
    this.recordById = new Map();
    this.chart = null;
    this.tempoMap = null;
    this.beats = [];
    this.bars = [];
    this.schedule = [];
    this.cursor = 0;
    this.currentTime = 0;
    this.generation = 0;
    this.ready = false;
    this.resources = new EffectResources({ THREE, fetchImpl });
  }

  async configure({ chart, modules = [] } = {}) {
    const generation = ++this.generation;
    await this.disposeRecords();
    if (generation !== this.generation) return;
    this.chart = chart ? normalizeChart(chart) : null;
    this.ready = false;
    if (!chart?.timing?.bpmKeys?.length) return;
    const descriptors = normalizeModules(modules);
    if (descriptors.length === 0) return;

    this.tempoMap = buildTempoMap(this.chart);
    this.beats = musicalEvents(this.chart, this.tempoMap);
    this.bars = this.beats.filter((event) => event.isBar);
    const cues = [...(this.chart.fx ?? [])]
      .map((cue, index) => ({ kind: "cue", ...cue, sourceIndex: index }))
      .sort((left, right) => left.time - right.time || left.sourceIndex - right.sourceIndex);
    this.schedule = [
      ...this.beats.map((event) => ({ ...event, priority: 0 })),
      ...this.bars.map((event) => ({ ...event, kind: "bar", priority: 1 })),
      ...cues.map((event) => ({ ...event, priority: 2 }))
    ].sort((left, right) => left.time - right.time || left.priority - right.priority || (left.sourceIndex ?? 0) - (right.sourceIndex ?? 0));

    for (const descriptor of descriptors) {
      if (generation !== this.generation) return;
      await this.loadModule(descriptor, generation);
    }
    if (generation !== this.generation) return;
    this.ready = true;
    this.seek(0);
  }

  async loadModule(descriptor, generation) {
    const url = descriptor.url ?? descriptor.file;
    try {
      const namespace = await this.moduleLoader(url, descriptor);
      if (generation !== this.generation) return;
      const root = this.THREE?.Group ? new this.THREE.Group() : { add() {}, removeFromParent() {} };
      root.name = `effect:${descriptor.id}`;
      this.root?.add?.(root);
      const cleanups = [];
      const context = this.makeContext(descriptor, root, cleanups);
      const exported = namespace?.default ?? namespace;
      const instance = typeof exported === "function"
        ? await exported(context, descriptor.options ?? {})
        : exported;
      const record = { descriptor, root, context, cleanups, instance: instance ?? {} };
      this.records.push(record);
      this.recordById.set(descriptor.id, record);
      await this.invokeAsync(record, "preload");
      await this.invokeAsync(record, "create");
    } catch (error) {
      this.onError(error, { phase: "load", module: descriptor.id, url });
    }
  }

  makeContext(descriptor, root, cleanups) {
    const resolve = (path) => {
      if (descriptor.resourceUrls && descriptor.file) {
        const projectBase = new URL(descriptor.file, "https://particlesoar.project/");
        const projectPath = new URL(path, projectBase).pathname.slice(1);
        if (descriptor.resourceUrls[projectPath]) return descriptor.resourceUrls[projectPath];
      }
      return new URL(path, descriptor.url ?? descriptor.file).href;
    };
    const resourceFacade = {
      load: (key, loader, disposer) => this.resources.load(resolve(key), loader, disposer),
      text: (path) => this.resources.text(resolve(path)),
      json: (path) => this.resources.json(resolve(path)),
      texture: (path) => this.resources.texture(resolve(path))
    };
    return {
      THREE: this.THREE,
      root,
      ...this.host,
      chart: this.chart,
      module: descriptor,
      resources: resourceFacade,
      resolve,
      receiver: {
        current: () => this.getReceiverPose(this.currentTime),
        at: (time) => this.getReceiverPose(time)
      },
      time: {},
      event: null,
      registerCleanup: (cleanup) => {
        if (typeof cleanup === "function") cleanups.push(cleanup);
        return cleanup;
      }
    };
  }

  timingAt(time, deltaTime = 0) {
    const beatPosition = beatAt(this.chart, time, this.tempoMap);
    const beatIndex = lastIndexAtOrBefore(this.beats, time);
    const barIndex = lastIndexAtOrBefore(this.bars, time);
    const previousBeat = this.beats[Math.max(0, beatIndex)];
    const nextBeat = this.beats[Math.min(this.beats.length - 1, beatIndex + 1)];
    const previousBar = this.bars[Math.max(0, barIndex)];
    const nextBar = this.bars[Math.min(this.bars.length - 1, barIndex + 1)];
    const phase = (from, to) => from && to && to.time > from.time
      ? Math.max(0, Math.min(1, (time - from.time) / (to.time - from.time)))
      : 0;
    return {
      chartTime: time,
      deltaTime,
      bpm: bpmAt(this.chart, time, this.tempoMap),
      beat: beatPosition,
      beatIndex: Math.max(0, beatIndex),
      beatPhase: phase(previousBeat, nextBeat),
      barIndex: Math.max(0, barIndex),
      barPhase: phase(previousBar, nextBar)
    };
  }

  setContextTime(time, deltaTime = 0, event = null) {
    const timing = this.timingAt(time, deltaTime);
    this.currentTime = time;
    for (const record of this.records) {
      Object.assign(record.context.time, timing);
      record.context.event = event;
    }
  }

  dispatch(event, replay = false) {
    this.setContextTime(event.time, 0, { ...event, replay });
    if (event.kind === "cue") {
      const record = this.recordById.get(event.target);
      if (!record) return;
      const action = record.instance?.actions?.[event.action];
      if (typeof action === "function") this.invokeFunction(record, action, event.params ?? {}, event);
      else this.invoke(record, "onCue", event);
      return;
    }
    for (const record of this.records) this.invoke(record, event.kind === "bar" ? "onBar" : "onBeat", event);
  }

  update(time) {
    if (!this.ready || !Number.isFinite(time)) return;
    const nextTime = Math.max(0, time);
    if (nextTime + EPSILON < this.currentTime) {
      this.seek(nextTime);
      return;
    }
    const deltaTime = nextTime - this.currentTime;
    while (this.cursor < this.schedule.length && this.schedule[this.cursor].time <= nextTime + EPSILON) {
      this.dispatch(this.schedule[this.cursor]);
      this.cursor += 1;
    }
    this.setContextTime(nextTime, deltaTime);
    for (const record of this.records) this.invoke(record, "update");
  }

  seek(time) {
    if (!this.ready) return;
    const target = Math.max(0, Number(time) || 0);
    this.cursor = 0;
    this.currentTime = 0;
    for (const record of this.records) this.invoke(record, "reset");
    while (this.cursor < this.schedule.length && this.schedule[this.cursor].time <= target + EPSILON) {
      this.dispatch(this.schedule[this.cursor], true);
      this.cursor += 1;
    }
    this.setContextTime(target, 0);
    for (const record of this.records) this.invoke(record, "update");
  }

  invokeFunction(record, callback, ...args) {
    try {
      const result = callback.call(record.instance, record.context, ...args);
      if (result?.catch) result.catch((error) => this.onError(error, { phase: "callback", module: record.descriptor.id }));
      return result;
    } catch (error) {
      this.onError(error, { phase: "callback", module: record.descriptor.id });
      return undefined;
    }
  }

  invoke(record, name, ...args) {
    const callback = record.instance?.[name];
    return typeof callback === "function" ? this.invokeFunction(record, callback, ...args) : undefined;
  }

  async invokeAsync(record, name, ...args) {
    await this.invoke(record, name, ...args);
  }

  async disposeRecords() {
    const records = this.records.splice(0);
    this.recordById.clear();
    for (const record of records.reverse()) {
      await this.invokeAsync(record, "dispose");
      for (const cleanup of record.cleanups.reverse()) {
        try { await cleanup(); } catch (error) {
          this.onError(error, { phase: "cleanup", module: record.descriptor.id });
        }
      }
      disposeTree(record.root);
      record.root.removeFromParent?.();
    }
    await this.resources.dispose();
    this.resources = new EffectResources({ THREE: this.THREE, fetchImpl: this.fetchImpl });
    this.schedule = [];
    this.beats = [];
    this.bars = [];
    this.cursor = 0;
  }

  async dispose() {
    ++this.generation;
    this.ready = false;
    await this.disposeRecords();
    this.chart = null;
    this.tempoMap = null;
  }
}
