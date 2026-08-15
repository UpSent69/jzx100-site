import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ease, isMobile, reducedMotion } from "./motion.js";

/**
 * Экран 5. Слева закреплённый кадр, справа прокручивается текст.
 * Кадр меняется по мере чтения, на каждый блок свой, смена — мягкое
 * растворение. Анимации здесь намеренно минимальные: это раздел для чтения,
 * движение мешает.
 */
export function initReading(root) {
  const shots = [...root.querySelectorAll("[data-reading-shot]")];
  const blocks = [...root.querySelectorAll("[data-reading-block]")];

  // Зерно и виньетка съедают контраст на тексте — здесь они слабее
  ScrollTrigger.create({
    trigger: root,
    start: "top 60%",
    end: "bottom 40%",
    onToggle: (self) => document.body.classList.toggle("is-reading", self.isActive),
  });

  // Абзацы проявляются простым сдвигом снизу: ни разбивки по буквам,
  // ни размытий — в тексте это отвлекает
  if (!reducedMotion) {
    blocks.forEach((block) => {
      gsap.fromTo(
        block.querySelectorAll("h3, p"),
        { y: 24, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.8,
          ease: ease.out,
          stagger: isMobile ? 0 : 0.06,
          scrollTrigger: { trigger: block, start: "top 78%", once: true },
        }
      );
    });
  }

  // На мобильных колонка одна: кадр, под ним текст блока, дальше следующий
  // кадр. Подменять нечего.
  if (isMobile || !shots.length) return;

  // Каждому блоку — свой кадр. Считаем не диапазонами на блок, а тем, какой
  // блок последним пересёк линию чтения: между блоками огромные отступы,
  // сами блоки короткие, и узкий диапазон легко проскочить целиком —
  // тогда кадр застревает на предыдущем.
  const pick = () => {
    const line = window.innerHeight * 0.45;
    let index = 0;
    blocks.forEach((block, i) => {
      if (block.getBoundingClientRect().top <= line) index = i;
    });
    show(shots, index);
  };

  ScrollTrigger.create({
    trigger: root,
    start: "top bottom",
    end: "bottom top",
    onUpdate: pick,
    onRefresh: pick,
  });

  pick();
}

function show(shots, index) {
  shots.forEach((shot, i) => {
    shot.style.opacity = i === index ? "1" : "0";
  });
}
