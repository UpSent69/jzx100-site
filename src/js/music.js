import { onDuck, onSoundChange, soundAllowed, soundVolume } from "./audio.js";

/**
 * Фоновая музыка и плеер в левом нижнем углу.
 *
 * Плейлист заказчика: шестнадцать треков. Тегов в файлах нет вовсе - ни
 * названия, ни исполнителя, ни обложки, - поэтому названия лежат здесь
 * списком, а обложка одна на всех. Четыре последних файла пришли и без имён.
 *
 * Громкость. Музыка идёт тише роликов: она фон, а не содержание. Общий
 * множитель с ползунка берётся из audio.js - тот же, что у всего остального
 * звука на сайте, поэтому ползунок ведёт и то, и другое разом.
 *
 * Приглушение. Когда под курсором начинает звучать ролик, музыка уходит
 * плавно вниз и встаёт на паузу - именно встаёт, а не продолжает играть
 * тихо: заказчик просил, чтобы после она продолжилась «с того же момента»,
 * а с работающей дорожкой момент уехал бы вперёд на всё время наведения.
 * Отпустили курсор - музыка возвращается с той же секунды и всплывает
 * обратно. Считает это не плеер, а audio.js: там через одну функцию проходит
 * весь звук роликов во всех пространствах и на карточках.
 */

const IDLE = 10000;     // мс тишины в зоне плеера, после которых он сжимается
const LEVEL = 0.5;      // музыка вполсилы от общего уровня: это фон
const DUCK = 260;       // мс на уход вниз
const RISE = 420;       // мс на возврат: назад мягче, чем вниз
const KEY = "markii:track";

const TRACKS = [
  { file: "/music/01.m4a", name: "akiaura, LONOWN - pussypodium" },
  { file: "/music/02.m4a", name: "ALDN - Icantbelieveiletyougetaway" },
  { file: "/music/03.m4a", name: "DJ Anemia, Crier, sixnite - archangel" },
  { file: "/music/04.m4a", name: "drnqt - Eyes Dont Lie" },
  { file: "/music/05.m4a", name: "itgmq leto, itgmqprod - theclubrock" },
  { file: "/music/06.m4a", name: "maduroo, trippie - i like the way you kiss me" },
  { file: "/music/07.m4a", name: "Roman Nasenmensch, domi4wave - take it from the starz" },
  { file: "/music/08.m4a", name: "SH3TLVIZ, Psycho Playa, NOFWERSY - Dream" },
  { file: "/music/09.m4a", name: "vierre cloud - moment" },
  { file: "/music/10.m4a", name: "wawso, kendickk - So Scared" },
  { file: "/music/11.m4a", name: "xxtristanxo - FALLING IN LOVE" },
  { file: "/music/12.m4a", name: "влад пиво - Бей меня" },
  // Эти четыре пришли без имён - в папке они лежали набором случайных букв.
  { file: "/music/13.m4a", name: "Без названия - 13" },
  { file: "/music/14.m4a", name: "Без названия - 14" },
  { file: "/music/15.m4a", name: "Без названия - 15" },
  { file: "/music/16.m4a", name: "Без названия - 16" },
];

const clock = (sec) => {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

export function initMusic(root) {
  if (!root) return;

  const nameEl = root.querySelector("[data-player-name]");
  const seek = root.querySelector("[data-player-seek]");
  const nowEl = root.querySelector("[data-player-now]");
  const lenEl = root.querySelector("[data-player-len]");
  const playBtn = root.querySelector("[data-player-play]");
  const prevBtn = root.querySelector("[data-player-prev]");
  const nextBtn = root.querySelector("[data-player-next]");

  const audio = new Audio();
  audio.preload = "none";
  audio.volume = 0;

  // Ручка для снималки из tools/: сам элемент в разметку не попадает,
  // и со стороны его никак не найти. Рядом - состояние плеера: по одному
  // audio не отличить «человек нажал стоп» от «музыка отошла под ролик».
  window.__music = audio;
  window.__musicState = () => ({
    хочет: wanted,
    отошла: ducked,
    стоит: audio.paused,
    громкость: +audio.volume.toFixed(2),
  });

  const stored = parseInt(localStorage.getItem(KEY), 10);
  let index = Number.isInteger(stored) && TRACKS[stored] ? stored : 0;

  let wanted = false;   // человек хочет, чтобы музыка играла
  let ducked = false;   // сейчас звучит ролик, музыка отошла
  let dragging = false; // ползунок перемотки под пальцем

  const level = () => LEVEL * soundVolume();

  /* Громкость ведём рампой: скачок слышно щелчком. Своя рампа, а не
     fadeVolume из audio.js, потому что там в конце нужно ещё и встать
     на паузу, а вызывающему про это знать незачем. */
  let ramp = 0;
  const glide = (to, ms, done) => {
    clearInterval(ramp);
    const from = audio.volume;
    const started = performance.now();
    if (ms <= 0) {
      audio.volume = to;
      done?.();
      return;
    }
    ramp = setInterval(() => {
      const t = Math.min(1, (performance.now() - started) / ms);
      audio.volume = from + (to - from) * t;
      if (t === 1) {
        clearInterval(ramp);
        done?.();
      }
    }, 16);
  };

  const paintPlay = () => {
    const on = wanted && !audio.paused;
    root.dataset.playing = String(on);
    playBtn?.setAttribute("aria-label", on ? "Пауза" : "Играть");
  };

  const paintTime = () => {
    const d = audio.duration;
    if (lenEl) lenEl.textContent = clock(d);
    if (nowEl) nowEl.textContent = clock(audio.currentTime);
    if (seek && !dragging) {
      const pct = Number.isFinite(d) && d > 0 ? (audio.currentTime / d) * 1000 : 0;
      seek.value = String(Math.round(pct));
      seek.style.setProperty("--fill", `${pct / 10}%`);
    }
  };

  const load = (i, andPlay) => {
    index = (i + TRACKS.length) % TRACKS.length;
    localStorage.setItem(KEY, String(index));
    const track = TRACKS[index];
    audio.src = track.file;
    audio.preload = "auto";
    if (nameEl) nameEl.textContent = track.name;
    if (lenEl) lenEl.textContent = "0:00";
    if (nowEl) nowEl.textContent = "0:00";
    if (seek) {
      seek.value = "0";
      seek.style.setProperty("--fill", "0%");
    }
    if (andPlay) start();
  };

  const start = () => {
    if (!soundAllowed()) return;
    if (!audio.src) load(index, false);
    audio.play().then(
      () => {
        // Пока звучит ролик, музыку не поднимаем: она отошла намеренно
        glide(ducked ? 0 : level(), ducked ? 0 : RISE);
        paintPlay();
      },
      () => paintPlay()
    );
  };

  const stop = () => {
    glide(0, DUCK, () => audio.pause());
    paintPlay();
  };

  playBtn?.addEventListener("click", () => {
    wanted = !wanted;
    if (wanted) start();
    else stop();
    paintPlay();
  });

  const jump = (step) => {
    load(index + step, wanted);
    paintPlay();
  };
  prevBtn?.addEventListener("click", () => jump(-1));
  nextBtn?.addEventListener("click", () => jump(1));

  audio.addEventListener("ended", () => jump(1));
  audio.addEventListener("timeupdate", paintTime);
  audio.addEventListener("loadedmetadata", paintTime);

  /* Перемотка. Пока ползунок тянут, время из ролика на него не пишем -
     иначе он вырывается из-под пальца. */
  seek?.addEventListener("pointerdown", () => {
    dragging = true;
  });
  const release = () => {
    dragging = false;
  };
  seek?.addEventListener("pointerup", release);
  seek?.addEventListener("pointercancel", release);
  seek?.addEventListener("input", () => {
    const d = audio.duration;
    if (!Number.isFinite(d) || d <= 0) return;
    const pct = Number(seek.value) / 1000;
    audio.currentTime = d * pct;
    seek.style.setProperty("--fill", `${pct * 100}%`);
    if (nowEl) nowEl.textContent = clock(audio.currentTime);
  });
  seek?.addEventListener("change", release);

  /* Ролик под курсором зазвучал - музыка уходит вниз и встаёт.
     Ушёл - возвращается с того же места. */
  onDuck((active) => {
    ducked = active;
    if (active) {
      if (!audio.paused) glide(0, DUCK, () => audio.pause());
    } else if (wanted && soundAllowed()) {
      audio.play().then(() => glide(level(), RISE), () => {});
    }
    paintPlay();
  });

  /* Переключатель и ползунок общей громкости. Первый вызов приходит сразу
     после входа на сайт: до клика по кнопке входа браузер звук не разрешает,
     и до этого момента музыке играть нечем. */
  onSoundChange(() => {
    // Первый вызов приходит с кнопки входа. До неё плеер закрыт прелоадером,
    // и отсчёт десяти секунд, начатый при загрузке, съел бы половину времени
    // ещё до того, как человек увидел угол.
    wake();
    if (!soundAllowed()) {
      if (!audio.paused) stop();
      return;
    }
    // Первый раз, когда звук разрешён, музыка включается сама: она фон,
    // и просить включить фон отдельной кнопкой незачем.
    if (!audio.src) {
      wanted = true;
      load(index, true);
      return;
    }
    if (wanted && audio.paused && !ducked) start();
    else if (!ducked) glide(level(), 120);
  });

  /* СВОРАЧИВАНИЕ ---------------------------------------------------------
     Десять секунд без движения в зоне плеера - и он сжимается в кружок
     с треугольником. Любое касание, наведение или приход фокуса разворачивают
     его обратно.

     Пока курсор внутри, отсчёт не идёт вовсе: человек смотрит на плеер,
     складывать его под носом незачем. Отсчёт начинается, когда курсор ушёл,
     и на экранах без наведения - от последнего касания.

     Высоту развёрнутого вида меряем и кладём в переменную: без числа
     переход от auto к кружку был бы прыжком. */
  let idleTimer = 0;
  let inside = false;

  /* Меряем натуральную высоту: на мгновение снимаем и заданную высоту,
     и переход, читаем, возвращаем обратно. Без снятия перехода замер попал бы
     на середину анимации и вернул промежуточное число - именно так плеер
     однажды и застрял развёрнутым в высоту кружка.

     В свёрнутом виде не меряем вовсе: там и ширина, и отступы другие,
     natural height от них не тот. */
  const measure = () => {
    if (root.dataset.idle === "true") return;
    root.style.transition = "none";
    root.style.setProperty("--player-h", "auto");
    const h = root.offsetHeight;
    root.style.setProperty("--player-h", `${h}px`);
    void root.offsetHeight; // применяем до того, как вернём переход
    root.style.transition = "";
  };

  const fold = () => {
    if (inside) return;
    root.dataset.idle = "true";
  };

  const wake = () => {
    clearTimeout(idleTimer);
    root.dataset.idle = "false";
    if (!inside) idleTimer = setTimeout(fold, IDLE);
  };

  /* Пока плеер разворачивался, мерить нечего - высота едет. Как только
     переход закончился, проверяем ещё раз: за время, что он был сложен,
     мог смениться размер экрана. */
  root.addEventListener("transitionend", (e) => {
    if (e.target === root && e.propertyName === "height") measure();
  });

  root.addEventListener("pointerenter", () => {
    inside = true;
    wake();
  });

  root.addEventListener("pointerleave", () => {
    inside = false;
    wake();
  });

  // Касание, клик, ввод и приход фокуса с клавиатуры - всё это движение
  // в зоне плеера
  for (const type of ["pointerdown", "pointermove", "input", "focusin", "keydown"]) {
    root.addEventListener(type, wake);
  }

  window.addEventListener("resize", () => {
    measure();
    wake();
  });

  if (nameEl) nameEl.textContent = TRACKS[index].name;
  paintPlay();
  paintTime();
  measure();
  idleTimer = setTimeout(fold, IDLE);
}
