import gsap from "gsap";
import Lenis from "lenis";
import { ease, lenisInstance, reducedMotion } from "./motion.js";

/**
 * Второе пространство — «Keep it street». Открывается кнопкой с карточки
 * во второй чёрной паузе.
 *
 * Живёт рядом с первым, а не внутри него, и это осознанно. Общего у них
 * только оболочка: слой поверх страницы, своя прокрутка, ролики, которые
 * идут сами. Всё остальное разное — там лента едет вбок, здесь развороты
 * идут сверху вниз, — и попытка свести оба в один настраиваемый модуль
 * означала бы переписать работающее первое пространство ради второго.
 * Дешевле держать их порознь.
 */
export function initStreet(root) {
  if (!root) return;

  const openers = document.querySelectorAll("[data-street-open]");
  if (!openers.length) return;

  const scroller = root.querySelector("[data-street-scroll]");
  const flow = root.querySelector("[data-street-flow]");
  const inner = root.querySelector("[data-street-inner]");
  const close = root.querySelector("[data-street-close]");
  const clips = [...root.querySelectorAll("[data-street-video]")];

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
    window.__streetRail = rail;

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
  const fading = [...root.querySelectorAll(".act__side, .act__open, .band__text, .plate, .plate__note")];
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
     Роликов пять, и вместе они весят больше всей остальной страницы. Пока
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

  /* Здесь ролики немые. Наведение звук не включает и общий переключатель
     на них не действует: развороты идут сплошной лентой, соседние кадры
     стоят близко, и звук, включающийся под курсором, тут только мешает.
     Глушим и в разметке, и здесь — чтобы браузер не начал воспроизведение
     со звуком до того, как отработает скрипт. */
  clips.forEach((v) => {
    v.muted = true;
    v.volume = 0;
  });

  openers.forEach((b) => b.addEventListener("click", show));
  close?.addEventListener("click", hide);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) hide();
  });
}
