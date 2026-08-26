import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import {
  EASING_PRESET_GROUPS,
  TIMELINE_DEFINITIONS,
  bpmKeyAt,
  buildReceiverTrajectory,
  compactChart,
  createDefaultChart,
  gridTimes,
  normalizeChart,
  sampleTimeline,
  snapTime,
  snapWPos,
  speedColor,
  trajectoryPoseAt,
  receiverFrameAt
} from "./chart-core.js?v=20260826-16";
import { CONFIG } from "./config.js?v=20260826-16";

const editorConfig = CONFIG.editor;
const colorConfig = CONFIG.colors;
const cssColor = (color) => `#${color.toString(16).padStart(6, "0")}`;

const $ = (selector) => document.querySelector(selector);
const refs = {
  shell: $(".editor-shell"),
  panelToggle: $("#toggle-editor-panel"),
  viewToggle: $("#view-toggle"),
  canvas: $("#preview-canvas"),
  gamePreview: $("#game-preview"),
  scrubber: $("#scrubber"),
  currentTime: $("#current-time"),
  durationTime: $("#duration-time"),
  playToggle: $("#play-toggle"),
  stop: $("#stop-button"),
  viewMode: $("#view-mode"),
  dirtyState: $("#dirty-state"),
  status: $("#status-message"),
  title: $("#meta-title"),
  composer: $("#meta-composer"),
  charter: $("#meta-charter"),
  illustrator: $("#meta-illustrator"),
  difficultyLabel: $("#meta-difficulty-label"),
  level: $("#meta-level"),
  duration: $("#chart-duration"),
  subdivision: $("#subdivision"),
  wPosDivision: $("#wpos-division"),
  noteZoom: $("#note-zoom"),
  currentBpm: $("#current-bpm"),
  currentBeats: $("#current-beats"),
  bpmKeyEditor: $("#bpm-key-editor"),
  bpmKeyTime: $("#bpm-key-time"),
  bpmValue: $("#bpm-value"),
  bpmBeatsPerBar: $("#bpm-beats-per-bar"),
  noteScroll: $("#note-scroll"),
  noteContent: $("#note-content"),
  noteGrid: $("#note-grid"),
  waveform: $("#waveform-canvas"),
  notePlayhead: $("#note-playhead"),
  eventTimelines: $("#event-timelines"),
  selectedNoteCount: $("#selected-note-count"),
  selectedEventCount: $("#selected-event-count"),
  emptyInspector: $("#empty-inspector"),
  noteInspector: $("#note-inspector"),
  eventInspector: $("#event-inspector"),
  formulaRow: $("#formula-row"),
  bpmList: $("#bpm-key-list"),
  effectList: $("#effect-list"),
  audio: $("#audio-player"),
  chartFile: $("#chart-file-input"),
  audioFile: $("#audio-file-input")
};

document.documentElement.style.setProperty("--waveform-width", `${editorConfig.waveform.width}px`);
document.documentElement.style.setProperty("--cyan", cssColor(colorConfig.left));
document.documentElement.style.setProperty("--pink", cssColor(colorConfig.right));
document.documentElement.style.setProperty("--gold", cssColor(colorConfig.space));
document.documentElement.style.setProperty("--green", cssColor(colorConfig.top));
refs.noteZoom.min = editorConfig.zoom.min;
refs.noteZoom.max = editorConfig.zoom.max;
refs.noteZoom.step = editorConfig.zoom.step;
refs.noteZoom.value = editorConfig.initialPixelsPerSecond;

const state = {
  chart: normalizeChart(createDefaultChart()),
  currentTime: 0,
  pixelsPerSecond: editorConfig.initialPixelsPerSecond,
  noteKind: "tap",
  selectedNotes: new Set(),
  selectedEvents: new Set(),
  selectedBpmKey: null,
  trajectory: [],
  waveformPeaks: null,
  audioUrl: null,
  playing: false,
  playStartedAt: 0,
  playStartedChartTime: 0,
  viewMode: "global",
  dirty: false,
  undo: [],
  redo: [],
  drag: null,
  syncingScroll: false,
  gamePreviewReady: false,
  editorPanelOpen: false,
  previewNoteCursor: 0,
  previewNoteTime: null,
  continuousEdit: null,
  waveformPitch: null
};

const svgNamespace = "http://www.w3.org/2000/svg";
const noteLayout = editorConfig.noteLayout;
const noteTypeLabels = editorConfig.noteTypeLabels;
const makeSvg = (name, attributes = {}) => {
  const element = document.createElementNS(svgNamespace, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
};

function formatTime(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(value / 60);
  const remainder = value - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remainder.toFixed(3).padStart(6, "0")}`;
}

function setStatus(message) {
  refs.status.textContent = message;
}

function setDirty(dirty = true) {
  state.dirty = dirty;
  refs.dirtyState.textContent = dirty ? "未保存" : "已保存";
  refs.dirtyState.style.color = dirty ? "var(--gold)" : "";
}

function setEditorPanelOpen(open) {
  state.editorPanelOpen = Boolean(open);
  refs.shell.classList.toggle("editor-panel-collapsed", !state.editorPanelOpen);
  refs.panelToggle.textContent = state.editorPanelOpen ? "\u2039" : "\u203a";
  refs.panelToggle.title = state.editorPanelOpen ? "关闭编辑面板" : "打开编辑面板";
  refs.panelToggle.setAttribute("aria-label", refs.panelToggle.title);
  refs.panelToggle.setAttribute("aria-expanded", String(state.editorPanelOpen));
  requestAnimationFrame(resizePreview);
  setTimeout(resizePreview, 200);
}

function populateEasingOptions() {
  const select = $("#inspect-event-easing");
  const groups = EASING_PRESET_GROUPS.map((group) => {
    const optgroup = document.createElement("optgroup");
    optgroup.label = group.label;
    group.options.forEach(({ value, label }) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      optgroup.append(option);
    });
    return optgroup;
  });
  select.replaceChildren(...groups);
}

function snapshot() {
  return JSON.stringify(state.chart);
}

function restoreSnapshot(serialized, message) {
  state.continuousEdit = null;
  state.chart = normalizeChart(JSON.parse(serialized));
  state.selectedNotes.clear();
  state.selectedEvents.clear();
  state.currentTime = Math.min(state.currentTime, state.chart.timing.duration);
  syncChartControls();
  rebuildEverything();
  setDirty(true);
  setStatus(message);
}

function beginChange() {
  state.continuousEdit = null;
  state.undo.push(snapshot());
  if (state.undo.length > 60) state.undo.shift();
  state.redo.length = 0;
}

function beginContinuousEdit(control, key) {
  if (state.continuousEdit?.control === control && state.continuousEdit.key === key) return;
  state.undo.push(snapshot());
  if (state.undo.length > 60) state.undo.shift();
  state.redo.length = 0;
  state.continuousEdit = { control, key };
}

function applyContinuousChange(control, key, mutator, message, {
  trajectory = false,
  notes = false,
  events = false,
  bpm = false
} = {}) {
  beginContinuousEdit(control, key);
  mutator();
  state.chart = normalizeChart(state.chart);
  setDirty(true);
  if (trajectory) rebuildTrajectory();
  if (notes || bpm) renderNoteEditor();
  if (events || bpm) renderEventTimelines();
  if (bpm) renderBpmKeys(false);
  if (!trajectory && notes) rebuildPreviewNotes();
  scheduleGamePreviewChartSync();
  updateTimeUi(false);
  setStatus(message);
}

function commitChange(mutator, message, { trajectory = false } = {}) {
  beginChange();
  mutator();
  state.chart = normalizeChart(state.chart);
  setDirty(true);
  if (trajectory) rebuildTrajectory();
  renderNoteEditor();
  renderEventTimelines();
  renderInspector();
  renderBpmKeys();
  renderEffects();
  rebuildPreviewNotes();
  syncGamePreviewChart();
  setStatus(message);
}

function undo() {
  const previous = state.undo.pop();
  if (!previous) return;
  state.redo.push(snapshot());
  restoreSnapshot(previous, "已撤销");
}

function redo() {
  const next = state.redo.pop();
  if (!next) return;
  state.undo.push(snapshot());
  restoreSnapshot(next, "已重做");
}

// 3D preview
const renderer = new THREE.WebGLRenderer({ canvas: refs.canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, editorConfig.renderer.maxPixelRatio));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = editorConfig.renderer.exposure;

const scene = new THREE.Scene();
scene.background = new THREE.Color(colorConfig.editorBackground);
scene.add(new THREE.HemisphereLight(0xdff6ff, 0x24202b, 2.4));
const camera = new THREE.PerspectiveCamera(
  editorConfig.camera.fov,
  1,
  editorConfig.camera.near,
  editorConfig.camera.far
);
camera.position.set(...editorConfig.camera.initialPosition);
const controls = new OrbitControls(camera, refs.canvas);
controls.enableDamping = true;
controls.dampingFactor = editorConfig.camera.dampingFactor;
controls.enablePan = true;
controls.screenSpacePanning = true;
let freeCameraInitialized = false;

const routeRoot = new THREE.Group();
const previewNotesRoot = new THREE.Group();
const previewNoteMeshes = new Map();
scene.add(routeRoot, previewNotesRoot);
scene.add(new THREE.AxesHelper(12));

const receiver = new THREE.Group();
const receiverRing = new THREE.Mesh(
  new THREE.TorusGeometry(CONFIG.chart.defaults.playfield.receiverRadius, 0.14, 10, 96),
  new THREE.MeshBasicMaterial({ color: colorConfig.white, transparent: true, opacity: 0.95 })
);
receiverRing.geometry.rotateX(Math.PI / 2);
const leftMarker = new THREE.Mesh(
  new THREE.BoxGeometry(0.18, 5, 0.18),
  new THREE.MeshBasicMaterial({ color: colorConfig.left })
);
const rightMarker = leftMarker.clone();
rightMarker.material = new THREE.MeshBasicMaterial({ color: colorConfig.right });
receiver.add(receiverRing, leftMarker, rightMarker);
scene.add(receiver);

const lineMaterials = new Set();
let gamePreviewChartSyncTimer = null;

function syncGamePreviewTime() {
  if (!state.gamePreviewReady) return;
  refs.gamePreview.contentWindow.postMessage({
    type: "ParticleSoarPreviewTime",
    time: state.currentTime
  }, window.location.origin);
}

function syncGamePreviewChart() {
  if (gamePreviewChartSyncTimer !== null) {
    clearTimeout(gamePreviewChartSyncTimer);
    gamePreviewChartSyncTimer = null;
  }
  if (!state.gamePreviewReady) return;
  refs.gamePreview.contentWindow.postMessage({
    type: "ParticleSoarPreviewChart",
    chart: structuredClone(state.chart),
    time: state.currentTime
  }, window.location.origin);
}

function scheduleGamePreviewChartSync() {
  if (gamePreviewChartSyncTimer !== null) clearTimeout(gamePreviewChartSyncTimer);
  gamePreviewChartSyncTimer = setTimeout(() => {
    gamePreviewChartSyncTimer = null;
    syncGamePreviewChart();
  }, 48);
}

function syncGamePreviewView() {
  if (!state.gamePreviewReady) return;
  refs.gamePreview.contentWindow.postMessage({
    type: "ParticleSoarPreviewView",
    view: state.viewMode === "global" ? "free" : "play"
  }, window.location.origin);
}

function updatePreviewSurface({ reloadGame = false } = {}) {
  refs.canvas.hidden = true;
  refs.gamePreview.hidden = false;
  if (state.gamePreviewReady) {
    refs.gamePreview.contentWindow.postMessage({
      type: "ParticleSoarPreviewActive",
      active: true
    }, window.location.origin);
    syncGamePreviewView();
  }
  if (reloadGame) syncGamePreviewChart();
  else syncGamePreviewTime();
}

refs.gamePreview.addEventListener("load", () => {
  state.gamePreviewReady = false;
  refs.gamePreview.contentWindow.postMessage({ type: "ParticleSoarPreviewHello" }, window.location.origin);
});

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin || event.source !== refs.gamePreview.contentWindow) return;
  if (event.data?.type === "ParticleSoarPreviewReady") {
    state.gamePreviewReady = true;
    syncGamePreviewChart();
    syncGamePreviewView();
    updatePreviewSurface();
  } else if (event.data?.type === "ParticleSoarEditorToggleView") {
    toggleView();
  } else if (event.data?.type === "ParticleSoarEditorTogglePanel") {
    setEditorPanelOpen(!state.editorPanelOpen);
  }
});

function disposeGroup(group) {
  while (group.children.length) {
    const child = group.children.pop();
    child.geometry?.dispose?.();
    child.material?.dispose?.();
  }
}

function makeRouteLine(key, width, opacity) {
  const positions = [];
  const colors = [];
  const speeds = state.trajectory.map((sample) => sample.speed);
  const minSpeed = speeds.length ? Math.min(...speeds) : 0;
  const maxSpeed = speeds.length ? Math.max(...speeds) : 1;
  state.trajectory.forEach((sample) => {
    positions.push(...sample[key]);
    colors.push(...speedColor(sample.speed, minSpeed, maxSpeed));
  });
  const geometry = new LineGeometry();
  geometry.setPositions(positions);
  geometry.setColors(colors);
  const material = new LineMaterial({
    color: 0xffffff,
    linewidth: width,
    vertexColors: true,
    transparent: true,
    opacity,
    depthTest: true,
    worldUnits: false
  });
  material.resolution.set(refs.canvas.clientWidth || 1, refs.canvas.clientHeight || 1);
  lineMaterials.add(material);
  const line = new Line2(geometry, material);
  line.computeLineDistances();
  routeRoot.add(line);
}

function focusFreeCamera(pose, resetView = false) {
  if (!pose) return;
  const center = new THREE.Vector3(...pose.position);
  if (resetView || !freeCameraInitialized) {
    const frame = receiverFrameAt(pose);
    const distance = Math.max(
      editorConfig.camera.freeViewMinimumDistance,
      state.chart.playfield.receiverRadius * editorConfig.camera.freeViewReceiverDistanceScale
    );
    const offset = new THREE.Vector3()
      .addScaledVector(new THREE.Vector3(...frame.xAxis), distance * 0.34)
      .addScaledVector(new THREE.Vector3(...frame.yAxis), -distance * 0.58)
      .addScaledVector(new THREE.Vector3(...frame.zAxis), distance * 0.74);
    camera.position.copy(center).add(offset);
  }
  controls.target.copy(center);
  controls.minDistance = Math.max(
    editorConfig.camera.freeViewMinOrbitDistance,
    state.chart.playfield.receiverRadius * editorConfig.camera.freeViewMinOrbitScale
  );
  controls.maxDistance = Math.max(
    editorConfig.camera.freeViewMaxOrbitDistance,
    state.chart.playfield.receiverRadius * editorConfig.camera.freeViewMaxOrbitScale
  );
  camera.fov = editorConfig.camera.freeViewFov;
  camera.near = editorConfig.camera.near;
  camera.far = editorConfig.camera.far;
  camera.updateProjectionMatrix();
  freeCameraInitialized = true;
  controls.update();
}

function focusFreeCameraAtCurrentTime(resetView = false) {
  focusFreeCamera(trajectoryPoseAt(state.trajectory, state.currentTime), resetView);
}

function rebuildTrajectory() {
  lineMaterials.forEach((material) => material.dispose());
  lineMaterials.clear();
  disposeGroup(routeRoot);
  state.trajectory = buildReceiverTrajectory(state.chart, editorConfig.trajectorySampleSeconds);
  if (!refs.canvas.hidden) {
    makeRouteLine("position", 4.2, 1);
    makeRouteLine("left", 2.1, 0.6);
    makeRouteLine("right", 2.1, 0.6);
    if (state.viewMode === "global" && !freeCameraInitialized) focusFreeCameraAtCurrentTime(true);
  }
  rebuildPreviewNotes();
}

function noteWorldPosition(note) {
  const pose = trajectoryPoseAt(state.trajectory, note.hitTime);
  if (!pose) return [0, 0, 0];
  if (note.type === "left") return pose.left;
  if (note.type === "right") return pose.right;
  const offset = note.type === "space" ? -3.5 : note.type === "top" ? 3.5 : note.wPos * state.chart.playfield.receiverRadius;
  return pose.position.map((value, index) => value + pose.lateral[index] * offset);
}

function notePreviewColor(type) {
  if (type === "left") return colorConfig.left;
  if (type === "right") return colorConfig.right;
  if (type === "space") return colorConfig.space;
  if (type === "top") return colorConfig.top;
  return colorConfig.white;
}

const previewTiming = editorConfig.previewTiming;

function previewNoteEndTime(note) {
  return (note.kind === "hold" ? note.endTime : note.hitTime) + previewTiming.postHitSeconds;
}

function createPreviewNoteMesh(note) {
  const mesh = new THREE.Mesh(
    note.kind === "hold" ? new THREE.OctahedronGeometry(0.75, 0) : new THREE.SphereGeometry(0.62, 12, 8),
    new THREE.MeshBasicMaterial({ color: notePreviewColor(note.type), transparent: true, opacity: 0.88 })
  );
  mesh.position.fromArray(noteWorldPosition(note));
  mesh.userData.noteId = note.id;
  mesh.userData.visibleUntil = previewNoteEndTime(note);
  previewNotesRoot.add(mesh);
  previewNoteMeshes.set(note.id, mesh);
}

function removePreviewNoteMesh(noteId) {
  const mesh = previewNoteMeshes.get(noteId);
  if (!mesh) return;
  previewNotesRoot.remove(mesh);
  mesh.geometry?.dispose?.();
  mesh.material?.dispose?.();
  previewNoteMeshes.delete(noteId);
}

function resetPreviewNoteWindow() {
  disposeGroup(previewNotesRoot);
  previewNoteMeshes.clear();
  state.previewNoteCursor = 0;
  state.previewNoteTime = null;
}

function syncPreviewNotesForTime(time, force = false) {
  if (!force && state.previewNoteTime === time) return;
  const notes = state.chart.notes;
  const jumped = state.previewNoteTime === null
    || time < state.previewNoteTime
    || Math.abs(time - state.previewNoteTime) > 0.5;

  if (jumped) {
    resetPreviewNoteWindow();
    while (
      state.previewNoteCursor < notes.length
      && notes[state.previewNoteCursor].hitTime - previewTiming.leadSeconds <= time
    ) {
      const note = notes[state.previewNoteCursor];
      if (previewNoteEndTime(note) >= time) createPreviewNoteMesh(note);
      state.previewNoteCursor += 1;
    }
  } else {
    while (
      state.previewNoteCursor < notes.length
      && notes[state.previewNoteCursor].hitTime - previewTiming.leadSeconds <= time
    ) {
      createPreviewNoteMesh(notes[state.previewNoteCursor]);
      state.previewNoteCursor += 1;
    }
    [...previewNoteMeshes.entries()].forEach(([noteId, mesh]) => {
      if (mesh.userData.visibleUntil < time) removePreviewNoteMesh(noteId);
    });
  }
  state.previewNoteTime = time;
}

function rebuildPreviewNotes() {
  resetPreviewNoteWindow();
  if (refs.canvas.hidden) return;
  syncPreviewNotesForTime(state.currentTime, true);
}

function updatePreviewPose() {
  const pose = trajectoryPoseAt(state.trajectory, state.currentTime);
  if (!pose) return;
  if (state.viewMode === "global" && !refs.canvas.hidden) syncPreviewNotesForTime(state.currentTime);
  receiver.position.fromArray(pose.position);
  const frame = receiverFrameAt(pose);
  receiver.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(...frame.xAxis),
    new THREE.Vector3(...frame.yAxis),
    new THREE.Vector3(...frame.zAxis)
  ));
  leftMarker.position.set(-state.chart.playfield.sideLaneOffset, 0, 0);
  rightMarker.position.set(state.chart.playfield.sideLaneOffset, 0, 0);
  previewNotesRoot.visible = state.viewMode === "global";
  syncGamePreviewTime();
}

function toggleView() {
  state.viewMode = state.viewMode === "global" ? "play" : "global";
  refs.viewMode.textContent = state.viewMode === "global" ? "FREE" : "PLAY";
  controls.enabled = false;
  updatePreviewSurface({ reloadGame: state.viewMode === "play" });
  updatePreviewPose();
  setStatus(state.viewMode === "global" ? "自由视角：可旋转、平移与缩放" : "游玩视角：相机跟随接收器");
}

function resizePreview() {
  const width = refs.canvas.clientWidth;
  const height = refs.canvas.clientHeight;
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  lineMaterials.forEach((material) => material.resolution.set(width, height));
}

new ResizeObserver(() => resizePreview()).observe(refs.canvas);

// Note editor
function contentHeight() {
  return Math.max(refs.noteScroll.clientHeight, state.chart.timing.duration * state.pixelsPerSecond + 80);
}

function timeToY(time) {
  return (state.chart.timing.duration - time) * state.pixelsPerSecond + 40;
}

function yToTime(y) {
  return state.chart.timing.duration - (y - 40) / state.pixelsPerSecond;
}

function noteX(note, width) {
  if (note.type === "left") return width * noteLayout.left;
  if (note.type === "right") return width * noteLayout.right;
  if (note.type === "space") return width * noteLayout.space;
  if (note.type === "top") return width * noteLayout.top;
  const middleWidth = noteLayout.middleEnd - noteLayout.middleStart;
  return width * (noteLayout.middleStart + ((note.wPos + 1) / 2) * middleWidth);
}

function xToWPos(x, width) {
  const middleWidth = noteLayout.middleEnd - noteLayout.middleStart;
  return snapWPos(state.chart, ((x / width - noteLayout.middleStart) / middleWidth) * 2 - 1);
}

function noteTypeAtX(x, width) {
  const ratio = x / Math.max(1, width);
  if (ratio < (noteLayout.left + noteLayout.middleStart) / 2) return "left";
  if (ratio <= (noteLayout.middleEnd + noteLayout.right) / 2) return "middle";
  if (ratio <= (noteLayout.right + noteLayout.space) / 2) return "right";
  if (ratio <= (noteLayout.space + noteLayout.top) / 2) return "space";
  return "top";
}

function notePointFromEvent(event) {
  const rect = refs.noteGrid.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * refs.noteGrid.viewBox.baseVal.width / rect.width,
    y: (event.clientY - rect.top) * refs.noteGrid.viewBox.baseVal.height / rect.height
  };
}

function renderWaveform() {
  const cssHeight = contentHeight();
  const renderHeight = Math.min(editorConfig.waveform.maxRenderHeight, Math.max(1, Math.round(cssHeight)));
  const dpr = Math.min(devicePixelRatio, editorConfig.waveform.maxPixelRatio);
  const waveformWidth = editorConfig.waveform.width;
  refs.waveform.width = Math.round(waveformWidth * dpr);
  refs.waveform.height = Math.round(renderHeight * dpr);
  refs.waveform.style.height = `${cssHeight}px`;
  const context = refs.waveform.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, waveformWidth, renderHeight);
  context.fillStyle = "#111318";
  context.fillRect(0, 0, waveformWidth, renderHeight);
  context.lineWidth = 1;
  const peaks = state.waveformPeaks;
  if (peaks?.length) {
    const colorSteps = editorConfig.waveform.colorSteps;
    const paths = Array.from({ length: colorSteps + 1 }, () => new Path2D());
    const centerX = waveformWidth * 0.5;
    const amplitude = waveformWidth * 0.43;
    for (let y = 0; y < renderHeight; y += 1) {
      const timeRatio = 1 - y / Math.max(1, renderHeight - 1);
      const peak = peaks[Math.min(peaks.length - 1, Math.floor(timeRatio * peaks.length))];
      const pitch = state.waveformPitch?.[
        Math.min(state.waveformPitch.length - 1, Math.floor(timeRatio * state.waveformPitch.length))
      ] ?? -1;
      const bucket = pitch >= 0 ? Math.min(colorSteps - 1, Math.floor(pitch * colorSteps)) : colorSteps;
      paths[bucket].moveTo(centerX - peak * amplitude, y);
      paths[bucket].lineTo(centerX + peak * amplitude, y);
    }
    paths.forEach((path, index) => {
      if (index === colorSteps) context.strokeStyle = "rgba(170, 186, 198, 0.56)";
      else {
        const pitch = index / Math.max(1, colorSteps - 1);
        const hue = 250 - pitch * 240;
        context.strokeStyle = `hsla(${hue} 88% 70% / 0.88)`;
      }
      context.stroke(path);
    });
  } else {
    context.strokeStyle = "rgba(112, 220, 255, 0.5)";
    context.beginPath();
    context.moveTo(waveformWidth * 0.5, 0);
    context.lineTo(waveformWidth * 0.5, renderHeight);
    context.stroke();
  }
}

function appendNoteShape(group, note, x, y) {
  if (note.kind === "hold") {
    const tailY = timeToY(note.endTime);
    group.appendChild(makeSvg("rect", {
      class: "hold-body",
      x: x - 7,
      y: tailY,
      width: 14,
      height: Math.max(2, y - tailY),
      rx: 3
    }));
  }
  if (note.type === "left" || note.type === "right") {
    const sign = note.type === "left" ? -1 : 1;
    group.appendChild(makeSvg("path", {
      class: "note-head",
      d: `M ${x - sign * 7} ${y - 8} L ${x + sign * 2} ${y} L ${x - sign * 7} ${y + 8} L ${x - sign * 3} ${y + 8} L ${x + sign * 6} ${y} L ${x - sign * 3} ${y - 8} Z`
    }));
  } else if (note.type === "top") {
    group.appendChild(makeSvg("path", {
      class: "note-head",
      d: `M ${x - 10} ${y + 7} L ${x} ${y - 7} L ${x + 10} ${y + 7} L ${x + 6} ${y + 7} L ${x} ${y - 1} L ${x - 6} ${y + 7} Z`
    }));
  } else {
    group.appendChild(makeSvg("circle", { class: "note-head", cx: x, cy: y, r: note.type === "space" ? 9 : 7 }));
  }
}

function renderNoteEditor({ waveform = true } = {}) {
  const scrollTop = refs.noteScroll.scrollTop;
  const width = Math.max(420, refs.noteGrid.clientWidth || refs.noteScroll.clientWidth - editorConfig.waveform.width);
  const height = contentHeight();
  refs.noteContent.style.height = `${height}px`;
  refs.noteGrid.setAttribute("viewBox", `0 0 ${width} ${height}`);
  refs.noteGrid.replaceChildren();

  refs.noteGrid.appendChild(makeSvg("rect", {
    class: "middle-lane-region",
    x: width * noteLayout.middleStart,
    y: 0,
    width: width * (noteLayout.middleEnd - noteLayout.middleStart),
    height
  }));

  gridTimes(state.chart).forEach((grid) => {
    refs.noteGrid.appendChild(makeSvg("line", {
      class: `grid-line${grid.beat ? " beat" : ""}${grid.major ? " major" : ""}`,
      x1: 0,
      x2: width,
      y1: timeToY(grid.time),
      y2: timeToY(grid.time)
    }));
  });

  const divisions = state.chart.timing.wPosDivision + 1;
  for (let index = 0; index <= divisions; index += 1) {
    const x = width * (noteLayout.middleStart + (index / divisions) * (noteLayout.middleEnd - noteLayout.middleStart));
    refs.noteGrid.appendChild(makeSvg("line", {
      class: `wpos-line${index === divisions / 2 ? " center" : ""}`,
      x1: x, x2: x, y1: 0, y2: height
    }));
  }
  [
    [noteLayout.left, "left"],
    [noteLayout.right, "right"],
    [noteLayout.space, "space"],
    [noteLayout.top, "top"]
  ].forEach(([ratio, lane]) => {
    refs.noteGrid.appendChild(makeSvg("line", {
      class: `wpos-line lane-line ${lane}`,
      x1: width * ratio, x2: width * ratio, y1: 0, y2: height
    }));
  });

  state.chart.notes.forEach((note) => {
    const group = makeSvg("g", {
      class: `note-object note-${note.type}${state.selectedNotes.has(note.id) ? " selected" : ""}`,
      "data-note-id": note.id
    });
    appendNoteShape(group, note, noteX(note, width), timeToY(note.hitTime));
    refs.noteGrid.appendChild(group);
  });
  refs.notePlayhead.style.top = `${timeToY(state.currentTime)}px`;
  refs.noteScroll.scrollTop = scrollTop;
  if (waveform) renderWaveform();
  else refs.waveform.style.height = `${height}px`;
  refs.selectedNoteCount.textContent = state.selectedNotes.size;
  $("#batch-note-wpos").disabled = !state.chart.notes.some((note) => note.type === "middle" && state.selectedNotes.has(note.id));
}

function createNoteAt(event) {
  const { x, y } = notePointFromEvent(event);
  const width = refs.noteGrid.viewBox.baseVal.width;
  const type = noteTypeAtX(x, width);
  const hitTime = snapTime(state.chart, yToTime(y));
  const wPos = type === "middle" ? xToWPos(x, width) : 0;
  const key = bpmKeyAt(state.chart, hitTime);
  const step = state.chart.timing.subdivision > 0
    ? ((60 / key.bpm) * key.beatsPerBar) / state.chart.timing.subdivision
    : 1;
  const note = {
    id: crypto.randomUUID(),
    type,
    kind: state.noteKind,
    hitTime,
    wPos,
    ...(state.noteKind === "hold" ? { endTime: Math.min(state.chart.timing.duration, hitTime + Math.max(step, 0.1)) } : {})
  };
  commitChange(() => state.chart.notes.push(note), `已放置 ${state.noteKind.toUpperCase()} ${type} 音符`);
  state.selectedEvents.clear();
  state.selectedNotes.clear();
  state.selectedNotes.add(note.id);
  renderNoteEditor();
  renderEventTimelines();
  renderInspector();
}

function eraseNoteAtPointer(clientX, clientY) {
  if (state.drag?.kind !== "erase") return;
  const target = document.elementFromPoint(clientX, clientY);
  const noteElement = target?.closest?.(".note-object");
  if (!noteElement || !refs.noteGrid.contains(noteElement)) return;
  const noteId = noteElement.dataset.noteId;
  if (!noteId || state.drag.erasedIds.has(noteId)) return;
  if (!state.drag.snapshotTaken) {
    beginChange();
    state.drag.snapshotTaken = true;
  }
  state.drag.erasedIds.add(noteId);
  state.chart.notes = state.chart.notes.filter((note) => note.id !== noteId);
  state.selectedNotes.delete(noteId);
  renderNoteEditor();
}

function noteSelectionBounds(note, width) {
  const x = noteX(note, width);
  const headY = timeToY(note.hitTime);
  const tailY = note.kind === "hold" ? timeToY(note.endTime) : headY;
  return {
    left: x - 12,
    right: x + 12,
    top: Math.min(headY, tailY) - 10,
    bottom: Math.max(headY, tailY) + 10
  };
}

function updateMarqueeSelection(drag) {
  const left = Math.min(drag.startX, drag.currentX);
  const right = Math.max(drag.startX, drag.currentX);
  const top = Math.min(drag.startY, drag.currentY);
  const bottom = Math.max(drag.startY, drag.currentY);
  state.selectedNotes = new Set(drag.additive ? drag.baseSelection : []);
  const width = refs.noteGrid.viewBox.baseVal.width;
  state.chart.notes.forEach((note) => {
    const bounds = noteSelectionBounds(note, width);
    if (bounds.right >= left && bounds.left <= right && bounds.bottom >= top && bounds.top <= bottom) {
      state.selectedNotes.add(note.id);
    }
  });
  refs.noteGrid.querySelectorAll(".note-object").forEach((element) => {
    element.classList.toggle("selected", state.selectedNotes.has(element.dataset.noteId));
  });
  refs.noteGrid.querySelector(".selection-rect")?.remove();
  refs.noteGrid.appendChild(makeSvg("rect", {
    class: "selection-rect",
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  }));
  refs.selectedNoteCount.textContent = state.selectedNotes.size;
}

function notePointerDown(event, element) {
  event.stopPropagation();
  state.selectedEvents.clear();
  renderEventTimelines();
  const id = element.dataset.noteId;
  if (event.shiftKey) {
    if (state.selectedNotes.has(id)) state.selectedNotes.delete(id);
    else state.selectedNotes.add(id);
    renderNoteEditor();
    renderInspector();
    return;
  }
  if (!state.selectedNotes.has(id)) {
    state.selectedNotes.clear();
    state.selectedNotes.add(id);
  }
  beginChange();
  const notes = state.chart.notes.filter((note) => state.selectedNotes.has(note.id));
  state.drag = {
    kind: "note",
    startX: event.clientX,
    startY: event.clientY,
    snapshots: notes.map((note) => ({ id: note.id, hitTime: note.hitTime, endTime: note.endTime, wPos: note.wPos }))
  };
  renderNoteEditor();
  renderInspector();
}

// Vertical event timelines
function eventToken(timelineId, eventId) {
  return `${timelineId}:${eventId}`;
}

function timelineRange(events) {
  const values = events.map((event) => event.value);
  for (let index = 0; index < events.length - 1; index += 1) {
    const from = events[index];
    const to = events[index + 1];
    for (let sample = 1; sample < 32; sample += 1) {
      const time = from.time + (to.time - from.time) * sample / 32;
      values.push(sampleTimeline(events, time, from.value));
    }
  }
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: -1, max: 1 };
  if (Math.abs(max - min) < 0.0001) {
    const padding = Math.max(1, Math.abs(min) * 0.2);
    min -= padding;
    max += padding;
  }
  return { min, max };
}

function eventX(value, range) {
  return 12 + ((value - range.min) / (range.max - range.min)) * 76;
}

function createTimelineCurve(events, range, height, color) {
  const curve = makeSvg("svg", {
    class: "timeline-curve",
    viewBox: `0 0 100 ${height}`,
    preserveAspectRatio: "none",
    "aria-hidden": "true"
  });
  curve.style.setProperty("--event-color", color);
  const sampleCount = Math.max(2, Math.min(
    editorConfig.timelineCurve.maxSamples,
    Math.ceil(height / editorConfig.timelineCurve.pixelsPerSample)
  ));
  const pathData = [];
  for (let index = 0; index <= sampleCount; index += 1) {
    const time = state.chart.timing.duration * index / sampleCount;
    const value = sampleTimeline(events, time, events[0]?.value ?? 0);
    const x = eventX(value, range);
    const y = timeToY(time);
    pathData.push(`${index === 0 ? "M" : "L"}${x.toFixed(3)} ${y.toFixed(3)}`);
  }
  curve.appendChild(makeSvg("path", { d: pathData.join(" ") }));
  return curve;
}

function renderEventTimelines() {
  const scrollTop = refs.eventTimelines.scrollTop;
  const scrollLeft = refs.eventTimelines.scrollLeft;
  const height = contentHeight();
  const content = document.createElement("div");
  content.className = "event-content";
  content.style.height = `${height}px`;

  TIMELINE_DEFINITIONS.forEach((definition) => {
    const events = state.chart.timelines[definition.id];
    const range = timelineRange(events);
    const column = document.createElement("div");
    column.className = "timeline-column";
    column.dataset.timelineId = definition.id;
    column.dataset.rangeMin = range.min;
    column.dataset.rangeMax = range.max;
    column.innerHTML = `<div class="timeline-label"><strong>${definition.label}</strong><span>${range.min.toFixed(2)}…${range.max.toFixed(2)}</span></div>`;
    column.appendChild(createTimelineCurve(events, range, height, definition.color));
    events.forEach((event) => {
      const key = document.createElement("button");
      key.type = "button";
      key.className = `event-key${state.selectedEvents.has(eventToken(definition.id, event.id)) ? " selected" : ""}`;
      key.style.setProperty("--event-color", definition.color);
      key.style.left = `${eventX(event.value, range)}%`;
      key.style.top = `${timeToY(event.time)}px`;
      key.dataset.timelineId = definition.id;
      key.dataset.eventId = event.id;
      key.title = `${event.time.toFixed(3)}s · ${event.value}`;
      column.appendChild(key);
    });
    content.appendChild(column);
  });
  const playhead = document.createElement("div");
  playhead.className = "timeline-playhead";
  playhead.style.top = `${timeToY(state.currentTime)}px`;
  content.appendChild(playhead);
  refs.eventTimelines.replaceChildren(content);
  refs.eventTimelines.scrollTop = scrollTop;
  refs.eventTimelines.scrollLeft = scrollLeft;
  refs.selectedEventCount.textContent = state.selectedEvents.size;
}

function addTimelineEvent(event, column) {
  const timelineId = column.dataset.timelineId;
  const rect = column.getBoundingClientRect();
  const localY = event.clientY - rect.top;
  const time = snapTime(state.chart, yToTime(localY));
  const definition = TIMELINE_DEFINITIONS.find((item) => item.id === timelineId);
  const value = sampleTimeline(state.chart.timelines[timelineId], time, definition.defaultValue);
  const timelineEvent = { id: crypto.randomUUID(), time, value, easing: "linear", formula: "t" };
  commitChange(() => state.chart.timelines[timelineId].push(timelineEvent), `已添加 ${definition.label} 事件`, { trajectory: true });
  state.selectedNotes.clear();
  state.selectedEvents.clear();
  state.selectedEvents.add(eventToken(timelineId, timelineEvent.id));
  renderNoteEditor();
  renderEventTimelines();
  renderInspector();
}

function eventPointerDown(event, key) {
  event.stopPropagation();
  state.selectedNotes.clear();
  renderNoteEditor();
  const timelineId = key.dataset.timelineId;
  const id = key.dataset.eventId;
  const token = eventToken(timelineId, id);
  if (event.shiftKey) {
    if (state.selectedEvents.has(token)) state.selectedEvents.delete(token);
    else state.selectedEvents.add(token);
    renderEventTimelines();
    renderInspector();
    return;
  }
  if (!state.selectedEvents.has(token)) {
    state.selectedEvents.clear();
    state.selectedEvents.add(token);
  }
  beginChange();
  const snapshots = [];
  state.selectedEvents.forEach((selectedToken) => {
    const [selectedTimeline, selectedId] = selectedToken.split(":");
    const selectedEvent = state.chart.timelines[selectedTimeline].find((item) => item.id === selectedId);
    if (selectedEvent) snapshots.push({ timelineId: selectedTimeline, id: selectedId, time: selectedEvent.time, value: selectedEvent.value });
  });
  state.drag = { kind: "event", startX: event.clientX, startY: event.clientY, snapshots };
  renderEventTimelines();
  renderInspector();
}

function handlePointerMove(event) {
  if (!state.drag) return;
  if (state.drag.kind === "erase") {
    if (event.buttons & 2) eraseNoteAtPointer(event.clientX, event.clientY);
    return;
  }
  if (state.drag.kind === "marquee") {
    const distance = Math.hypot(event.clientX - state.drag.startClientX, event.clientY - state.drag.startClientY);
    if (!state.drag.active && distance < 4) return;
    state.drag.active = true;
    const point = notePointFromEvent(event);
    state.drag.currentX = point.x;
    state.drag.currentY = point.y;
    updateMarqueeSelection(state.drag);
    return;
  }
  if (state.drag.kind === "note") {
    const deltaTime = -(event.clientY - state.drag.startY) / state.pixelsPerSecond;
    const deltaWPos = ((event.clientX - state.drag.startX) / Math.max(1, refs.noteGrid.clientWidth))
      * (2 / (noteLayout.middleEnd - noteLayout.middleStart));
    state.drag.snapshots.forEach((snapshot) => {
      const note = state.chart.notes.find((item) => item.id === snapshot.id);
      if (!note) return;
      const newTime = snapTime(state.chart, snapshot.hitTime + deltaTime);
      const duration = snapshot.endTime ? snapshot.endTime - snapshot.hitTime : 0;
      note.hitTime = newTime;
      if (note.type === "middle") note.wPos = snapWPos(state.chart, snapshot.wPos + deltaWPos);
      if (note.kind === "hold") note.endTime = Math.min(state.chart.timing.duration, newTime + duration);
    });
    renderNoteEditor();
  } else if (state.drag.kind === "event") {
    const deltaTime = -(event.clientY - state.drag.startY) / state.pixelsPerSecond;
    state.drag.snapshots.forEach((snapshot) => {
      const timelineEvent = state.chart.timelines[snapshot.timelineId].find((item) => item.id === snapshot.id);
      if (!timelineEvent) return;
      const events = state.chart.timelines[snapshot.timelineId];
      const range = timelineRange(events);
      timelineEvent.time = snapTime(state.chart, snapshot.time + deltaTime);
      timelineEvent.value = snapshot.value + ((event.clientX - state.drag.startX) / 110) * (range.max - range.min);
    });
    renderEventTimelines();
  }
}

function handlePointerUp(event) {
  if (!state.drag) return;
  if (state.drag.kind === "erase") {
    const erasedCount = state.drag.erasedIds.size;
    refs.noteGrid.classList.remove("erasing");
    state.drag = null;
    if (erasedCount === 0) return;
    state.chart = normalizeChart(state.chart);
    setDirty(true);
    renderNoteEditor();
    renderInspector();
    rebuildPreviewNotes();
    syncGamePreviewChart();
    setStatus(`已擦除 ${erasedCount} 个音符`);
    return;
  }
  if (state.drag.kind === "marquee") {
    const drag = state.drag;
    state.drag = null;
    if (drag.active) {
      renderNoteEditor();
      renderInspector();
      setStatus(`已框选 ${state.selectedNotes.size} 个音符`);
    } else {
      createNoteAt({ clientX: drag.startClientX, clientY: drag.startClientY });
    }
    return;
  }
  const wasEvent = state.drag.kind === "event";
  state.drag = null;
  state.chart = normalizeChart(state.chart);
  setDirty(true);
  if (wasEvent) rebuildTrajectory();
  renderNoteEditor();
  renderEventTimelines();
  renderInspector();
  rebuildPreviewNotes();
  syncGamePreviewChart();
  setStatus(wasEvent ? "已移动事件" : "已移动音符");
}

// Inspector and lists
function selectedNote() {
  const id = state.selectedNotes.values().next().value;
  return state.chart.notes.find((note) => note.id === id);
}

function selectedEvent() {
  const token = state.selectedEvents.values().next().value;
  if (!token) return null;
  const [timelineId, id] = token.split(":");
  const event = state.chart.timelines[timelineId]?.find((item) => item.id === id);
  return event ? { timelineId, event } : null;
}

function renderInspector() {
  const note = selectedNote();
  const timelineSelection = selectedEvent();
  refs.emptyInspector.hidden = Boolean(note || timelineSelection);
  refs.noteInspector.hidden = !note;
  refs.eventInspector.hidden = Boolean(note) || !timelineSelection;
  if (note) {
    $("#inspect-note-type").textContent = noteTypeLabels[note.type];
    $("#inspect-note-kind").value = note.kind;
    $("#inspect-note-time").value = note.hitTime.toFixed(3);
    $("#inspect-note-end").value = (note.endTime ?? note.hitTime + 1).toFixed(3);
    $("#inspect-note-wpos").value = note.wPos.toFixed(3);
    $("#inspect-note-end-row").hidden = note.kind !== "hold";
    $("#inspect-note-wpos-row").hidden = note.type !== "middle";
  } else if (timelineSelection) {
    const definition = TIMELINE_DEFINITIONS.find((item) => item.id === timelineSelection.timelineId);
    $("#inspect-event-title").textContent = definition.label;
    $("#inspect-event-time").value = timelineSelection.event.time.toFixed(3);
    $("#inspect-event-value").value = timelineSelection.event.value.toFixed(4);
    $("#inspect-event-easing").value = timelineSelection.event.easing;
    $("#inspect-event-formula").value = timelineSelection.event.formula ?? "t";
    refs.formulaRow.hidden = timelineSelection.event.easing !== "formula";
  }
}

function renderBpmKeys(syncEditor = true) {
  const keys = state.chart.timing.bpmKeys;
  if (!keys.some((key) => key.id === state.selectedBpmKey)) {
    state.selectedBpmKey = bpmKeyAt(state.chart, state.currentTime)?.id ?? keys[0]?.id ?? null;
  }
  refs.bpmList.replaceChildren();
  keys.forEach((key) => {
    const item = document.createElement("div");
    item.className = `bpm-key-item${state.selectedBpmKey === key.id ? " selected" : ""}`;
    item.dataset.bpmId = key.id;
    item.innerHTML = `<strong>${formatTime(key.time)}</strong><strong>${key.bpm.toFixed(2)} BPM</strong><span>${key.beatsPerBar}/4</span><span>双击跳转</span>`;
    refs.bpmList.appendChild(item);
  });
  const selected = keys.find((key) => key.id === state.selectedBpmKey);
  refs.bpmKeyEditor.hidden = !selected;
  if (selected && syncEditor) {
    refs.bpmKeyTime.value = selected.time.toFixed(3);
    refs.bpmValue.value = selected.bpm;
    refs.bpmBeatsPerBar.value = selected.beatsPerBar;
  }
  $("#remove-bpm-key").disabled = keys.length <= 1;
}

function renderEffects() {
  refs.effectList.replaceChildren();
  state.chart.effects.forEach((effect) => {
    const item = document.createElement("div");
    item.className = "effect-item";
    item.innerHTML = `<strong>${effect.type}</strong><span>${formatTime(effect.time)}</span><code>${JSON.stringify(effect.position)} · ${JSON.stringify(effect.params)}</code>`;
    refs.effectList.appendChild(item);
  });
}

function syncChartControls() {
  refs.title.value = state.chart.meta.title;
  refs.composer.value = state.chart.meta.composer;
  refs.charter.value = state.chart.meta.charter;
  refs.illustrator.value = state.chart.meta.illustrator;
  refs.difficultyLabel.value = state.chart.meta.difficultyLabel;
  refs.level.value = state.chart.meta.level;
  refs.duration.value = state.chart.timing.duration;
  refs.scrubber.max = state.chart.timing.duration;
  refs.subdivision.value = state.chart.timing.subdivision;
  refs.wPosDivision.value = state.chart.timing.wPosDivision;
  refs.durationTime.textContent = formatTime(state.chart.timing.duration);
  renderBpmKeys();
}

function rebuildEverything() {
  rebuildTrajectory();
  renderNoteEditor();
  renderEventTimelines();
  renderInspector();
  renderBpmKeys();
  renderEffects();
  updateTimeUi(false);
  syncGamePreviewChart();
}

// Time and audio
function setCurrentTime(time, scrollIntoView = false) {
  state.currentTime = Math.max(0, Math.min(state.chart.timing.duration, Number(time) || 0));
  if (Math.abs(refs.audio.currentTime - state.currentTime) > 0.08 && !refs.audio.paused) refs.audio.currentTime = state.currentTime;
  updateTimeUi(scrollIntoView);
}

function updateTimeUi(scrollIntoView = false) {
  refs.currentTime.textContent = formatTime(state.currentTime);
  refs.scrubber.value = state.currentTime;
  refs.notePlayhead.style.top = `${timeToY(state.currentTime)}px`;
  const eventPlayhead = refs.eventTimelines.querySelector(".timeline-playhead");
  if (eventPlayhead) eventPlayhead.style.top = `${timeToY(state.currentTime)}px`;
  const activeBpmKey = bpmKeyAt(state.chart, state.currentTime);
  refs.currentBpm.textContent = activeBpmKey.bpm.toFixed(2);
  refs.currentBeats.textContent = String(activeBpmKey.beatsPerBar);
  updatePreviewPose();
  if (scrollIntoView) {
    const target = Math.max(0, timeToY(state.currentTime) - refs.noteScroll.clientHeight * 0.55);
    refs.noteScroll.scrollTop = target;
    refs.eventTimelines.scrollTop = target;
  }
}

async function togglePlayback() {
  if (state.playing) {
    state.playing = false;
    refs.audio.pause();
    refs.playToggle.textContent = "▶";
    return;
  }
  state.playing = true;
  state.playStartedAt = performance.now() / 1000;
  state.playStartedChartTime = state.currentTime;
  refs.playToggle.textContent = "❚❚";
  if (refs.audio.src) {
    refs.audio.currentTime = state.currentTime;
    try { await refs.audio.play(); } catch { state.playing = false; }
  }
}

function stopPlayback() {
  state.playing = false;
  refs.audio.pause();
  refs.audio.currentTime = 0;
  refs.playToggle.textContent = "▶";
  setCurrentTime(0, true);
}

function fftInPlace(real, imaginary) {
  const size = real.length;
  for (let index = 1, reversed = 0; index < size; index += 1) {
    let bit = size >> 1;
    while (reversed & bit) {
      reversed ^= bit;
      bit >>= 1;
    }
    reversed ^= bit;
    if (index >= reversed) continue;
    [real[index], real[reversed]] = [real[reversed], real[index]];
    [imaginary[index], imaginary[reversed]] = [imaginary[reversed], imaginary[index]];
  }
  for (let length = 2; length <= size; length <<= 1) {
    const angle = -2 * Math.PI / length;
    const stepReal = Math.cos(angle);
    const stepImaginary = Math.sin(angle);
    for (let start = 0; start < size; start += length) {
      let twiddleReal = 1;
      let twiddleImaginary = 0;
      for (let offset = 0; offset < length / 2; offset += 1) {
        const even = start + offset;
        const odd = even + length / 2;
        const oddReal = real[odd] * twiddleReal - imaginary[odd] * twiddleImaginary;
        const oddImaginary = real[odd] * twiddleImaginary + imaginary[odd] * twiddleReal;
        real[odd] = real[even] - oddReal;
        imaginary[odd] = imaginary[even] - oddImaginary;
        real[even] += oddReal;
        imaginary[even] += oddImaginary;
        const nextReal = twiddleReal * stepReal - twiddleImaginary * stepImaginary;
        twiddleImaginary = twiddleReal * stepImaginary + twiddleImaginary * stepReal;
        twiddleReal = nextReal;
      }
    }
  }
}

async function analyzeDominantPitch(channel, sampleRate, duration) {
  const analysisRate = 20;
  const binCount = Math.min(12000, Math.max(1, Math.ceil(duration * analysisRate)));
  const fftSize = editorConfig.waveform.pitchFftSize;
  const real = new Float64Array(fftSize);
  const imaginary = new Float64Array(fftSize);
  const result = new Float32Array(binCount);
  result.fill(-1);
  const minFrequency = 55;
  const maxFrequency = Math.min(3520, sampleRate / 2);
  const firstBin = Math.max(1, Math.ceil(minFrequency * fftSize / sampleRate));
  const lastBin = Math.min(fftSize / 2 - 1, Math.floor(maxFrequency * fftSize / sampleRate));
  const frequencyRange = Math.log2(maxFrequency / minFrequency);

  for (let index = 0; index < binCount; index += 1) {
    const center = Math.floor(((index + 0.5) / binCount) * channel.length);
    const start = center - fftSize / 2;
    let energy = 0;
    for (let sample = 0; sample < fftSize; sample += 1) {
      const sourceIndex = start + sample;
      const value = sourceIndex >= 0 && sourceIndex < channel.length ? channel[sourceIndex] : 0;
      const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * sample) / (fftSize - 1));
      real[sample] = value * window;
      imaginary[sample] = 0;
      energy += value * value;
    }
    if (energy / fftSize > 0.000004) {
      fftInPlace(real, imaginary);
      let strongestBin = firstBin;
      let strongestPower = 0;
      for (let bin = firstBin; bin <= lastBin; bin += 1) {
        const power = (real[bin] * real[bin] + imaginary[bin] * imaginary[bin]) / Math.sqrt(bin);
        if (power > strongestPower) {
          strongestPower = power;
          strongestBin = bin;
        }
      }
      const frequency = strongestBin * sampleRate / fftSize;
      result[index] = Math.max(0, Math.min(1, Math.log2(frequency / minFrequency) / frequencyRange));
    }
    if (index > 0 && index % 180 === 0) await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  return result;
}

async function loadAudio(file) {
  if (!file) return;
  if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
  state.audioUrl = URL.createObjectURL(file);
  refs.audio.src = state.audioUrl;
  const context = new AudioContext();
  const buffer = await context.decodeAudioData(await file.arrayBuffer());
  const channel = buffer.getChannelData(0);
  const bins = Math.min(
    channel.length,
    editorConfig.waveform.maxPeakBins,
    Math.max(editorConfig.waveform.minPeakBins, Math.ceil(buffer.duration * editorConfig.waveform.samplesPerSecond))
  );
  const block = Math.max(1, Math.floor(channel.length / bins));
  const peaks = new Float32Array(bins);
  for (let index = 0; index < bins; index += 1) {
    let peak = 0;
    const start = index * block;
    const end = Math.min(channel.length, start + block);
    for (let sample = start; sample < end; sample += 1) peak = Math.max(peak, Math.abs(channel[sample]));
    peaks[index] = peak;
  }
  state.waveformPeaks = peaks;
  state.waveformPitch = null;
  setStatus("正在分析波形主导音高…");
  state.waveformPitch = await analyzeDominantPitch(channel, buffer.sampleRate, buffer.duration);
  await context.close();
  commitChange(() => {
    state.chart.meta.audioFile = file.name;
    state.chart.timing.duration = buffer.duration;
  }, `已加载音乐 ${file.name}`, { trajectory: true });
  syncChartControls();
}

// Persistence
function saveChart() {
  const metaDefaults = CONFIG.chart.defaults.meta;
  state.chart.meta.title = refs.title.value.trim() || metaDefaults.title;
  state.chart.meta.composer = refs.composer.value.trim() || metaDefaults.composer;
  state.chart.meta.charter = refs.charter.value.trim() || metaDefaults.charter;
  state.chart.meta.illustrator = refs.illustrator.value.trim() || metaDefaults.illustrator;
  state.chart.meta.difficultyLabel = refs.difficultyLabel.value.trim() || metaDefaults.difficultyLabel;
  state.chart.meta.level = Math.max(0, Math.round(Number(refs.level.value) || 0));
  const blob = new Blob([JSON.stringify(compactChart(state.chart))], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${state.chart.meta.title.replace(/[^\w\-]+/g, "_") || "chart"}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  setDirty(false);
  setStatus("谱面已保存");
}

async function loadChartFile(file) {
  if (!file) return;
  const chart = normalizeChart(JSON.parse(await file.text()));
  state.undo.push(snapshot());
  state.chart = chart;
  state.selectedNotes.clear();
  state.selectedEvents.clear();
  state.currentTime = 0;
  syncChartControls();
  rebuildEverything();
  setDirty(false);
  setStatus(`已加载 ${file.name}`);
}

// Commands and inputs
refs.noteGrid.addEventListener("pointerdown", (event) => {
  if (event.button === 2) {
    event.preventDefault();
    event.stopPropagation();
    state.drag = {
      kind: "erase",
      erasedIds: new Set(),
      snapshotTaken: false
    };
    refs.noteGrid.classList.add("erasing");
    eraseNoteAtPointer(event.clientX, event.clientY);
    return;
  }
  if (event.button !== 0) return;
  const noteElement = event.target.closest(".note-object");
  if (noteElement) notePointerDown(event, noteElement);
  else {
    event.preventDefault();
    state.selectedEvents.clear();
    renderEventTimelines();
    const point = notePointFromEvent(event);
    state.drag = {
      kind: "marquee",
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
      additive: event.shiftKey,
      baseSelection: new Set(state.selectedNotes),
      active: false
    };
  }
});

refs.noteGrid.addEventListener("contextmenu", (event) => event.preventDefault());

refs.eventTimelines.addEventListener("dblclick", (event) => {
  const column = event.target.closest(".timeline-column");
  if (column && !event.target.closest(".event-key")) addTimelineEvent(event, column);
});

refs.eventTimelines.addEventListener("pointerdown", (event) => {
  const key = event.target.closest(".event-key");
  if (key) eventPointerDown(event, key);
});

window.addEventListener("pointermove", handlePointerMove);
window.addEventListener("pointerup", handlePointerUp);
window.addEventListener("pointercancel", handlePointerUp);

refs.noteScroll.addEventListener("scroll", () => {
  if (state.syncingScroll) return;
  state.syncingScroll = true;
  refs.eventTimelines.scrollTop = refs.noteScroll.scrollTop;
  state.syncingScroll = false;
});

refs.eventTimelines.addEventListener("scroll", () => {
  if (state.syncingScroll) return;
  state.syncingScroll = true;
  refs.noteScroll.scrollTop = refs.eventTimelines.scrollTop;
  state.syncingScroll = false;
});

$("#note-kind-tools").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-note-kind]");
  if (!button) return;
  state.noteKind = button.dataset.noteKind;
  $("#note-kind-tools").querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
});

$("#delete-selection").addEventListener("click", () => {
  if (!state.selectedNotes.size) return;
  commitChange(() => {
    state.chart.notes = state.chart.notes.filter((note) => !state.selectedNotes.has(note.id));
    state.selectedNotes.clear();
  }, "已删除所选音符");
});

$("#apply-note-batch").addEventListener("click", () => {
  const deltaTime = Number($("#batch-note-time").value) || 0;
  const deltaWPos = Number($("#batch-note-wpos").value) || 0;
  commitChange(() => {
    state.chart.notes.filter((note) => state.selectedNotes.has(note.id)).forEach((note) => {
      const duration = note.endTime ? note.endTime - note.hitTime : 0;
      note.hitTime = snapTime(state.chart, note.hitTime + deltaTime);
      if (note.type === "middle") note.wPos = snapWPos(state.chart, note.wPos + deltaWPos);
      if (note.kind === "hold") note.endTime = Math.min(state.chart.timing.duration, note.hitTime + duration);
    });
  }, "已批量修改音符");
});

$("#apply-event-batch").addEventListener("click", () => {
  const deltaTime = Number($("#batch-event-time").value) || 0;
  const scale = Number($("#batch-event-scale").value) || 1;
  commitChange(() => {
    state.selectedEvents.forEach((token) => {
      const [timelineId, id] = token.split(":");
      const event = state.chart.timelines[timelineId].find((item) => item.id === id);
      if (!event) return;
      event.time = snapTime(state.chart, event.time + deltaTime);
      event.value *= scale;
    });
  }, "已批量修改事件", { trajectory: true });
});

refs.noteInspector.addEventListener("submit", (event) => event.preventDefault());
refs.eventInspector.addEventListener("submit", (event) => event.preventDefault());
refs.bpmKeyEditor.addEventListener("submit", (event) => event.preventDefault());

function inputNumber(control) {
  return Number.isFinite(control.valueAsNumber) ? control.valueAsNumber : null;
}

$("#inspect-note-kind").addEventListener("change", (event) => {
  const note = selectedNote();
  if (!note) return;
  const kind = event.target.value;
  applyContinuousChange(event.target, `note:${note.id}:kind`, () => {
    note.kind = kind;
    if (kind === "hold") note.endTime = Math.min(state.chart.timing.duration, note.endTime ?? note.hitTime + 1);
    else delete note.endTime;
  }, "音符形态已更新", { notes: true });
  $("#inspect-note-end-row").hidden = kind !== "hold";
});

$("#inspect-note-time").addEventListener("input", (event) => {
  const value = inputNumber(event.target);
  const note = selectedNote();
  if (value === null || !note) return;
  applyContinuousChange(event.target, `note:${note.id}:hitTime`, () => {
    const duration = note.kind === "hold" ? note.endTime - note.hitTime : 0;
    note.hitTime = snapTime(state.chart, value);
    if (note.kind === "hold") note.endTime = Math.min(state.chart.timing.duration, note.hitTime + Math.max(0.001, duration));
  }, "音符时间已更新", { notes: true });
});

$("#inspect-note-end").addEventListener("input", (event) => {
  const value = inputNumber(event.target);
  const note = selectedNote();
  if (value === null || !note || note.kind !== "hold") return;
  applyContinuousChange(event.target, `note:${note.id}:endTime`, () => {
    note.endTime = Math.min(state.chart.timing.duration, Math.max(note.hitTime + 0.001, value));
  }, "Hold 结束时间已更新", { notes: true });
});

$("#inspect-note-wpos").addEventListener("input", (event) => {
  const value = inputNumber(event.target);
  const note = selectedNote();
  if (value === null || !note || note.type !== "middle") return;
  applyContinuousChange(event.target, `note:${note.id}:wPos`, () => {
    note.wPos = snapWPos(state.chart, value);
  }, "音符 wPos 已更新", { notes: true });
});

$("#inspect-event-time").addEventListener("input", (event) => {
  const value = inputNumber(event.target);
  const selection = selectedEvent();
  if (value === null || !selection) return;
  applyContinuousChange(event.target, `event:${selection.timelineId}:${selection.event.id}:time`, () => {
    selection.event.time = snapTime(state.chart, value);
  }, "事件时间已更新", { trajectory: true, events: true });
});

$("#inspect-event-value").addEventListener("input", (event) => {
  const value = inputNumber(event.target);
  const selection = selectedEvent();
  if (value === null || !selection) return;
  applyContinuousChange(event.target, `event:${selection.timelineId}:${selection.event.id}:value`, () => {
    selection.event.value = value;
  }, "事件数值已更新", { trajectory: true, events: true });
});

$("#inspect-event-easing").addEventListener("change", (event) => {
  const selection = selectedEvent();
  if (!selection) return;
  applyContinuousChange(event.target, `event:${selection.timelineId}:${selection.event.id}:easing`, () => {
    selection.event.easing = event.target.value;
  }, "事件缓动已更新", { trajectory: true, events: true });
  refs.formulaRow.hidden = event.target.value !== "formula";
});

$("#inspect-event-formula").addEventListener("input", (event) => {
  const selection = selectedEvent();
  if (!selection) return;
  applyContinuousChange(event.target, `event:${selection.timelineId}:${selection.event.id}:formula`, () => {
    selection.event.formula = event.target.value.trim() || "t";
  }, "事件公式已更新", { trajectory: true, events: true });
});

refs.bpmList.addEventListener("click", (event) => {
  const item = event.target.closest(".bpm-key-item");
  if (!item) return;
  state.selectedBpmKey = item.dataset.bpmId;
  const key = state.chart.timing.bpmKeys.find((candidate) => candidate.id === state.selectedBpmKey);
  if (event.detail >= 2) setCurrentTime(key.time, true);
  renderBpmKeys();
});

$("#add-bpm-key").addEventListener("click", () => {
  const existing = state.chart.timing.bpmKeys.find((key) => Math.abs(key.time - state.currentTime) < 0.0005);
  if (existing) {
    state.selectedBpmKey = existing.id;
    renderBpmKeys();
    setStatus("当前位置已有 BPM Key");
    return;
  }
  const active = bpmKeyAt(state.chart, state.currentTime);
  const key = {
    id: crypto.randomUUID(),
    time: state.currentTime,
    bpm: active.bpm,
    beatsPerBar: active.beatsPerBar
  };
  state.selectedBpmKey = key.id;
  commitChange(() => state.chart.timing.bpmKeys.push(key), "已添加 BPM Key");
  updateTimeUi(false);
});

$("#remove-bpm-key").addEventListener("click", () => {
  if (!state.selectedBpmKey || state.chart.timing.bpmKeys.length <= 1) return;
  const removedId = state.selectedBpmKey;
  commitChange(() => {
    state.chart.timing.bpmKeys = state.chart.timing.bpmKeys.filter((key) => key.id !== removedId);
    state.selectedBpmKey = null;
  }, "已删除 BPM Key");
  renderBpmKeys();
  updateTimeUi(false);
});

refs.bpmKeyTime.addEventListener("input", (event) => {
  const value = inputNumber(event.target);
  const key = state.chart.timing.bpmKeys.find((candidate) => candidate.id === state.selectedBpmKey);
  if (value === null || !key) return;
  applyContinuousChange(event.target, `bpm:${key.id}:time`, () => {
    key.time = Math.max(0, Math.min(state.chart.timing.duration, value));
  }, "BPM Key 时间已更新", { bpm: true });
});

refs.bpmValue.addEventListener("input", (event) => {
  const value = inputNumber(event.target);
  const key = state.chart.timing.bpmKeys.find((candidate) => candidate.id === state.selectedBpmKey);
  if (value === null || !key) return;
  applyContinuousChange(event.target, `bpm:${key.id}:value`, () => {
    key.bpm = Math.max(1, value);
  }, "BPM 已更新", { bpm: true });
});

refs.bpmBeatsPerBar.addEventListener("input", (event) => {
  const value = inputNumber(event.target);
  const key = state.chart.timing.bpmKeys.find((candidate) => candidate.id === state.selectedBpmKey);
  if (value === null || !key) return;
  applyContinuousChange(event.target, `bpm:${key.id}:beats`, () => {
    key.beatsPerBar = Math.max(1, Math.round(value));
  }, "每小节拍数已更新", { bpm: true });
});

document.addEventListener("focusout", (event) => {
  if (state.continuousEdit?.control !== event.target) return;
  state.continuousEdit = null;
  if (refs.bpmKeyEditor.contains(event.target)) renderBpmKeys();
  else if (refs.noteInspector.contains(event.target) || refs.eventInspector.contains(event.target)) renderInspector();
});

$("#add-effect").addEventListener("click", () => {
  const effect = { id: crypto.randomUUID(), time: state.currentTime, type: "planet", position: [0, 0, 0], params: { radius: 30, color: "#9fc8ff" } };
  commitChange(() => state.chart.effects.push(effect), "已添加自定义特效事件");
});

refs.scrubber.addEventListener("input", () => {
  state.playing = false;
  refs.audio.pause();
  refs.playToggle.textContent = "▶";
  setCurrentTime(Number(refs.scrubber.value), true);
});
refs.playToggle.addEventListener("click", togglePlayback);
refs.stop.addEventListener("click", stopPlayback);

refs.duration.addEventListener("change", () => {
  commitChange(() => {
    state.chart.timing.duration = Math.max(
      0.1,
      Number(refs.duration.value) || CONFIG.chart.defaults.timing.duration
    );
    state.chart.notes = state.chart.notes.filter((note) => note.hitTime <= state.chart.timing.duration);
  }, "谱面时长已更新", { trajectory: true });
  syncChartControls();
});

refs.subdivision.addEventListener("input", (event) => {
  const value = inputNumber(event.target);
  if (value === null) return;
  applyContinuousChange(event.target, "grid:subdivision", () => {
    state.chart.timing.subdivision = Math.max(0, Math.round(value));
  }, value === 0 ? "节拍网格与时间吸附已关闭" : "节拍细分已更新", { notes: true, events: true });
});

refs.wPosDivision.addEventListener("input", (event) => {
  const value = inputNumber(event.target);
  if (value === null) return;
  applyContinuousChange(event.target, "grid:wpos", () => {
    state.chart.timing.wPosDivision = Math.max(0, Math.round(value));
  }, "wPos 网格已更新", { notes: true });
});

let zoomRenderFrame = 0;

function renderZoomPreview(includeWaveform = false) {
  if (zoomRenderFrame) {
    cancelAnimationFrame(zoomRenderFrame);
    zoomRenderFrame = 0;
  }
  renderNoteEditor({ waveform: includeWaveform });
  renderEventTimelines();
  updateTimeUi(true);
}

const noteZoom = refs.noteZoom;
noteZoom.addEventListener("input", (event) => {
  state.pixelsPerSecond = Number(event.target.value);
  if (zoomRenderFrame) return;
  zoomRenderFrame = requestAnimationFrame(() => {
    zoomRenderFrame = 0;
    renderZoomPreview(false);
  });
});
noteZoom.addEventListener("change", () => renderZoomPreview(true));

refs.title.addEventListener("change", () => { state.chart.meta.title = refs.title.value; setDirty(true); });
refs.composer.addEventListener("change", () => { state.chart.meta.composer = refs.composer.value; setDirty(true); });
refs.charter.addEventListener("change", () => { state.chart.meta.charter = refs.charter.value; setDirty(true); });
refs.illustrator.addEventListener("change", () => { state.chart.meta.illustrator = refs.illustrator.value; setDirty(true); });
refs.difficultyLabel.addEventListener("change", () => {
  state.chart.meta.difficultyLabel = refs.difficultyLabel.value.replace(/^-+|-+$/g, "")
    || CONFIG.chart.defaults.meta.difficultyLabel;
  refs.difficultyLabel.value = state.chart.meta.difficultyLabel;
  setDirty(true);
});
refs.level.addEventListener("change", () => {
  state.chart.meta.level = Math.max(0, Math.round(Number(refs.level.value) || 0));
  refs.level.value = state.chart.meta.level;
  setDirty(true);
});

$("#new-chart").addEventListener("click", () => {
  state.undo.push(snapshot());
  state.chart = normalizeChart(createDefaultChart());
  state.currentTime = 0;
  state.selectedNotes.clear();
  state.selectedEvents.clear();
  syncChartControls();
  rebuildEverything();
  setDirty(true);
  setStatus("已新建谱面");
});
$("#load-chart").addEventListener("click", () => refs.chartFile.click());
$("#save-chart").addEventListener("click", saveChart);
$("#load-audio").addEventListener("click", () => refs.audioFile.click());
$("#undo-button").addEventListener("click", undo);
$("#redo-button").addEventListener("click", redo);
refs.chartFile.addEventListener("change", () => loadChartFile(refs.chartFile.files[0]));
refs.audioFile.addEventListener("change", () => loadAudio(refs.audioFile.files[0]).catch((error) => setStatus(`音乐加载失败：${error.message}`)));
refs.panelToggle.addEventListener("click", () => setEditorPanelOpen(!state.editorPanelOpen));
refs.viewToggle.addEventListener("click", toggleView);

window.addEventListener("keydown", (event) => {
  const typingTarget = event.target.matches("input:not([type='range']), select, textarea, [contenteditable='true']");
  if (event.code === "KeyE" && !typingTarget) {
    event.preventDefault();
    if (!event.repeat) setEditorPanelOpen(!state.editorPanelOpen);
    return;
  }
  if (typingTarget) return;
  if (event.code === "Equal") {
    event.preventDefault();
    toggleView();
  } else if (event.code === "Space") {
    event.preventDefault();
    togglePlayback();
  } else if (event.code === "Delete" || event.code === "Backspace") {
    event.preventDefault();
    if (state.selectedNotes.size) $("#delete-selection").click();
    else if (state.selectedEvents.size) {
      commitChange(() => {
        state.selectedEvents.forEach((token) => {
          const [timelineId, id] = token.split(":");
          state.chart.timelines[timelineId] = state.chart.timelines[timelineId].filter((item) => item.id !== id);
        });
        state.selectedEvents.clear();
      }, "已删除所选事件", { trajectory: true });
    }
  } else if ((event.ctrlKey || event.metaKey) && event.code === "KeyZ") {
    event.preventDefault();
    event.shiftKey ? redo() : undo();
  } else if ((event.ctrlKey || event.metaKey) && event.code === "KeyY") {
    event.preventDefault();
    redo();
  } else if ((event.ctrlKey || event.metaKey) && event.code === "KeyS") {
    event.preventDefault();
    saveChart();
  }
});

window.addEventListener("beforeunload", (event) => {
  if (!state.dirty) return;
  event.preventDefault();
});

new ResizeObserver(() => {
  renderNoteEditor();
  renderEventTimelines();
}).observe(refs.noteScroll);

function animate() {
  if (state.playing) {
    const time = refs.audio.src && !refs.audio.paused
      ? refs.audio.currentTime
      : state.playStartedChartTime + performance.now() / 1000 - state.playStartedAt;
    if (time >= state.chart.timing.duration) stopPlayback();
    else setCurrentTime(time, true);
  }
  updatePreviewPose();
  requestAnimationFrame(animate);
}

populateEasingOptions();
setEditorPanelOpen(false);
syncChartControls();
rebuildEverything();
resizePreview();
setTimeout(() => {
  refs.noteScroll.scrollTop = Math.max(0, contentHeight() - refs.noteScroll.clientHeight);
  refs.eventTimelines.scrollTop = refs.noteScroll.scrollTop;
}, 0);
animate();

window.ParticleSoarEditor = {
  get chart() { return state.chart; },
  load(chart) {
    state.chart = normalizeChart(chart);
    syncChartControls();
    rebuildEverything();
  },
  trajectoryAt(time) { return trajectoryPoseAt(state.trajectory, time); }
};
