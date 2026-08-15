/**
 * Проверки поведения, которых не видно на скриншотах: раскрытие карточки,
 * возврат фокуса, переключатель звука и его запоминание, реакция на
 * prefers-reduced-motion.
 *
 *   node tools/checks.mjs [адрес]
 */
import puppeteer from "puppeteer-core";

const URL = process.argv[2] || "http://localhost:4175/";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

const results = [];
const check = (name, ok, extra = "") =>
  results.push(`${ok ? "  ок " : "ОШИБКА"}  ${name}${extra ? " — " + extra : ""}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Edge — приложение с одним экземпляром на профиль: когда обычное окно уже
// открыто, запуск нового он иногда перехватывает и тут же выходит, а puppeteer
// видит только «процесс закрылся с кодом 0». Чтобы проверки не зависели
// от того, открыт ли у кого-то браузер, их можно направить в уже запущенный:
//
//   msedge --headless=new --remote-debugging-port=9333 --user-data-dir=<своя папка>
//   MARKII_BROWSER=http://127.0.0.1:9333 node tools/checks.mjs <адрес>
const REMOTE = process.env.MARKII_BROWSER;

const viewport = { width: 1600, height: 900, deviceScaleFactor: 1 };

async function open(opts = {}) {
  const browser = REMOTE
    ? await puppeteer.connect({ browserURL: REMOTE, defaultViewport: viewport })
    : await puppeteer.launch({
        executablePath: EDGE,
        headless: "new",
        args: ["--autoplay-policy=no-user-gesture-required"],
        defaultViewport: viewport,
      });
  const page = await browser.newPage();
  if (opts.reducedMotion) {
    await page.emulateMediaFeatures([
      { name: "prefers-reduced-motion", value: "reduce" },
    ]);
  }
  await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });

  // Сайт запоминает выбор звука, а при подключении к уже запущенному браузеру
  // профиль у всех прогонов общий — «выкл» с прошлого раза утекал в следующий,
  // и проверка звука мигала через раз. Чистим и перезагружаемся: дальше по ходу
  // проверок страница перезагружается ещё раз, но уже осознанно — как раз чтобы
  // убедиться, что выбор сохраняется.
  await page.evaluate(() => {
    try {
      localStorage.clear();
    } catch {}
  });
  await page.reload({ waitUntil: "networkidle2", timeout: 60000 });

  return { browser, page };
}

async function enter(page) {
  await page.waitForSelector('[data-preloader][data-ready="true"]', { timeout: 20000 });
  await page.click("[data-preloader-enter]");
  await sleep(1500);
}

async function scrollWithin(page, name, ratio) {
  await page.evaluate(
    (n, r) => {
      const el = document.querySelector(`[data-screen="${n}"]`);
      const box = el.closest(".pin-spacer") || el;
      const top = box.getBoundingClientRect().top + window.scrollY;
      const span = Math.max(1, box.offsetHeight - window.innerHeight);
      const y = top + span * r;
      if (window.__lenis) window.__lenis.scrollTo(y, { immediate: true });
      else window.scrollTo(0, y);
    },
    name,
    ratio
  );
}

async function toCards(page) {
  await page.evaluate(() => {
    const el = document.querySelector('[data-screen="cards"]');
    const y = el.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.2;
    if (window.__lenis) window.__lenis.scrollTo(y, { immediate: true });
    else window.scrollTo(0, y);
  });
  await sleep(1200);
}

// --- основной проход -------------------------------------------------------
{
  const { browser, page } = await open();
  await enter(page);

  check(
    "прелоадер убран после входа",
    (await page.$("[data-preloader]")) === null
  );
  check(
    "прокрутка разблокирована",
    !(await page.evaluate(() => document.body.hasAttribute("data-locked")))
  );

  // Ролики ведёт прокрутка: положение в ролике должно повторять положение
  // на странице и отматываться назад вместе с ней.
  for (const [label, name, sel, from, to] of [
    ["первый экран", "hero", "[data-hero-video]", 0.55, 0.95],
    ["третий экран", "motion", "[data-motion-video]", 0.35, 0.95],
  ]) {
    const seen = [];
    for (const r of [from, to, from]) {
      await scrollWithin(page, name, r);
      await sleep(1400);
      seen.push(await page.evaluate((s) => document.querySelector(s).currentTime, sel));
    }
    const [a, b, c] = seen;
    check(`ролик ${label} идёт вперёд по прокрутке`, b > a + 0.2,
      `${a.toFixed(2)} → ${b.toFixed(2)} c`);
    check(`ролик ${label} отматывается назад`, c < b - 0.2,
      `${b.toFixed(2)} → ${c.toFixed(2)} c`);
    check(`ролик ${label} не проигрывается сам`,
      await page.evaluate((s) => document.querySelector(s).paused, sel));
  }

  await toCards(page);
  await sleep(1600);

  // Появления обязаны доигрывать до конца. Если сцене задать scrub по
  // умолчанию, его наследуют и они — тогда элемент навсегда застревает
  // на полпути, и заметить это на глаз почти нельзя.
  const settled = await page.evaluate(() =>
    [...document.querySelectorAll("[data-card]")].map((c) => {
      const m = new DOMMatrixReadOnly(getComputedStyle(c).transform);
      return Math.round(Math.abs(m.f) * 10) / 10;
    })
  );
  check("карточки доезжают до своего места", settled.every((v) => v === 0),
    `сдвиг по вертикали: ${settled.join(", ")} px`);

  // наведение: постер уходит, видео играет
  await page.hover("[data-card]");
  await sleep(600);
  const hovered = await page.evaluate(() => {
    const card = document.querySelector("[data-card]");
    const v = card.querySelector("[data-card-video]");
    return {
      playing: card.dataset.playing,
      paused: v.paused,
      t: v.currentTime,
      muted: v.muted,
      volume: v.volume,
      label: document.querySelector("[data-sound-label]").textContent,
    };
  });
  check("наведение запускает видео", hovered.playing === "true" && !hovered.paused,
    `currentTime=${hovered.t.toFixed(2)}`);
  check("карточка под курсором звучит", !hovered.muted && hovered.volume > 0.4,
    `беззвучно=${hovered.muted}, громкость=${hovered.volume.toFixed(2)}`);
  check("на переключателе написано состояние звука", /вкл|выкл/.test(hovered.label),
    `подпись: «${hovered.label}»`);

  // уход курсора: возврат в постер и отмотка на начало
  await page.mouse.move(10, 10);
  await sleep(900);
  const left = await page.evaluate(() => {
    const card = document.querySelector("[data-card]");
    const v = card.querySelector("[data-card-video]");
    return { playing: card.dataset.playing, paused: v.paused, t: v.currentTime };
  });
  check("уход курсора возвращает постер и отматывает",
    left.playing === "false" && left.paused && left.t === 0, `currentTime=${left.t}`);

  // раскрытие по клику
  await page.click("[data-card]");
  await sleep(800);
  const box = await page.evaluate(() => {
    const b = document.querySelector("[data-lightbox]");
    const v = b.querySelector("video");
    return {
      open: !b.hidden,
      looping: v?.loop ?? null,
      playing: v ? !v.paused : null,
      locked: document.body.hasAttribute("data-locked"),
      focusOnClose: document.activeElement?.hasAttribute("data-lightbox-close"),
    };
  });
  check("клик раскрывает карточку", box.open);
  check("в раскрытой карточке видео в петле и играет", box.looping === true && box.playing === true);
  check("за раскрытой карточкой страница заблокирована", box.locked === true);
  check("фокус уходит на кнопку закрытия", box.focusOnClose === true);

  await page.keyboard.press("Escape");
  await sleep(500);
  const shut = await page.evaluate(() => ({
    open: !document.querySelector("[data-lightbox]").hidden,
    locked: document.body.hasAttribute("data-locked"),
  }));
  check("Escape закрывает карточку", !shut.open && !shut.locked);

  // переключатель звука
  const before = await page.evaluate(() =>
    document.querySelector("[data-sound-toggle]").dataset.on
  );
  await page.click("[data-sound-toggle]");
  await sleep(200);
  const after = await page.evaluate(() => ({
    on: document.querySelector("[data-sound-toggle]").dataset.on,
    stored: localStorage.getItem("markii:sound"),
  }));
  check("переключатель звука меняет состояние", before !== after.on);
  check("выбор звука запоминается", after.stored === (after.on === "true" ? "on" : "off"),
    `в хранилище: ${after.stored}`);

  await page.reload({ waitUntil: "networkidle2" });
  const restored = await page.evaluate(() =>
    document.querySelector("[data-sound-toggle]").dataset.on
  );
  check("выбор звука переживает перезагрузку", restored === after.on);

  // Подключённый браузер закрывать нельзя — он не наш: гасим только страницу.
  if (REMOTE) { await page.close(); await browser.disconnect(); }
  else await browser.close();
}

// --- проход без движения ---------------------------------------------------
{
  const { browser, page } = await open({ reducedMotion: true });
  await enter(page);

  const state = await page.evaluate(() => {
    const hero = document.querySelector('[data-screen="hero"]');
    const v = hero.querySelector("[data-hero-video]");
    const letters = hero.querySelector("[data-letter]");
    return {
      heroHeight: hero.getBoundingClientRect().height,
      vh: window.innerHeight,
      videoPaused: v.paused,
      lettersVisible: getComputedStyle(letters).opacity,
      lenis: !!window.__lenis,
    };
  });

  check("без движения первый экран не растянут на 300vh",
    Math.abs(state.heroHeight - state.vh) < 4, `${Math.round(state.heroHeight)}px при vh ${state.vh}`);
  check("без движения фоновый ролик не играет", state.videoPaused === true);
  check("без движения композиция остаётся целой", state.lettersVisible === "1");
  check("без движения инерционная прокрутка выключена", state.lenis === false);

  // Подключённый браузер закрывать нельзя — он не наш: гасим только страницу.
  if (REMOTE) { await page.close(); await browser.disconnect(); }
  else await browser.close();
}

console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("ОШИБКА")) ? 1 : 0);
