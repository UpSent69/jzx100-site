import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ease, lenisInstance, reducedMotion } from "./motion.js";
import { unlockSound } from "./audio.js";

const SWEEP = 250; // градусов на шкале тахометра — как у стрелочного прибора

/**
 * Прелоадер: счётчик от 0 до 100 в виде тахометра, за это время догружаются
 * первый кадр и первое видео. Затем кнопка входа — она же разрешает звук
 * на карточках. После клика шторка уходит вверх.
 */
export function initPreloader(root) {
  if (!root) return;

  const needle = root.querySelector("[data-preloader-needle]");
  const number = root.querySelector("[data-preloader-number]");
  const enter = root.querySelector("[data-preloader-enter]");

  lenisInstance()?.stop(); // пока шторка на месте, страница не листается
  document.body.dataset.locked = "true";

  let shown = 0;    // то, что видно на шкале
  let target = 0;   // то, что реально загружено
  let raf = 0;

  const paint = () => {
    // Стрелка догоняет реальную загрузку, а не прыгает за ней: рывок
    // на скачке прогресса читается как поломка прибора
    shown += (target - shown) * 0.06;
    if (target - shown < 0.4) shown = target;

    const v = Math.round(shown);
    if (number) number.textContent = String(v).padStart(3, "0");
    if (needle) needle.style.transform = `rotate(${-SWEEP / 2 + (SWEEP * shown) / 100}deg)`;

    if (shown >= 100) {
      ready();
      return;
    }
    raf = requestAnimationFrame(paint);
  };

  let done = false;
  const ready = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    root.dataset.ready = "true";
    enter?.focus({ preventScroll: true });
  };

  trackAssets((p) => (target = p));
  raf = requestAnimationFrame(paint);

  // Страховка: если какой-то файл не отдастся, кнопка всё равно появится
  setTimeout(ready, 8000);

  enter?.addEventListener("click", () => {
    unlockSound(); // это и есть то действие пользователя, после которого можно звук

    const finish = () => {
      root.remove();
      delete document.body.dataset.locked;
      lenisInstance()?.start();
      ScrollTrigger.refresh();
    };

    if (reducedMotion) {
      finish();
      return;
    }

    gsap.to(root, {
      yPercent: -100,
      duration: 1.1,
      ease: ease.inOut,
      onComplete: finish,
    });
  });
}

/**
 * Считаем готовность по тому, что реально нужно первому экрану:
 * фоновый кадр и первое видео. Всё остальное грузится уже за шторкой.
 */
function trackAssets(onProgress) {
  const plate = document.querySelector("[data-hero-plate]");
  const video = document.querySelector("[data-hero-video]");

  const parts = [];

  parts.push(
    new Promise((resolve) => {
      if (!plate || plate.complete) return resolve();
      plate.addEventListener("load", resolve, { once: true });
      plate.addEventListener("error", resolve, { once: true });
    })
  );

  parts.push(
    new Promise((resolve) => {
      if (!video) return resolve();
      if (video.readyState >= 3) return resolve();
      video.addEventListener("canplaythrough", resolve, { once: true });
      video.addEventListener("error", resolve, { once: true });
      video.load();
    })
  );

  let loaded = 0;
  const total = parts.length;

  // Шкала не должна долетать до сотни раньше, чем файлы: держим её
  // на 92 до того, как всё придёт
  const cap = () => Math.min(92, Math.round((loaded / total) * 100));

  parts.forEach((p) =>
    p.then(() => {
      loaded += 1;
      onProgress(loaded === total ? 100 : cap());
    })
  );

  // Пока ничего не пришло, шкала всё равно ползёт — иначе прибор выглядит мёртвым
  let creep = 0;
  const idle = setInterval(() => {
    if (loaded === total) return clearInterval(idle);
    creep = Math.min(60, creep + 2);
    onProgress(Math.max(creep, cap()));
  }, 90);
}
