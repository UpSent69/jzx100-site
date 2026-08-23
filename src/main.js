import "@fontsource/oswald/400.css";
import "@fontsource/oswald/500.css";
import "@fontsource-variable/inter";

import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/typography.css";
import "./styles/overlay.css";
import "./styles/screen-hero.css";
import "./styles/screens.css";
import "./styles/promo.css";
import "./styles/street.css";
import "./styles/chrome.css";

import { ScrollTrigger } from "gsap/ScrollTrigger";
import { initScroll, fadeScene } from "./js/motion.js";
import { initSoundToggle, unlockSound } from "./js/audio.js";
import { initPreloader } from "./js/preloader.js";
import { initHero } from "./js/hero.js";
import { initJzx100 } from "./js/jzx100.js";
import { initMotionScreen } from "./js/motion-screen.js";
import { initCards } from "./js/cards.js";
import { initReading } from "./js/reading.js";
import { initFinal } from "./js/final.js";
import { initSpace } from "./js/space.js";
import { initStreet } from "./js/street.js";

initScroll();

const screen = (name) => document.querySelector(`[data-screen="${name}"]`);
const run = (el, init) => el && init(el);

run(screen("hero"), initHero);
run(screen("jzx100"), initJzx100);
run(screen("motion"), initMotionScreen);
run(screen("cards"), initCards);
run(screen("reading"), initReading);
run(screen("final"), initFinal);

// Растворение по краям — у всех слайдов, кроме текстового раздела: гасить
// читаемый текст на въезде и выезде значит мешать его читать, а всё остальное
// на сайте — это кадры во весь экран, и появляться они должны из черноты.
//
// Первому экрану появляться неоткуда, он и есть начало страницы;
// финалу неоткуда уходить — за ним конец.
const scenes = [
  ["hero", ".hero__stage", { fadeIn: false }],
  ["jzx100", ".jzx__stage", {}],
  ["motion", ".motion__stage", {}],
  // Блок карточек не закреплён — он проезжает через экран целиком, и доли
  // растворения у него считаются иначе (см. fadeScene).
  ["cards", null, { pinned: false }],
  ["final", null, { fadeOut: false, pinned: false }],
];

scenes.forEach(([name, sel, opts]) => {
  const section = screen(name);
  if (!section) return;
  fadeScene(section, sel ? section.querySelector(sel) : section, opts);
});

initSpace(document.querySelector("[data-space]"));
initStreet(document.querySelector("[data-street]"));
initSoundToggle(document.querySelector("[data-sound-toggle]"));
initPreloader(document.querySelector("[data-preloader]"));

// Разрешение на звук снимает кнопка входа на прелоадере. Но прелоадер можно
// и не увидеть — он снимается по таймауту, его убирает режим без движения,
// его может не быть при перезагрузке посреди страницы. Поэтому право на звук
// даёт вообще любое нажатие: браузеру нужно действие пользователя, а не
// конкретная кнопка.
document.addEventListener("pointerdown", unlockSound, { once: true });
document.addEventListener("keydown", unlockSound, { once: true });

// Пересчёт после подгрузки шрифтов и картинок: без него закреплённые секции
// считают свою длину по недогруженной раскладке
document.fonts?.ready.then(() => ScrollTrigger.refresh());
window.addEventListener("load", () => ScrollTrigger.refresh());
