import { CONFIG } from "./config.js?v=20260901-3";

const chartConfig = CONFIG.chart;
const chartDefaults = chartConfig.defaults;
const gameConfig = CONFIG.game;
const timelineDefault = Object.fromEntries(
  chartConfig.timelineDefinitions.map((definition) => [definition.id, definition.defaultValue])
);

export const CHART_FORMAT = chartConfig.format;
export const CHART_TIME_STEP = chartConfig.timeStepSeconds;

const NOTE_TYPE_CODES = chartConfig.noteTypeCodes;

const NOTE_TYPE_NAMES = Object.freeze(
  Object.fromEntries(Object.entries(NOTE_TYPE_CODES).map(([name, code]) => [code, name]))
);
const PLACEMENT_PRECISION = 1e6;

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
    fx: []
  };
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function placementNumberKey(value) {
  return Math.round(finite(value, 0) * PLACEMENT_PRECISION);
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

// Non-middle lanes have an implicit fixed wPos, represented by their lane type.
export function notePlacementKey(note) {
  const type = normalizeNoteType(note.type);
  const lanePosition = type === "middle"
    ? `middle:${placementNumberKey(note.wPos ?? note.localX)}`
    : type;
  return `${placementNumberKey(note.hitTime ?? note.time)}:${lanePosition}`;
}

export function findDuplicateNotePlacement(notes = []) {
  const seen = new Map();
  for (const note of notes) {
    const key = notePlacementKey(note);
    if (seen.has(key)) return { first: seen.get(key), duplicate: note };
    seen.set(key, note);
  }
  return null;
}

export function findDuplicateTimelineEvent(timelines = {}) {
  for (const definition of TIMELINE_DEFINITIONS) {
    const seen = new Map();
    for (const event of timelines[definition.id] ?? []) {
      const key = `${placementNumberKey(event.time)}:${placementNumberKey(event.value)}`;
      if (seen.has(key)) {
        return {
          timelineId: definition.id,
          label: definition.label,
          first: seen.get(key),
          duplicate: event
        };
      }
      seen.set(key, event);
    }
  }
  return null;
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
      beatsPerBar: Math.max(1, finite(key.beatsPerBar ?? key.timeSignature, chartDefaults.timing.beatsPerBar)),
      ...(key.ramp ? { ramp: structuredClone(key.ramp) } : {})
    }))
    .sort((a, b) => a.time - b.time);
  if (chart.timing.bpmKeys.length === 0) chart.timing.bpmKeys.push({
    id: crypto.randomUUID(),
    time: 0,
    bpm: chartDefaults.timing.bpm,
    beatsPerBar: chartDefaults.timing.beatsPerBar
  });
  chart.timing.bpmKeys.forEach((key, index) => {
    const next = chart.timing.bpmKeys[index + 1];
    if (!next || !key.ramp) {
      delete key.ramp;
      return;
    }
    const duration = Math.max(CHART_TIME_STEP, next.time - key.time);
    const estimatedBeats = duration * (key.bpm + next.bpm) / 120;
    const beats = Math.max(1, Math.round(finite(key.ramp.beats, estimatedBeats)));
    const anchors = (key.ramp.anchors ?? [])
      .map((anchor) => {
        const arrayAnchor = Array.isArray(anchor);
        const rawPosition = finite(arrayAnchor
          ? anchor[0]
          : anchor.position ?? anchor.bar ?? anchor.beat ?? anchor.beatOffset, NaN);
        const rawKind = arrayAnchor ? anchor[2] : anchor.kind;
        const legacyBeat = Math.round(rawPosition);
        const kind = rawKind === "b" || rawKind === "bar"
          ? "bar"
          : rawKind === "t" || rawKind === "beat"
            ? "beat"
            : legacyBeat > 0 && legacyBeat % key.beatsPerBar === 0
              ? "bar"
              : "beat";
        const position = kind === "bar" && rawKind == null
          ? Math.round(rawPosition / key.beatsPerBar)
          : Math.round(rawPosition);
        return {
          id: arrayAnchor ? crypto.randomUUID() : anchor.id ?? crypto.randomUUID(),
          kind,
          position,
          beat: kind === "bar" ? position * key.beatsPerBar : position,
          time: finite(arrayAnchor ? anchor[1] : anchor.time, NaN)
        };
      })
      .filter((anchor) => Number.isFinite(anchor.beat) && Number.isFinite(anchor.time))
      .sort((left, right) => left.beat - right.beat || left.time - right.time);
    key.ramp = { beats, anchors };
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

  const seenNotePlacements = new Set();
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
      ...(kind === "hold" ? { endTime: Math.max(hitTime + CHART_TIME_STEP, finite(note.endTime, hitTime + 1)) } : {}),
      wPos: type === "middle" ? Math.max(-1, Math.min(1, finite(note.wPos ?? note.localX, 0))) : 0
    };
  }).filter((note) => {
    const key = notePlacementKey(note);
    if (seenNotePlacements.has(key)) return false;
    seenNotePlacements.add(key);
    return true;
  }).sort((a, b) => a.hitTime - b.hitTime || (a.wPos ?? 0) - (b.wPos ?? 0));
  const sourceCues = Array.isArray(chart.fx)
    ? chart.fx
    : Array.isArray(chart.effects)
      ? chart.effects.map((effect) => ({
        time: effect.time,
        target: effect.target ?? effect.type,
        action: effect.action ?? effect.type,
        params: effect.params ?? {}
      }))
      : [];
  chart.fx = sourceCues.map((cue) => ({
    id: cue.id ?? crypto.randomUUID(),
    time: Math.max(0, finite(cue.time, 0)),
    target: String(cue.target ?? "").trim(),
    action: String(cue.action ?? "").trim(),
    params: cue.params && typeof cue.params === "object" && !Array.isArray(cue.params)
      ? cue.params
      : {}
  })).filter((cue) => cue.target && cue.action)
    .sort((left, right) => left.time - right.time);
  delete chart.effects;
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
      ...(key.beatsPerBar !== chartDefaults.timing.beatsPerBar ? { beatsPerBar: key.beatsPerBar } : {}),
      ...(key.ramp ? {
        ramp: {
          beats: key.ramp.beats,
          ...(key.ramp.anchors.length
            ? { anchors: key.ramp.anchors.map((anchor) => [
              anchor.position,
              anchor.time,
              anchor.kind === "bar" ? "b" : "t"
            ]) }
            : {})
        }
      } : {})
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
  const fx = normalized.fx.map(({ id, params, ...cue }) => ({
    ...cue,
    ...(params && Object.keys(params).length ? { params } : {})
  }));

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
      ...(normalized.meta.cover ? { cover: normalized.meta.cover } : {})
    },
    timing,
    ...(Object.keys(playfield).length ? { playfield } : {}),
    timelines: Object.fromEntries(
      TIMELINE_DEFINITIONS.map(({ id }) => [id, compactTimeline(normalized.timelines[id])])
    ),
    notes: normalized.notes.map(compactNote),
    ...(fx.length ? { fx } : {})
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

const tempoEpsilon = 1e-8;
const approximately = (left, right) => Math.abs(left - right) <= tempoEpsilon * Math.max(1, Math.abs(left), Math.abs(right));

function makeConstantTempoSegment(start, end, rate, keyIndex) {
  const duration = Math.max(0.000001, end.time - start.time);
  return {
    startTime: start.time,
    endTime: end.time,
    startBeat: start.beat,
    endBeat: start.beat + rate * duration,
    startRate: rate,
    endRate: rate,
    averageRate: rate,
    mode: "constant",
    power: 1,
    keyIndex,
    ramp: false
  };
}

function solveRamp(points, startRate, endRate) {
  const strictlyOrdered = points.every((point, index) => (
    index === 0
    || (point.time > points[index - 1].time && point.beat > points[index - 1].beat)
  ));
  if (!strictlyOrdered) {
    return {
      valid: false,
      averages: [],
      reason: "关键节拍必须依次位于变速段的时间与拍数范围内"
    };
  }
  const averages = points.slice(0, -1).map((point, index) => (
    (points[index + 1].beat - point.beat) / Math.max(0.000001, points[index + 1].time - point.time)
  ));
  const direction = Math.sign(endRate - startRate);
  const orderedRates = [startRate, ...averages, endRate];
  const ordered = orderedRates.every((rate, index) => (
    index === 0
    || (direction > 0
      ? rate >= orderedRates[index - 1] - tempoEpsilon
      : direction < 0
        ? rate <= orderedRates[index - 1] + tempoEpsilon
        : approximately(rate, orderedRates[index - 1]))
  ));
  if (!ordered) {
    return {
      valid: false,
      averages,
      reason: direction === 0
        ? "首尾 BPM 相同，但区间拍数与时长不对应恒定 BPM"
        : "关键节拍要求的平均 BPM 不符合首尾 BPM 的单调方向"
    };
  }

  const rates = new Array(points.length);
  rates[0] = startRate;
  rates[rates.length - 1] = endRate;
  for (let index = 1; index < rates.length - 1; index += 1) {
    rates[index] = (averages[index - 1] + averages[index]) * 0.5;
  }
  for (let pass = 0; pass < rates.length * 2; pass += 1) {
    averages.forEach((average, index) => {
      if (approximately(average, rates[index]) && index + 1 < rates.length - 1) rates[index + 1] = average;
      if (approximately(average, rates[index + 1]) && index > 0) rates[index] = average;
    });
  }
  const feasibleBoundaries = averages.every((average, index) => {
    const low = Math.min(rates[index], rates[index + 1]);
    const high = Math.max(rates[index], rates[index + 1]);
    if (average < low - tempoEpsilon || average > high + tempoEpsilon) return false;
    if (approximately(average, low) || approximately(average, high)) {
      return approximately(rates[index], rates[index + 1]);
    }
    return true;
  });
  return feasibleBoundaries
    ? { valid: true, averages, rates, direction }
    : { valid: false, averages, reason: "锚点在连续单调 BPM 下没有可行解" };
}

function makeMonotoneTempoSegment(start, end, startRate, endRate, averageRate, keyIndex) {
  const duration = Math.max(0.000001, end.time - start.time);
  if (approximately(startRate, endRate)) {
    return makeConstantTempoSegment(start, end, startRate, keyIndex);
  }
  const direction = Math.sign(endRate - startRate);
  const transformedStart = startRate * direction;
  const transformedEnd = endRate * direction;
  const transformedAverage = averageRate * direction;
  const delta = transformedEnd - transformedStart;
  const midpoint = (transformedStart + transformedEnd) * 0.5;
  const mode = transformedAverage <= midpoint ? "powerIn" : "powerOut";
  const denominator = mode === "powerIn"
    ? transformedAverage - transformedStart
    : transformedEnd - transformedAverage;
  const power = Math.max(1, delta / Math.max(tempoEpsilon, denominator) - 1);
  return {
    startTime: start.time,
    endTime: end.time,
    startBeat: start.beat,
    endBeat: start.beat + averageRate * duration,
    startRate,
    endRate,
    averageRate,
    direction,
    mode,
    power,
    keyIndex,
    ramp: true
  };
}

function tempoSegmentRate(segment, progress) {
  const u = Math.max(0, Math.min(1, progress));
  if (segment.mode === "constant") return segment.startRate;
  const transformedStart = segment.startRate * segment.direction;
  const transformedEnd = segment.endRate * segment.direction;
  const delta = transformedEnd - transformedStart;
  const transformedRate = segment.mode === "powerIn"
    ? transformedStart + delta * u ** segment.power
    : transformedEnd - delta * (1 - u) ** segment.power;
  return transformedRate * segment.direction;
}

function tempoSegmentBeat(segment, progress) {
  const u = Math.max(0, Math.min(1, progress));
  const duration = segment.endTime - segment.startTime;
  if (segment.mode === "constant") return segment.startBeat + segment.startRate * duration * u;
  const transformedStart = segment.startRate * segment.direction;
  const transformedEnd = segment.endRate * segment.direction;
  const delta = transformedEnd - transformedStart;
  const transformedIntegral = segment.mode === "powerIn"
    ? transformedStart * u + delta * u ** (segment.power + 1) / (segment.power + 1)
    : transformedEnd * u - delta * (1 - (1 - u) ** (segment.power + 1)) / (segment.power + 1);
  return segment.startBeat + duration * transformedIntegral * segment.direction;
}

export function buildTempoMap(chart) {
  const keys = chart.timing.bpmKeys;
  const duration = chart.timing.duration;
  const segments = [];
  const issues = [];
  const keyBeats = new Array(keys.length).fill(0);
  let currentBeat = 0;

  if (keys[0].time > 0) {
    const rate = keys[0].bpm / 60;
    segments.push(makeConstantTempoSegment(
      { time: 0, beat: 0 },
      { time: keys[0].time, beat: keys[0].time * rate },
      rate,
      0
    ));
    currentBeat = keys[0].time * rate;
  }

  keys.forEach((key, index) => {
    keyBeats[index] = currentBeat;
    const next = keys[index + 1];
    const endTime = Math.min(duration, next?.time ?? duration);
    if (endTime <= key.time) return;
    if (key.ramp && next) {
      const points = [
        { time: key.time, beat: currentBeat },
        ...key.ramp.anchors.map((anchor) => ({ time: anchor.time, beat: currentBeat + anchor.beat })),
        { time: next.time, beat: currentBeat + key.ramp.beats }
      ];
      const solution = solveRamp(points, key.bpm / 60, next.bpm / 60);
      if (solution.valid) {
        for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex += 1) {
          segments.push(makeMonotoneTempoSegment(
            points[pointIndex],
            points[pointIndex + 1],
            solution.rates[pointIndex],
            solution.rates[pointIndex + 1],
            solution.averages[pointIndex],
            index
          ));
        }
        currentBeat += key.ramp.beats;
      } else {
        const fallbackAverage = (key.bpm + next.bpm) / 120;
        const fallbackEnd = {
          time: next.time,
          beat: currentBeat + fallbackAverage * (next.time - key.time)
        };
        segments.push(makeMonotoneTempoSegment(
          points[0], fallbackEnd, key.bpm / 60, next.bpm / 60, fallbackAverage, index
        ));
        currentBeat = fallbackEnd.beat;
        issues.push({ keyIndex: index, reason: solution.reason });
      }
    } else {
      const rate = key.bpm / 60;
      const endBeat = currentBeat + (endTime - key.time) * rate;
      segments.push(makeConstantTempoSegment(
        { time: key.time, beat: currentBeat },
        { time: endTime, beat: endBeat },
        rate,
        index
      ));
      currentBeat = endBeat;
    }
  });

  return { segments, keyBeats, totalBeats: currentBeat, issues };
}

function tempoSegmentAtTime(map, time) {
  const clamped = Math.max(0, time);
  let low = 0;
  let high = map.segments.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (map.segments[middle].endTime <= clamped) low = middle + 1;
    else high = middle;
  }
  return map.segments[low];
}

function tempoSegmentAtBeat(map, beat) {
  const clamped = Math.max(0, beat);
  let low = 0;
  let high = map.segments.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (map.segments[middle].endBeat <= clamped) low = middle + 1;
    else high = middle;
  }
  return map.segments[low];
}

export function bpmAt(chart, time, tempoMap = buildTempoMap(chart)) {
  const segment = tempoSegmentAtTime(tempoMap, time);
  if (!segment) return bpmKeyAt(chart, time)?.bpm ?? chartDefaults.timing.bpm;
  const progress = (Math.max(segment.startTime, Math.min(segment.endTime, time)) - segment.startTime)
    / Math.max(0.000001, segment.endTime - segment.startTime);
  return tempoSegmentRate(segment, progress) * 60;
}

export function beatAt(chart, time, tempoMap = buildTempoMap(chart)) {
  const segment = tempoSegmentAtTime(tempoMap, time);
  if (!segment) return 0;
  const progress = (Math.max(segment.startTime, Math.min(segment.endTime, time)) - segment.startTime)
    / Math.max(0.000001, segment.endTime - segment.startTime);
  return tempoSegmentBeat(segment, progress);
}

export function timeAtBeat(chart, beat, tempoMap = buildTempoMap(chart)) {
  const segment = tempoSegmentAtBeat(tempoMap, beat);
  if (!segment) return 0;
  const target = Math.max(segment.startBeat, Math.min(segment.endBeat, beat));
  if (!segment.ramp) return segment.startTime + (target - segment.startBeat) / segment.startRate;
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 48; iteration += 1) {
    const middle = (low + high) * 0.5;
    if (tempoSegmentBeat(segment, middle) < target) low = middle;
    else high = middle;
  }
  return segment.startTime + (segment.endTime - segment.startTime) * (low + high) * 0.5;
}

export function nearestRampAnchorAtTime(chart, keyIndex, time, kind = "beat", tempoMap = buildTempoMap(chart)) {
  const key = chart.timing.bpmKeys[keyIndex];
  const next = chart.timing.bpmKeys[keyIndex + 1];
  if (!key?.ramp || !next || time <= key.time || time >= next.time) return null;

  const totalBeats = key.ramp.beats;
  const step = kind === "bar" ? key.beatsPerBar : 1;
  const maxPosition = Math.floor((totalBeats - tempoEpsilon) / step);
  if (maxPosition < 1) return null;

  const issue = tempoMap.issues.find((candidate) => candidate.keyIndex === keyIndex);
  const relativeBeat = issue
    ? (time - key.time) / Math.max(tempoEpsilon, next.time - key.time) * totalBeats
    : beatAt(chart, time, tempoMap) - (tempoMap.keyBeats[keyIndex] ?? 0);
  const position = Math.max(1, Math.min(maxPosition, Math.round(relativeBeat / step)));
  return {
    kind: kind === "bar" ? "bar" : "beat",
    position,
    beat: position * step,
    time
  };
}

export function snapTime(chart, time, tempoMap = buildTempoMap(chart)) {
  const clamped = Math.max(0, Math.min(chart.timing.duration, finite(time, 0)));
  if (chart.timing.subdivision === 0) return clamped;
  const key = bpmKeyAt(chart, clamped);
  const keyIndex = chart.timing.bpmKeys.indexOf(key);
  const keyBeat = tempoMap.keyBeats[keyIndex] ?? 0;
  const beatStep = key.beatsPerBar / chart.timing.subdivision;
  const subdivision = Math.round((beatAt(chart, clamped, tempoMap) - keyBeat) / beatStep);
  return Math.max(0, Math.min(chart.timing.duration, timeAtBeat(chart, keyBeat + subdivision * beatStep, tempoMap)));
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

function motionAt(chart, time, multiplier) {
  const orientation = directionAt(chart, time);
  const forwardSpeed = sampleTimeline(chart.timelines.moveSpeed, time, 0) * multiplier;
  const strafeSpeed = sampleTimeline(chart.timelines.moveStrafeSpeed, time, 0) * multiplier;
  const velocity = orientation.direction.map((value, index) => (
    value * forwardSpeed + orientation.right[index] * strafeSpeed
  ));
  return {
    ...orientation,
    velocity,
    speed: Math.hypot(forwardSpeed, strafeSpeed),
    forwardSpeed,
    strafeSpeed
  };
}

function vectorDistance(left, right) {
  return Math.hypot(...left.map((value, index) => value - right[index]));
}

function directionAngle(left, right) {
  const dot = left.reduce((sum, value, index) => sum + value * right[index], 0);
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}

function trajectorySampleTimes(chart, sampleSeconds, multiplier) {
  const duration = chart.timing.duration;
  const baseStep = Math.max(CHART_TIME_STEP, Number(sampleSeconds) || chartConfig.trajectorySampleSeconds);
  const seedTimes = [0, duration];
  for (let time = baseStep; time < duration; time += baseStep) seedTimes.push(time);
  ["moveYaw", "movePitch", "moveSpeed", "moveStrafeSpeed"].forEach((timelineId) => {
    chart.timelines[timelineId]?.forEach((event) => {
      if (event.time > 0 && event.time < duration) seedTimes.push(event.time);
    });
  });
  seedTimes.sort((left, right) => left - right);
  const uniqueTimes = seedTimes.filter((time, index) => index === 0 || time - seedTimes[index - 1] > 1e-9);
  const motionCache = new Map();
  const sampleMotion = (time) => {
    if (!motionCache.has(time)) motionCache.set(time, motionAt(chart, time, multiplier));
    return motionCache.get(time);
  };
  const maxTurn = chartConfig.trajectoryMaxTurnDegrees * Math.PI / 180;
  const maxError = chartConfig.trajectoryMaxIntegrationError;
  const maxDepth = chartConfig.trajectoryMaxSubdivisions;
  const times = [uniqueTimes[0]];

  const appendAdaptive = (startTime, endTime, depth) => {
    const middleTime = (startTime + endTime) * 0.5;
    const start = sampleMotion(startTime);
    const middle = sampleMotion(middleTime);
    const end = sampleMotion(endTime);
    const turn = Math.max(
      directionAngle(start.direction, middle.direction),
      directionAngle(middle.direction, end.direction),
      directionAngle(start.right, middle.right),
      directionAngle(middle.right, end.right)
    );
    const linearMiddleVelocity = start.velocity.map((value, index) => (value + end.velocity[index]) * 0.5);
    const integrationError = vectorDistance(middle.velocity, linearMiddleVelocity) * (endTime - startTime);
    if (depth < maxDepth && endTime - startTime > CHART_TIME_STEP * 2
      && (turn > maxTurn || integrationError > maxError)) {
      appendAdaptive(startTime, middleTime, depth + 1);
      appendAdaptive(middleTime, endTime, depth + 1);
      return;
    }
    times.push(endTime);
  };

  for (let index = 1; index < uniqueTimes.length; index += 1) {
    appendAdaptive(uniqueTimes[index - 1], uniqueTimes[index], 0);
  }
  return { times, sampleMotion };
}

export function buildReceiverTrajectory(chart, sampleSeconds = 0.04, speedMultiplier = 1) {
  const origin = chart.playfield.origin;
  const multiplier = Math.max(0.001, Number(speedMultiplier) || 1);
  const { times, sampleMotion } = trajectorySampleTimes(chart, sampleSeconds, multiplier);
  const samples = [];
  let position = [...origin];
  for (let sampleIndex = 0; sampleIndex < times.length; sampleIndex += 1) {
    const time = times[sampleIndex];
    const { direction, right, yaw, pitch, speed, forwardSpeed, strafeSpeed } = sampleMotion(time);
    if (sampleIndex > 0) {
      const previousTime = times[sampleIndex - 1];
      const middle = sampleMotion((previousTime + time) * 0.5);
      const delta = time - previousTime;
      position = position.map((value, index) => value + middle.velocity[index] * delta);
    }
    const sideOffset = chart.playfield.sideLaneOffset;
    samples.push({
      time,
      position: [...position],
      left: position.map((value, index) => value - right[index] * sideOffset),
      right: position.map((value, index) => value + right[index] * sideOffset),
      direction,
      lateral: right,
      yaw,
      pitch,
      speed,
      forwardSpeed,
      strafeSpeed
    });
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
    forwardSpeed: from.forwardSpeed + (to.forwardSpeed - from.forwardSpeed) * progress,
    strafeSpeed: from.strafeSpeed + (to.strafeSpeed - from.strafeSpeed) * progress,
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

export function gridTimes(chart, start = 0, end = chart.timing.duration, tempoMap = buildTempoMap(chart)) {
  const times = [];
  if (chart.timing.subdivision === 0) return times;
  const keys = chart.timing.bpmKeys;
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const segmentEnd = Math.min(end, keys[index + 1]?.time ?? chart.timing.duration);
    if (segmentEnd < start || key.time > end) continue;
    const keyBeat = tempoMap.keyBeats[index] ?? beatAt(chart, key.time, tempoMap);
    const beatStep = key.beatsPerBar / chart.timing.subdivision;
    const visibleStartBeat = beatAt(chart, Math.max(start, key.time), tempoMap);
    const segmentEndBeat = beatAt(chart, segmentEnd, tempoMap);
    let subdivision = Math.max(0, Math.ceil((visibleStartBeat - keyBeat - 1e-9) / beatStep));
    const includesEnd = index === keys.length - 1;
    for (
      let targetBeat = keyBeat + subdivision * beatStep;
      includesEnd ? targetBeat <= segmentEndBeat + 1e-9 : targetBeat < segmentEndBeat - 1e-9;
      subdivision += 1, targetBeat = keyBeat + subdivision * beatStep
    ) {
      const time = timeAtBeat(chart, targetBeat, tempoMap);
      if (time < start - 0.0001 || time > end + 0.0001) continue;
      if (times.length && Math.abs(times[times.length - 1].time - time) < 0.000001) continue;
      const localBeat = targetBeat - keyBeat;
      times.push({
        time,
        major: Math.abs(localBeat / key.beatsPerBar - Math.round(localBeat / key.beatsPerBar)) < 1e-7,
        beat: Math.abs(localBeat - Math.round(localBeat)) < 1e-7
      });
    }
  }
  return times;
}

export function chartForGame(chart, { flowSpeedMultiplier = 1 } = {}) {
  const normalized = normalizeChart(chart);
  const sampleSeconds = chartConfig.trajectorySampleSeconds;
  const trajectory = buildReceiverTrajectory(normalized, sampleSeconds, flowSpeedMultiplier);
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
      moveSeconds: Math.max(CHART_TIME_STEP, sample.time - previous.time),
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
      LookAhead: bakeTimeline(normalized.timelines.lookAhead, timelineDefault.lookAhead),
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
