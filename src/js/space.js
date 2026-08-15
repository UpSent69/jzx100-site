import gsap from "gsap";
import { ease, lenisInstance, reducedMotion } from "./motion.js";

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

  openers.forEach((b) => b.addEventListener("click", show));
  close?.addEventListener("click", hide);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) hide();
  });
}
