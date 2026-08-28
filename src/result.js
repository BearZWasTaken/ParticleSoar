import { loadContentCatalog } from "./content-catalog.js?v=20260829-1";
import { difficultyColor } from "./difficulty.js?v=20260828-4";
import {
  RESULT_JUDGEMENTS,
  RESULT_SESSION_KEY,
  paddedResultScore,
  parseResultSession,
  resultCompletionLabel
} from "./result-core.js?v=20260829-1";

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
  completion: document.getElementById("completion-mark"),
  score: document.getElementById("result-score"),
  maxCombo: document.getElementById("result-max-combo"),
  restart: document.getElementById("result-restart"),
  back: document.getElementById("result-back"),
  errorBack: document.getElementById("error-back"),
  starfield: document.getElementById("result-starfield")
};

function resultSession() {
  return parseResultSession(sessionStorage.getItem(RESULT_SESSION_KEY));
}

function chapterUrl(session) {
  const target = new URL("./select.html", window.location.href);
  target.searchParams.set("v", "20260828-5");
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
  target.searchParams.set("v", "20260829-1");
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
  refs.completion.textContent = resultCompletionLabel(session.result);
  refs.score.textContent = paddedResultScore(session.result.score);
  refs.maxCombo.textContent = Math.max(0, Number(session.result.maxCombo) || 0);
  RESULT_JUDGEMENTS.forEach((name) => {
    document.getElementById(`count-${name}`).textContent = Math.max(0, Number(session.result.counts?.[name]) || 0);
  });

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
