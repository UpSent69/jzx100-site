import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ease, isMobile, reducedMotion, lenisInstance } from "./motion.js";
import { fadeVolume, onSoundChange, soundAllowed, soundVolume, unlockSound } from "./audio.js";

const HOVER_DELAY = 120;   // мс: без задержки при быстром проходе курсора обе карточки дёргаются
const FADE_IN = 120;       // мс: звук вводится почти мгновенно
const FADE_OUT = 300;      // мс: и уходит заметно мягче
const HOVER_VOLUME = 0.5;  // половина исходной громкости
const FULL_VOLUME = 1;     // в раскрытой карточке можно на полную

/** Карточка под курсором. Она же единственная, которой разрешено звучать. */
let sounding = null;

export function initCards(root) {
  const cards = [...root.querySelectorAll("[data-card]")].map((el) => new Card(el));
  if (!cards.length) return;

  // Сразу грузится только постер — на старте карточка весит как картинка.
  // Само видео подтягивается, когда блок подходит к экрану.
  ScrollTrigger.create({
    trigger: root,
    start: "top 150%",
    once: true,
    onEnter: () => cards.forEach((c) => c.load()),
  });

  // Карточки поднимаются снизу при въезде в экран, левая раньше правой.
  //
  // Только поднимаются. Прозрачность здесь не ведётся: её ведёт весь блок
  // целиком, когда въезжает и выезжает (fadeScene в main.js). Две
  // накладывающиеся друг на друга кривые прозрачности давали мутное
  // появление в два приёма вместо одного движения.
  if (!reducedMotion) {
    gsap.fromTo(
      root.querySelectorAll("[data-card]"),
      { yPercent: 14 },
      {
        yPercent: 0,
        duration: 1,
        ease: ease.out,
        stagger: isMobile ? 0 : 0.14,
        scrollTrigger: { trigger: root, start: "top 75%", once: true },
      }
    );
  }

  if (isMobile) initMobilePlayback(cards);

  // Звук переключили на лету. Карточка под курсором должна отозваться сразу —
  // и зазвучать, и замолчать, — иначе переключатель выглядит сломанным.
  onSoundChange(() => sounding?.applySound());

  initLightbox(root);
}

class Card {
  constructor(el) {
    this.el = el;
    this.video = el.querySelector("[data-card-video]");
    this.poster = el.querySelector("[data-card-poster]");
    this.progress = el.querySelector("[data-card-progress]");
    this.timer = 0;
    this.raf = 0;
    this.loaded = false;

    this.video.volume = 0;
    this.video.muted = true; // до разблокировки звука иначе не дадут играть

    if (!isMobile) {
      el.addEventListener("pointerenter", () => this.schedule());
      el.addEventListener("pointerleave", () => this.leave());
      // Клавиатура: наведения нет, поэтому играем по фокусу
      el.addEventListener("focus", () => this.enter());
      el.addEventListener("blur", () => this.leave());
    }
  }

  /** Подставляем источники только когда блок подошёл к экрану. */
  load() {
    if (this.loaded) return;
    this.loaded = true;
    this.video.querySelectorAll("source[data-src]").forEach((s) => {
      s.src = s.dataset.src;
    });
    this.video.load();
  }

  schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.enter(), HOVER_DELAY);
  }

  enter() {
    clearTimeout(this.timer);
    this.load();
    this.el.dataset.playing = "true";

    // При переходе с одной карточки на другую первая глушится раньше,
    // чем зазвучит вторая
    if (sounding && sounding !== this) sounding.hush();
    sounding = this; // под курсором эта — независимо от того, разрешён ли звук

    // Запускаем беззвучно и включаем звук уже на идущем ролике. Если просить
    // браузер сразу о звуке, а он в этот момент не считает действие
    // пользователя достаточным, отказ приходит на весь play() — и карточка
    // не то что молчит, она вообще не оживает.
    this.video
      .play()
      .then(() => this.applySound())
      .catch(() => {});

    this.tick();
  }

  /** Приводит звук карточки в соответствие с общим состоянием. */
  applySound() {
    if (sounding !== this) return;

    if (soundAllowed()) {
      this.video.muted = false;
      fadeVolume(this.video, HOVER_VOLUME, FADE_IN);
    } else {
      fadeVolume(this.video, 0, 0);
      this.video.muted = true;
    }
  }

  leave() {
    clearTimeout(this.timer);
    this.el.dataset.playing = "false";
    this.hush();

    // Видео возвращается в постер и отматывается на начало
    setTimeout(() => {
      if (this.el.dataset.playing === "true") return;
      this.video.pause();
      this.video.currentTime = 0;
      this.setProgress(0);
    }, FADE_OUT);

    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  hush() {
    fadeVolume(this.video, 0, FADE_OUT);
    if (sounding === this) sounding = null;
  }

  /** Тонкая линия по нижнему краю: единственный признак, что карточка живая. */
  tick() {
    if (!this.progress) return;
    const step = () => {
      const d = this.video.duration || 1;
      this.setProgress(this.video.currentTime / d);
      this.raf = requestAnimationFrame(step);
    };
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(step);
  }

  setProgress(v) {
    if (this.progress) this.progress.style.transform = `scaleX(${v})`;
  }
}

/**
 * Мобильные: наведения нет. Карточка играет, когда попадает в центр экрана,
 * и останавливается на выходе. Играет одна за раз.
 */
function initMobilePlayback(cards) {
  let current = null;

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        const card = cards.find((c) => c.el === e.target);
        if (!card) return;
        if (e.isIntersecting) {
          if (current && current !== card) current.leave();
          current = card;
          card.enter();
        } else if (current === card) {
          card.leave();
          current = null;
        }
      });
    },
    // Узкая полоса по центру экрана: карточка считается активной,
    // только когда действительно стоит перед глазами
    { rootMargin: "-40% 0px -40% 0px", threshold: 0 }
  );

  cards.forEach((c) => io.observe(c.el));
}

/**
 * По клику карточка раскрывается на весь экран: видео играет в петле,
 * громкость можно поднять до полной.
 */
function initLightbox(root) {
  const box = document.querySelector("[data-lightbox]");
  if (!box) return;

  const slot = box.querySelector("[data-lightbox-slot]");
  const close = box.querySelector("[data-lightbox-close]");
  let opened = null;   // исходная карточка
  let clone = null;
  let returnFocus = null;

  const open = (card) => {
    unlockSound(); // клик — то самое действие пользователя

    opened = card;
    returnFocus = document.activeElement;

    clone = card.querySelector("[data-card-video]").cloneNode(true);
    clone.removeAttribute("data-card-video");
    clone.loop = true;
    clone.controls = false;
    clone.muted = !soundAllowed();
    // Единственное место, где громкость ставится мимо fadeVolume, —
    // значит и общий уровень надо применить руками.
    clone.volume = soundAllowed() ? FULL_VOLUME * soundVolume() : 0;
    slot.replaceChildren(clone);
    clone.play().catch(() => {});

    box.hidden = false;
    document.body.dataset.locked = "true";
    lenisInstance()?.stop(); // за раскрытой карточкой страница стоять должна
    close.focus();
  };

  const shut = () => {
    if (!opened) return;
    clone?.pause();
    slot.replaceChildren();
    box.hidden = true;
    delete document.body.dataset.locked;
    lenisInstance()?.start();
    returnFocus?.focus?.();
    opened = null;
    clone = null;
  };

  root.querySelectorAll("[data-card]").forEach((el) => {
    el.addEventListener("click", () => open(el));
  });

  close.addEventListener("click", shut);
  box.addEventListener("click", (e) => {
    if (e.target === box) shut();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !box.hidden) shut();
  });
}
