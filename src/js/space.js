import gsap from "gsap";
import Lenis from "lenis";
import { ease, lenisInstance, reducedMotion } from "./motion.js";
import { fadeVolume, onSoundChange, soundAllowed } from "./audio.js";

/**
 * Отдельное пространство, которое открывается кнопкой с иллюстрации
 * в чёрной паузе.
 *
 * Это не переход на другую страницу: страница остаётся на месте и на своей
 * прокрутке, а поверх неё раскрывается самостоятельный слой.
 *
 * Появляется он тихо. Здесь был другой переход — кадр иллюстрации разъезжался
 * из карточки на весь экран, как на странице-образце. Приём заметный, и в этом
 * оказалась беда: смотреть начинали на сам переход, а не на то, куда он привёл.
 * Осталось растворение — то же, каким на сайте сменяются слайды, и такое же
 * незаметное.
 */
export function initSpace(root) {
  if (!root) return;

  const inner = root.querySelector("[data-space-inner]");
  const close = root.querySelector("[data-space-close]");
  const openers = document.querySelectorAll("[data-space-open]");
  if (!openers.length) return;

  let open = false;
  let returnFocus = null;
  let tl = null;

  const show = () => {
    if (open) return;
    open = true;
    returnFocus = document.activeElement;

    root.hidden = false;
    document.body.dataset.locked = "true";
    lenisInstance()?.stop(); // за пространством страница стоять должна

    tl?.kill();

    // Открываем всегда с начала: закрыли на пятом кадре — в следующий раз
    // открывалось бы там же. Пересчёт нужен потому, что размеры ленты
    // считаются по видимому элементу, а он до этого был скрыт.
    if (rail) {
      rail.resize();
      rail.scrollTo(0, { immediate: true });
      rail.start();
    } else if (scroller) {
      scroller.scrollTo({ left: 0 });
    }

    // Мерить положения можно только теперь: до этого слой был скрыт,
    // и все прямоугольники были нулевыми.
    measure();
    fade(0);

    if (reducedMotion) {
      gsap.set(root, { opacity: 1 });
      close?.focus();
      return;
    }

    tl = gsap.timeline();
    tl.fromTo(root, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: "none" });
    // Содержимое приходит следом и на волос позже — это единственное движение
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

  const scroller = root.querySelector("[data-space-scroll]");

  // Боковая прокрутка — той же сглаженной, что и на самой странице, только
  // повёрнутой. Отдельный экземпляр Lenis на своей обёртке.
  //
  // Здесь была листалка шагом по разделу, и она была не по делу: лента должна
  // ехать непрерывно. Прилипание, из-за которого шаг и появился, тоже убрано —
  // короткий ход оно отматывало обратно, и пространство выглядело зависшим.
  //
  // gestureOrientation: "both" — колесо мыши крутит только по вертикали,
  // и без этого лента не поехала бы от него вовсе.
  const track = root.querySelector("[data-space-track]");
  let rail = null;

  if (scroller && track && !reducedMotion) {
    rail = new Lenis({
      wrapper: scroller,
      content: track,
      orientation: "horizontal",
      gestureOrientation: "both",
      lerp: 0.07,          // столько же, сколько у страницы: ход один и тот же
      wheelMultiplier: 1.1,
      smoothWheel: true,
      syncTouch: true,
    });

    // Крутим тем же тикером, что и страницу: на кадр приходится ровно один
    // пересчёт, и две прокрутки не спорят за время.
    gsap.ticker.add((time) => rail.raf(time * 1000));
    rail.stop(); // пока пространство закрыто, ей делать нечего

    // Ручка для снималки кадров из tools/. Прямое присваивание scrollLeft
    // здесь не работает: Lenis каждый кадр возвращает своё значение обратно,
    // и снимок выходит не с того места, с которого просили.
    window.__spaceRail = rail;

    rail.on("scroll", ({ scroll }) => fade(scroll));
  }

  /**
   * Затухание по ходу ленты.
   *
   * Гаснет и проявляется только содержимое — текст, карточки, реплики.
   * Фоновые кадры не трогаем: они идут встык, и погасший фон открыл бы
   * под собой чёрную дыру вместо соседнего кадра.
   *
   * Положения меряются один раз и складываются в таблицу. Читать
   * getBoundingClientRect на каждом кадре нельзя: одиннадцать блоков по три
   * элемента — это тридцать принудительных пересчётов раскладки в кадр, и вся
   * плавность, ради которой всё затевалось, кончится.
   */
  const fading = [...root.querySelectorAll(".chapter__text, .frame, .gallery__note")];
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
      const left = b.left - scroll;          // где элемент относительно окна
      const right = left + b.width;
      const enters = (vw - left) / span;     // въезжает справа
      const leaves = right / span;           // уезжает влево
      const v = Math.max(0, Math.min(1, enters, leaves));
      b.el.style.opacity = v.toFixed(3);
    }
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

  // Вертикальный ролик в галерее играет, только пока он на экране. Своего
  // ScrollTrigger тут нет и быть не может: пространство прокручивается внутри
  // себя, а ScrollTrigger следит за прокруткой страницы, которая в это время
  // стоит. Наблюдатель за пересечением смотрит именно за видимостью, поэтому
  // ему всё равно, кто и как крутит.
  const clips = [...root.querySelectorAll("[data-chapter-video]")];
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
      { root: scroller, threshold: 0.35 }
    );
    clips.forEach((v) => io.observe(v));
  }

  /* Звук на роликах — как на карточках главной страницы: половина исходной
     громкости, ввод почти мгновенный, уход мягкий.

     Одно отличие, и оно принципиальное. На карточке уход курсора возвращает
     постер и отматывает ролик на начало — там видео и есть отклик на наведение.
     Здесь ролики идут сами, наведением их не запускают, поэтому уходит только
     звук: кадр продолжает идти как ни в чём не бывало. */
  const HOVER_DELAY = 120;   // мс: без задержки при быстром проходе курсора ролики дёргаются
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

  /* Фоновый ролик вступления в этот список не попадает: у него в разметке
     стоит data-chapter-quiet. Он лежит во весь экран за текстом, курсор над
     ним почти всё время, и наведение включало бы «звук» там, где звуковой
     дорожки нет вовсе. Слышно от этого ничего не становилось, а фоновая
     музыка честно отходила и не возвращалась, пока курсор не уйдёт с экрана. */
  const voiced = clips.filter((v) => !v.hasAttribute("data-chapter-quiet"));

  clips.forEach((v) => {
    v.muted = true;
    v.volume = 0;
  });

  voiced.forEach((v) => {
    let timer = 0;

    v.addEventListener("pointerenter", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        // Звучать может только один ролик. Соседний глушим раньше, чем
        // зазвучит этот.
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
