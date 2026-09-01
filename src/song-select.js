import { loadContentCatalog } from "./content-catalog.js?v=20260901-1";
import { difficultyColor } from "./difficulty.js?v=20260828-4";
import { PlayerProfileStore } from "./player-profile.js?v=20260901-1";
import { resultGrade } from "./result-core.js?v=20260829-2";

const refs = {
  chapterTitle: document.getElementById("chapter-title"),
  chapterSubtitle: document.getElementById("chapter-subtitle"),
  constellation: document.getElementById("constellation"),
  stage: document.getElementById("constellation-stage"),
  lines: document.getElementById("constellation-lines"),
  nodes: document.getElementById("song-nodes"),
  songInfo: document.getElementById("song-info"),
  songState: document.getElementById("song-state"),
  songTitle: document.getElementById("song-title"),
  songComposer: document.getElementById("song-composer"),
  songDifficulties: document.getElementById("song-difficulties"),
  loading: document.getElementById("loading-state"),
  starfield: document.getElementById("starfield"),
  settings: document.getElementById("open-settings")
};

const profileStore = new PlayerProfileStore();
const params = new URLSearchParams(window.location.search);
let catalog;
let chapter;
let progress;
let chapterEntries = [];
let focusedNode = null;

function fallbackCover(title) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  const seed = [...title].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 7);
  context.fillStyle = "#07101a";
  context.fillRect(0, 0, 256, 256);
  context.translate(128, 128);
  for (let index = 0; index < 7; index += 1) {
    context.strokeStyle = `hsla(${(seed + index * 31) % 360} 72% 68% / ${0.76 - index * 0.08})`;
    context.lineWidth = index % 2 ? 3 : 9;
    context.beginPath();
    context.arc(0, 0, 28 + index * 15, -2.4 + index * 0.13, 2.1 + index * 0.08);
    context.stroke();
  }
  return canvas.toDataURL("image/png");
}

function positionOf(entry) {
  if (!Array.isArray(entry.position) || entry.position.length !== 2) {
    throw new Error(`Constellation entry ${entry.target} has no explicit position`);
  }
  const [x, y] = entry.position.map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(`Constellation entry ${entry.target} has an invalid position`);
  }
  return { x, y };
}

function entryByTarget(target) {
  return chapterEntries.find((entry) => entry.target === target) ?? null;
}

function isUnlocked(songId) {
  return progress.progression.unlocked.includes(songId);
}

function chartRecord(songId, chartFile) {
  return progress.records[songId]?.charts?.[chartFile] ?? null;
}

function bestChartResult(songId, chartFile) {
  const record = chartRecord(songId, chartFile);
  const score = Math.max(0, Number(record?.bestScore) || 0);
  return {
    isNew: !record || (Number(record.playCount) || 0) === 0,
    score,
    grade: resultGrade(record?.bestResult ? { ...record.bestResult, score } : { score })
  };
}

function applyGradeTone(element, grade) {
  element.dataset.tone = grade.tone;
  element.textContent = grade.label;
}

function applyChartRecord(container, gradeElement, scoreElement, best) {
  container.classList.toggle("is-new", best.isNew);
  gradeElement.hidden = best.isNew;
  if (best.isNew) {
    scoreElement.textContent = "-NEW-";
    return;
  }
  applyGradeTone(gradeElement, best.grade);
  scoreElement.textContent = String(best.score).padStart(7, "0");
}

function positionSongInfo(button) {
  const nodeRect = button.getBoundingClientRect();
  const infoRect = refs.songInfo.getBoundingClientRect();
  const gap = 18;
  const viewportPadding = 18;
  const right = nodeRect.right + gap;
  const leftSide = nodeRect.left - infoRect.width - gap;
  const hasRightRoom = right + infoRect.width <= window.innerWidth - viewportPadding;
  const hasLeftRoom = leftSide >= viewportPadding;
  let left = hasRightRoom ? right : leftSide;
  let top = nodeRect.top + nodeRect.height * 0.5 - infoRect.height * 0.5;
  if (!hasRightRoom && !hasLeftRoom) {
    left = nodeRect.left + nodeRect.width * 0.5 - infoRect.width * 0.5;
    top = nodeRect.bottom + gap;
    if (top + infoRect.height > window.innerHeight - viewportPadding) {
      top = nodeRect.top - infoRect.height - gap;
    }
  }
  left = Math.max(viewportPadding, Math.min(window.innerWidth - infoRect.width - viewportPadding, left));
  top = Math.max(viewportPadding, Math.min(window.innerHeight - infoRect.height - viewportPadding, top));
  refs.songInfo.style.left = `${left}px`;
  refs.songInfo.style.top = `${top}px`;
}

function showSongInfo(song, unlocked, button) {
  const summary = song.summary ?? {};
  refs.songState.textContent = unlocked ? "AVAILABLE" : "LOCKED";
  refs.songTitle.textContent = summary.title ?? song.id;
  refs.songComposer.textContent = summary.composer ?? "Unknown Composer";
  refs.songDifficulties.replaceChildren(...(summary.charts ?? []).map((chart) => {
    const difficulty = document.createElement("span");
    const best = bestChartResult(song.id, chart.file);
    difficulty.className = "song-difficulty";
    difficulty.style.setProperty("--difficulty-color", difficultyColor(chart.difficultyLabel));
    const label = document.createElement("strong");
    const grade = document.createElement("b");
    const score = document.createElement("small");
    label.textContent = `${chart.difficultyLabel ?? "--"} ${chart.level ?? "--"}`;
    grade.className = "record-grade";
    difficulty.append(label, grade, score);
    applyChartRecord(difficulty, grade, score, best);
    return difficulty;
  }));
  refs.songInfo.hidden = false;
  requestAnimationFrame(() => positionSongInfo(button));
}

function hideSongInfo() {
  if (!focusedNode) refs.songInfo.hidden = true;
}

function clearFocus() {
  if (!focusedNode) return;
  focusedNode.classList.remove("is-selected");
  refs.constellation.classList.remove("is-focused");
  refs.stage.style.removeProperty("--focus-x");
  refs.stage.style.removeProperty("--focus-y");
  focusedNode = null;
  refs.songInfo.hidden = true;
}

function focusSong(button, song, unlocked, position) {
  if (!unlocked || focusedNode === button) return;
  clearFocus();
  focusedNode = button;
  button.classList.add("is-selected");
  refs.constellation.classList.add("is-focused");
  refs.stage.style.setProperty("--focus-x", `${position.x * 100}%`);
  refs.stage.style.setProperty("--focus-y", `${position.y * 100}%`);
  showSongInfo(song, true, button);
}

async function launchSong(song, chartSummary) {
  if (!isUnlocked(song.id)) return;
  const manifest = await catalog.loadSongManifest(song.id);
  const chart = manifest.charts.find((entry) => entry.file === chartSummary.file);
  if (!chart) throw new Error(`Difficulty chart not found: ${chartSummary.file}`);
  const target = new URL("./index.html", window.location.href);
  target.searchParams.set("v", "20260829-11");
  target.searchParams.set("song", song.id);
  target.searchParams.set("chart", chart.file);
  target.searchParams.set("chapter", chapter.id);
  window.location.assign(target);
}

function renderLinks() {
  refs.lines.replaceChildren(...(chapter.links ?? []).map((link) => {
    const from = entryByTarget(link.from);
    const to = entryByTarget(link.to);
    if (!from || !to) return document.createDocumentFragment();
    const a = positionOf(from);
    const b = positionOf(to);
    const x1 = a.x * 1000;
    const y1 = a.y * 700;
    const x2 = b.x * 1000;
    const y2 = b.y * 700;
    const bend = Math.max(26, Math.abs(x2 - x1) * 0.12);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`);
    path.setAttribute("class", `constellation-link${isUnlocked(link.to) ? "" : " is-locked"}`);
    return path;
  }));
}

function makeDifficultyPicker(song, charts, unlocked) {
  const picker = document.createElement("span");
  picker.className = "difficulty-picker";
  picker.dataset.count = String(Math.min(charts.length, 6));
  charts.forEach((chart) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "difficulty-choice";
    button.style.setProperty("--difficulty-color", difficultyColor(chart.difficultyLabel));
    const chartIdentity = document.createElement("span");
    const chartLabel = document.createElement("strong");
    const chartLevel = document.createElement("b");
    chartIdentity.className = "difficulty-choice-identity";
    chartLabel.textContent = chart.difficultyLabel ?? "--";
    chartLevel.textContent = chart.level ?? "--";
    chartIdentity.append(chartLabel, chartLevel);
    button.append(chartIdentity);
    button.disabled = !unlocked;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      launchSong(song, chart).catch(showError);
    });
    picker.append(button);
  });
  return picker;
}

function renderSongNodes() {
  const songEntries = chapterEntries.filter((entry) => entry.node?.type === "song");
  refs.nodes.replaceChildren(...songEntries.map((entry) => {
    const song = entry.node;
    const summary = song.summary ?? {};
    const charts = summary.charts ?? [];
    const unlocked = isUnlocked(song.id);
    const position = positionOf(entry);
    const button = document.createElement("div");
    button.className = `song-node${unlocked ? "" : " is-locked"}`;
    button.style.left = `${position.x * 100}%`;
    button.style.top = `${position.y * 100}%`;
    button.setAttribute("aria-label", `${summary.title ?? song.id}${unlocked ? "" : "，未解锁"}`);
    button.setAttribute("aria-disabled", String(!unlocked));
    button.setAttribute("role", "button");
    button.tabIndex = 0;

    const image = document.createElement("img");
    image.alt = "";
    image.draggable = false;
    image.src = catalog.resolveSongAsset(song, summary.cover) ?? fallbackCover(summary.title ?? song.id);
    image.addEventListener("error", () => { image.src = fallbackCover(summary.title ?? song.id); }, { once: true });

    button.append(image);
    if (!unlocked) {
      const status = document.createElement("span");
      status.className = "song-node-status";
      status.textContent = "LOCKED";
      button.append(status);
    }
    button.append(makeDifficultyPicker(song, charts, unlocked));
    button.addEventListener("mouseenter", () => showSongInfo(song, unlocked, button));
    button.addEventListener("mouseleave", hideSongInfo);
    button.addEventListener("focus", () => showSongInfo(song, unlocked, button));
    button.addEventListener("blur", hideSongInfo);
    button.addEventListener("click", () => focusSong(button, song, unlocked, position));
    button.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      focusSong(button, song, unlocked, position);
    });
    return button;
  }));
}

function showError(error) {
  refs.loading.textContent = error.message || String(error);
  refs.loading.classList.remove("is-hidden");
  refs.loading.classList.add("is-error");
}

function setupStarfield() {
  const canvas = refs.starfield;
  const context = canvas.getContext("2d");
  const stars = Array.from({ length: 420 }, (_, index) => ({
    x: ((index * 0.61803398875) % 1),
    y: ((index * 0.41421356237 + Math.sin(index * 9.17) * 0.12) % 1 + 1) % 1,
    size: 0.35 + (index % 7) * 0.18,
    alpha: 0.16 + (index % 9) * 0.045
  }));
  let pointerX = 0;
  let pointerY = 0;

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.6);
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  };
  const draw = () => {
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const star of stars) {
      const depth = 0.25 + star.size * 0.12;
      context.fillStyle = `rgba(204, 225, 235, ${star.alpha})`;
      context.fillRect(
        star.x * window.innerWidth + pointerX * depth,
        star.y * window.innerHeight + pointerY * depth,
        star.size,
        star.size
      );
    }
  };
  window.addEventListener("resize", () => { resize(); draw(); });
  window.addEventListener("pointermove", (event) => {
    pointerX = (event.clientX / window.innerWidth - 0.5) * -12;
    pointerY = (event.clientY / window.innerHeight - 0.5) * -8;
    draw();
  });
  resize();
  draw();
}

async function initialize() {
  setupStarfield();
  catalog = await loadContentCatalog(
    "./public/content/catalog.json?v=20260901-2",
    globalThis.fetch,
    { cache: "no-store" }
  );
  chapter = params.get("chapter") ? catalog.getNode(params.get("chapter")) : catalog.getEntrypoint();
  if (!chapter || !["chapter", "map", "collection"].includes(chapter.type)) {
    throw new Error("Chapter entrypoint is missing");
  }
  progress = await profileStore.initializeChapter(chapter);
  chapterEntries = catalog.resolveEntries(chapter);
  refs.chapterTitle.textContent = chapter.title ?? "Untitled Chapter";
  refs.chapterSubtitle.textContent = chapter.subtitle ?? "CHAPTER";
  document.documentElement.style.setProperty("--cyan", chapter.presentation?.accent ?? "#70dcff");
  renderLinks();
  renderSongNodes();
  refs.loading.classList.add("is-hidden");
}

refs.constellation.addEventListener("click", (event) => {
  if ([refs.constellation, refs.stage, refs.nodes, refs.lines].includes(event.target)) clearFocus();
});
refs.settings.addEventListener("click", () => {
  const target = new URL("./settings.html", window.location.href);
  target.searchParams.set("v", "20260829-4");
  target.searchParams.set("return", `${window.location.pathname}${window.location.search}`);
  window.location.assign(target);
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") clearFocus();
});
window.addEventListener("resize", () => {
  if (focusedNode && !refs.songInfo.hidden) positionSongInfo(focusedNode);
});
refs.stage.addEventListener("transitionend", (event) => {
  if (event.propertyName === "transform" && focusedNode && !refs.songInfo.hidden) {
    positionSongInfo(focusedNode);
  }
});

initialize().catch(showError);
