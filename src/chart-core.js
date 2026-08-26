import { CONFIG } from "./config.js?v=20260826-23";

const chartConfig = CONFIG.chart;
const chartDefaults = chartConfig.defaults;
const gameConfig = CONFIG.game;
const timelineDefault = Object.fromEntries(
  chartConfig.timelineDefinitions.map((definition) => [definition.id, definition.defaultValue])
);

export const CHART_FORMAT = chartConfig.format;

const NOTE_TYPE_CODES = chartConfig.noteTypeCodes;

const NOTE_TYPE_NAMES = Object.freeze(
  Object.fromEntries(Object.entries(NOTE_TYPE_CODES).map(([name, code]) => [code, name]))
);

export const TIMELINE_DEFINITIONS = chartConfig.timelineDefinitions;

const easingGroup = (label, options) => Object.freeze({
  label,
  options: Object.freeze(options.map(([value, optionLabel]) => Object.freeze({ value, label: optionLabel })))
});

export const EASING_PRESET_GROUPS = Object.freeze(
  chartConfig.easingPresetGroups.map((group) => easingGroup(group.label, group.options))
);

export const EASING_PRESETS = Object.freeze(
  EASING_PRESET_GROUPS.flatMap((group) => group.options.map((option) => option.value))
);

const legacyEasingAliases = chartConfig.legacyEasingAliases;

function normalizeEasingPreset(preset) {
  const migrated = legacyEasingAliases[preset] ?? preset;
  return EASING_PRESETS.includes(migrated) ? migrated : "linear";
}

export function createDefaultChart() {
  const timelineEvents = Object.fromEntries(
    Object.entries(chartDefaults.timelines).map(([id, events]) => [
      id,
      events.map(([time, value, easing]) => ({ time, value, easing }))
    ])
  );
  return {
    format: CHART_FORMAT,
    meta: structuredClone(chartDefaults.meta),
    timing: {
      duration: chartDefaults.timing.duration,
      offset: chartDefaults.timing.offset,
      subdivision: chartDefaults.timing.subdivision,
      wPosDivision: chartDefaults.timing.wPosDivision,
      bpmKeys: [{
        time: 0,
        bpm: chartDefaults.timing.bpm,
        beatsPerBar: chartDefaults.timing.beatsPerBar
      }]
    },
    playfield: structuredClone(chartDefaults.playfield),
    timelines: timelineEvents,
    notes: chartDefaults.notes.map((note) => ({ id: crypto.randomUUID(), ...note })),
    effects: []
  };
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeDifficultyLabel(value) {
  const fallback = chartDefaults.meta.difficultyLabel;
  const label = String(value ?? fallback).trim().replace(/^-+|-+$/g, "").trim();
  return label || fallback;
}

function normalizeNoteType(type) {
  if (NOTE_TYPE_NAMES[type]) return NOTE_TYPE_NAMES[type];
  return Object.hasOwn(NOTE_TYPE_CODES, type) ? type : "middle";
}

function normalizeEvent(event, fallbackValue) {
  return {
    id: event.id ?? crypto.randomUUID(),
    time: Math.max(0, finite(event.time, 0)),
    value: finite(event.value, fallbackValue),
    easing: normalizeEasingPreset(event.easing),
    formula: typeof event.formula === "string" ? event.formula : "t"
  };
}

export function normalizeChart(source = {}) {
  const defaults = createDefaultChart();
  const chart = structuredClone(source);
  chart.format = CHART_FORMAT;
  chart.meta = { ...defaults.meta, ...(chart.meta ?? {}) };
  chart.meta.difficultyLabel = normalizeDifficultyLabel(chart.meta.difficultyLabel);
  chart.meta.level = Math.max(0, Math.round(finite(chart.meta.level, defaults.meta.level)));
  delete chart.meta.difficultyColor;
  chart.timing = { ...defaults.timing, ...(chart.timing ?? {}) };
  chart.timing.duration = Math.max(0.1, finite(chart.timing.duration ?? chart.timing.chartDuration, chartDefaults.timing.duration));
  chart.timing.offset = finite(chart.timing.offset, chartDefaults.timing.offset);
  chart.timing.subdivision = Math.max(0, Math.round(finite(chart.timing.subdivision, chartDefaults.timing.subdivision)));
  chart.timing.wPosDivision = Math.max(0, Math.round(finite(chart.timing.wPosDivision, chartDefaults.timing.wPosDivision)));
  chart.timing.bpmKeys = (chart.timing.bpmKeys ?? defaults.timing.bpmKeys)
    .map((key) => ({
      id: key.id ?? crypto.randomUUID(),
      time: Math.max(0, finite(key.time ?? key.startTime, 0)),
      bpm: Math.max(1, finite(key.bpm, chartDefaults.timing.bpm)),
      beatsPerBar: Math.max(1, finite(key.beatsPerBar ?? key.timeSignature, chartDefaults.timing.beatsPerBar))
    }))
    .sort((a, b) => a.time - b.time);
  if (chart.timing.bpmKeys.length === 0) chart.timing.bpmKeys.push({
    id: crypto.randomUUID(),
    time: 0,
    bpm: chartDefaults.timing.bpm,
    beatsPerBar: chartDefaults.timing.beatsPerBar
  });
  chart.playfield = { ...defaults.playfield, ...(chart.playfield ?? {}) };
  chart.playfield.receiverRadius = Math.max(0.1, finite(chart.playfield.receiverRadius, chartDefaults.playfield.receiverRadius));
  chart.playfield.sideLaneOffset = Math.max(
    chart.playfield.receiverRadius,
    finite(chart.playfield.sideLaneOffset, chartDefaults.playfield.sideLaneOffset)
  );
  chart.playfield.origin = Array.isArray(chart.playfield.origin) && chart.playfield.origin.length === 3
    ? chart.playfield.origin.map((value, index) => finite(value, defaults.playfield.origin[index]))
    : [...defaults.playfield.origin];

  chart.timelines = chart.timelines ?? {};
  TIMELINE_DEFINITIONS.forEach((definition) => {
    const events = chart.timelines[definition.id] ?? defaults.timelines[definition.id] ?? [];
    chart.timelines[definition.id] = events
      .map((event) => normalizeEvent(event, definition.defaultValue))
      .sort((a, b) => a.time - b.time);
    if (chart.timelines[definition.id].length === 0) {
      chart.timelines[definition.id].push(normalizeEvent({ time: 0, value: definition.defaultValue }, definition.defaultValue));
    }
  });

  chart.notes = (chart.notes ?? []).map((note) => {
    const hitTime = Math.max(0, finite(note.hitTime ?? note.time, 0));
    const kind = note.kind === "hold" || note.endTime > hitTime ? "hold" : "tap";
    const type = normalizeNoteType(note.type);
    return {
      ...note,
      id: note.id ?? crypto.randomUUID(),
      type,
      kind,
      hitTime,
      ...(kind === "hold" ? { endTime: Math.max(hitTime + 0.001, finite(note.endTime, hitTime + 1)) } : {}),
      wPos: type === "middle" ? Math.max(-1, Math.min(1, finite(note.wPos ?? note.localX, 0))) : 0
    };
  }).sort((a, b) => a.hitTime - b.hitTime || (a.wPos ?? 0) - (b.wPos ?? 0));
  chart.effects = Array.isArray(chart.effects) ? chart.effects : [];
  return chart;
}

function compactTimeline(events) {
  return events.map((event) => ({
    ...(event.time !== 0 ? { time: event.time } : {}),
    value: event.value,
    ...(event.easing !== "linear" ? { easing: event.easing } : {}),
    ...(event.easing === "formula" && event.formula !== "t" ? { formula: event.formula } : {})
  }));
}

function compactNote(note) {
  const compact = {
    type: NOTE_TYPE_CODES[note.type],
    hitTime: note.hitTime
  };
  if (note.kind === "hold") compact.endTime = note.endTime;
  if (note.type === "middle" && note.wPos !== 0) compact.wPos = note.wPos;
  if (note.scoreWeight !== undefined && note.scoreWeight !== 1) compact.scoreWeight = note.scoreWeight;
  return compact;
}

function sameVector(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

// Editor-only ids and derivable defaults never cross the chart file boundary.
export function compactChart(chart) {
  const normalized = normalizeChart(chart);
  const defaults = createDefaultChart();
  const timing = {
    duration: normalized.timing.duration,
    bpmKeys: normalized.timing.bpmKeys.map((key) => ({
      ...(key.time !== 0 ? { time: key.time } : {}),
      bpm: key.bpm,
      ...(key.beatsPerBar !== chartDefaults.timing.beatsPerBar ? { beatsPerBar: key.beatsPerBar } : {})
    })),
    ...(normalized.timing.offset !== 0 ? { offset: normalized.timing.offset } : {}),
    ...(normalized.timing.subdivision !== defaults.timing.subdivision
      ? { subdivision: normalized.timing.subdivision }
      : {}),
    ...(normalized.timing.wPosDivision !== defaults.timing.wPosDivision
      ? { wPosDivision: normalized.timing.wPosDivision }
      : {})
  };
  const playfield = {
    ...(normalized.playfield.receiverRadius !== defaults.playfield.receiverRadius
      ? { receiverRadius: normalized.playfield.receiverRadius }
      : {}),
    ...(normalized.playfield.sideLaneOffset !== defaults.playfield.sideLaneOffset
      ? { sideLaneOffset: normalized.playfield.sideLaneOffset }
      : {}),
    ...(!sameVector(normalized.playfield.origin, defaults.playfield.origin)
      ? { origin: normalized.playfield.origin }
      : {})
  };
  const effects = normalized.effects.map(({ id, ...effect }) => effect);

  return {
    format: CHART_FORMAT,
    meta: {
      title: normalized.meta.title,
      composer: normalized.meta.composer,
      charter: normalized.meta.charter,
      illustrator: normalized.meta.illustrator,
      difficultyLabel: normalizeDifficultyLabel(normalized.meta.difficultyLabel),
      level: normalized.meta.level,
      ...(normalized.meta.audioFile ? { audioFile: normalized.meta.audioFile } : {}),
      ...(normalized.meta.jacket ? { jacket: normalized.meta.jacket } : {})
    },
    timing,
    ...(Object.keys(playfield).length ? { playfield } : {}),
    timelines: Object.fromEntries(
      TIMELINE_DEFINITIONS.map(({ id }) => [id, compactTimeline(normalized.timelines[id])])
    ),
    notes: normalized.notes.map(compactNote),
    ...(effects.length ? { effects } : {})
  };
}

export function bpmKeyAt(chart, time) {
  let current = chart.timing.bpmKeys[0];
  for (const key of chart.timing.bpmKeys) {
    if (key.time > time) break;
    current = key;
  }
  return current;
}

export function snapTime(chart, time) {
  const clamped = Math.max(0, Math.min(chart.timing.duration, finite(time, 0)));
  if (chart.timing.subdivision === 0) return clamped;
  const key = bpmKeyAt(chart, clamped);
  const barDuration = (60 / key.bpm) * key.beatsPerBar;
  const subdivisionDuration = barDuration / chart.timing.subdivision;
  const subdivision = Math.round((clamped - key.time) / subdivisionDuration);
  return Math.max(0, Math.min(chart.timing.duration, key.time + subdivision * subdivisionDuration));
}

export function snapWPos(chart, value) {
  const clamped = Math.max(-1, Math.min(1, finite(value, 0)));
  if (chart.timing.wPosDivision === 0) return clamped;
  const step = 2 / (chart.timing.wPosDivision + 1);
  return Math.max(-1, Math.min(1, Math.round((clamped + 1) / step) * step - 1));
}

const formulaCache = new Map();

function formulaEasing(formula, t) {
  const expression = String(formula || "t").trim();
  if (!/^[0-9A-Za-z_+\-*/%().,\s]+$/.test(expression)) return t;
  const allowedIdentifiers = new Set([
    "t", "pi", "sin", "cos", "tan", "asin", "acos", "atan",
    "abs", "min", "max", "pow", "sqrt", "log", "ln", "exp",
    "floor", "ceil", "round"
  ]);
  const identifiers = expression.match(/[A-Za-z_]+/g) ?? [];
  if (identifiers.some((identifier) => !allowedIdentifiers.has(identifier))) return t;
  if (!formulaCache.has(expression)) {
    formulaCache.set(expression, new Function(
      "t", "pi", "sin", "cos", "tan", "asin", "acos", "atan",
      "abs", "min", "max", "pow", "sqrt", "log", "ln", "exp", "floor", "ceil", "round",
      `"use strict"; return (${expression});`
    ));
  }
  try {
    const result = formulaCache.get(expression)(
      t, Math.PI, Math.sin, Math.cos, Math.tan, Math.asin, Math.acos, Math.atan,
      Math.abs, Math.min, Math.max, Math.pow, Math.sqrt, Math.log10, Math.log, Math.exp,
      Math.floor, Math.ceil, Math.round
    );
    return Number.isFinite(result) ? result : t;
  } catch {
    return t;
  }
}

function bounceOut(x) {
  const n = 7.5625;
  const d = 2.75;
  if (x < 1 / d) return n * x * x;
  if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
  if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375;
  return n * (x -= 2.625 / d) * x + 0.984375;
}

export function easeValue(preset, t, formula = "t") {
  const x = Math.max(0, Math.min(1, t));
  const easing = normalizeEasingPreset(preset);
  if (easing === "formula") return formulaEasing(formula, x);
  if (easing === "hold") return x < 1 ? 0 : 1;
  if (easing === "midStep") return x < 0.5 ? 0 : 1;
  if (easing === "triangle") return x < 0.5 ? 2 * x : 2 * (1 - x);
  if (easing === "sinePulse") return Math.sin(Math.PI * x);
  if (easing === "quadIn") return x ** 2;
  if (easing === "quadOut") return 1 - (1 - x) ** 2;
  if (easing === "quadInOut") return x < 0.5 ? 2 * x ** 2 : 1 - ((-2 * x + 2) ** 2) / 2;
  if (easing === "cubicIn") return x ** 3;
  if (easing === "cubicOut") return 1 - (1 - x) ** 3;
  if (easing === "cubicInOut") return x < 0.5 ? 4 * x ** 3 : 1 - ((-2 * x + 2) ** 3) / 2;
  if (easing === "quartIn") return x ** 4;
  if (easing === "quartOut") return 1 - (1 - x) ** 4;
  if (easing === "quartInOut") return x < 0.5 ? 8 * x ** 4 : 1 - ((-2 * x + 2) ** 4) / 2;
  if (easing === "quintIn") return x ** 5;
  if (easing === "quintOut") return 1 - (1 - x) ** 5;
  if (easing === "quintInOut") return x < 0.5 ? 16 * x ** 5 : 1 - ((-2 * x + 2) ** 5) / 2;
  if (easing === "sineIn") return 1 - Math.cos((x * Math.PI) / 2);
  if (easing === "sineOut") return Math.sin((x * Math.PI) / 2);
  if (easing === "sineInOut") return -(Math.cos(Math.PI * x) - 1) / 2;
  if (easing === "expoIn") return x === 0 ? 0 : 2 ** (10 * x - 10);
  if (easing === "expoOut") return x === 1 ? 1 : 1 - 2 ** (-10 * x);
  if (easing === "expoInOut") {
    if (x === 0 || x === 1) return x;
    return x < 0.5 ? 2 ** (20 * x - 10) / 2 : (2 - 2 ** (-20 * x + 10)) / 2;
  }
  if (easing === "circIn") return 1 - Math.sqrt(1 - x ** 2);
  if (easing === "circOut") return Math.sqrt(1 - (x - 1) ** 2);
  if (easing === "circInOut") {
    return x < 0.5
      ? (1 - Math.sqrt(1 - (2 * x) ** 2)) / 2
      : (Math.sqrt(1 - (-2 * x + 2) ** 2) + 1) / 2;
  }
  if (easing === "elasticIn") {
    if (x === 0 || x === 1) return x;
    return -(2 ** (10 * x - 10)) * Math.sin((10 * x - 10.75) * (2 * Math.PI / 3));
  }
  if (easing === "elasticOut") {
    if (x === 0 || x === 1) return x;
    return 2 ** (-10 * x) * Math.sin((10 * x - 0.75) * (2 * Math.PI / 3)) + 1;
  }
  if (easing === "elasticInOut") {
    if (x === 0 || x === 1) return x;
    const oscillation = Math.sin((20 * x - 11.125) * (2 * Math.PI / 4.5));
    return x < 0.5
      ? -(2 ** (20 * x - 10) * oscillation) / 2
      : (2 ** (-20 * x + 10) * oscillation) / 2 + 1;
  }
  if (easing === "backIn") {
    const c = 1.70158;
    return (c + 1) * x ** 3 - c * x ** 2;
  }
  if (easing === "backOut") {
    const c = 1.70158;
    return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2;
  }
  if (easing === "backInOut") {
    const c = 1.70158 * 1.525;
    return x < 0.5
      ? ((2 * x) ** 2 * ((c + 1) * 2 * x - c)) / 2
      : (((2 * x - 2) ** 2 * ((c + 1) * (2 * x - 2) + c)) + 2) / 2;
  }
  if (easing === "bounceIn") return 1 - bounceOut(1 - x);
  if (easing === "bounceOut") return bounceOut(x);
  if (easing === "bounceInOut") {
    return x < 0.5
      ? (1 - bounceOut(1 - 2 * x)) / 2
      : (1 + bounceOut(2 * x - 1)) / 2;
  }
  return x;
}

export function sampleTimeline(events, time, fallback = 0) {
  if (!events?.length) return fallback;
  if (time <= events[0].time) return events[0].value;
  let from = events[0];
  for (let index = 1; index < events.length; index += 1) {
    const to = events[index];
    if (time <= to.time) {
      const duration = Math.max(0.000001, to.time - from.time);
      const progress = easeValue(from.easing, (time - from.time) / duration, from.formula);
      return from.value + (to.value - from.value) * progress;
    }
    from = to;
  }
  return from.value;
}

export function directionAt(chart, time) {
  const yaw = sampleTimeline(chart.timelines.moveYaw, time, timelineDefault.moveYaw) * Math.PI / 180;
  const pitch = sampleTimeline(chart.timelines.movePitch, time, timelineDefault.movePitch) * Math.PI / 180;
  const horizontal = Math.cos(pitch);
  return {
    direction: [horizontal * Math.cos(yaw), Math.sin(pitch), horizontal * Math.sin(yaw)],
    right: [-Math.sin(yaw), 0, Math.cos(yaw)],
    yaw,
    pitch
  };
}

export function buildReceiverTrajectory(chart, sampleSeconds = 0.04) {
  const duration = chart.timing.duration;
  const origin = chart.playfield.origin;
  const samples = [];
  let position = [...origin];
  let previousTime = 0;
  for (let time = 0; time < duration + sampleSeconds * 0.5; time += sampleSeconds) {
    const clampedTime = Math.min(duration, time);
    const { direction, right, yaw, pitch } = directionAt(chart, clampedTime);
    const speed = Math.max(0, sampleTimeline(chart.timelines.moveSpeed, clampedTime, 0));
    const delta = clampedTime - previousTime;
    if (samples.length > 0) {
      position = position.map((value, index) => value + direction[index] * speed * delta);
    }
    const sideOffset = chart.playfield.sideLaneOffset;
    samples.push({
      time: clampedTime,
      position: [...position],
      left: position.map((value, index) => value - right[index] * sideOffset),
      right: position.map((value, index) => value + right[index] * sideOffset),
      direction,
      lateral: right,
      yaw,
      pitch,
      speed
    });
    previousTime = clampedTime;
    if (clampedTime >= duration) break;
  }
  return samples;
}

export function trajectoryPoseAt(samples, time) {
  if (!samples.length) return null;
  if (time <= samples[0].time) return samples[0];
  const last = samples[samples.length - 1];
  if (time >= last.time) return last;
  let low = 0;
  let high = samples.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (samples[middle].time <= time) low = middle;
    else high = middle;
  }
  const from = samples[low];
  const to = samples[high];
  const progress = (time - from.time) / Math.max(0.000001, to.time - from.time);
  const interpolate = (a, b) => a.map((value, index) => value + (b[index] - value) * progress);
  return {
    time,
    position: interpolate(from.position, to.position),
    left: interpolate(from.left, to.left),
    right: interpolate(from.right, to.right),
    direction: interpolate(from.direction, to.direction),
    lateral: interpolate(from.lateral, to.lateral),
    speed: from.speed + (to.speed - from.speed) * progress,
    yaw: from.yaw + (to.yaw - from.yaw) * progress,
    pitch: from.pitch + (to.pitch - from.pitch) * progress
  };
}

const vectorLength = (vector) => Math.hypot(vector[0], vector[1], vector[2]);
const normalizeVector = (vector, fallback) => {
  const length = vectorLength(vector);
  return length > 0.000001 ? vector.map((value) => value / length) : [...fallback];
};
const crossVectors = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];

export function receiverFrameAt(pose) {
  const xAxis = normalizeVector(pose?.lateral ?? [1, 0, 0], [1, 0, 0]);
  const rawYAxis = normalizeVector(pose?.direction ?? [0, 1, 0], [0, 1, 0]);
  const zAxis = normalizeVector(crossVectors(xAxis, rawYAxis), [0, 0, 1]);
  const yAxis = normalizeVector(crossVectors(zAxis, xAxis), rawYAxis);
  return { xAxis, yAxis, zAxis };
}

function transformByFrame(vector, frame) {
  return [0, 1, 2].map((index) => (
    frame.xAxis[index] * vector[0]
    + frame.yAxis[index] * vector[1]
    + frame.zAxis[index] * vector[2]
  ));
}

export function cameraPoseAt(chart, trajectory, time) {
  const pose = trajectoryPoseAt(trajectory, time);
  if (!pose) return null;
  const referencePosition = trajectory[0].position;
  const localPosition = [
    sampleTimeline(chart.timelines.cameraX, time, timelineDefault.cameraX),
    sampleTimeline(chart.timelines.cameraY, time, timelineDefault.cameraY),
    sampleTimeline(chart.timelines.cameraZ, time, timelineDefault.cameraZ)
  ];
  const localTarget = [
    sampleTimeline(chart.timelines.cameraTargetX, time, timelineDefault.cameraTargetX),
    sampleTimeline(chart.timelines.cameraTargetY, time, timelineDefault.cameraTargetY),
    sampleTimeline(chart.timelines.cameraTargetZ, time, timelineDefault.cameraTargetZ)
  ];
  const frame = receiverFrameAt(pose);
  const mountVector = (point) => transformByFrame(
    point.map((value, index) => value - referencePosition[index]),
    frame
  ).map((value, index) => value + pose.position[index]);
  return {
    position: mountVector(localPosition),
    target: mountVector(localTarget),
    fov: sampleTimeline(chart.timelines.cameraFov, time, timelineDefault.cameraFov),
    frame
  };
}

export function speedColor(speed, minSpeed, maxSpeed) {
  const range = Math.max(0.0001, maxSpeed - minSpeed);
  const t = Math.max(0, Math.min(1, (speed - minSpeed) / range));
  const toRgb = (color) => [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
  const low = toRgb(CONFIG.colors.speedSlow);
  const high = toRgb(CONFIG.colors.speedFast);
  return low.map((value, index) => (value + (high[index] - value) * t) / 255);
}

export function gridTimes(chart, start = 0, end = chart.timing.duration) {
  const times = [];
  if (chart.timing.subdivision === 0) return times;
  const keys = chart.timing.bpmKeys;
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const segmentEnd = Math.min(end, keys[index + 1]?.time ?? chart.timing.duration);
    const barDuration = (60 / key.bpm) * key.beatsPerBar;
    const step = barDuration / chart.timing.subdivision;
    let subdivision = Math.max(0, Math.ceil((start - key.time) / step));
    for (let time = key.time + subdivision * step; time <= segmentEnd + 0.0001; time += step, subdivision += 1) {
      if (time < start - 0.0001) continue;
      times.push({
        time,
        major: subdivision % chart.timing.subdivision === 0,
        beat: subdivision % Math.max(1, Math.round(chart.timing.subdivision / key.beatsPerBar)) === 0
      });
    }
  }
  return times;
}

export function chartForGame(chart) {
  const normalized = normalizeChart(chart);
  const sampleSeconds = chartConfig.trajectorySampleSeconds;
  const trajectory = buildReceiverTrajectory(normalized, sampleSeconds);
  const receiverEvents = [{
    hitTime: 0,
    moveSeconds: 0,
    receiverPosition: trajectory[0].position,
    judgeLineDirection: trajectory[0].lateral,
    fallDirection: trajectory[0].direction.map((value) => -value)
  }];
  for (let index = 1; index < trajectory.length; index += 1) {
    const previous = trajectory[index - 1];
    const sample = trajectory[index];
    receiverEvents.push({
      hitTime: previous.time,
      moveSeconds: Math.max(0.001, sample.time - previous.time),
      curve: "linear",
      receiverPosition: sample.position,
      judgeLineDirection: sample.lateral,
      fallDirection: sample.direction.map((value) => -value)
    });
  }

  const bakeTimeline = (events, fallback, baseValue = 0) => {
    const baked = [];
    for (let time = 0; time < normalized.timing.duration; time += sampleSeconds) {
      const endTime = Math.min(normalized.timing.duration, time + sampleSeconds);
      baked.push({
        startTime: time,
        endTime,
        from: sampleTimeline(events, time, fallback) - baseValue,
        to: sampleTimeline(events, endTime, fallback) - baseValue,
        curve: "linear"
      });
    }
    return baked;
  };

  return {
    ...structuredClone(normalized),
    motionMode: "receiver-catch",
    camera: {
      position: [...gameConfig.camera.position],
      target: [...gameConfig.camera.target],
      fov: gameConfig.camera.fov,
      near: gameConfig.camera.near,
      far: gameConfig.camera.far
    },
    timing: {
      chartDuration: normalized.timing.duration,
      audioOffset: normalized.timing.offset,
      bpmKeys: normalized.timing.bpmKeys,
      subdivision: normalized.timing.subdivision,
      wPosDivision: normalized.timing.wPosDivision
    },
    playfield: {
      ...normalized.playfield,
      sideLaneX: normalized.playfield.sideLaneOffset
    },
    receiverEvents,
    timelines: {
      ...structuredClone(normalized.timelines),
      FlowSpeed: [],
      CameraX: bakeTimeline(normalized.timelines.cameraX, timelineDefault.cameraX),
      CameraY: bakeTimeline(normalized.timelines.cameraY, timelineDefault.cameraY),
      CameraZ: bakeTimeline(normalized.timelines.cameraZ, timelineDefault.cameraZ, timelineDefault.cameraZ),
      CameraTargetX: bakeTimeline(normalized.timelines.cameraTargetX, timelineDefault.cameraTargetX),
      CameraTargetY: bakeTimeline(normalized.timelines.cameraTargetY, timelineDefault.cameraTargetY),
      CameraTargetZ: bakeTimeline(normalized.timelines.cameraTargetZ, timelineDefault.cameraTargetZ),
      CameraFov: bakeTimeline(normalized.timelines.cameraFov, timelineDefault.cameraFov, timelineDefault.cameraFov)
    },
    notes: normalized.notes.map((note) => ({
      ...note,
      type: note.kind === "hold"
        ? note.type === "space" ? "spaceHold" : note.type === "middle" ? "hold" : `${note.type}Hold`
        : note.type,
      localX: note.type === "left"
        ? -normalized.playfield.sideLaneOffset
        : note.type === "right"
          ? normalized.playfield.sideLaneOffset
          : note.type === "middle"
            ? note.wPos * normalized.playfield.receiverRadius
            : 0
    }))
  };
}
