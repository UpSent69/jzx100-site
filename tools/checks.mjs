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
  // Кнопок входа две - RU и ENG. Обычный проход идёт по русской: она первая.
  await page.click("[data-preloader-enter]");
  await sleep(1500);
}

/** Что написано на кнопках входа. Читается до входа, пока прелоадер на месте. */
async function readEnterButtons(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("[data-preloader-enter]")].map((b) =>
      b.textContent.replace(/\s+/g, " ").trim()
    )
  );
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
  const enterButtons = await readEnterButtons(page);
  await enter(page);

  check(
    "прелоадер убран после входа",
    (await page.$("[data-preloader]")) === null
  );
  check(
    "прокрутка разблокирована",
    !(await page.evaluate(() => document.body.hasAttribute("data-locked")))
  );

  // Локализация. Русский лежит в разметке, английский - рядом атрибутами;
  // проверяем не отдельные строки, а то, что после входа по-английски
  // на странице не осталось ни одного русского текста и ни одного русского
  // alt или aria-label. Такую проверку не обмануть частичным переводом.
  check("на входе две кнопки языка", enterButtons.length === 2,
    enterButtons.join(" / "));

  // Плеер и фоновая музыка. Проверяем здесь, а не вместе с остальным звуком
  // ниже: сюда мы приходим сразу после входа, курсор ещё ни на чём не стоит
  // и ничто не держит музыку приглушённой.
  await sleep(1200);
  const music = await page.evaluate(() => {
    const a = window.__music;
    const pl = document.querySelector("[data-player]");
    return {
      есть: !!a,
      играет: a ? !a.paused : false,
      громкость: a ? +a.volume.toFixed(2) : 0,
      трек: a ? (a.currentSrc || "").split("/").pop() : "",
      название: pl.querySelector("[data-player-name]").textContent.trim(),
      длина: pl.querySelector("[data-player-len]").textContent,
      обложка: !!pl.querySelector("[data-player-cover]")?.complete,
      угла_справа_нет: !document.querySelector(".dock"),
    };
  });
  check("фоновая музыка идёт после входа", music.есть && music.играет,
    `трек ${music.трек}, громкость ${music.громкость}`);
  check("в плеере есть обложка, название и длительность",
    music.обложка && music.название.length > 3 && /^[0-9]+:[0-9]{2}$/.test(music.длина),
    `${music.название} - ${music.длина}`);
  check("угол звука справа убран", music.угла_справа_нет);

  // Через десять секунд без движения в зоне плеера он сжимается в кружок.
  // Ждём двенадцать: переход занимает треть секунды, плюс запас.
  const folded = await page.evaluate(async () => {
    const el = document.querySelector("[data-player]");
    await new Promise((r) => setTimeout(r, 12000));
    const st = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      сжат: el.dataset.idle === "true",
      круглый: st.borderRadius.startsWith("999"),
      квадрат: Math.abs(r.width - r.height) < 2 && r.width < 60,
      прозрачный: +st.opacity < 0.6,
      треугольник: +getComputedStyle(el.querySelector(".player__bubble")).opacity > 0.9,
      музыка: !window.__music.paused,
    };
  });
  check("через десять секунд плеер сжимается в кружок",
    folded.сжат && folded.круглый && folded.квадрат && folded.треугольник);
  check("свёрнутый кружок полупрозрачен", folded.прозрачный);
  check("свёрнутый плеер музыку не останавливает", folded.музыка);

  const unfolded = await page.evaluate(async () => {
    const el = document.querySelector("[data-player]");
    el.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 900));
    const r = el.getBoundingClientRect();
    return { сжат: el.dataset.idle === "true", высота: Math.round(r.height), ширина: Math.round(r.width) };
  });
  check("наведение разворачивает плеер обратно",
    !unfolded.сжат && unfolded.высота > 100 && unfolded.ширина > 200,
    `${unfolded.ширина}x${unfolded.высота}`);

  // Ролик первого экрана ведёт прокрутка: положение в ролике должно повторять
  // положение на странице и отматываться назад вместе с ней.
  //
  // Третьего экрана в этом списке больше нет: там теперь петля, а не перемотка,
  // и проверяется она ниже — по другому признаку.
  for (const [label, name, sel, from, to] of [
    ["первый экран", "hero", "[data-hero-video]", 0.55, 0.95],
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

  // Третий экран: ролик идёт петлёй, пока сцена в окне, и встаёт за её
  // пределами. Прокрутка его не перематывает — по ней проверять нечего,
  // проверяем ровно то, чем петля отличается от перемотки: он играет сам
  // и время в нём растёт без участия скролла.
  await scrollWithin(page, "motion", 0.4);
  await sleep(1600);
  const loop = await page.evaluate(async () => {
    const v = document.querySelector("[data-motion-video]");
    const was = v.currentTime;
    await new Promise((r) => setTimeout(r, 1200));
    return { играет: !v.paused, петля: v.loop, беззвучно: v.muted,
             прирост: +(v.currentTime - was).toFixed(2) };
  });
  check("ролик третьего экрана идёт сам", loop.играет && loop.прирост > 0.5,
    `за 1.2 с прошло ${loop.прирост} с`);
  check("ролик третьего экрана зациклен и беззвучен", loop.петля && loop.беззвучно);

  await scrollWithin(page, "hero", 0.2);
  await sleep(1600);
  check("за пределами экрана ролик встаёт",
    await page.evaluate(() => document.querySelector("[data-motion-video]").paused));

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

  // Проверки идут после перезагрузки, а она вернула прелоадер: пока в него
  // не вошли, тело страницы заперто и по кнопке в паузе не кликнуть.
  await enter(page);

  // Проверка звука ниже идёт следом за проверкой переключателя, а та оставляла его
  // выключенным — и наведение честно молчало. Возвращаем звук, иначе проверяли
  // бы не наведение, а запрет.
  if (await page.evaluate(() => document.querySelector("[data-sound-toggle]").dataset.on !== "true")) {
    await page.click("[data-sound-toggle]");
    await sleep(250);
  }

  // --- второе пространство, «Keep it street» ---
  //
  // Проверяем ровно то, чего не видно на снимке: что пять роликов не уходят
  // в сеть, пока кнопку не нажали, что слой запирает страницу под собой
  // и отпускает её на том же месте, и что звук по наведению ведёт себя
  // как везде на сайте — приходит на половине громкости и уходит,
  // не останавливая кадр.
  await page.evaluate(() => {
    const el = document.querySelector(".gap--promo-street");
    const y = el.getBoundingClientRect().top + window.scrollY - 200;
    window.__lenis ? window.__lenis.scrollTo(y, { immediate: true }) : window.scrollTo(0, y);
  });
  await sleep(1400);

  const untouched = await page.evaluate(() =>
    [...document.querySelectorAll("[data-street-video]")].filter((v) => v.getAttribute("src")).length
  );
  check("ролики второго пространства не грузятся заранее", untouched === 0,
    `с адресом: ${untouched}`);

  const wasAt = await page.evaluate(() => Math.round(window.scrollY));
  await page.click("[data-street-open]");
  await sleep(1400);

  const inside = await page.evaluate(() => {
    const r = document.querySelector("[data-street]");
    return {
      shown: !r.hidden && +getComputedStyle(r).opacity > 0.95,
      locked: document.body.dataset.locked === "true",
      loaded: [...document.querySelectorAll("[data-street-video]")].filter((v) => v.getAttribute("src")).length,
      total: document.querySelectorAll("[data-street-video]").length,
      focused: document.activeElement?.hasAttribute?.("data-street-close") === true,
    };
  });
  check("второе пространство открывается", inside.shown);
  check("за вторым пространством страница заперта", inside.locked);
  check("ролики второго пространства подтянулись при открытии", inside.loaded === inside.total,
    `${inside.loaded} из ${inside.total}`);
  check("фокус уходит на кнопку закрытия пространства", inside.focused);

  // Лента едет своей прокруткой: страница под слоем стоит, и обычный scrollTo
  // тут ничего не сдвинул бы.
  const ride = await page.evaluate(async () => {
    const flow = document.querySelector("[data-street-flow]");
    window.__streetRail.scrollTo(Math.round(flow.scrollHeight * 0.42), { immediate: true });
    await new Promise((r) => setTimeout(r, 800));
    return Math.round(window.__streetRail.scroll);
  });
  check("лента второго пространства едет", ride > 1000, `на ${ride}px`);

  // Подводим к ролику первого разворота вместо того, чтобы искать хоть какой-то
  // видимый на глазок: доля ленты — величина ненадёжная, стоит добавить в слой
  // материал, и та же доля попадает уже в пустое место между разделами.
  await page.evaluate(async () => {
    const v = document.querySelectorAll("[data-street-video]")[1];
    const box = v.closest(".act__media") || v;
    window.__streetRail.scrollTo(box.offsetTop + box.offsetHeight / 2 - innerHeight / 2, { immediate: true });
    await new Promise((r) => setTimeout(r, 700));
  });
  await sleep(500);

  const sound = await page.evaluate(async () => {
    const vis = [...document.querySelectorAll("[data-street-video]")].find((v) => {
      const r = v.getBoundingClientRect();
      return r.top < innerHeight * 0.8 && r.bottom > innerHeight * 0.2;
    });
    if (!vis) return null;
    vis.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 500));
    const on = { muted: vis.muted, volume: +vis.volume.toFixed(2) };
    vis.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 600));
    return { on, off: { paused: vis.paused, volume: +vis.volume.toFixed(2) } };
  });
  // Здесь ролики немые по решению заказчика: наведение звук не включает.
  check("ролик в пространстве остаётся немым под курсором",
    !!sound && sound.on.muted === true && sound.on.volume === 0,
    sound ? `muted ${sound.on.muted}, громкость ${sound.on.volume}` : "видимого ролика не нашлось");
  check("уход курсора кадр не останавливает",
    !!sound && sound.off.paused === false,
    sound ? `пауза ${sound.off.paused}` : "");

  const playerHere = await page.evaluate(() => {
    const pl = document.querySelector("[data-player]");
    pl.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
    const r = document.querySelector(".player__btn--play").getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!el && !!el.closest(".player");
  });
  check("плеер доступен и в этом пространстве", playerHere);


  await page.keyboard.press("Escape");
  await sleep(900);
  const back = await page.evaluate(() => ({
    hidden: document.querySelector("[data-street]").hidden,
    locked: document.body.dataset.locked === "true",
    y: Math.round(window.scrollY),
  }));
  check("Escape закрывает второе пространство", back.hidden && !back.locked);
  check("после закрытия страница на том же месте", Math.abs(back.y - wasAt) < 40,
    `было ${wasAt}, стало ${back.y}`);



  // --- микшер громкости ---
  //
  // Проверяем главное: общий уровень множится на то, что просит вызывающая
  // сторона, а не заменяет его. Карточка под курсором просит половину
  // громкости; при уровне 40% должно получиться 0.2, а не 0.4 — иначе
  // соотношение между наведением и раскрытой карточкой поехало бы.
  await page.evaluate(() => {
    const r = document.querySelector("[data-sound-volume]");
    r.value = "40";
    r.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await sleep(300);
  check("уровень громкости запоминается",
    (await page.evaluate(() => localStorage.getItem("markii:volume"))) === "0.4");

  await toCards(page);
  await sleep(1600);
  const mixed = await page.evaluate(async () => {
    const v = document.querySelector(".card video");
    v.closest(".card").dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 700));
    return { muted: v.muted, volume: +v.volume.toFixed(3) };
  });
  check("общий уровень множится, а не заменяет", !mixed.muted && Math.abs(mixed.volume - 0.2) < 0.02,
    `громкость ${mixed.volume} при половине от 40%`);

  const zero = await page.evaluate(async () => {
    const r = document.querySelector("[data-sound-volume]");
    r.value = "0";
    r.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((x) => setTimeout(x, 300));
    return document.querySelector("[data-sound-toggle]").dataset.on;
  });
  check("ноль на ползунке выключает звук", zero === "false");

  const backUp = await page.evaluate(async () => {
    const r = document.querySelector("[data-sound-volume]");
    r.value = "100";
    r.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((x) => setTimeout(x, 300));
    return document.querySelector("[data-sound-toggle]").dataset.on;
  });
  check("шаг вверх с нуля возвращает звук", backUp === "true");

  // --- третье пространство, «Культ JDM» ---
  //
  // Проверяем то, чего не видно на снимке: что фон и ролики не уходят в сеть,
  // пока кнопку не нажали; что фон идёт, пока слой открыт, и встаёт вместе
  // с ним — иначе он крутился бы за закрытым пространством всю остальную
  // страницу; что лента едет вбок и что звук по наведению ведёт себя
  // как везде.
  await page.evaluate(() => {
    const el = document.querySelector(".promo--cult");
    const r = el.getBoundingClientRect();
    const y = r.top + window.scrollY - (window.innerHeight - r.height) / 2;
    window.__lenis ? window.__lenis.scrollTo(y, { immediate: true }) : window.scrollTo(0, y);
  });
  await sleep(1400);

  const cultCold = await page.evaluate(() =>
    [...document.querySelectorAll("[data-cult-bg], [data-cult-video]")]
      .filter((v) => v.getAttribute("src")).length
  );
  check("материалы третьего пространства не грузятся заранее", cultCold === 0,
    `с адресом: ${cultCold}`);

  await page.click("button[data-cult-open]");
  await sleep(1800);

  const cult = await page.evaluate(() => {
    const r = document.querySelector("[data-cult]");
    const bg = document.querySelector("[data-cult-bg]");
    return {
      shown: !r.hidden && +getComputedStyle(r).opacity > 0.95,
      locked: document.body.dataset.locked === "true",
      loaded: [...document.querySelectorAll("[data-cult-bg], [data-cult-video]")]
        .filter((v) => v.getAttribute("src")).length,
      total: document.querySelectorAll("[data-cult-bg], [data-cult-video]").length,
      bgPlays: !bg.paused,
      focused: document.activeElement?.hasAttribute?.("data-cult-close") === true,
    };
  });
  check("третье пространство открывается", cult.shown);
  check("за третьим пространством страница заперта", cult.locked);
  check("материалы третьего пространства подтянулись при открытии",
    cult.loaded === cult.total, `${cult.loaded} из ${cult.total}`);
  check("фон третьего пространства идёт", cult.bgPlays);
  check("фокус уходит на кнопку закрытия третьего пространства", cult.focused);

  const cultRide = await page.evaluate(async () => {
    const t = document.querySelector("[data-cult-track]");
    window.__cultRail.scrollTo(Math.round(t.scrollWidth * 0.45), { immediate: true });
    await new Promise((r) => setTimeout(r, 900));
    return Math.round(window.__cultRail.scroll);
  });
  check("лента третьего пространства едет вбок", cultRide > 1000, `на ${cultRide}px`);

  // Подводим к первому ролику, а не ищем хоть какой-то видимый на глазок:
  // доля ленты — величина ненадёжная, ролики лежат в развалах между
  // текстовыми панелями, и середина ленты приходится ровно на текст.
  await page.evaluate(async () => {
    const v = document.querySelector("[data-cult-video]");
    const box = v.closest(".slab") || v;
    // offsetLeft здесь врёт: у карточки свой позиционированный предок,
    // и отсчёт идёт от него, а не от начала ленты. Меряем от ленты напрямую.
    const t = document.querySelector("[data-cult-track]");
    const r = box.getBoundingClientRect();
    const at = r.left - t.getBoundingClientRect().left + r.width / 2 - innerWidth / 2;
    window.__cultRail.scrollTo(at, { immediate: true });
    await new Promise((r) => setTimeout(r, 700));
  });
  await sleep(600);

  const cultSound = await page.evaluate(async () => {
    const vis = [...document.querySelectorAll("[data-cult-video]")].find((v) => {
      const r = v.getBoundingClientRect();
      return r.right > 0 && r.left < innerWidth;
    });
    if (!vis) return null;
    vis.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 500));
    const on = { muted: vis.muted, volume: +vis.volume.toFixed(2) };
    vis.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 600));
    return { on, off: { paused: vis.paused, volume: +vis.volume.toFixed(2) } };
  });
  check("ролик третьего пространства звучит под курсором",
    !!cultSound && !cultSound.on.muted && cultSound.on.volume > 0.4,
    cultSound ? `громкость ${cultSound.on.volume}` : "видимого ролика не нашлось");
  check("уход курсора снимает звук, но не кадр",
    !!cultSound && cultSound.off.paused === false && cultSound.off.volume < 0.05);

  await page.keyboard.press("Escape");
  await sleep(900);
  const cultShut = await page.evaluate(() => ({
    hidden: document.querySelector("[data-cult]").hidden,
    locked: document.body.dataset.locked === "true",
    bgPaused: document.querySelector("[data-cult-bg]").paused,
  }));
  check("Escape закрывает третье пространство", cultShut.hidden && !cultShut.locked);
  check("фон встаёт вместе с закрытым пространством", cultShut.bgPaused);

  // --- пятое пространство, «Самурай в цветах сакуры» ---

  const sakuCold = await page.evaluate(
    () =>
      [...document.querySelectorAll("[data-saku-video]")].filter((v) => v.getAttribute("src"))
        .length
  );
  check("материалы пятого пространства не грузятся заранее", sakuCold === 0,
    `подтянулось ${sakuCold}`);

  await page.click("button[data-saku-open]");
  await sleep(1800);

  const saku = await page.evaluate(() => {
    const r = document.querySelector("[data-saku]");
    const clips = [...document.querySelectorAll("[data-saku-video]")];
    return {
      shown: !r.hidden && +getComputedStyle(r).opacity > 0.9,
      locked: document.body.dataset.locked === "true",
      loaded: clips.filter((v) => v.getAttribute("src")).length,
      total: clips.length,
      focused: document.activeElement?.hasAttribute?.("data-saku-close") === true,
      start: Math.round(window.__sakuRail.scroll),
    };
  });
  check("пятое пространство открывается", saku.shown);
  check("за пятым пространством страница заперта", saku.locked);
  check("ролики пятого пространства подтянулись при открытии",
    saku.loaded === saku.total, `${saku.loaded} из ${saku.total}`);
  check("фокус уходит на кнопку закрытия пятого пространства", saku.focused);
  check("пятое пространство открывается с начала", saku.start === 0);

  const sakuRide = await page.evaluate(async () => {
    const flow = document.querySelector("[data-saku-flow]");
    window.__sakuRail.scrollTo(Math.round(flow.scrollHeight * 0.4), { immediate: true });
    await new Promise((r) => setTimeout(r, 900));
    return Math.round(window.__sakuRail.scroll);
  });
  check("лента пятого пространства едет вниз", sakuRide > 1000, `на ${sakuRide}px`);

  // Разделов здесь семь видов, и каждый должен занимать своё место, а не
  // схлопываться в ноль: проверка ловит как раз это - например, когда класс
  // раздела совпал с чужим и его забрали себе чужие правила.
  const sakuBoxes = await page.evaluate(() =>
    [".gate", ".column", ".fan", ".crest", ".pair", ".strip", ".saku__end"].map(
      (sel) => ({ sel, h: document.querySelector(sel)?.offsetHeight || 0 })
    )
  );
  const flat = sakuBoxes.filter((b) => b.h < 300);
  check("все разделы пятого пространства стоят в полный рост", flat.length === 0,
    flat.map((b) => `${b.sel} ${b.h}px`).join(", "));

  // Ни один кадр не обрезан и не растянут: у ленты и веера это делает
  // контейнер, а вот у ролика и крупных кадров ширину считает сам файл.
  const sakuFit = await page.evaluate(() => {
    const v = document.querySelector(".gate__media--clip video");
    const box = v.getBoundingClientRect();
    return {
      родное: +(v.videoWidth / v.videoHeight).toFixed(2),
      показ: +(box.width / box.height).toFixed(2),
    };
  });
  check("ролик пятого пространства идёт в своих пропорциях",
    Math.abs(sakuFit.родное - sakuFit.показ) < 0.02,
    `файл ${sakuFit.родное}, на экране ${sakuFit.показ}`);

  const sakuSound = await page.evaluate(async () => {
    // Оба ролика теперь стоят во вступлении, рядом. Звук по наведению есть
    // только у второго - первый фоновый и молчит всегда.
    const solo = document.querySelector(".gate__media--clip video");
    window.__sakuRail.scrollTo(0, { immediate: true });
    await new Promise((r) => setTimeout(r, 1400));
    solo.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 600));
    const on = { muted: solo.muted, v: +solo.volume.toFixed(2) };
    solo.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 700));
    const off = { v: +solo.volume.toFixed(2), playing: !solo.paused };
    // Не просто .gate__media video: у ролика ленты тот же класс, и в разметке
    // он стоит первым - выборка без уточнения возвращала бы как раз его.
    const intro = document.querySelector(".gate__media:not(.gate__media--clip) video");
    intro.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 600));
    const res = { on, off, introVolume: +intro.volume.toFixed(2), introMuted: intro.muted };
    // Курсор обязательно уводим: брошенное наведение держит музыку
    // приглушённой, и следующие проверки мерили бы уже последствия этой.
    intro.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 500));
    return res;
  });
  check("ролик пятого пространства звучит под курсором",
    !sakuSound.on.muted && sakuSound.on.v > 0.4, `громкость ${sakuSound.on.v}`);
  check("уход курсора снимает звук, но не кадр",
    sakuSound.off.v < 0.05 && sakuSound.off.playing);
  check("ролик вступления тоже звучит под курсором",
    !sakuSound.introMuted && sakuSound.introVolume > 0.4,
    `громкость ${sakuSound.introVolume}`);

  await page.keyboard.press("Escape");
  await sleep(900);
  const sakuShut = await page.evaluate(() => ({
    hidden: document.querySelector("[data-saku]").hidden,
    locked: document.body.dataset.locked === "true",
  }));
  check("Escape закрывает пятое пространство", sakuShut.hidden && !sakuShut.locked);

  // --- плеер и фоновая музыка ---

  // Звук выше по ходу выключали и включали обратно; здесь только убеждаемся,
  // что он включён, и снимаем браузерный запрет - после перезагрузки страницы,
  // которая была выше, он снова стоит.
  await page.evaluate(() => {
    const b = document.querySelector("[data-sound-toggle]");
    if (b.dataset.on === "true") b.click();
    b.click();
  });
  await sleep(1500);

  // Ролик под курсором глушит музыку, и после ухода она продолжается с того
  // же места. «С того же» проверяем так: пауза случилась на секунде X,
  // и через t секунд после возврата время должно быть около X + t.
  await toCards(page);
  await page.hover("[data-card]");
  await sleep(900);
  const ducked = await page.evaluate(() => ({
    стоит: window.__music.paused,
    громкость: +window.__music.volume.toFixed(2),
    момент: window.__music.currentTime,
  }));
  check("под курсором ролика музыка отходит", ducked.стоит && ducked.громкость < 0.05,
    `пауза ${ducked.стоит}, громкость ${ducked.громкость}`);

  await page.mouse.move(10, 10);
  await sleep(1400);
  const resumed = await page.evaluate(() => ({
    играет: !window.__music.paused,
    громкость: +window.__music.volume.toFixed(2),
    момент: window.__music.currentTime,
  }));
  const drift = Math.abs(resumed.момент - ducked.момент - 1.4);
  check("после ухода курсора музыка продолжается с того же места",
    resumed.играет && resumed.громкость > 0.2 && drift < 0.7,
    `${ducked.момент.toFixed(2)} → ${resumed.момент.toFixed(2)} c`);

  const buttons = await page.evaluate(async () => {
    const now = () => (window.__music.currentSrc || "").split("/").pop();
    document.querySelector("[data-player-next]").click();
    await new Promise((r) => setTimeout(r, 1200));
    const next = now();
    document.querySelector("[data-player-prev]").click();
    await new Promise((r) => setTimeout(r, 1200));
    const back = now();
    document.querySelector("[data-player-play]").click();
    await new Promise((r) => setTimeout(r, 800));
    const stopped = window.__music.paused;
    document.querySelector("[data-player-play]").click();
    await new Promise((r) => setTimeout(r, 900));
    return { next, back, stopped, снова: !window.__music.paused };
  });
  check("кнопки вперёд и назад переключают трек",
    buttons.next !== buttons.back, `${buttons.back} → ${buttons.next}`);
  check("кнопка стоп останавливает и запускает музыку",
    buttons.stopped && buttons.снова);

  const musicMix = await page.evaluate(async () => {
    const r = document.querySelector("[data-sound-volume]");
    r.value = "40";
    r.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((x) => setTimeout(x, 700));
    const v = +window.__music.volume.toFixed(2);
    r.value = "100";
    r.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((x) => setTimeout(x, 700));
    return { на40: v, на100: +window.__music.volume.toFixed(2) };
  });
  check("ползунок ведёт и музыку", musicMix.на40 < musicMix.на100 && musicMix.на40 > 0,
    `40% → ${musicMix.на40}, 100% → ${musicMix.на100}`);

  // Открывать должна вся иллюстрация, а не только кнопка на ней.
  for (const [name, card, layer] of [
    ["первое", ".gap--promo:not(.gap--promo-street) .promo__art", "[data-space]"],
    ["второе", ".promo--street .promo__art", "[data-street]"],
  ]) {
    const opened = await page.evaluate(async (c, l) => {
      document.querySelector(c).dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 1200));
      const el = document.querySelector(l);
      return !el.hidden && +getComputedStyle(el).opacity > 0.9;
    }, card, layer);
    check(`клик по иллюстрации открывает ${name} пространство`, opened);
    await page.keyboard.press("Escape");
    await sleep(700);
  }

  // Звук должен быть доступен внутри каждого пространства: там звучат ролики,
  // и там же играет фоновая музыка. Копий плеера в слоях нет — он один
  // и всплывает над открытым слоем, поэтому проверяем не наличие в разметке,
  // а то, что нажатие в его точке достаётся именно ему, а не слою сверху.
  for (const [label, opener, layer] of [
    ["первом", "[data-space-open]", "[data-space]"],
    ["втором", "button[data-street-open]", "[data-street]"],
    ["третьем", "button[data-cult-open]", "[data-cult]"],
    ["пятом", "button[data-saku-open]", "[data-saku]"],
  ]) {
    await page.evaluate((sel) => document.querySelector(sel).click(), opener);
    await sleep(1500);
    const reach = await page.evaluate((l) => {
      // Плеер к этому времени мог свернуться в кружок - тогда кнопки в нём
      // не нажать. Будим его, как это сделал бы курсор.
      const pl = document.querySelector("[data-player]");
      pl.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
      const r = document.querySelector(".sound").getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { open: !document.querySelector(l).hidden, hit: !!el && !!el.closest(".player") };
    }, layer);
    check(`плеер доступен в ${label} пространстве`, reach.open && reach.hit);
    await page.keyboard.press("Escape");
    await sleep(800);
  }


  // Подключённый браузер закрывать нельзя — он не наш: гасим только страницу.
  if (REMOTE) { await page.close(); await browser.disconnect(); }
  else await browser.close();
}

// --- проход на английском ---------------------------------------------------
{
  const { browser, page } = await open();
  await page.waitForSelector('[data-preloader][data-ready="true"]', { timeout: 20000 });
  await page.click('[data-lang-pick="en"]');
  await sleep(2500);

  const left = await page.evaluate(() => {
    const texts = [];
    document.querySelectorAll("body *").forEach((el) => {
      if (el.closest("script,style")) return;
      for (const n of el.childNodes) {
        if (n.nodeType === 3 && /[А-Яа-яЁё]/.test(n.textContent) && n.textContent.trim()) {
          texts.push((el.className || el.tagName) + ": " + n.textContent.trim().slice(0, 40));
        }
      }
    });
    const attrs = [];
    document.querySelectorAll("[alt],[aria-label],[content]").forEach((el) => {
      for (const a of ["alt", "aria-label", "content"]) {
        const v = el.getAttribute(a);
        if (v && /[А-Яа-яЁё]/.test(v)) attrs.push(`${a}: ${v.slice(0, 40)}`);
      }
    });
    return { texts, attrs, lang: document.documentElement.lang };
  });
  check("на английском не осталось русского текста", left.texts.length === 0,
    left.texts.slice(0, 3).join(" | "));
  check("на английском переведены alt, aria-label и описание страницы",
    left.attrs.length === 0, left.attrs.slice(0, 3).join(" | "));
  check("на английском выставлен lang", left.lang === "en", left.lang);

  await page.reload({ waitUntil: "networkidle2", timeout: 60000 });
  await sleep(2500);
  const kept = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    ru: document.querySelector('[data-lang-pick="ru"]').textContent.includes("Войти"),
  }));
  check("выбранный язык переживает перезагрузку", kept.lang === "en");
  check("кнопка RU остаётся русской и на английской версии", kept.ru);

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
