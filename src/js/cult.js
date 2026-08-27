import gsap from "gsap";
import Lenis from "lenis";
import { ease, lenisInstance, reducedMotion } from "./motion.js";
import { fadeVolume, onSoundChange, soundAllowed } from "./audio.js";

/**
 * Третье пространство — «Культ JDM». Открывается второй карточкой
 * из второй чёрной паузы.
 *
 * Лента едет вбок, как в первом пространстве: приём тот же, и он же здесь
 * самый уместный. Отличий от первого два, и оба лежат не в коде, а в том,
 * что код обслуживает:
 *
 *   * фон один на всю ленту и живой. В первом пространстве фоном каждого
 *     раздела была своя фотография, и вместе с лентой она уезжала; здесь
 *     под лентой идёт ролик, который стоит на месте. Отсюда лишняя забота:
 *     его надо подтянуть при открытии и остановить при закрытии, иначе он
 *     крутится за закрытым слоем;
 *   * панели разной ширины. Считалке затухания это безразлично — она меряет
 *     каждый блок по факту, — но именно поэтому мерить приходится по факту,
 *     а не по номеру раздела.
 *
 * Живёт отдельным файлом рядом с двумя другими пространствами по той же
 * причине, что и второе: общего у них только оболочка, а сводить три разных
 * раскладки в один настраиваемый модуль означало бы переписать два
 * работающих ради третьего.
 */
export function initCult(root) {
  if (!root) return;

  const openers = document.querySelectorAll("[data-cult-open]");
  if (!openers.length) return;

  const scroller = root.querySelector("[data-cult-scroll]");
  const track = root.querySelector("[data-cult-track]");
  const inner = root.querySelector("[data-cult-inner]");
  const close = root.querySelector("[data-cult-close]");
  const bg = root.querySelector("[data-cult-bg]");
  const clips = [...root.querySelectorAll("[data-cult-video]")];

  let open = false;
  let returnFocus = null;
  let tl = null;
  let rail = null;
  let loaded = false;

  /* ПРОКРУТКА ------------------------------------------------------------
     Боковая и сглаженная — той же, что и на странице, только повёрнутой.
     Отдельный экземпляр нужен потому, что страница под слоем в это время
     стоит: её Lenis остановлен, и крутить содержимое слоя ему нечем.

     gestureOrientation: "both" — колесо мыши крутит только по вертикали,
     и без этого лента не поехала бы от него вовсе. */
  if (scroller && track && !reducedMotion) {
    rail = new Lenis({
      wrapper: scroller,
      content: track,
      orientation: "horizontal",
      gestureOrientation: "both",
      lerp: 0.07, // столько же, сколько у страницы: ход один и тот же
      wheelMultiplier: 1.1,
      smoothWheel: true,
      syncTouch: true,
    });

    gsap.ticker.add((time) => rail.raf(time * 1000));
    rail.stop(); // пока слой закрыт, ей делать нечего

    // Ручка для снималки кадров из tools/: прямое присваивание scrollLeft
    // здесь не работает, Lenis каждый кадр возвращает своё значение обратно.
    window.__cultRail = rail;

    rail.on("scroll", ({ scroll }) => fade(scroll));
  }

  /* ЗАТУХАНИЕ ПО ХОДУ ----------------------------------------------------
     Гаснет и проявляется всё содержимое ленты. Фон не трогаем — он один
     на всё пространство и никуда не едет.

     Положения меряются один раз и складываются в таблицу. Читать
     getBoundingClientRect на каждом кадре нельзя: полтора десятка блоков —
     это полтора десятка принудительных пересчётов раскладки в кадр. */
  const fading = [...root.querySelectorAll(".cult__open, .cult__end, .leaf, .slab, .rack__note")];
  let boxes = [];

  const measure = () => {
    if (!track) return;
    const base = track.getBoundingClientRect().left;
    boxes = fading.map((el) => {
      const r = el.getBoundingClientRect();
      return { el, left: r.left - base, width: r.width };
    });
  };

  const fade = (scroll) => {
    if (!scroller || !boxes.length) return;
    const vw = scroller.clientWidth;
    // Ход растворения — треть экрана. Меньше читается как мигание, больше —
    // и половина ленты всё время стоит полупрозрачной.
    const span = vw * 0.34;

    for (const b of boxes) {
      const left = b.left - scroll; // где блок относительно окна
      const right = left + b.width;
      const enters = (vw - left) / span; // въезжает справа
      const leaves = right / span; // уезжает влево
      const v = Math.max(0, Math.min(1, enters, leaves));
      b.el.style.opacity = v.toFixed(3);
    }
  };

  /* ЗАГРУЗКА -------------------------------------------------------------
     Фон и два ролика вместе весят под десять мегабайт. Пока кнопку
     не нажали, они не нужны вовсе: у видео стоит preload="none", а адрес
     лежит в data-src и подставляется только при первом открытии. */
  const load = () => {
    if (loaded) return;
    loaded = true;
    [bg, ...clips].forEach((v) => {
      if (!v || !v.dataset.src) return;
      v.src = v.dataset.src;
      v.preload = "auto";
      v.load();
    });
  };

  /* ОТКРЫТИЕ И ЗАКРЫТИЕ -------------------------------------------------- */
  const show = () => {
    if (open) return;
    open = true;
    returnFocus = document.activeElement;

    root.hidden = false;
    document.body.dataset.locked = "true";
    lenisInstance()?.stop(); // за слоем страница стоять должна
    load();
    bg?.play().catch(() => {});

    tl?.kill();

    // Открываем всегда с начала: закрыли на третьем развале — в следующий
    // раз открывалось бы там же. Пересчёт нужен потому, что размеры считаются
    // по видимому элементу, а он до этого был скрыт.
    if (rail) {
      rail.resize();
      rail.scrollTo(0, { immediate: true });
      rail.start();
    } else if (scroller) {
      scroller.scrollTo({ left: 0 });
    }

    measure();
    fade(0);

    if (reducedMotion) {
      gsap.set(root, { opacity: 1 });
      close?.focus();
      return;
    }

    tl = gsap.timeline();
    tl.fromTo(root, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: "none" });
    // Содержимое приходит следом и на волос позже — единственное движение
    // во всём переходе, и оно короткое.
    tl.fromTo(
      inner,
      { x: 20 },
      { x: 0, duration: 0.5, ease: ease.out, onComplete: () => close?.focus() },
      0.1
    );
  };

  const hide = () => {
    if (!open) return;
    open = false;

    const done = () => {
      rail?.stop();
      // Фон обязан встать вместе со слоем: за закрытым пространством он
      // невидим, но продолжал бы крутиться и греть процессор всю остальную
      // страницу.
      bg?.pause();
      clips.forEach((v) => v.pause());
      root.hidden = true;
      gsap.set(root, { opacity: 0 });
      delete document.body.dataset.locked;
      lenisInstance()?.start();
      returnFocus?.focus?.({ preventScroll: true });
    };

    tl?.kill();

    if (reducedMotion) {
      done();
      return;
    }

    tl = gsap.timeline({ onComplete: done });
    tl.to(root, { opacity: 0, duration: 0.35, ease: "none" });
  };

  window.addEventListener("resize", () => {
    measure();
    fade(rail ? rail.scroll : scroller?.scrollLeft || 0);
  });

  // Стрелки листают по экрану. Слушаем на документе, а не на ленте: фокус
  // после открытия стоит на кнопке закрытия, и до ленты нажатия не дошли бы.
  document.addEventListener("keydown", (e) => {
    if (!open || !scroller) return;
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const to = scroller.scrollLeft + dir * scroller.clientWidth * 0.9;
    if (rail) rail.scrollTo(to);
    else scroller.scrollTo({ left: to, behavior: "smooth" });
  });

  /* Ролики в ленте играют, только пока они на экране. Своего ScrollTrigger
     тут нет и быть не может: слой прокручивается внутри себя, а ScrollTrigger
     следит за прокруткой страницы, которая в это время стоит. */
  if (clips.length && scroller) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          const v = e.target;
          if (e.isIntersecting) v.play().catch(() => {});
          else {
            v.pause();
            v.currentTime = 0;
          }
        });
      },
      { root: scroller, threshold: 0.3 }
    );
    clips.forEach((v) => io.observe(v));
  }

  /* Звук по наведению — как в двух других пространствах и на карточках
     страницы: половина исходной громкости, ввод почти мгновенный, уход
     мягкий. Кадр при уходе курсора продолжает идти, уходит только звук. */
  const HOVER_DELAY = 120; // мс: без задержки при быстром проходе курсора ролики дёргаются
  const FADE_IN = 120;
  const FADE_OUT = 300;
  const HOVER_VOLUME = 0.5;

  let sounding = null;

  const applySound = (v) => {
    if (sounding !== v) return;
    if (soundAllowed()) {
      v.muted = false;
      fadeVolume(v, HOVER_VOLUME, FADE_IN);
    } else {
      fadeVolume(v, 0, 0);
      v.muted = true;
    }
  };

  const hush = (v) => {
    fadeVolume(v, 0, FADE_OUT);
    // Заглушаем только после того, как громкость сошла: снять muted раньше —
    // значит оборвать звук щелчком вместо того, чтобы дать ему угаснуть.
    setTimeout(() => {
      if (sounding !== v) v.muted = true;
    }, FADE_OUT + 20);
    if (sounding === v) sounding = null;
  };

  clips.forEach((v) => {
    v.muted = true;
    v.volume = 0;
    let timer = 0;

    v.addEventListener("pointerenter", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        // Звучать может только один ролик. Соседний глушим раньше,
        // чем зазвучит этот.
        if (sounding && sounding !== v) hush(sounding);
        sounding = v;
        applySound(v);
      }, HOVER_DELAY);
    });

    v.addEventListener("pointerleave", () => {
      clearTimeout(timer);
      hush(v);
    });
  });

  // Звук переключили на лету — ролик под курсором должен отозваться сразу
  onSoundChange(() => sounding && applySound(sounding));

  openers.forEach((b) => b.addEventListener("click", show));
  close?.addEventListener("click", hide);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) hide();
  });
}
