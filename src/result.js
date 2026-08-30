import { loadContentCatalog } from "./content-catalog.js?v=20260829-1";
import { difficultyColor } from "./difficulty.js?v=20260828-4";
import {
  RESULT_JUDGEMENTS,
  RESULT_SESSION_KEY,
  paddedResultScore,
  parseResultSession,
  resultGrade
} from "./result-core.js?v=20260829-2";
import { CONFIG } from "./config.js?v=20260829-1";
import {
  accuracyHistogram,
  meanAbsoluteTimingError,
  successfulTimingOffsets,
  timingWindowsMilliseconds
} from "./accuracy-core.js?v=20260829-1";

const refs = {
  shell: document.getElementById("result-shell"),
  error: document.getElementById("result-error"),
  jacket: document.getElementById("result-jacket"),
  title: document.getElementById("result-song-title"),
  composer: document.getElementById("result-composer"),
  charter: document.getElementById("result-charter"),
  illustrator: document.getElementById("result-illustrator"),
  difficulty: document.getElementById("result-difficulty"),
  difficultyLabel: document.getElementById("result-difficulty-label"),
  difficultyLevel: document.getElementById("result-difficulty-level"),
  grade: document.getElementById("result-grade"),
  gradeLabel: document.getElementById("result-grade-label"),
  score: document.getElementById("result-score"),
  maxCombo: document.getElementById("result-max-combo"),
  accuracyMean: document.getElementById("accuracy-mean"),
  accuracyHistogram: document.getElementById("accuracy-histogram"),
  restart: document.getElementById("result-restart"),
  back: document.getElementById("result-back"),
  errorBack: document.getElementById("error-back"),
  starfield: document.getElementById("result-starfield")
};

function renderAccuracy(result) {
  const offsets = successfulTimingOffsets(result.timingSamples);
  const fallbackWindows = timingWindowsMilliseconds(
    CONFIG.game.judgement.windows[CONFIG.game.judgement.mode]
      ?? CONFIG.game.judgement.windows.ordinary
  );
  const windows = result.timingWindowsMs ?? fallbackWindows;
  const bins = accuracyHistogram(offsets, windows);
  const maximum = Math.max(1, ...bins);
  const labels = ["-D", "-DP", "-P", "0", "+P", "+PD", "+D"];
  const halfFlawless = windows.flawless / 2;
  const primeDecentMiddle = (windows.prime + windows.decent) / 2;
  const ranges = [
    `[-${windows.decent}, -${primeDecentMiddle})ms`,
    `[-${primeDecentMiddle}, -${windows.prime})ms`,
    `[-${windows.prime}, -${halfFlawless})ms`,
    `[-${halfFlawless}, ${halfFlawless}]ms`,
    `(${halfFlawless}, ${windows.prime}]ms`,
    `(${windows.prime}, ${primeDecentMiddle}]ms`,
    `(${primeDecentMiddle}, ${windows.decent}]ms`
  ];
  refs.accuracyMean.textContent = `${meanAbsoluteTimingError(offsets).toFixed(2)}ms`;
  refs.accuracyHistogram.replaceChildren(...bins.map((count, index) => {
    const column = document.createElement("div");
    const value = document.createElement("strong");
    const bar = document.createElement("span");
    const label = document.createElement("small");
    const distance = Math.abs(index - 3) / 3;
    const hue = 132 + (48 - 132) * distance;
    column.className = `accuracy-column${index === 3 ? " center" : ""}`;
    column.style.setProperty("--bar-height", `${Math.max(count > 0 ? 8 : 1, count / maximum * 100)}%`);
    column.style.setProperty("--accuracy-bar-color", `hsl(${hue} 84% 65%)`);
    column.setAttribute("aria-label", `${ranges[index]}: ${count}`);
    column.title = ranges[index];
    value.textContent = String(count);
    label.textContent = labels[index];
    column.append(value, bar, label);
    return column;
  }));
}

function resultSession() {
  return parseResultSession(sessionStorage.getItem(RESULT_SESSION_KEY));
}

function chapterUrl(session) {
  const target = new URL("./select.html", window.location.href);
  target.searchParams.set("v", "20260829-10");
  if (session?.chapterId) target.searchParams.set("chapter", session.chapterId);
  return target;
}

function setupStarfield() {
  const canvas = refs.starfield;
  const context = canvas.getContext("2d");
  const points = Array.from({ length: 280 }, (_, index) => ({
    x: (index * 0.61803398875) % 1,
    y: ((index * 0.41421356237 + Math.sin(index * 4.71) * 0.08) % 1 + 1) % 1,
    size: 0.45 + (index % 6) * 0.16,
    alpha: 0.11 + (index % 8) * 0.035
  }));
  const draw = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.6);
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const point of points) {
      context.fillStyle = `rgba(190, 219, 232, ${point.alpha})`;
      context.fillRect(point.x * window.innerWidth, point.y * window.innerHeight, point.size, point.size);
    }
  };
  window.addEventListener("resize", draw);
  draw();
}

function navigateToGame(session) {
  const target = new URL("./index.html", window.location.href);
  target.searchParams.set("v", "20260829-11");
  target.searchParams.set("song", session.songId);
  target.searchParams.set("chart", session.chart);
  if (session.chapterId) target.searchParams.set("chapter", session.chapterId);
  window.location.assign(target);
}

async function initialize() {
  setupStarfield();
  const session = resultSession();
  if (!session) {
    refs.error.hidden = false;
    refs.errorBack.addEventListener("click", () => window.location.assign(chapterUrl(null)));
    return;
  }

  const catalog = await loadContentCatalog(
    "./public/content/catalog.json?v=20260829-1",
    globalThis.fetch,
    { cache: "no-store" }
  );
  const song = catalog.getNode(session.songId);
  if (!song || song.type !== "song") throw new Error(`Song not found: ${session.songId}`);
  const manifest = await catalog.loadSongManifest(song);
  const chart = manifest.charts.find((entry) => entry.file === session.chart);
  if (!chart) throw new Error(`Chart not found: ${session.chart}`);

  const color = difficultyColor(chart.difficultyLabel);
  document.documentElement.style.setProperty("--difficulty-color", color);
  refs.jacket.src = manifest.jacketUrl ?? "";
  refs.jacket.alt = `${manifest.title} jacket`;
  refs.title.textContent = manifest.title;
  refs.composer.textContent = manifest.composer ?? "-";
  refs.charter.textContent = chart.charter ?? "-";
  refs.illustrator.textContent = manifest.illustrator ?? "-";
  refs.difficultyLabel.textContent = `-${chart.difficultyLabel ?? "--"}-`;
  refs.difficultyLevel.textContent = chart.level ?? "--";
  const grade = resultGrade(session.result);
  refs.grade.dataset.tone = grade.tone;
  refs.gradeLabel.textContent = grade.label;
  refs.score.textContent = paddedResultScore(session.result.score);
  refs.maxCombo.textContent = Math.max(0, Number(session.result.maxCombo) || 0);
  RESULT_JUDGEMENTS.forEach((name) => {
    document.getElementById(`count-${name}`).textContent = Math.max(0, Number(session.result.counts?.[name]) || 0);
  });
  renderAccuracy(session.result);

  refs.restart.addEventListener("click", () => navigateToGame(session));
  refs.back.addEventListener("click", () => window.location.assign(chapterUrl(session)));
  window.addEventListener("keydown", (event) => {
    if (event.code === "KeyR") navigateToGame(session);
    if (event.code === "Escape") window.location.assign(chapterUrl(session));
  });
  refs.shell.hidden = false;
}

initialize().catch((error) => {
  console.error(error);
  refs.shell.hidden = true;
  refs.error.hidden = false;
  refs.error.querySelector("span").textContent = error.message;
  refs.errorBack.addEventListener("click", () => window.location.assign(chapterUrl(resultSession())));
});
