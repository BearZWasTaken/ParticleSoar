import { CONFIG } from "./config.js?v=20260901-3";
import { HitSoundPlayer } from "./hit-sounds.js?v=20260829-2";
import { createInputMap } from "./input-map.js?v=20260829-1";
import {
  DEFAULT_PLAYER_SETTINGS,
  PlayerProfileStore
} from "./player-profile.js?v=20260829-1";
import { bindRangeControl, setRangeValue } from "./ui-components.js?v=20260829-1";

const CALIBRATION_BPM = 128;
const SECONDS_PER_BEAT = 60 / CALIBRATION_BPM;
const NOTE_INTERVAL_BEATS = 4;
const NOTE_FIRST_BEAT = 2;
const NOTE_LEAD_SECONDS = 2.25;
const CALIBRATION_AUDIO_URL = "./public/audio/settings/delay_calibration.wav";

const refs = {
  canvas: document.getElementById("calibration-scene"),
  back: document.getElementById("settings-back"),
  saveState: document.getElementById("save-state"),
  replay: document.getElementById("calibration-replay"),
  reset: document.getElementById("settings-reset"),
  resetConfirm: document.getElementById("reset-confirm"),
  resetCancel: document.getElementById("reset-cancel"),
  resetAccept: document.getElementById("reset-accept"),
  autoPause: document.getElementById("auto-pause"),
  calibrationResult: document.getElementById("calibration-result")
};

const context = refs.canvas.getContext("2d");
const profileStore = new PlayerProfileStore();
const inputMap = createInputMap(CONFIG.game.input);
const audio = new Audio(CALIBRATION_AUDIO_URL);
audio.preload = "auto";
const hitSounds = new HitSoundPlayer({
  urls: CONFIG.game.audio.hitSounds,
  volume: DEFAULT_PLAYER_SETTINGS.hitSoundVolume
});

let settings = { ...DEFAULT_PLAYER_SETTINGS };
let saveTimer = 0;
let notes = [];
let particles = [];
let lastFrame = performance.now();
let judgementUntil = 0;

const stars = Array.from({ length: 360 }, (_, index) => ({
  x: (index * 0.61803398875) % 1,
  y: ((index * 0.41421356237 + Math.sin(index * 7.13) * 0.1) % 1 + 1) % 1,
  size: 0.4 + (index % 6) * 0.18,
  alpha: 0.08 + (index % 8) * 0.035
}));

const sliderFormats = {
  chartDelayMs: (value) => `${value > 0 ? "+" : ""}${Math.round(value)} ms`,
  inputDelayMs: (value) => `${value > 0 ? "+" : ""}${Math.round(value)} ms`,
  musicVolume: (value) => `${Math.round(value * 100)}%`,
  hitSoundVolume: (value) => `${Math.round(value * 100)}%`,
  flowSpeedMultiplier: (value) => `${value.toFixed(2)}x`
};

const sliderControls = new Map();

function setSaveState(text, saving = false) {
  refs.saveState.textContent = text;
  refs.saveState.classList.toggle("is-saving", saving);
}

function saveSettingsSoon() {
  setSaveState("SAVING", true);
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => persistSettings().catch(console.warn), 140);
}

async function persistSettings() {
  window.clearTimeout(saveTimer);
  saveTimer = 0;
  settings = (await profileStore.updateSettings(settings)).settings;
  setSaveState("SAVED");
}

function applyRuntimeVolumes() {
  audio.volume = settings.musicVolume;
  hitSounds.setVolume(settings.hitSoundVolume);
}

function updateSetting(key, value) {
  settings[key] = value;
  applyRuntimeVolumes();
  saveSettingsSoon();
}

function setupControls() {
  document.querySelectorAll(".ps-slider[data-setting]").forEach((root) => {
    const key = root.dataset.setting;
    const control = bindRangeControl(root, {
      format: sliderFormats[key],
      onInput: (value) => updateSetting(key, value)
    });
    sliderControls.set(key, control);
  });
  refs.autoPause.addEventListener("change", () => updateSetting("autoPauseOnBlur", refs.autoPause.checked));
}

function syncControls() {
  sliderControls.forEach((control, key) => setRangeValue(control, settings[key]));
  refs.autoPause.checked = settings.autoPauseOnBlur;
  applyRuntimeVolumes();
}

function rebuildNotes() {
  const duration = Number.isFinite(audio.duration) ? audio.duration : 30;
  notes = [];
  for (let beat = NOTE_FIRST_BEAT; beat * SECONDS_PER_BEAT < duration; beat += NOTE_INTERVAL_BEATS) {
    notes.push({ hitTime: beat * SECONDS_PER_BEAT, judged: false });
  }
}

function chartTime() {
  return audio.currentTime + settings.chartDelayMs / 1000;
}

function judgementForGap(gap) {
  const windows = CONFIG.game.judgement.windows.ordinary;
  const absolute = Math.abs(gap);
  if (absolute <= windows.flawless) return "flawless";
  if (absolute <= windows.prime) return "prime";
  if (absolute <= windows.decent) return "decent";
  if (absolute <= windows.loose) return "loose";
  return null;
}

function spawnBurst(x, y, color) {
  for (let index = 0; index < 9; index += 1) {
    const angle = index / 9 * Math.PI * 2 + Math.random() * 0.24;
    const speed = 90 + Math.random() * 90;
    particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, age: 0, life: 0.48, size: 4 + Math.random() * 5, color });
  }
}

function judgeCalibration() {
  if (!audio.duration || audio.paused) return;
  hitSounds.unlock().catch(() => {});
  const judgeTime = chartTime() + settings.inputDelayMs / 1000;
  const candidate = notes
    .filter((note) => !note.judged)
    .sort((a, b) => Math.abs(a.hitTime - judgeTime) - Math.abs(b.hitTime - judgeTime))[0];
  if (!candidate) return;
  const gap = judgeTime - candidate.hitTime;
  const judgement = judgementForGap(gap);
  const timingLabel = gap <= 0 ? "EARLY" : "LATE";
  refs.calibrationResult.textContent = `${timingLabel} ${Math.abs(Math.round(gap * 1000))}ms`;
  judgementUntil = performance.now() + 850;
  if (!judgement) {
    return;
  }
  candidate.judged = true;
  const colors = { flawless: "#eaf6fa", prime: "#70dcff", decent: "#ffd66b", loose: "#ff6f87" };
  const { receiverX, receiverY } = sceneLayout();
  spawnBurst(receiverX, receiverY, colors[judgement]);
  if (judgement !== "loose") hitSounds.playJudgement(judgement);
}

function sceneLayout() {
  const panelClearance = Math.min(500, window.innerWidth * 0.38);
  return {
    receiverX: panelClearance + (window.innerWidth - panelClearance) * 0.5,
    receiverY: window.innerHeight * 0.73,
    receiverRadius: Math.min(105, window.innerWidth * 0.075)
  };
}

function positionCalibrationResult() {
  const { receiverX, receiverY, receiverRadius } = sceneLayout();
  refs.calibrationResult.style.left = `${receiverX + receiverRadius + 24}px`;
  refs.calibrationResult.style.top = `${receiverY}px`;
}

function resizeCanvas() {
  const ratio = Math.min(window.devicePixelRatio || 1, 1.75);
  refs.canvas.width = Math.round(window.innerWidth * ratio);
  refs.canvas.height = Math.round(window.innerHeight * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  positionCalibrationResult();
}

function drawScene(now) {
  const delta = Math.min(0.04, (now - lastFrame) / 1000);
  lastFrame = now;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const { receiverX, receiverY, receiverRadius } = sceneLayout();
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#03060b";
  context.fillRect(0, 0, width, height);

  for (const star of stars) {
    context.fillStyle = `rgba(190, 219, 232, ${star.alpha})`;
    context.fillRect(star.x * width, star.y * height, star.size, star.size);
  }

  const current = chartTime();
  context.lineWidth = 1.2;
  context.strokeStyle = "rgba(112, 220, 255, 0.72)";
  context.shadowColor = "rgba(112, 220, 255, 0.52)";
  context.shadowBlur = 11;
  context.beginPath();
  context.ellipse(receiverX, receiverY, receiverRadius, receiverRadius * 0.18, 0, 0, Math.PI * 2);
  context.stroke();

  for (const note of notes) {
    const timeToHit = note.hitTime - current;
    if (timeToHit > NOTE_LEAD_SECONDS || timeToHit < -0.3 || note.judged) continue;
    const progress = 1 - timeToHit / NOTE_LEAD_SECONDS;
    const y = 80 + (receiverY - 80) * progress;
    const opacity = timeToHit < 0 ? Math.max(0, 1 + timeToHit / 0.3) : Math.min(1, progress * 2.2);
    const radius = 15;
    context.globalAlpha = opacity;
    context.fillStyle = "#eaf6fa";
    context.shadowColor = "rgba(112, 220, 255, 0.8)";
    context.shadowBlur = 16;
    context.beginPath();
    context.arc(receiverX, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  context.globalAlpha = 1;
  context.shadowBlur = 0;
  particles = particles.filter((particle) => {
    particle.age += delta;
    if (particle.age >= particle.life) return false;
    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;
    context.globalAlpha = Math.pow(1 - particle.age / particle.life, 1.5);
    context.fillStyle = particle.color;
    context.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
    return true;
  });
  context.globalAlpha = 1;

  if (judgementUntil && now > judgementUntil) {
    refs.calibrationResult.textContent = "";
    judgementUntil = 0;
  }
  requestAnimationFrame(drawScene);
}

async function replayCalibration() {
  await hitSounds.unlock().catch(() => {});
  audio.currentTime = 0;
  notes.forEach((note) => { note.judged = false; });
  particles = [];
  refs.calibrationResult.textContent = "";
  await audio.play();
}

function settingsReturnUrl() {
  const returnTo = new URLSearchParams(location.search).get("return");
  return returnTo && returnTo.startsWith("/") ? returnTo : "./select.html";
}

async function leaveSettings() {
  if (saveTimer) await persistSettings();
  location.href = settingsReturnUrl();
}

async function initialize() {
  setupControls();
  settings = (await profileStore.load()).settings;
  syncControls();
  await hitSounds.preload();
  rebuildNotes();
  resizeCanvas();
  requestAnimationFrame(drawScene);

  refs.replay.addEventListener("click", () => replayCalibration().catch(console.warn));
  refs.reset.addEventListener("click", () => refs.resetConfirm.showModal());
  refs.resetCancel.addEventListener("click", () => refs.resetConfirm.close());
  refs.resetAccept.addEventListener("click", async () => {
    settings = { ...DEFAULT_PLAYER_SETTINGS };
    syncControls();
    settings = (await profileStore.updateSettings(settings)).settings;
    setSaveState("SAVED");
    refs.resetConfirm.close();
  });
  refs.back.addEventListener("click", () => leaveSettings().catch(console.warn));
  refs.canvas.addEventListener("pointerdown", judgeCalibration);
  audio.addEventListener("loadedmetadata", rebuildNotes);
  audio.addEventListener("ended", () => {
    refs.calibrationResult.textContent = "";
  });
  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("keydown", (event) => {
    if (event.code === "Escape") {
      if (refs.resetConfirm.open) {
        refs.resetConfirm.close();
        return;
      }
      leaveSettings().catch(console.warn);
      return;
    }
    if (!inputMap.keyCodes.has(event.code) || event.repeat) return;
    event.preventDefault();
    judgeCalibration();
  });
}

initialize().catch((error) => {
  refs.calibrationResult.textContent = error.message;
});
