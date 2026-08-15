/**
 * Снимает сайт в нужных точках прокрутки и собирает ошибки консоли.
 * Гоняет уже установленный Edge, ничего не скачивает.
 *
 *   node tools/shots.mjs [адрес] [папка]
 */
import { mkdir, writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const URL = process.argv[2] || "http://localhost:4175/";
const OUT = process.argv[3] || "shots";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

// Точки съёмки: секция и доля прокрутки внутри неё. Считать в долях всей
// страницы бессмысленно — фазы сцен привязаны к своим секциям.
const MARKS = [
  ["00-preloader", null, 0],
  ["01-hero-start", "hero", 0.05],
  ["02-hero-letters", "hero", 0.33],
  ["03-hero-pause", "hero", 0.42],
  ["03b-hero-seam", "hero", 0.5],
  ["04-hero-video", "hero", 0.9],
  ["04b-hero-to-jzx", "hero", 0.985],
  ["05-jzx-in", "jzx100", 0.15],
  ["05b-jzx-text", "jzx100", 0.5],
  ["06-jzx-full", "jzx100", 0.7],
  ["07-jzx-out", "jzx100", 0.95],
  ["08-motion-smear", "motion", 0.45],
  ["09-motion-clean", "motion", 0.75],
  ["09b-motion-to-cards", "motion", 0.95],
  ["10-cards", "cards", 0.4],
  ["11-reading", "reading", 0.15],
  ["12-reading-mid", "reading", 0.6],
  ["13-final", "final", 0.8],
  ["14-final-end", "final", 1],
];

const viewports = [
  ["desktop", 1600, 900],
  ["mobile", 414, 896],
];

const errors = [];

for (const [name, width, height] of viewports) {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: "new",
    args: [`--window-size=${width},${height}`, "--autoplay-policy=no-user-gesture-required"],
    defaultViewport: { width, height, deviceScaleFactor: 1 },
  });

  const page = await browser.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`[${name}] console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`[${name}] pageerror: ${e.message}`));
  page.on("requestfailed", (r) => {
    // Видео запрашивается кусками, и при паузе или перемотке недокачанный
    // кусок обрывается. Это штатно и к ошибкам отношения не имеет.
    const mediaAbort =
      r.failure()?.errorText === "net::ERR_ABORTED" && /\.(mp4|webm)(\?|$)/.test(r.url());
    if (!mediaAbort) {
      errors.push(`[${name}] запрос не прошёл: ${r.url()} — ${r.failure()?.errorText}`);
    }
  });

  await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });
  await mkdir(`${OUT}/${name}`, { recursive: true });

  for (const [shot, section, ratio] of MARKS) {
    if (!section) {
      await page.screenshot({ path: `${OUT}/${name}/${shot}.png` });
      // Проходим прелоадер так же, как это делает человек — кликом
      await page.waitForSelector('[data-preloader][data-ready="true"]', { timeout: 15000 });
      await page.click("[data-preloader-enter]");
      await sleep(1600);
      continue;
    }

    await page.evaluate(
      (sel, r) => {
        const el = document.querySelector(`[data-screen="${sel}"]`);
        if (!el) return;
        // Закреплённые секции обёрнуты в pin-spacer — считаем по нему
        const box = el.closest(".pin-spacer") || el;
        const top = box.getBoundingClientRect().top + window.scrollY;
        const span = Math.max(1, box.offsetHeight - window.innerHeight);
        const y = top + span * r;
        if (window.__lenis) window.__lenis.scrollTo(y, { immediate: true });
        else window.scrollTo(0, y);
      },
      section,
      ratio
    );
    // Скролл сглажен, а сцены идут со scrub 1.6 — они доезжают ещё позже.
    // При 1200 мс снимок заставал сцену на полпути и врал.
    await sleep(2600);
    await page.screenshot({ path: `${OUT}/${name}/${shot}.png` });
  }

  await browser.close();
}

await writeFile(`${OUT}/errors.txt`, errors.join("\n") || "ошибок нет", "utf8");
console.log(errors.length ? errors.join("\n") : "ошибок нет");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
