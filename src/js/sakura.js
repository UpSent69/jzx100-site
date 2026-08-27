import gsap from "gsap";
import Lenis from "lenis";
import { ease, lenisInstance, reducedMotion } from "./motion.js";
import { fadeVolume, onSoundChange, soundAllowed } from "./audio.js";

/**
 * Пятое пространство — «Самурай в цветах сакуры». Открывается кнопкой
 * с карточки в четвёртой чёрной паузе.
 *
 * Механика взята со второго пространства: слой поверх страницы, своя
 * вертикальная прокрутка, затухание содержимого по ходу ленты, ролики
 * играют только пока видны. Раскладка внутри своя, и держится она
 * на разметке и стилях, а не здесь.
 *
 * Отдельным файлом по той же причине, по какой ими живут остальные:
 * свести четыре пространства в один настраиваемый модуль значит
 * переписать четыре работающих ради пятого.
 *
 * Отличие от второго только одно и в звуке. Там ролики немые совсем,
 * здесь оба ролика отзываются на наведение - как в первом и третьем
 * пространствах.
 */
export function initSaku(root) {
  if (!root) return;

  const openers = document.querySelectorAll("[data-saku-open]");
  if (!openers.length) return;

  const scroller = root.querySelector("[data-saku-scroll]");
  const flow = root.querySelector("[data-saku-flow]");
  const inner = root.querySelector("[data-saku-inner]");
  const close = root.querySelector("[data-saku-close]");
  const clips = [...root.querySelectorAll("[data-saku-video]")];

  let open = false;
  let returnFocus = null;
  let tl = null;
  let rail = null;
  let loaded = false;

  /* ПРОКРУТКА ------------------------------------------------------------
     Такая же сглаженная, как у страницы, и так же вертикальная — только на
     своей обёртке. Отдельный экземпляр нужен потому, что страница под слоем
     в это время стоит: её Lenis остановлен, и крутить содержимое слоя ему
     нечем.

     data-lenis-prevent на обёртке в разметке — чтобы прокрутка страницы
     не перехватывала колесо у этой. */
  if (scroller && flow && !reducedMotion) {
    rail = new Lenis({
      wrapper: scroller,
      content: flow,
      lerp: 0.07, // столько же, сколько у страницы: ход один и тот же
      wheelMultiplier: 1,
      smoothWheel: true,
      syncTouch: true,
    });

    // Тот же тикер, что и у страницы: один пересчёт на кадр, две прокрутки
    // не спорят за время.
    gsap.ticker.add((time) => rail.raf(time * 1000));
    rail.stop(); // пока слой закрыт, ей делать нечего

    // Ручка для снималки кадров из tools/. Прямое присваивание scrollTop
    // здесь не работает: Lenis каждый кадр возвращает своё значение обратно.
    window.__sakuRail = rail;

    rail.on("scroll", ({ scroll }) => fade(scroll));
  }

  /* ЗАТУХАНИЕ ПО ХОДУ ----------------------------------------------------
     Гаснет и проявляется только содержимое — тексты, реплики, карточки
     мозаики. Кадры во весь экран не трогаем: они идут встык, и погасший кадр
     открыл бы под собой чёрную дыру вместо соседнего.

     Положения меряются один раз и складываются в таблицу. Читать
     getBoundingClientRect на каждом кадре нельзя: это два десятка
     принудительных пересчётов раскладки в кадр, и вся плавность,
     ради которой всё затевалось, кончится. */
  const fading = [...root.querySelectorAll(
    ".gate__text, .gate__note, .gate__vertical, .column, .fan__frame, .fan__note, " +
      ".crest__text, .pair__main, .pair__detail, .pair__text, " +
      ".strip__frame, .strip__note, .saku__end-text"
  )];
  let boxes = [];

  const measure = () => {
    if (!flow) return;
    const base = flow.getBoundingClientRect().top - (rail ? rail.scroll : scroller.scrollTop);
    boxes = fading.map((el) => {
      const r = el.getBoundingClientRect();
      return { el, top: r.top - base, height: r.height };
    });
  };

  const fade = (scroll) => {
    if (!scroller || !boxes.length) return;
    const vh = scroller.clientHeight;
    // Ход растворения — треть экрана. Меньше читается как мигание, больше —
    // и половина ленты всё время стоит полупрозрачной.
    const span = vh * 0.34;

    for (const b of boxes) {
      const top = b.top - scroll; // где элемент относительно окна
      const bottom = top + b.height;
      const enters = (vh - top) / span; // въезжает снизу
      const leaves = bottom / span; // уезжает вверх
      const v = Math.max(0, Math.min(1, enters, leaves));
      b.el.style.opacity = v.toFixed(3);
    }
  };

  /* ЗАГРУЗКА -------------------------------------------------------------
     Роликов два, и вместе они весят больше всей остальной страницы. Пока
     кнопку не нажали, они не нужны вовсе: у видео стоит preload="none",
     а адрес лежит в data-src и подставляется только при первом открытии.
     До этого на месте каждого ролика стоит его первый кадр. */
  const load = () => {
    if (loaded) return;
    loaded = true;
    clips.forEach((v) => {
      if (!v.dataset.src) return;
      v.src = v.dataset.src;
      v.preload = "auto";
      v.load();
    });
  };

  /* ОТКРЫТИЕ И ЗАКРЫТИЕ --------------------------------------------------
     Появляется тихо — тем же растворением, каким на сайте сменяются слайды.
     Заметный переход здесь пробовали в первом пространстве: смотреть
     начинали на сам переход, а не на то, куда он привёл. */
  const show = () => {
    if (open) return;
    open = true;
    returnFocus = document.activeElement;

    root.hidden = false;
    document.body.dataset.locked = "true";
    lenisInstance()?.stop(); // за слоем страница стоять должна
    load();

    tl?.kill();

    // Открываем всегда с начала: закрыли на третьем развороте — в следующий
    // раз открывалось бы там же. Пересчёт нужен потому, что размеры считаются
    // по видимому элементу, а он до этого был скрыт.
    if (rail) {
      rail.resize();
      rail.scrollTo(0, { immediate: true });
      rail.start();
    } else if (scroller) {
      scroller.scrollTo({ top: 0 });
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
      { y: 16 },
      { y: 0, duration: 0.5, ease: ease.out, onComplete: () => close?.focus() },
      0.1
    );
  };

  const hide = () => {
    if (!open) return;
    open = false;

    const done = () => {
      rail?.stop();
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
    fade(rail ? rail.scroll : scroller?.scrollTop || 0);
  });

  /* Ролик играет, только пока он на экране. Своего ScrollTrigger тут нет
     и быть не может: слой прокручивается внутри себя, а ScrollTrigger следит
     за прокруткой страницы, которая в это время стоит. Наблюдатель за
     пересечением смотрит именно за видимостью, поэтому ему всё равно,
     кто и как крутит. */
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
      { root: scroller, threshold: 0.2 }
    );
    clips.forEach((v) => io.observe(v));
  }

  /* ЗВУК ПО НАВЕДЕНИЮ ----------------------------------------------------
     Половина исходной громкости, ввод почти мгновенный, уход мягкий. Кадр
     при уходе курсора продолжает идти — уходит только звук.

     Список звучащих собирается с оговоркой: ролику можно поставить
     data-saku-quiet в разметке, и тогда он молчит всегда. Сейчас такого нет -
     оба ролика стоят кадрами на виду, и звук по наведению уместен у обоих. */
  const voiced = clips.filter((v) => !v.hasAttribute("data-saku-quiet"));

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
  });

  voiced.forEach((v) => {
    let timer = 0;

    v.addEventListener("pointerenter", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
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
