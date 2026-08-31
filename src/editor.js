import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import {
  EASING_PRESET_GROUPS,
  CHART_TIME_STEP,
  TIMELINE_DEFINITIONS,
  beatAt,
  bpmAt,
  bpmKeyAt,
  buildReceiverTrajectory,
  buildTempoMap,
  compactChart,
  createDefaultChart,
  findDuplicateNotePlacement,
  findDuplicateTimelineEvent,
  gridTimes,
  normalizeChart,
  nearestRampAnchorAtTime,
  sampleTimeline,
  snapTime,
  snapWPos,
  speedColor,
  timeAtBeat,
  trajectoryPoseAt,
  receiverFrameAt
} from "./chart-core.js?v=20260901-5";
import { CONFIG } from "./config.js?v=20260901-2";
import { HitSoundPlayer } from "./hit-sounds.js?v=20260831-1";
import { createProjectZip, projectJson, readProjectZip } from "./project-package.js?v=20260828-66";

const editorConfig = CONFIG.editor;
const colorConfig = CONFIG.colors;
const HALF_TIME_STEP = CHART_TIME_STEP * 0.5;
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
  hitSoundVolume: $("#hit-sound-volume"),
  viewMode: $("#view-mode"),
  dirtyState: $("#dirty-state"),
  projectLocation: $("#project-location"),
  difficultySelect: $("#difficulty-select"),
  difficultyDialog: $("#difficulty-dialog"),
  difficultyForm: $("#difficulty-form"),
  newDifficultyLabel: $("#new-difficulty-label"),
  newDifficultyLevel: $("#new-difficulty-level"),
  newDifficultyCharter: $("#new-difficulty-charter"),
  status: $("#status-message"),
  cameraRelativeX: $("#camera-relative-x"),
  cameraRelativeY: $("#camera-relative-y"),
  cameraRelativeZ: $("#camera-relative-z"),
  cameraTargetX: $("#camera-target-x"),
  cameraTargetY: $("#camera-target-y"),
  cameraTargetZ: $("#camera-target-z"),
  cameraRelativeFov: $("#camera-relative-fov"),
  cameraValueSource: $("#camera-value-source"),
  addCameraKeyframe: $("#add-camera-keyframe"),
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
  bpmRampEditor: $("#bpm-ramp-editor"),
  bpmRampRange: $("#bpm-ramp-range"),
  bpmRampControls: $("#bpm-ramp-controls"),
  bpmRampBeats: $("#bpm-ramp-beats"),
  bpmRampCurve: $("#bpm-ramp-curve"),
  bpmRampStatus: $("#bpm-ramp-status"),
  bpmRampAnchorList: $("#bpm-ramp-anchor-list"),
  bpmRampRepair: $("#bpm-ramp-repair"),
  repairRampStart: $("#repair-ramp-start"),
  repairRampEnd: $("#repair-ramp-end"),
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
  projectPackage: $("#project-package-input"),
  audioFile: $("#audio-file-input"),
  coverFile: $("#cover-file-input")
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
  hitSoundCursor: 0,
  hitSoundScheduledThrough: 0,
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
  waveformPitch: null,
  liveCamera: null,
  clipboard: null,
  projectDirectory: null,
  projectMeta: null,
  projectChartFile: null,
  projectCharts: new Map(),
  audioSourceFile: null,
  coverSourceFile: null,
  coverUrl: null
};
state.tempoMap = buildTempoMap(state.chart);

const hitSounds = new HitSoundPlayer({
  urls: CONFIG.game.audio.hitSounds,
  volume: editorConfig.audio.hitSoundVolume
});
let editorAudioSource = null;
let hitSoundReadyPromise = null;
refs.hitSoundVolume.value = editorConfig.audio.hitSoundVolume;

function refreshTempoMap() {
  state.tempoMap = buildTempoMap(state.chart);
}

const svgNamespace = "http://www.w3.org/2000/svg";
const noteLayout = editorConfig.noteLayout;
const noteTypeLabels = editorConfig.noteTypeLabels;
const timelineDefinitionsById = new Map(TIMELINE_DEFINITIONS.map((definition) => [definition.id, definition]));
const cameraTimelineIds = [
  "cameraX", "cameraY", "cameraZ",
  "cameraTargetX", "cameraTargetY", "cameraTargetZ",
  "cameraFov"
];
const makeSvg = (name, attributes = {}) => {
  const element = document.createElementNS(svgNamespace, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
};

function formatTime(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(value / 60);
  const remainder = value - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remainder.toFixed(4).padStart(7, "0")}`;
}

function formatSigned(value) {
  const normalized = Math.abs(value) < 0.0005 ? 0 : value;
  return `${normalized >= 0 ? "+" : ""}${normalized.toFixed(2)}`;
}

function timelineValueAt(timelineId, time = state.currentTime) {
  const definition = timelineDefinitionsById.get(timelineId);
  return sampleTimeline(state.chart.timelines[timelineId], time, definition?.defaultValue ?? 0);
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
  refs.panelToggle.setAttribute("aria-label", state.editorPanelOpen ? "关闭编辑面板" : "打开编辑面板");
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
  refreshTempoMap();
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
  if (notes && findDuplicateNotePlacement(state.chart.notes)) {
    const previous = state.undo.pop();
    state.continuousEdit = null;
    if (previous) state.chart = normalizeChart(JSON.parse(previous));
    rebuildEverything();
    setStatus("该时间与位置已有音符，修改已取消");
    return;
  }
  state.chart = normalizeChart(state.chart);
  if (bpm) refreshTempoMap();
  setDirty(true);
  if (trajectory) rebuildTrajectory();
  if (notes || bpm) renderNoteEditor();
  if (events || bpm) renderEventTimelines();
  if (bpm) renderBpmKeys(false);
  if (!trajectory && notes) rebuildPreviewNotes();
  scheduleGamePreviewChartSync();
  updateTimeUi(false);
  const duplicateEvent = events ? findDuplicateTimelineEvent(state.chart.timelines) : null;
  setStatus(duplicateEvent
    ? `${duplicateEvent.label}：${duplicateEvent.duplicate.time.toFixed(4)}s 已有相同值 ${duplicateEvent.duplicate.value}`
    : message);
}

function commitChange(mutator, message, { trajectory = false, events = false } = {}) {
  const selectedNotesBefore = new Set(state.selectedNotes);
  const selectedEventsBefore = new Set(state.selectedEvents);
  beginChange();
  mutator();
  if (findDuplicateNotePlacement(state.chart.notes)) {
    const previous = state.undo.pop();
    if (previous) state.chart = normalizeChart(JSON.parse(previous));
    state.selectedNotes = selectedNotesBefore;
    state.selectedEvents = selectedEventsBefore;
    rebuildEverything();
    setStatus("该时间与位置已有音符，操作已取消");
    return false;
  }
  state.chart = normalizeChart(state.chart);
  refreshTempoMap();
  setDirty(true);
  if (trajectory) rebuildTrajectory();
  renderNoteEditor();
  renderEventTimelines();
  renderInspector();
  renderBpmKeys();
  renderEffects();
  rebuildPreviewNotes();
  syncGamePreviewChart();
  const duplicateEvent = events ? findDuplicateTimelineEvent(state.chart.timelines) : null;
  setStatus(duplicateEvent
    ? `${duplicateEvent.label}：${duplicateEvent.duplicate.time.toFixed(4)}s 已有相同值 ${duplicateEvent.duplicate.value}`
    : message);
  return true;
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
  const previewChart = structuredClone(state.chart);
  if (state.coverUrl) previewChart.meta.cover = state.coverUrl;
  refs.gamePreview.contentWindow.postMessage({
    type: "ParticleSoarPreviewChart",
    chart: previewChart,
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
  } else if (event.data?.type === "ParticleSoarEditorTogglePlayback") {
    togglePlayback();
  } else if (event.data?.type === "ParticleSoarEditorAddCameraKeyframe") {
    addCameraKeyframesAtCurrentTime();
  } else if (event.data?.type === "ParticleSoarPreviewCamera") {
    state.liveCamera = event.data.camera;
    updateCameraState();
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
  if (state.viewMode === "global") state.liveCamera = null;
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

function holdGridStepAt(time) {
  if (state.chart.timing.subdivision === 0) return CHART_TIME_STEP;
  const tempoMap = state.tempoMap;
  const key = bpmKeyAt(state.chart, time);
  const keyIndex = state.chart.timing.bpmKeys.indexOf(key);
  const keyBeat = tempoMap.keyBeats[keyIndex] ?? 0;
  const currentBeat = beatAt(state.chart, time, tempoMap);
  const beatStep = key.beatsPerBar / state.chart.timing.subdivision;
  const nextSubdivision = Math.floor((currentBeat - keyBeat) / beatStep + 1 + 1e-7);
  const nextTime = timeAtBeat(state.chart, keyBeat + nextSubdivision * beatStep, tempoMap);
  return Math.max(CHART_TIME_STEP, nextTime - time);
}

function defaultHoldEndTime(hitTime) {
  const duration = state.chart.timing.duration;
  const step = Math.max(CHART_TIME_STEP, holdGridStepAt(hitTime));
  return Math.min(duration, Math.max(hitTime + CHART_TIME_STEP, snapTime(state.chart, hitTime + step, state.tempoMap)));
}

function holdEndTimeAtY(note, y) {
  const snapped = snapTime(state.chart, yToTime(y), state.tempoMap);
  return snapped > note.hitTime ? snapped : defaultHoldEndTime(note.hitTime);
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

function waveformTimelineHeight() {
  return Math.max(1, state.chart.timing.duration * state.pixelsPerSecond);
}

function syncWaveformGeometry() {
  refs.waveform.style.top = `${timeToY(state.chart.timing.duration)}px`;
  refs.waveform.style.height = `${waveformTimelineHeight()}px`;
}

function renderWaveform() {
  const cssHeight = waveformTimelineHeight();
  const renderHeight = Math.min(editorConfig.waveform.maxRenderHeight, Math.max(1, Math.round(cssHeight)));
  const dpr = Math.min(devicePixelRatio, editorConfig.waveform.maxPixelRatio);
  const waveformWidth = editorConfig.waveform.width;
  refs.waveform.width = Math.round(waveformWidth * dpr);
  refs.waveform.height = Math.round(renderHeight * dpr);
  syncWaveformGeometry();
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
    group.appendChild(makeSvg("line", {
      class: "hold-tail-cap",
      x1: x - 9,
      x2: x + 9,
      y1: tailY,
      y2: tailY
    }));
    group.appendChild(makeSvg("circle", {
      class: "hold-tail-handle",
      cx: x,
      cy: tailY,
      r: 10
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
  const width = Math.max(1, refs.noteGrid.clientWidth || refs.noteScroll.clientWidth - editorConfig.waveform.width);
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

  gridTimes(state.chart, 0, state.chart.timing.duration, state.tempoMap).forEach((grid) => {
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

  const appendNote = (note, extraClass = "") => {
    const selected = state.selectedNotes.has(note.id);
    const x = noteX(note, width);
    const y = timeToY(note.hitTime);
    const group = makeSvg("g", {
      class: `note-object note-${note.type}${selected ? " selected" : ""}${extraClass}`,
      "data-note-id": note.id
    });
    if (selected) {
      const bounds = noteSelectionBounds(note, width);
      group.appendChild(makeSvg("rect", {
        class: "note-selection-frame",
        x: bounds.left - 2,
        y: bounds.top - 2,
        width: bounds.right - bounds.left + 4,
        height: bounds.bottom - bounds.top + 4,
        rx: 4
      }));
    }
    appendNoteShape(group, note, x, y);
    refs.noteGrid.appendChild(group);
  };
  state.chart.notes.forEach((note) => appendNote(note));
  if (state.drag?.kind === "create-hold") appendNote(state.drag.note, " draft");
  refs.notePlayhead.style.top = `${timeToY(state.currentTime)}px`;
  refs.noteScroll.scrollTop = scrollTop;
  if (waveform) renderWaveform();
  else syncWaveformGeometry();
  refs.selectedNoteCount.textContent = state.selectedNotes.size;
  $("#batch-note-wpos").disabled = !state.chart.notes.some((note) => note.type === "middle" && state.selectedNotes.has(note.id));
}

function createNoteAt(event) {
  const { x, y } = notePointFromEvent(event);
  const width = refs.noteGrid.viewBox.baseVal.width;
  const type = noteTypeAtX(x, width);
  const hitTime = snapTime(state.chart, yToTime(y));
  const wPos = type === "middle" ? xToWPos(x, width) : 0;
  const note = {
    id: crypto.randomUUID(),
    type,
    kind: state.noteKind,
    hitTime,
    wPos,
    ...(state.noteKind === "hold" ? { endTime: defaultHoldEndTime(hitTime) } : {})
  };
  const created = commitChange(
    () => state.chart.notes.push(note),
    `已放置 ${state.noteKind.toUpperCase()} ${type} 音符`
  );
  if (!created) return;
  state.selectedEvents.clear();
  state.selectedNotes.clear();
  state.selectedNotes.add(note.id);
  renderNoteEditor();
  renderEventTimelines();
  renderInspector();
}

function holdDraftFromEvent(event) {
  const { x, y } = notePointFromEvent(event);
  const width = refs.noteGrid.viewBox.baseVal.width;
  const type = noteTypeAtX(x, width);
  const duration = state.chart.timing.duration;
  let hitTime = snapTime(state.chart, yToTime(y));
  if (hitTime >= duration) hitTime = Math.max(0, duration - CHART_TIME_STEP);
  return {
    id: crypto.randomUUID(),
    type,
    kind: "hold",
    hitTime,
    endTime: defaultHoldEndTime(hitTime),
    wPos: type === "middle" ? xToWPos(x, width) : 0
  };
}

function startHoldCreation(event) {
  event.preventDefault();
  state.selectedEvents.clear();
  state.selectedNotes.clear();
  state.drag = {
    kind: "create-hold",
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    note: holdDraftFromEvent(event)
  };
  refs.noteGrid.setPointerCapture?.(event.pointerId);
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

function holdTailPointerDown(event, element) {
  event.preventDefault();
  event.stopPropagation();
  const note = state.chart.notes.find((item) => item.id === element.dataset.noteId);
  if (!note || note.kind !== "hold") return;
  state.selectedEvents.clear();
  state.selectedNotes.clear();
  state.selectedNotes.add(note.id);
  beginChange();
  state.drag = {
    kind: "hold-tail",
    pointerId: event.pointerId,
    noteId: note.id,
    originalEndTime: note.endTime,
    changed: false
  };
  refs.noteGrid.setPointerCapture?.(event.pointerId);
  renderNoteEditor();
  renderEventTimelines();
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

function eventDragRange(timelineId) {
  return state.drag?.kind === "event" ? state.drag.metrics?.[timelineId]?.range : null;
}

function createTimelineCurve(events, range, height, color) {
  const curve = makeSvg("svg", {
    class: "timeline-curve",
    viewBox: `0 0 100 ${height}`,
    preserveAspectRatio: "none",
    "aria-hidden": "true"
  });
  curve.style.setProperty("--event-color", color);
  const pathData = [];
  const appendPoint = (time) => {
    const value = sampleTimeline(events, time, events[0]?.value ?? 0);
    const x = eventX(value, range);
    const y = timeToY(time);
    pathData.push(`${pathData.length === 0 ? "M" : "L"}${x.toFixed(3)} ${y.toFixed(3)}`);
  };
  appendPoint(0);
  const boundaries = [0, ...events.map((event) => event.time), state.chart.timing.duration]
    .filter((time) => time >= 0 && time <= state.chart.timing.duration)
    .sort((left, right) => left - right)
    .filter((time, index, values) => index === 0 || time - values[index - 1] > 1e-9);
  let sourceIndex = 0;
  const plans = [];
  for (let boundaryIndex = 1; boundaryIndex < boundaries.length; boundaryIndex += 1) {
    const startTime = boundaries[boundaryIndex - 1];
    const endTime = boundaries[boundaryIndex];
    while (sourceIndex + 1 < events.length && events[sourceIndex + 1].time <= startTime + 1e-9) sourceIndex += 1;
    const sourceEvent = events[sourceIndex];
    const nonlinearMinimum = sourceEvent?.easing === "formula"
      ? editorConfig.timelineCurve.formulaSamples
      : sourceEvent?.easing && sourceEvent.easing !== "linear" && sourceEvent.easing !== "hold"
        ? editorConfig.timelineCurve.minNonlinearSamples
        : 1;
    const pixelSamples = Math.ceil(
      (endTime - startTime) * state.pixelsPerSecond / editorConfig.timelineCurve.pixelsPerSample
    );
    plans.push({ startTime, endTime, desiredSamples: Math.max(1, pixelSamples, nonlinearMinimum) });
  }
  const requiredSamples = plans.length;
  const desiredExtras = plans.reduce((sum, plan) => sum + plan.desiredSamples - 1, 0);
  const availableExtras = Math.max(0, editorConfig.timelineCurve.maxSamples - requiredSamples);
  const extraScale = desiredExtras > availableExtras ? availableExtras / desiredExtras : 1;
  plans.forEach(({ startTime, endTime, desiredSamples }) => {
    const segmentSamples = 1 + Math.floor((desiredSamples - 1) * extraScale);
    for (let sample = 1; sample <= segmentSamples; sample += 1) {
      appendPoint(startTime + (endTime - startTime) * sample / segmentSamples);
    }
  });
  curve.appendChild(makeSvg("path", { d: pathData.join(" ") }));
  return curve;
}

function updateTimelineCurrentValues() {
  refs.eventTimelines.querySelectorAll(".timeline-value-marker").forEach((marker) => {
    const column = marker.closest(".timeline-column");
    const timelineId = column.dataset.timelineId;
    const range = {
      min: Number(column.dataset.rangeMin),
      max: Number(column.dataset.rangeMax)
    };
    const value = timelineValueAt(timelineId);
    marker.textContent = value.toFixed(2);
    marker.style.left = `${eventX(value, range)}%`;
    marker.style.top = `${timeToY(state.currentTime)}px`;
  });
}

function timelineCameraValues(time = state.currentTime) {
  return Object.fromEntries(cameraTimelineIds.map((timelineId) => [timelineId, timelineValueAt(timelineId, time)]));
}

function cameraValuesForEditing(time = state.currentTime) {
  if (state.viewMode === "global" && state.liveCamera) return state.liveCamera;
  return timelineCameraValues(time);
}

function updateCameraState() {
  const values = cameraValuesForEditing();
  const live = state.viewMode === "global" && Boolean(state.liveCamera);
  refs.cameraValueSource.textContent = `${live ? "LIVE" : "CHART"} · RECEIVER RELATIVE`;
  refs.cameraRelativeX.textContent = formatSigned(values.cameraX);
  refs.cameraRelativeY.textContent = formatSigned(values.cameraY);
  refs.cameraRelativeZ.textContent = formatSigned(values.cameraZ);
  refs.cameraTargetX.textContent = formatSigned(values.cameraTargetX);
  refs.cameraTargetY.textContent = formatSigned(values.cameraTargetY);
  refs.cameraTargetZ.textContent = formatSigned(values.cameraTargetZ);
  refs.cameraRelativeFov.textContent = values.cameraFov.toFixed(2);
}

function renderEventTimelines() {
  const scrollTop = refs.eventTimelines.scrollTop;
  const scrollLeft = refs.eventTimelines.scrollLeft;
  const height = contentHeight();
  const content = document.createElement("div");
  content.className = "event-content";
  content.style.height = `${height}px`;
  content.style.minWidth = `${TIMELINE_DEFINITIONS.length * 108}px`;
  content.style.gridTemplateColumns = `repeat(${TIMELINE_DEFINITIONS.length}, minmax(100px, 1fr))`;

  gridTimes(state.chart, 0, state.chart.timing.duration, state.tempoMap).forEach((grid) => {
    const line = document.createElement("div");
    line.className = `event-grid-line${grid.beat ? " beat" : ""}${grid.major ? " major" : ""}`;
    line.style.top = `${timeToY(grid.time)}px`;
    content.appendChild(line);
  });

  TIMELINE_DEFINITIONS.forEach((definition) => {
    const events = state.chart.timelines[definition.id];
    const range = eventDragRange(definition.id) ?? timelineRange(events);
    const column = document.createElement("div");
    column.className = "timeline-column";
    column.dataset.timelineId = definition.id;
    column.dataset.rangeMin = range.min;
    column.dataset.rangeMax = range.max;
    column.style.setProperty("--event-color", definition.color);
    column.innerHTML = `<div class="timeline-label"><strong>${definition.label}</strong><span>${range.min.toFixed(2)}…${range.max.toFixed(2)}</span></div>`;
    column.appendChild(createTimelineCurve(events, range, height, definition.color));
    events.forEach((event) => {
      const token = eventToken(definition.id, event.id);
      const selected = state.selectedEvents.has(token);
      const dragging = state.drag?.kind === "event" && selected;
      const key = document.createElement("button");
      key.type = "button";
      key.className = `event-key${selected ? " selected" : ""}`;
      key.style.setProperty("--event-color", definition.color);
      const position = eventX(event.value, range);
      key.style.left = `${dragging ? Math.max(2, Math.min(98, position)) : position}%`;
      key.style.top = `${timeToY(event.time)}px`;
      key.dataset.timelineId = definition.id;
      key.dataset.eventId = event.id;
      key.setAttribute("aria-label", `${event.time.toFixed(4)}s · ${event.value}`);
      column.appendChild(key);
    });
    const marker = document.createElement("output");
    marker.className = "timeline-value-marker";
    marker.textContent = timelineValueAt(definition.id).toFixed(2);
    marker.style.left = `${eventX(timelineValueAt(definition.id), range)}%`;
    marker.style.top = `${timeToY(state.currentTime)}px`;
    column.appendChild(marker);
    content.appendChild(column);
  });
  const playhead = document.createElement("div");
  playhead.className = "timeline-playhead";
  playhead.style.top = `${timeToY(state.currentTime)}px`;
  content.appendChild(playhead);
  refs.eventTimelines.replaceChildren(content);
  const scrollbarHeight = Math.max(0, refs.noteScroll.clientHeight - refs.eventTimelines.clientHeight);
  if (scrollbarHeight > 0) {
    const adjustedHeight = Math.max(refs.eventTimelines.clientHeight, height - scrollbarHeight);
    content.style.height = `${adjustedHeight}px`;
    content.querySelectorAll(".timeline-curve").forEach((curve) => {
      curve.setAttribute("viewBox", `0 0 100 ${adjustedHeight}`);
    });
  }
  refs.eventTimelines.scrollTop = scrollTop;
  refs.eventTimelines.scrollLeft = scrollLeft;
  refs.selectedEventCount.textContent = state.selectedEvents.size;
}

function addCameraKeyframesAtCurrentTime() {
  const time = state.currentTime;
  const sampledValues = cameraValuesForEditing(time);
  const existing = Object.fromEntries(cameraTimelineIds.map((timelineId) => [
    timelineId,
    state.chart.timelines[timelineId].find((event) => Math.abs(event.time - time) < HALF_TIME_STEP)
  ]));
  const missingIds = cameraTimelineIds.filter((timelineId) => !existing[timelineId]);
  const valuesChanged = cameraTimelineIds.some((timelineId) => (
    existing[timelineId]
    && Math.abs(existing[timelineId].value - sampledValues[timelineId]) >= 0.000001
  ));

  if (missingIds.length === 0 && !valuesChanged) {
    state.selectedNotes.clear();
    state.selectedEvents = new Set(cameraTimelineIds.map((timelineId) => eventToken(timelineId, existing[timelineId].id)));
    renderNoteEditor();
    renderEventTimelines();
    renderInspector();
    setStatus(`${time.toFixed(4)}s 的相机关键帧已是当前视角`);
    return;
  }

  commitChange(() => {
    state.selectedNotes.clear();
    state.selectedEvents.clear();
    cameraTimelineIds.forEach((timelineId) => {
      let timelineEvent = existing[timelineId];
      if (!timelineEvent) {
        timelineEvent = {
          id: crypto.randomUUID(),
          time,
          value: sampledValues[timelineId],
          easing: "linear",
          formula: "t"
        };
        state.chart.timelines[timelineId].push(timelineEvent);
      } else {
        timelineEvent.value = sampledValues[timelineId];
      }
      state.selectedEvents.add(eventToken(timelineId, timelineEvent.id));
    });
  }, `已在 ${time.toFixed(4)}s 写入当前相机视角`, { trajectory: true, events: true });
}

function addTimelineEvent(event, column) {
  const timelineId = column.dataset.timelineId;
  const rect = column.getBoundingClientRect();
  const localY = event.clientY - rect.top;
  const time = snapTime(state.chart, yToTime(localY));
  const definition = TIMELINE_DEFINITIONS.find((item) => item.id === timelineId);
  const value = sampleTimeline(state.chart.timelines[timelineId], time, definition.defaultValue);
  const timelineEvent = { id: crypto.randomUUID(), time, value, easing: "linear", formula: "t" };
  commitChange(() => state.chart.timelines[timelineId].push(timelineEvent), `已添加 ${definition.label} 事件`, { trajectory: true, events: true });
  state.selectedNotes.clear();
  state.selectedEvents.clear();
  state.selectedEvents.add(eventToken(timelineId, timelineEvent.id));
  renderNoteEditor();
  renderEventTimelines();
  renderInspector();
}

function eventPointerDown(event, key) {
  event.preventDefault();
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
  const timelineIds = new Set(snapshots.map((snapshot) => snapshot.timelineId));
  const metrics = Object.fromEntries([...timelineIds].map((selectedTimeline) => {
    const column = refs.eventTimelines.querySelector(`.timeline-column[data-timeline-id="${selectedTimeline}"]`);
    return [selectedTimeline, {
      range: timelineRange(state.chart.timelines[selectedTimeline]),
      width: Math.max(1, column?.getBoundingClientRect().width ?? 110)
    }];
  }));
  state.drag = {
    kind: "event",
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    snapshots,
    metrics,
    changed: false
  };
  refs.eventTimelines.setPointerCapture?.(event.pointerId);
  renderEventTimelines();
  renderInspector();
}

function eventSelectionRectangle() {
  let rectangle = document.querySelector(".event-selection-rect");
  if (!rectangle) {
    rectangle = document.createElement("div");
    rectangle.className = "event-selection-rect";
    document.body.appendChild(rectangle);
  }
  return rectangle;
}

function updateEventMarqueeSelection(drag) {
  const left = Math.min(drag.startX, drag.currentX);
  const right = Math.max(drag.startX, drag.currentX);
  const top = Math.min(drag.startY, drag.currentY);
  const bottom = Math.max(drag.startY, drag.currentY);
  state.selectedEvents = new Set(drag.additive ? drag.baseSelection : []);

  refs.eventTimelines.querySelectorAll(".event-key").forEach((key) => {
    const bounds = key.getBoundingClientRect();
    const intersects = bounds.right >= left && bounds.left <= right
      && bounds.bottom >= top && bounds.top <= bottom;
    const token = eventToken(key.dataset.timelineId, key.dataset.eventId);
    if (intersects) state.selectedEvents.add(token);
    key.classList.toggle("selected", state.selectedEvents.has(token));
  });

  const rectangle = eventSelectionRectangle();
  rectangle.style.left = `${left}px`;
  rectangle.style.top = `${top}px`;
  rectangle.style.width = `${right - left}px`;
  rectangle.style.height = `${bottom - top}px`;
  refs.selectedEventCount.textContent = state.selectedEvents.size;
}

function removeEventSelectionRectangle() {
  document.querySelector(".event-selection-rect")?.remove();
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
  if (state.drag.kind === "event-marquee") {
    const distance = Math.hypot(event.clientX - state.drag.startX, event.clientY - state.drag.startY);
    if (!state.drag.active && distance < 4) return;
    if (!state.drag.active) {
      state.drag.active = true;
      state.drag.captured = true;
      refs.eventTimelines.setPointerCapture?.(state.drag.pointerId);
    }
    state.drag.currentX = event.clientX;
    state.drag.currentY = event.clientY;
    updateEventMarqueeSelection(state.drag);
    return;
  }
  if (state.drag.kind === "create-hold") {
    const point = notePointFromEvent(event);
    state.drag.note.endTime = holdEndTimeAtY(state.drag.note, point.y);
    renderNoteEditor({ waveform: false });
    return;
  }
  if (state.drag.kind === "hold-tail") {
    const note = state.chart.notes.find((item) => item.id === state.drag.noteId);
    if (!note) return;
    const point = notePointFromEvent(event);
    const endTime = holdEndTimeAtY(note, point.y);
    state.drag.changed ||= Math.abs(endTime - state.drag.originalEndTime) > 0.0001;
    note.endTime = endTime;
    renderNoteEditor({ waveform: false });
    renderInspector();
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
    const deltaX = event.clientX - state.drag.startX;
    state.drag.changed ||= Math.hypot(deltaX, event.clientY - state.drag.startY) >= 1;
    state.drag.snapshots.forEach((snapshot) => {
      const timelineEvent = state.chart.timelines[snapshot.timelineId].find((item) => item.id === snapshot.id);
      if (!timelineEvent) return;
      const metric = state.drag.metrics[snapshot.timelineId];
      const valueSpan = metric.range.max - metric.range.min;
      timelineEvent.time = snapTime(state.chart, snapshot.time + deltaTime);
      timelineEvent.value = snapshot.value + (deltaX / (metric.width * 0.76)) * valueSpan;
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
  if (state.drag.kind === "create-hold") {
    const note = state.drag.note;
    refs.noteGrid.releasePointerCapture?.(state.drag.pointerId);
    state.drag = null;
    commitChange(() => {
      state.chart.notes.push(note);
      state.selectedEvents.clear();
      state.selectedNotes.clear();
      state.selectedNotes.add(note.id);
    }, `已放置 HOLD ${note.type} 音符`);
    return;
  }
  if (state.drag.kind === "hold-tail") {
    const drag = state.drag;
    refs.noteGrid.releasePointerCapture?.(drag.pointerId);
    state.drag = null;
    if (!drag.changed) {
      state.undo.pop();
      renderNoteEditor();
      renderInspector();
      return;
    }
    state.chart = normalizeChart(state.chart);
    setDirty(true);
    renderNoteEditor();
    renderInspector();
    rebuildPreviewNotes();
    syncGamePreviewChart();
    setStatus("已调整 Hold 尾部");
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
  if (state.drag.kind === "event-marquee") {
    const drag = state.drag;
    if (drag.captured) refs.eventTimelines.releasePointerCapture?.(drag.pointerId);
    state.drag = null;
    removeEventSelectionRectangle();
    if (!drag.active) {
      if (!drag.additive) {
        state.selectedEvents.clear();
        refs.eventTimelines.querySelectorAll(".event-key.selected")
          .forEach((key) => key.classList.remove("selected"));
        refs.selectedEventCount.textContent = "0";
      }
      renderInspector();
      setStatus("已清除事件选择");
      return;
    }
    renderEventTimelines();
    renderInspector();
    setStatus(`已框选 ${state.selectedEvents.size} 个事件`);
    return;
  }
  const drag = state.drag;
  const wasEvent = drag.kind === "event";
  if (wasEvent) refs.eventTimelines.releasePointerCapture?.(drag.pointerId);
  state.drag = null;
  if (wasEvent && !drag.changed) {
    state.undo.pop();
    renderEventTimelines();
    renderInspector();
    return;
  }
  if (!wasEvent && findDuplicateNotePlacement(state.chart.notes)) {
    const previous = state.undo.pop();
    if (previous) state.chart = normalizeChart(JSON.parse(previous));
    rebuildEverything();
    setStatus("该时间与位置已有音符，移动已取消");
    return;
  }
  state.chart = normalizeChart(state.chart);
  setDirty(true);
  if (wasEvent) rebuildTrajectory();
  renderNoteEditor();
  renderEventTimelines();
  renderInspector();
  rebuildPreviewNotes();
  syncGamePreviewChart();
  const duplicateEvent = wasEvent ? findDuplicateTimelineEvent(state.chart.timelines) : null;
  setStatus(duplicateEvent
    ? `${duplicateEvent.label}：${duplicateEvent.duplicate.time.toFixed(4)}s 已有相同值 ${duplicateEvent.duplicate.value}`
    : wasEvent ? "已移动事件" : "已移动音符");
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

function copySelection() {
  const notes = state.chart.notes.filter((note) => state.selectedNotes.has(note.id));
  if (notes.length) {
    state.clipboard = {
      kind: "notes",
      anchorTime: Math.min(...notes.map((note) => note.hitTime)),
      items: structuredClone(notes)
    };
    setStatus(`已复制 ${notes.length} 个音符`);
    return;
  }

  const events = [];
  state.selectedEvents.forEach((token) => {
    const [timelineId, id] = token.split(":");
    const timelineEvent = state.chart.timelines[timelineId]?.find((item) => item.id === id);
    if (timelineEvent) events.push({ timelineId, event: structuredClone(timelineEvent) });
  });
  if (events.length) {
    state.clipboard = {
      kind: "events",
      anchorTime: Math.min(...events.map((item) => item.event.time)),
      items: events
    };
    setStatus(`已复制 ${events.length} 个事件`);
    return;
  }

  setStatus("请先选择要复制的音符或事件");
}

function clipboardTimeDelta(anchorTime, endTime) {
  const duration = state.chart.timing.duration;
  let delta = snapTime(state.chart, state.currentTime) - anchorTime;
  if (anchorTime + delta < 0) delta = -anchorTime;
  if (endTime + delta > duration) delta -= endTime + delta - duration;
  return delta;
}

function pasteNotes(clipboard) {
  const endTime = Math.max(...clipboard.items.map((note) => note.kind === "hold" ? note.endTime : note.hitTime));
  const delta = clipboardTimeDelta(clipboard.anchorTime, endTime);
  const pasted = clipboard.items.map((source) => {
    const hitTime = Math.max(0, Math.min(state.chart.timing.duration, source.hitTime + delta));
    const note = {
      ...structuredClone(source),
      id: crypto.randomUUID(),
      hitTime
    };
    if (note.kind === "hold") {
      note.endTime = Math.max(
        hitTime + CHART_TIME_STEP,
        Math.min(state.chart.timing.duration, source.endTime + delta)
      );
    }
    return note;
  });

  commitChange(() => {
    state.chart.notes.push(...pasted);
    state.selectedEvents.clear();
    state.selectedNotes = new Set(pasted.map((note) => note.id));
  }, `已粘贴 ${pasted.length} 个音符`);
}

function pasteEvents(clipboard) {
  const endTime = Math.max(...clipboard.items.map((item) => item.event.time));
  const delta = clipboardTimeDelta(clipboard.anchorTime, endTime);
  const pasted = clipboard.items.map(({ timelineId, event }) => ({
    timelineId,
    event: {
      ...structuredClone(event),
      id: crypto.randomUUID(),
      time: Math.max(0, Math.min(state.chart.timing.duration, event.time + delta))
    }
  }));

  commitChange(() => {
    pasted.forEach(({ timelineId, event }) => state.chart.timelines[timelineId].push(event));
    state.selectedNotes.clear();
    state.selectedEvents = new Set(pasted.map(({ timelineId, event }) => eventToken(timelineId, event.id)));
  }, `已粘贴 ${pasted.length} 个事件`, { trajectory: true, events: true });
}

function pasteClipboard() {
  if (!state.clipboard?.items?.length) {
    setStatus("剪贴板中没有音符或事件");
    return;
  }
  if (state.clipboard.kind === "notes") pasteNotes(state.clipboard);
  else if (state.clipboard.kind === "events") pasteEvents(state.clipboard);
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
    $("#inspect-note-time").value = note.hitTime.toFixed(4);
    $("#inspect-note-end").value = (note.endTime ?? note.hitTime + 1).toFixed(4);
    $("#inspect-note-wpos").value = note.wPos.toFixed(3);
    $("#inspect-note-end-row").hidden = note.kind !== "hold";
    $("#inspect-note-wpos-row").hidden = note.type !== "middle";
  } else if (timelineSelection) {
    const definition = TIMELINE_DEFINITIONS.find((item) => item.id === timelineSelection.timelineId);
    $("#inspect-event-title").textContent = definition.label;
    $("#inspect-event-time").value = timelineSelection.event.time.toFixed(4);
    $("#inspect-event-value").value = timelineSelection.event.value.toFixed(4);
    $("#inspect-event-easing").value = timelineSelection.event.easing;
    $("#inspect-event-formula").value = timelineSelection.event.formula ?? "t";
    refs.formulaRow.hidden = timelineSelection.event.easing !== "formula";
  }
}

function selectedBpmRange() {
  const keys = state.chart.timing.bpmKeys;
  const index = keys.findIndex((key) => key.id === state.selectedBpmKey);
  return index >= 0 ? { index, key: keys[index], next: keys[index + 1] ?? null } : null;
}

function estimatedRampBeats(key, next) {
  return Math.max(1, Math.round((next.time - key.time) * (key.bpm + next.bpm) / 120));
}

function rampIssueFor(key) {
  const range = selectedBpmRange();
  return range?.key === key
    ? state.tempoMap.issues.find((issue) => issue.keyIndex === range.index) ?? null
    : null;
}

function renderBpmRampCurve(key, next) {
  refs.bpmRampCurve.replaceChildren();
  const tempoMap = state.tempoMap;
  const samples = Array.from({ length: 81 }, (_, index) => {
    const time = key.time + (next.time - key.time) * index / 80;
    return { time, bpm: bpmAt(state.chart, time, tempoMap) };
  });
  const values = samples.map((sample) => sample.bpm);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = Math.max(2, (max - min) * 0.12);
  const rangeMin = Math.max(0, min - padding);
  const rangeMax = max + padding;
  const pointAt = (time, bpm) => ({
    x: (time - key.time) / Math.max(0.000001, next.time - key.time) * 300,
    y: 78 - (bpm - rangeMin) / Math.max(0.000001, rangeMax - rangeMin) * 72
  });
  for (let index = 1; index < 4; index += 1) {
    const y = index * 84 / 4;
    refs.bpmRampCurve.appendChild(makeSvg("line", { class: "ramp-grid", x1: 0, x2: 300, y1: y, y2: y }));
  }
  const path = samples.map((sample, index) => {
    const point = pointAt(sample.time, sample.bpm);
    return `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  }).join(" ");
  refs.bpmRampCurve.appendChild(makeSvg("path", { class: "ramp-path", d: path }));
  key.ramp.anchors.forEach((anchor) => {
    const point = pointAt(anchor.time, bpmAt(state.chart, anchor.time, tempoMap));
    refs.bpmRampCurve.appendChild(makeSvg("circle", {
      class: "ramp-anchor",
      cx: point.x,
      cy: point.y,
      r: 3.5
    }));
  });
  const issue = rampIssueFor(key);
  refs.bpmRampStatus.classList.toggle("warning", Boolean(issue));
  refs.bpmRampStatus.textContent = issue
    ? issue.reason
    : `${key.ramp.anchors.length} 个关键拍 · ${min.toFixed(2)}–${max.toFixed(2)} BPM · 单调可行`;
  refs.bpmRampRepair.hidden = !issue;
}

function renderBpmRampEditor(selected, syncEditor = true) {
  const keys = state.chart.timing.bpmKeys;
  const index = selected ? keys.indexOf(selected) : -1;
  const next = index >= 0 ? keys[index + 1] : null;
  refs.bpmRampEditor.hidden = !selected;
  if (!selected) return;
  refs.bpmRampControls.hidden = false;
  const hasRange = Boolean(next);
  $("#toggle-bpm-ramp").disabled = !hasRange;
  refs.bpmRampBeats.disabled = !selected.ramp;
  $("#add-ramp-beat").disabled = !selected.ramp;
  $("#add-ramp-bar").disabled = !selected.ramp;
  refs.bpmRampCurve.hidden = !selected.ramp;
  refs.bpmRampStatus.hidden = !selected.ramp;
  refs.bpmRampRepair.hidden = true;
  refs.bpmRampAnchorList.replaceChildren();
  if (!next) {
    refs.bpmRampRange.textContent = "后面没有 BpmKey";
    $("#toggle-bpm-ramp").textContent = "创建变速";
    return;
  }
  refs.bpmRampRange.textContent = `${formatTime(selected.time)} → ${formatTime(next.time)} · ${next.bpm.toFixed(2)} BPM`;
  $("#toggle-bpm-ramp").textContent = selected.ramp ? "删除变速" : "创建变速";
  if (!selected.ramp) {
    refs.bpmRampBeats.value = estimatedRampBeats(selected, next);
    return;
  }
  if (syncEditor) refs.bpmRampBeats.value = selected.ramp.beats;
  selected.ramp.anchors.forEach((anchor) => {
    const item = document.createElement("div");
    const isBar = anchor.kind === "bar";
    const position = isBar ? anchor.position : anchor.beat;
    const maxPosition = isBar
      ? Math.max(1, Math.floor((selected.ramp.beats - 1) / selected.beatsPerBar))
      : selected.ramp.beats - 1;
    item.className = "bpm-ramp-anchor";
    item.dataset.anchorId = anchor.id;
    item.innerHTML = `
      <small>${isBar ? "小节" : "节拍"}</small>
      <input class="ramp-anchor-beat" type="number" min="1" max="${maxPosition}" step="1" value="${position}" aria-label="${isBar ? "相对小节数" : "相对拍数"}">
      <input class="ramp-anchor-time" type="number" min="${selected.time + CHART_TIME_STEP}" max="${next.time - CHART_TIME_STEP}" step="${CHART_TIME_STEP}" value="${anchor.time.toFixed(4)}" aria-label="锚点时间">
      <button class="remove-ramp-anchor" type="button" aria-label="删除变速锚点">×</button>`;
    refs.bpmRampAnchorList.appendChild(item);
  });
  renderBpmRampCurve(selected, next);
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
    item.innerHTML = `<strong>${formatTime(key.time)}</strong><strong>${key.bpm.toFixed(2)} BPM</strong><span>${key.beatsPerBar}/4</span><span>${key.ramp ? "自动变速" : "双击跳转"}</span>`;
    refs.bpmList.appendChild(item);
  });
  const selected = keys.find((key) => key.id === state.selectedBpmKey);
  refs.bpmKeyEditor.hidden = !selected;
  if (selected && syncEditor) {
    refs.bpmKeyTime.value = selected.time.toFixed(4);
    refs.bpmValue.value = selected.bpm;
    refs.bpmBeatsPerBar.value = selected.beatsPerBar;
  }
  renderBpmRampEditor(selected, syncEditor);
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
  renderDifficultyManager();
}

function rebuildEverything() {
  refreshTempoMap();
  rebuildTrajectory();
  renderNoteEditor();
  renderEventTimelines();
  renderInspector();
  renderBpmKeys();
  renderEffects();
  updateTimeUi(false);
  syncGamePreviewChart();
  resetHitSoundSchedule(state.currentTime);
}

// Time and audio
const HIT_SOUND_LOOKAHEAD_SECONDS = editorConfig.audio.hitSoundLookaheadSeconds;
const HIT_SOUND_TIME_EPSILON = HALF_TIME_STEP;

function firstNoteAtOrAfter(time) {
  const notes = state.chart.notes;
  let low = 0;
  let high = notes.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (notes[middle].hitTime < time) low = middle + 1;
    else high = middle;
  }
  return low;
}

function resetHitSoundSchedule(time = state.currentTime, includeCurrent = false) {
  hitSounds.stopAll();
  const threshold = time + (includeCurrent ? -HIT_SOUND_TIME_EPSILON : HIT_SOUND_TIME_EPSILON);
  state.hitSoundCursor = firstNoteAtOrAfter(threshold);
  state.hitSoundScheduledThrough = time;
}

function scheduleHitSounds(time) {
  if (hitSounds.volume <= 0 || !state.playing) return;

  const jumpedForward = time > state.hitSoundScheduledThrough + 0.05;
  const jumpedBackward = time < state.hitSoundScheduledThrough - HIT_SOUND_LOOKAHEAD_SECONDS - 0.05;
  if (jumpedForward || jumpedBackward) resetHitSoundSchedule(time);

  const horizon = Math.min(state.chart.timing.duration, time + HIT_SOUND_LOOKAHEAD_SECONDS);
  const notes = state.chart.notes;
  const context = hitSounds.ensureContext();
  if (!context) return;

  while (state.hitSoundCursor < notes.length) {
    const hitTime = notes[state.hitSoundCursor].hitTime;
    if (hitTime > horizon + HIT_SOUND_TIME_EPSILON) break;

    // A chord is one timing cue. Skip every other note at the same hitTime.
    hitSounds.playJudgement("prime", context.currentTime + Math.max(0, hitTime - time));
    state.hitSoundCursor += 1;
    while (
      state.hitSoundCursor < notes.length
      && Math.abs(notes[state.hitSoundCursor].hitTime - hitTime) <= HIT_SOUND_TIME_EPSILON
    ) state.hitSoundCursor += 1;
  }
  state.hitSoundScheduledThrough = horizon;
}

function ensureEditorAudioRouting() {
  const context = hitSounds.ensureContext();
  if (!context || editorAudioSource) return context;
  editorAudioSource = context.createMediaElementSource(refs.audio);
  editorAudioSource.connect(context.destination);
  return context;
}

function ensureHitSoundsReady() {
  if (hitSoundReadyPromise) return hitSoundReadyPromise;
  ensureEditorAudioRouting();
  hitSoundReadyPromise = Promise.all([hitSounds.unlock(), hitSounds.preload()]).catch((error) => {
    hitSoundReadyPromise = null;
    console.warn("Could not initialize editor hit sounds.", error);
  });
  return hitSoundReadyPromise;
}

function updateHitSoundVolume() {
  const wasSilent = hitSounds.volume <= 0;
  const volume = Number(refs.hitSoundVolume.value);
  hitSounds.setVolume(volume);
  if (volume <= 0) {
    resetHitSoundSchedule();
    return;
  }
  ensureHitSoundsReady().then(() => {
    if (wasSilent) resetHitSoundSchedule(state.currentTime, state.playing);
  });
}

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
  refs.currentBpm.textContent = bpmAt(state.chart, state.currentTime, state.tempoMap).toFixed(2);
  refs.currentBeats.textContent = String(activeBpmKey.beatsPerBar);
  updateTimelineCurrentValues();
  updateCameraState();
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
    resetHitSoundSchedule();
    refs.playToggle.textContent = "▶";
    return;
  }
  if (hitSounds.volume > 0) await ensureHitSoundsReady();
  state.playing = true;
  state.playStartedAt = performance.now() / 1000;
  state.playStartedChartTime = state.currentTime;
  resetHitSoundSchedule(state.currentTime, true);
  refs.playToggle.textContent = "❚❚";
  if (refs.audio.src) {
    refs.audio.currentTime = state.currentTime;
    try {
      await refs.audio.play();
    } catch {
      state.playing = false;
      refs.playToggle.textContent = "▶";
      resetHitSoundSchedule();
    }
  }
}

function stopPlayback() {
  state.playing = false;
  refs.audio.pause();
  resetHitSoundSchedule(0);
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

async function snapshotSourceFile(file) {
  const bytes = await file.arrayBuffer();
  return {
    bytes,
    file: new File([bytes], file.name, {
      type: file.type || fileMimeType(file.name),
      lastModified: file.lastModified || Date.now()
    })
  };
}

async function loadAudio(file, { updateChart = true } = {}) {
  if (!file) return;
  const source = await snapshotSourceFile(file);
  if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
  state.audioSourceFile = source.file;
  state.audioUrl = URL.createObjectURL(source.file);
  refs.audio.src = state.audioUrl;
  const context = new AudioContext();
  const buffer = await context.decodeAudioData(source.bytes.slice(0));
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
  if (updateChart) {
    commitChange(() => {
      state.chart.meta.audioFile = file.name;
      state.chart.timing.duration = buffer.duration;
    }, `已加载音乐 ${file.name}`, { trajectory: true });
  } else {
    state.chart.meta.audioFile ||= file.name;
    renderNoteEditor();
    setStatus(`已加载音乐 ${file.name}`);
  }
  syncChartControls();
}

async function loadCover(file, { updateChart = true } = {}) {
  if (!file) return;
  const source = await snapshotSourceFile(file);
  if (state.coverUrl) URL.revokeObjectURL(state.coverUrl);
  state.coverSourceFile = source.file;
  state.coverUrl = URL.createObjectURL(source.file);
  state.chart.meta.cover = file.name;
  if (updateChart) setDirty(true);
  syncGamePreviewChart();
  setStatus(`已加载曲绘 ${file.name}`);
}

// Persistence
function syncMetaFromControls() {
  const metaDefaults = CONFIG.chart.defaults.meta;
  state.chart.meta.title = refs.title.value.trim() || metaDefaults.title;
  state.chart.meta.composer = refs.composer.value.trim() || metaDefaults.composer;
  state.chart.meta.charter = refs.charter.value.trim() || metaDefaults.charter;
  state.chart.meta.illustrator = refs.illustrator.value.trim() || metaDefaults.illustrator;
  state.chart.meta.difficultyLabel = refs.difficultyLabel.value.trim() || metaDefaults.difficultyLabel;
  state.chart.meta.level = Math.max(0, Math.round(Number(refs.level.value) || 0));
  updateCurrentDifficultyEntry();
}

function safeFileName(value, fallback) {
  const safe = String(value ?? "").trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
  return safe || fallback;
}

function chartFileName() {
  if (state.projectChartFile) return state.projectChartFile;
  const label = safeFileName(state.chart.meta.difficultyLabel.toLowerCase(), `chart-${state.chart.meta.level}`);
  return `${label}.json`;
}

function uniqueChartFileName(label, level) {
  const base = safeFileName(String(label).toLowerCase(), `chart-${level}`);
  const used = new Set([
    ...state.projectCharts.keys(),
    ...(state.projectMeta?.charts ?? []).map((entry) => entry.file)
  ]);
  let name = `${base}.json`;
  for (let suffix = 2; used.has(name); suffix += 1) name = `${base}-${suffix}.json`;
  return name;
}

function difficultyEntry(file, chart) {
  return {
    file,
    difficultyLabel: chart.meta.difficultyLabel,
    level: chart.meta.level,
    charter: chart.meta.charter
  };
}

function renderDifficultyManager() {
  const entries = state.projectMeta?.charts?.length
    ? state.projectMeta.charts
    : [difficultyEntry(state.projectChartFile ?? "", state.chart)];
  refs.difficultySelect.replaceChildren(...entries.map((entry) => {
    const option = document.createElement("option");
    option.value = entry.file;
    option.textContent = `${entry.difficultyLabel} ${entry.level}`;
    return option;
  }));
  refs.difficultySelect.value = state.projectChartFile ?? entries[0]?.file ?? "";
  $("#remove-difficulty").disabled = entries.length <= 1;
}

function updateCurrentDifficultyEntry() {
  if (!state.projectChartFile || !state.projectMeta) {
    renderDifficultyManager();
    return;
  }
  const entry = difficultyEntry(state.projectChartFile, state.chart);
  const index = state.projectMeta.charts.findIndex((item) => item.file === state.projectChartFile);
  if (index >= 0) state.projectMeta.charts[index] = entry;
  else state.projectMeta.charts.push(entry);
  renderDifficultyManager();
}

function ensureCurrentDifficultyRegistered() {
  if (!state.projectChartFile) {
    state.projectChartFile = uniqueChartFileName(state.chart.meta.difficultyLabel, state.chart.meta.level);
  }
  state.projectMeta ??= { format: "particlesoar-song@1", charts: [] };
  state.projectMeta.charts ??= [];
  updateCurrentDifficultyEntry();
}

function cacheCurrentDifficulty() {
  syncMetaFromControls();
  ensureCurrentDifficultyRegistered();
  state.projectCharts.set(state.projectChartFile, structuredClone(state.chart));
}

function activateDifficulty(file, message, preserveDirty = state.dirty) {
  const chart = state.projectCharts.get(file);
  if (!chart) return;
  state.projectChartFile = file;
  state.chart = normalizeChart(structuredClone(chart));
  state.currentTime = 0;
  state.selectedNotes.clear();
  state.selectedEvents.clear();
  state.undo.length = 0;
  state.redo.length = 0;
  syncChartControls();
  rebuildEverything();
  setDirty(preserveDirty);
  renderDifficultyManager();
  if (message) setStatus(message);
}

function blankDifficultyChart() {
  const current = state.chart;
  const blank = normalizeChart(createDefaultChart());
  blank.meta = {
    ...blank.meta,
    title: current.meta.title,
    composer: current.meta.composer,
    illustrator: current.meta.illustrator,
    audioFile: current.meta.audioFile,
    cover: current.meta.cover
  };
  blank.timing.duration = current.timing.duration;
  blank.timing.offset = current.timing.offset;
  blank.timing.subdivision = current.timing.subdivision;
  blank.timing.wPosDivision = current.timing.wPosDivision;
  blank.timing.bpmKeys = structuredClone(current.timing.bpmKeys);
  blank.playfield = structuredClone(current.playfield);
  blank.notes = [];
  blank.effects = [];
  return normalizeChart(blank);
}

function exportChartJson() {
  syncMetaFromControls();
  const blob = new Blob([JSON.stringify(compactChart(state.chart))], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = chartFileName();
  anchor.click();
  URL.revokeObjectURL(url);
  setDirty(false);
  setStatus("已导出单谱面 JSON");
}

function hasProjectDirectoryApi() {
  return "showDirectoryPicker" in window;
}

async function writableProjectDirectory() {
  if (!state.projectDirectory) {
    state.projectDirectory = await window.showDirectoryPicker({
      id: "particlesoar-chart-project",
      mode: "readwrite"
    });
  }
  if (state.projectDirectory.requestPermission) {
    const permission = await state.projectDirectory.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") throw new DOMException("工程文件夹没有写入权限", "NotAllowedError");
  }
  refs.projectLocation.textContent = state.projectDirectory.name;
  return state.projectDirectory;
}

async function readProjectJson(directory, name) {
  const handle = await directory.getFileHandle(name);
  return JSON.parse(await (await handle.getFile()).text());
}

async function writeProjectFile(directory, name, contents) {
  const handle = await directory.getFileHandle(safeFileName(name, "file"), { create: true });
  const writable = await handle.createWritable();
  await writable.write(contents);
  await writable.close();
}

async function materializeProjectEntries(entries) {
  return Promise.all(entries.map(async (entry) => ({
    name: entry.name,
    contents: typeof entry.contents === "string" || entry.contents instanceof ArrayBuffer
      ? entry.contents
      : ArrayBuffer.isView(entry.contents)
        ? entry.contents.buffer.slice(entry.contents.byteOffset, entry.contents.byteOffset + entry.contents.byteLength)
        : await entry.contents.arrayBuffer()
  })));
}

function rebuildProjectMeta() {
  const previousOrder = (state.projectMeta?.charts ?? []).map((entry) => entry.file);
  const files = [
    ...previousOrder.filter((file) => state.projectCharts.has(file)),
    ...[...state.projectCharts.keys()].filter((file) => !previousOrder.includes(file))
  ];
  return {
    format: "particlesoar-song@1",
    title: state.chart.meta.title,
    composer: state.chart.meta.composer,
    illustrator: state.chart.meta.illustrator,
    ...(state.chart.meta.audioFile ? { audio: state.chart.meta.audioFile } : {}),
    ...(state.chart.meta.cover ? { cover: state.chart.meta.cover } : {}),
    charts: files.map((file) => difficultyEntry(file, state.projectCharts.get(file)))
  };
}

async function collectProjectEntries() {
  cacheCurrentDifficulty();
  if (state.audioSourceFile) {
    state.chart.meta.audioFile = safeFileName(state.chart.meta.audioFile || state.audioSourceFile.name, "audio.ogg");
  }
  if (state.coverSourceFile) {
    state.chart.meta.cover = safeFileName(state.chart.meta.cover || state.coverSourceFile.name, "cover.webp");
  }
  for (const [file, chart] of state.projectCharts) {
    chart.meta.title = state.chart.meta.title;
    chart.meta.composer = state.chart.meta.composer;
    chart.meta.illustrator = state.chart.meta.illustrator;
    if (state.chart.meta.audioFile) chart.meta.audioFile = state.chart.meta.audioFile;
    else delete chart.meta.audioFile;
    if (state.chart.meta.cover) chart.meta.cover = state.chart.meta.cover;
    else delete chart.meta.cover;
    state.projectCharts.set(file, chart);
  }
  state.projectMeta = rebuildProjectMeta();
  renderDifficultyManager();
  return [
    { name: "meta.json", contents: JSON.stringify(state.projectMeta, null, 2) },
    ...[...state.projectCharts].map(([name, chart]) => ({ name, contents: JSON.stringify(compactChart(chart)) })),
    ...(state.audioSourceFile ? [{ name: state.chart.meta.audioFile, contents: state.audioSourceFile }] : []),
    ...(state.coverSourceFile ? [{ name: state.chart.meta.cover, contents: state.coverSourceFile }] : [])
  ];
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function saveProject() {
  try {
    const entries = await collectProjectEntries();
    if (hasProjectDirectoryApi()) {
      const directory = await writableProjectDirectory();
      // Resolve every source before replacing any destination file. In particular,
      // An opened project's audio and cover may have originated in this directory.
      const materializedEntries = await materializeProjectEntries(entries);
      for (const entry of materializedEntries) await writeProjectFile(directory, entry.name, entry.contents);
      refs.projectLocation.textContent = directory.name;
      setStatus(`工程已保存：${directory.name}/${state.projectChartFile}`);
    } else {
      const archive = await createProjectZip(entries);
      const name = `${safeFileName(state.chart.meta.title, "ParticleSoar-song")}.zip`;
      downloadBlob(archive, name);
      refs.projectLocation.textContent = `${name} · PACKAGE`;
      setStatus(`工程包已保存：${name}`);
    }
    setDirty(false);
  } catch (error) {
    if (error?.name === "AbortError") setStatus("已取消选择工程文件夹");
    else setStatus(`工程保存失败：${error.message}`);
  }
}

function clearProjectResources() {
  if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
  if (state.coverUrl) URL.revokeObjectURL(state.coverUrl);
  state.audioUrl = null;
  state.coverUrl = null;
  state.audioSourceFile = null;
  state.coverSourceFile = null;
  state.waveformPeaks = null;
  state.waveformPitch = null;
  refs.audio.pause();
  refs.audio.removeAttribute("src");
  refs.audio.load();
}

function clearProjectContext() {
  state.projectDirectory = null;
  state.projectMeta = null;
  state.projectChartFile = null;
  state.projectCharts = new Map();
  refs.projectLocation.textContent = "NO PROJECT";
  clearProjectResources();
}

async function applyLoadedChart(chart, label) {
  state.undo.push(snapshot());
  state.chart = normalizeChart(chart);
  state.selectedNotes.clear();
  state.selectedEvents.clear();
  state.currentTime = 0;
  syncChartControls();
  rebuildEverything();
  setDirty(false);
  setStatus(`已加载 ${label}`);
}

async function openProject() {
  if (!hasProjectDirectoryApi()) {
    refs.projectPackage.click();
    return;
  }
  try {
    const directory = await window.showDirectoryPicker({
      id: "particlesoar-chart-project",
      mode: "readwrite"
    });
    const meta = await readProjectJson(directory, "meta.json");
    const charts = Array.isArray(meta.charts) ? meta.charts : [];
    if (!charts.length) throw new Error("meta.json 中没有难度谱面");
    const entry = charts.find((item) => item.difficultyLabel === state.chart.meta.difficultyLabel) ?? charts[0];
    const loadedCharts = new Map();
    for (const chartEntry of charts) {
      loadedCharts.set(chartEntry.file, normalizeChart(await readProjectJson(directory, chartEntry.file)));
    }
    clearProjectResources();
    state.projectDirectory = directory;
    state.projectMeta = meta;
    state.projectCharts = loadedCharts;
    refs.projectLocation.textContent = directory.name;
    activateDifficulty(entry.file, null, false);
    if (meta.audio) {
      const audio = await (await directory.getFileHandle(meta.audio)).getFile();
      await loadAudio(audio, { updateChart: false });
    }
    const coverName = meta.cover;
    if (coverName) {
      const cover = await (await directory.getFileHandle(coverName)).getFile();
      await loadCover(cover, { updateChart: false });
    }
    setDirty(false);
    setStatus(`工程已打开：${directory.name}/${entry.file}`);
  } catch (error) {
    if (error?.name === "AbortError") setStatus("已取消打开工程");
    else setStatus(`工程打开失败：${error.message}`);
  }
}

function fileMimeType(name) {
  const extension = name.split(".").pop()?.toLowerCase();
  return ({
    mp3: "audio/mpeg",
    ogg: "audio/ogg",
    wav: "audio/wav",
    flac: "audio/flac",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp"
  })[extension] ?? "application/octet-stream";
}

async function loadProjectPackage(file) {
  if (!file) return;
  try {
    const files = await readProjectZip(file);
    const meta = projectJson(files, "meta.json");
    const charts = Array.isArray(meta.charts) ? meta.charts : [];
    if (!charts.length) throw new Error("meta.json 中没有难度谱面");
    const entry = charts.find((item) => item.difficultyLabel === state.chart.meta.difficultyLabel) ?? charts[0];
    const loadedCharts = new Map(charts.map((chartEntry) => [chartEntry.file, normalizeChart(projectJson(files, chartEntry.file))]));
    clearProjectContext();
    state.projectMeta = meta;
    state.projectCharts = loadedCharts;
    refs.projectLocation.textContent = `${file.name} · PACKAGE`;
    activateDifficulty(entry.file, null, false);
    if (meta.audio && files.has(meta.audio)) {
      await loadAudio(new File([files.get(meta.audio)], meta.audio, { type: fileMimeType(meta.audio) }), { updateChart: false });
    }
    const coverName = meta.cover;
    if (coverName && files.has(coverName)) {
      await loadCover(new File([files.get(coverName)], coverName, { type: fileMimeType(coverName) }), { updateChart: false });
    }
    setDirty(false);
    setStatus(`工程包已打开：${file.name}/${entry.file}`);
  } catch (error) {
    setStatus(`工程包打开失败：${error.message}`);
  } finally {
    refs.projectPackage.value = "";
  }
}

async function loadChartFile(file) {
  if (!file) return;
  clearProjectContext();
  await applyLoadedChart(JSON.parse(await file.text()), file.name);
}

function nextDifficultyLabel() {
  const used = new Set((state.projectMeta?.charts ?? []).map((entry) => entry.difficultyLabel.toUpperCase()));
  return ["EZ", "HD", "HS", "IN", "AT"].find((label) => !used.has(label)) ?? "NEW";
}

function openDifficultyDialog() {
  cacheCurrentDifficulty();
  refs.newDifficultyLabel.value = nextDifficultyLabel();
  refs.newDifficultyLevel.value = state.chart.meta.level;
  refs.newDifficultyCharter.value = state.chart.meta.charter;
  refs.difficultyForm.querySelector("input[name='difficulty-source'][value='blank']").checked = true;
  refs.difficultyDialog.showModal();
  refs.newDifficultyLabel.select();
}

function createDifficultyFromDialog() {
  const label = refs.newDifficultyLabel.value.trim().replace(/^-+|-+$/g, "");
  const level = Math.max(0, Math.round(Number(refs.newDifficultyLevel.value) || 0));
  const charter = refs.newDifficultyCharter.value.trim() || CONFIG.chart.defaults.meta.charter;
  if (!label) {
    setStatus("难度标识不能为空");
    return false;
  }
  const duplicate = (state.projectMeta?.charts ?? []).some((entry) =>
    entry.difficultyLabel.toLowerCase() === label.toLowerCase()
  );
  if (duplicate) {
    setStatus(`难度 ${label} 已存在`);
    return false;
  }
  cacheCurrentDifficulty();
  const source = refs.difficultyForm.querySelector("input[name='difficulty-source']:checked")?.value;
  const chart = source === "copy" ? normalizeChart(structuredClone(state.chart)) : blankDifficultyChart();
  chart.meta.difficultyLabel = label;
  chart.meta.level = level;
  chart.meta.charter = charter;
  const file = uniqueChartFileName(label, level);
  state.projectCharts.set(file, chart);
  state.projectMeta.charts.push(difficultyEntry(file, chart));
  activateDifficulty(file, `已创建难度 ${label} ${level}`, true);
  setDirty(true);
  return true;
}

function removeCurrentDifficulty() {
  const entries = state.projectMeta?.charts ?? [];
  if (entries.length <= 1 || !state.projectChartFile) return;
  const currentIndex = entries.findIndex((entry) => entry.file === state.projectChartFile);
  const current = entries[currentIndex];
  if (!window.confirm(`从工程中移除难度 ${current.difficultyLabel} ${current.level}？\n磁盘上的旧 JSON 不会立即删除。`)) return;
  state.projectCharts.delete(current.file);
  entries.splice(currentIndex, 1);
  const next = entries[Math.min(currentIndex, entries.length - 1)];
  activateDifficulty(next.file, `已从工程移除难度 ${current.difficultyLabel}`, true);
  setDirty(true);
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
  if (noteElement) {
    if (event.target.closest(".hold-tail-handle")) holdTailPointerDown(event, noteElement);
    else notePointerDown(event, noteElement);
  }
  else if (state.noteKind === "hold" && !event.shiftKey) startHoldCreation(event);
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
  if (event.button !== 0) return;
  const key = event.target.closest(".event-key");
  if (key) {
    eventPointerDown(event, key);
    return;
  }
  state.selectedNotes.clear();
  renderNoteEditor();
  state.drag = {
    kind: "event-marquee",
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    currentX: event.clientX,
    currentY: event.clientY,
    additive: event.shiftKey,
    baseSelection: new Set(state.selectedEvents),
    active: false,
    captured: false
  };
});

window.addEventListener("pointermove", handlePointerMove);
window.addEventListener("pointerup", handlePointerUp);
window.addEventListener("pointercancel", handlePointerUp);

function synchronizeTimelineScroll(source, target) {
  const sharedTop = Math.min(
    source.scrollTop,
    Math.max(0, source.scrollHeight - source.clientHeight),
    Math.max(0, target.scrollHeight - target.clientHeight)
  );
  source.scrollTop = sharedTop;
  target.scrollTop = sharedTop;
}

refs.noteScroll.addEventListener("scroll", () => {
  if (state.syncingScroll) return;
  state.syncingScroll = true;
  synchronizeTimelineScroll(refs.noteScroll, refs.eventTimelines);
  state.syncingScroll = false;
});

refs.eventTimelines.addEventListener("scroll", () => {
  if (state.syncingScroll) return;
  state.syncingScroll = true;
  synchronizeTimelineScroll(refs.eventTimelines, refs.noteScroll);
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

$("#copy-selection").addEventListener("click", copySelection);
$("#paste-selection").addEventListener("click", pasteClipboard);

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
  if (!state.selectedEvents.size) return;
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
  }, "已批量修改事件", { trajectory: true, events: true });
});

function deleteSelectedEvents() {
  if (!state.selectedEvents.size) return;
  const selected = new Set(state.selectedEvents);
  commitChange(() => {
    selected.forEach((token) => {
      const [timelineId, id] = token.split(":");
      state.chart.timelines[timelineId] = state.chart.timelines[timelineId]
        .filter((item) => item.id !== id);
    });
    state.selectedEvents.clear();
  }, `已删除 ${selected.size} 个事件`, { trajectory: true });
}

$("#delete-event-selection").addEventListener("click", deleteSelectedEvents);

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
    if (note.kind === "hold") note.endTime = Math.min(state.chart.timing.duration, note.hitTime + Math.max(CHART_TIME_STEP, duration));
  }, "音符时间已更新", { notes: true });
});

$("#inspect-note-end").addEventListener("input", (event) => {
  const value = inputNumber(event.target);
  const note = selectedNote();
  if (value === null || !note || note.kind !== "hold") return;
  applyContinuousChange(event.target, `note:${note.id}:endTime`, () => {
    note.endTime = Math.min(state.chart.timing.duration, Math.max(note.hitTime + CHART_TIME_STEP, value));
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
  const existing = state.chart.timing.bpmKeys.find((key) => Math.abs(key.time - state.currentTime) < HALF_TIME_STEP);
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
    bpm: bpmAt(state.chart, state.currentTime),
    beatsPerBar: active.beatsPerBar
  };
  state.selectedBpmKey = key.id;
  commitChange(() => {
    delete active.ramp;
    state.chart.timing.bpmKeys.push(key);
  }, "已添加 BPM Key");
  updateTimeUi(false);
});

$("#remove-bpm-key").addEventListener("click", () => {
  if (!state.selectedBpmKey || state.chart.timing.bpmKeys.length <= 1) return;
  const removedId = state.selectedBpmKey;
  commitChange(() => {
    const index = state.chart.timing.bpmKeys.findIndex((key) => key.id === removedId);
    if (index > 0) delete state.chart.timing.bpmKeys[index - 1].ramp;
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
    const keys = state.chart.timing.bpmKeys;
    const index = keys.indexOf(key);
    const minimum = index > 0 ? keys[index - 1].time + CHART_TIME_STEP : 0;
    const maximum = index < keys.length - 1
      ? keys[index + 1].time - CHART_TIME_STEP
      : state.chart.timing.duration;
    key.time = Math.max(minimum, Math.min(maximum, value));
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

function applyRampContinuousChange(control, key, mutator, message) {
  beginContinuousEdit(control, key);
  mutator();
  state.chart = normalizeChart(state.chart);
  refreshTempoMap();
  setDirty(true);
  renderNoteEditor();
  renderEventTimelines();
  const range = selectedBpmRange();
  if (range?.key.ramp && range.next) renderBpmRampCurve(range.key, range.next);
  scheduleGamePreviewChartSync();
  updateTimeUi(false);
  setStatus(message);
}

$("#toggle-bpm-ramp").addEventListener("click", () => {
  const range = selectedBpmRange();
  if (!range?.next) return;
  const removing = Boolean(range.key.ramp);
  commitChange(() => {
    if (removing) delete range.key.ramp;
    else range.key.ramp = { beats: estimatedRampBeats(range.key, range.next), anchors: [] };
  }, removing ? "已删除自动变速段" : "已创建自动变速段");
});

refs.bpmRampBeats.addEventListener("input", (event) => {
  const value = inputNumber(event.target);
  const range = selectedBpmRange();
  if (value === null || !range?.key.ramp) return;
  applyRampContinuousChange(event.target, `ramp:${range.key.id}:beats`, () => {
    range.key.ramp.beats = Math.max(1, Math.round(value));
  }, "变速段总拍数已更新");
});

function addRampAnchor(kind) {
  const range = selectedBpmRange();
  if (!range?.next || !range.key.ramp) return;
  if (state.currentTime <= range.key.time + HALF_TIME_STEP || state.currentTime >= range.next.time - HALF_TIME_STEP) {
    setStatus("请将播放位置放在所选 BpmKey 与下一个 BpmKey 之间");
    return;
  }
  const detected = nearestRampAnchorAtTime(
    state.chart,
    range.index,
    state.currentTime,
    kind,
    state.tempoMap
  );
  if (!detected) {
    setStatus(kind === "bar" ? "该变速段内没有可用的小节位置" : "该变速段内没有可用的节拍位置");
    return;
  }
  if (range.key.ramp.anchors.some((anchor) => anchor.beat === detected.beat)) {
    setStatus(`第 ${detected.beat} 拍已经有关键拍`);
    return;
  }
  const anchor = { id: crypto.randomUUID(), ...detected };
  const keyId = range.key.id;
  commitChange(() => {
    const key = state.chart.timing.bpmKeys.find((candidate) => candidate.id === keyId);
    if (!key?.ramp) return;
    key.ramp.anchors.push(anchor);
  }, kind === "bar"
    ? `已识别并记录第 ${anchor.position} 小节`
    : `已识别并记录第 ${anchor.beat} 拍`);
}

$("#add-ramp-beat").addEventListener("click", () => addRampAnchor("beat"));
$("#add-ramp-bar").addEventListener("click", () => addRampAnchor("bar"));

refs.bpmRampAnchorList.addEventListener("input", (event) => {
  const item = event.target.closest(".bpm-ramp-anchor");
  const range = selectedBpmRange();
  const anchor = range?.key.ramp?.anchors.find((candidate) => candidate.id === item?.dataset.anchorId);
  const value = inputNumber(event.target);
  if (!anchor || value === null) return;
  if (event.target.classList.contains("ramp-anchor-beat")) {
    applyRampContinuousChange(event.target, `ramp:${range.key.id}:${anchor.id}:beat`, () => {
      const maxPosition = anchor.kind === "bar"
        ? Math.max(1, Math.floor((range.key.ramp.beats - 1) / range.key.beatsPerBar))
        : range.key.ramp.beats - 1;
      anchor.position = Math.max(1, Math.min(maxPosition, Math.round(value)));
      anchor.beat = anchor.kind === "bar"
        ? anchor.position * range.key.beatsPerBar
        : anchor.position;
    }, "变速锚点拍数已更新");
  } else if (event.target.classList.contains("ramp-anchor-time")) {
    applyRampContinuousChange(event.target, `ramp:${range.key.id}:${anchor.id}:time`, () => {
      anchor.time = Math.max(range.key.time + CHART_TIME_STEP, Math.min(range.next.time - CHART_TIME_STEP, value));
    }, "变速锚点时间已更新");
  }
});

refs.bpmRampAnchorList.addEventListener("click", (event) => {
  const button = event.target.closest(".remove-ramp-anchor");
  const item = button?.closest(".bpm-ramp-anchor");
  const range = selectedBpmRange();
  if (!item || !range?.key.ramp) return;
  const anchorId = item.dataset.anchorId;
  commitChange(() => {
    range.key.ramp.anchors = range.key.ramp.anchors.filter((anchor) => anchor.id !== anchorId);
  }, "已删除变速锚点");
});

function repairRampEndpoint(endpoint) {
  const range = selectedBpmRange();
  if (!range?.next || !range.key.ramp) return;
  const totalBeats = Math.max(1, Math.round(range.key.ramp.beats));
  const averageBpm = (range.key.bpm + range.next.bpm) * 0.5;
  const duration = totalBeats * 60 / averageBpm;
  const startTime = endpoint === "start" ? range.next.time - duration : range.key.time;
  if (startTime < 0) {
    setStatus("起点无法再向前移动；请选择移动终点");
    return;
  }
  commitChange(() => {
    if (endpoint === "start") {
      range.key.time = startTime;
      if (range.index > 0) delete state.chart.timing.bpmKeys[range.index - 1].ramp;
    } else {
      range.next.time = range.key.time + duration;
      delete range.next.ramp;
      state.chart.timing.duration = Math.max(state.chart.timing.duration, range.next.time);
    }
  }, endpoint === "start" ? "已移动变速起点至整数拍" : "已移动变速终点至整数拍");
}

refs.repairRampStart.addEventListener("click", () => repairRampEndpoint("start"));
refs.repairRampEnd.addEventListener("click", () => repairRampEndpoint("end"));

document.addEventListener("focusout", (event) => {
  if (state.continuousEdit?.control !== event.target) return;
  state.continuousEdit = null;
  if (refs.bpmKeyEditor.contains(event.target) || refs.bpmRampEditor.contains(event.target)) renderBpmKeys();
  else if (refs.noteInspector.contains(event.target) || refs.eventInspector.contains(event.target)) renderInspector();
});

$("#add-effect").addEventListener("click", () => {
  const effect = { id: crypto.randomUUID(), time: state.currentTime, type: "planet", position: [0, 0, 0], params: { radius: 30, color: "#9fc8ff" } };
  commitChange(() => state.chart.effects.push(effect), "已添加自定义特效事件");
});

refs.scrubber.addEventListener("input", () => {
  state.playing = false;
  refs.audio.pause();
  resetHitSoundSchedule(Number(refs.scrubber.value));
  refs.playToggle.textContent = "▶";
  setCurrentTime(Number(refs.scrubber.value), true);
});
refs.playToggle.addEventListener("click", togglePlayback);
refs.stop.addEventListener("click", stopPlayback);
refs.hitSoundVolume.addEventListener("input", updateHitSoundVolume);

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
refs.charter.addEventListener("change", () => {
  state.chart.meta.charter = refs.charter.value;
  updateCurrentDifficultyEntry();
  setDirty(true);
});
refs.illustrator.addEventListener("change", () => { state.chart.meta.illustrator = refs.illustrator.value; setDirty(true); });
refs.difficultyLabel.addEventListener("change", () => {
  const previous = state.chart.meta.difficultyLabel;
  const next = refs.difficultyLabel.value.replace(/^-+|-+$/g, "")
    || CONFIG.chart.defaults.meta.difficultyLabel;
  const duplicate = (state.projectMeta?.charts ?? []).some((entry) =>
    entry.file !== state.projectChartFile && entry.difficultyLabel.toLowerCase() === next.toLowerCase()
  );
  if (duplicate) {
    refs.difficultyLabel.value = previous;
    setStatus(`难度 ${next} 已存在`);
    return;
  }
  state.chart.meta.difficultyLabel = next;
  refs.difficultyLabel.value = state.chart.meta.difficultyLabel;
  updateCurrentDifficultyEntry();
  setDirty(true);
});
refs.level.addEventListener("change", () => {
  state.chart.meta.level = Math.max(0, Math.round(Number(refs.level.value) || 0));
  refs.level.value = state.chart.meta.level;
  updateCurrentDifficultyEntry();
  setDirty(true);
});

refs.difficultySelect.addEventListener("change", () => {
  const file = refs.difficultySelect.value;
  if (!file || file === state.projectChartFile) return;
  const preserveDirty = state.dirty;
  cacheCurrentDifficulty();
  activateDifficulty(file, `已切换到 ${state.projectCharts.get(file).meta.difficultyLabel}`, preserveDirty);
});

$("#add-difficulty").addEventListener("click", openDifficultyDialog);
$("#remove-difficulty").addEventListener("click", removeCurrentDifficulty);
refs.difficultyForm.addEventListener("submit", (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  if (createDifficultyFromDialog()) refs.difficultyDialog.close();
});

$("#new-chart").addEventListener("click", () => {
  state.undo.push(snapshot());
  clearProjectContext();
  state.chart = normalizeChart(createDefaultChart());
  state.currentTime = 0;
  state.selectedNotes.clear();
  state.selectedEvents.clear();
  syncChartControls();
  rebuildEverything();
  setDirty(true);
  setStatus("已新建谱面");
});
$("#open-project").addEventListener("click", openProject);
$("#save-project").addEventListener("click", saveProject);
$("#load-chart").addEventListener("click", () => refs.chartFile.click());
$("#save-chart").addEventListener("click", exportChartJson);
$("#load-audio").addEventListener("click", () => refs.audioFile.click());
$("#load-cover").addEventListener("click", () => refs.coverFile.click());
$("#undo-button").addEventListener("click", undo);
$("#redo-button").addEventListener("click", redo);
refs.chartFile.addEventListener("change", () => loadChartFile(refs.chartFile.files[0]));
refs.projectPackage.addEventListener("change", () => loadProjectPackage(refs.projectPackage.files[0]));
refs.audioFile.addEventListener("change", () => loadAudio(refs.audioFile.files[0]).catch((error) => setStatus(`音乐加载失败：${error.message}`)));
refs.coverFile.addEventListener("change", () => loadCover(refs.coverFile.files[0]).catch((error) => setStatus(`曲绘加载失败：${error.message}`)));
refs.panelToggle.addEventListener("click", () => setEditorPanelOpen(!state.editorPanelOpen));
refs.viewToggle.addEventListener("click", toggleView);
refs.addCameraKeyframe.addEventListener("click", addCameraKeyframesAtCurrentTime);

window.addEventListener("keydown", (event) => {
  const typingTarget = event.target.matches("input:not([type='range']), select, textarea, [contenteditable='true']");
  if (event.code === "KeyE" && !typingTarget) {
    event.preventDefault();
    if (!event.repeat) setEditorPanelOpen(!state.editorPanelOpen);
    return;
  }
  if (typingTarget) return;
  if ((event.ctrlKey || event.metaKey) && event.code === "KeyC") {
    event.preventDefault();
    copySelection();
  } else if ((event.ctrlKey || event.metaKey) && event.code === "KeyV") {
    event.preventDefault();
    pasteClipboard();
  } else if (event.code === "Equal") {
    event.preventDefault();
    toggleView();
  } else if (event.code === "Space") {
    event.preventDefault();
    togglePlayback();
  } else if (event.code === "KeyK") {
    event.preventDefault();
    if (!event.repeat) addCameraKeyframesAtCurrentTime();
  } else if (event.code === "Delete" || event.code === "Backspace") {
    event.preventDefault();
    if (state.selectedNotes.size) $("#delete-selection").click();
    else if (state.selectedEvents.size) deleteSelectedEvents();
  } else if ((event.ctrlKey || event.metaKey) && event.code === "KeyZ") {
    event.preventDefault();
    event.shiftKey ? redo() : undo();
  } else if ((event.ctrlKey || event.metaKey) && event.code === "KeyY") {
    event.preventDefault();
    redo();
  } else if ((event.ctrlKey || event.metaKey) && event.code === "KeyS") {
    event.preventDefault();
    saveProject();
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
    else {
      scheduleHitSounds(time);
      setCurrentTime(time, true);
    }
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
