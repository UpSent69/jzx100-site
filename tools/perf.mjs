/**
 * Замер того, что обещано в методичке: LCP меньше 2.5 с, стабильные 60 FPS,
 * первый экран легче 3 МБ.
 *
 *   node tools/perf.mjs [адрес]
 *
 * Прокрутка идёт колесом, как у человека, а не прыжками: только так видно
 * настоящую частоту кадров на сценах.
 */
import puppeteer from "puppeteer-core";

const URL = process.argv[2] || "http://localhost:4177/";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: "new",
  args: ["--autoplay-policy=no-user-gesture-required"],
  defaultViewport: { width: 1600, height: 900, deviceScaleFactor: 1 },
});

const page = await browser.newPage();

// --- вес первого экрана ---
const bytes = new Map();
page.on("response", async (r) => {
  const len = Number(r.headers()["content-length"] || 0);
  if (len) bytes.set(r.url(), len);
});

await page.evaluateOnNewDocument(() => {
  window.__lcp = 0;
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__lcp = e.startTime;
  }).observe({ type: "largest-contentful-paint", buffered: true });
});

await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });

const lcp = await page.evaluate(() => window.__lcp);
const firstScreen = [...bytes.entries()].reduce((s, [, v]) => s + v, 0);

console.log(`LCP:               ${Math.round(lcp)} мс   (цель < 2500)`);
console.log(`первый экран:      ${(firstScreen / 1024 / 1024).toFixed(2)} МБ  (цель < 3)`);

await page.waitForSelector('[data-preloader][data-ready="true"]', { timeout: 20000 });
await page.click("[data-preloader-enter]");
await new Promise((r) => setTimeout(r, 1500));

// --- частота кадров на прокрутке ---
await page.evaluate(() => {
  window.__frames = [];
  const tick = (t) => {
    window.__frames.push(t);
    window.__at.push(window.scrollY);
    if (window.__measuring) requestAnimationFrame(tick);
  };
  window.__start = () => {
    window.__measuring = true;
    window.__frames = [];
    window.__at = [];
    requestAnimationFrame(tick);
  };
  window.__stop = () => {
    window.__measuring = false;
    return window.__frames;
  };
});

// Каждая сцена проходится дважды. Первый проход показывает цену включения
// эффекта — выделение поверхности под фильтр, подъём декодера. Второй
// показывает, во что сцена обходится на самом деле, когда всё уже готово.
const scenes = [
  ["первый экран", "hero"],
  ["JZX100", "jzx100"],
  ["движение", "motion"],
  ["карточки", "cards"],
  ["текст", "reading"],
  ["первый экран #2", "hero"],
  ["движение #2", "motion"],
];

for (const [label, name] of scenes) {
  await page.evaluate((n) => {
    const el = document.querySelector(`[data-screen="${n}"]`);
    const box = el.closest(".pin-spacer") || el;
    window.__lenis.scrollTo(box.getBoundingClientRect().top + window.scrollY, { immediate: true });
  }, name);
  await new Promise((r) => setTimeout(r, 900));

  await page.evaluate(() => window.__start());
  // катим колесом полторы секунды — примерно так листает человек
  for (let i = 0; i < 30; i++) {
    await page.mouse.wheel({ deltaY: 90 });
    await new Promise((r) => setTimeout(r, 50));
  }
  const { frames, at, top, span } = await page.evaluate((n) => {
    const el = document.querySelector(`[data-screen="${n}"]`);
    const box = el.closest(".pin-spacer") || el;
    return {
      frames: window.__stop(),
      at: window.__at,
      top: box.getBoundingClientRect().top + window.scrollY,
      span: Math.max(1, box.offsetHeight - window.innerHeight),
    };
  }, name);

  const gaps = frames.slice(1).map((t, i) => ({ ms: t - frames[i], y: at[i + 1] }));
  const sorted = [...gaps].sort((a, b) => a.ms - b.ms);
  const avg = sorted.reduce((s, g) => s + g.ms, 0) / sorted.length;
  const worst = sorted[sorted.length - 1];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];

  console.log(
    `${label.padEnd(16)} ${(1000 / avg).toFixed(0).padStart(3)} FPS  ` +
      `худший кадр ${(1000 / worst.ms).toFixed(0).padStart(3)} ` +
      `(на ${Math.round(((worst.y - top) / span) * 100)}% сцены)  ` +
      `в 95% случаев не хуже ${(1000 / p95.ms).toFixed(0)}`
  );
}

await browser.close();
