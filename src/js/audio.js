/**
 * Общее состояние звука.
 *
 * Браузеры не дают включить звук без действия пользователя, и наведение
 * таким действием не считается. Поэтому до первого клика по странице всё
 * играет беззвучно. Кнопка входа на прелоадере и есть это действие —
 * после неё звук разрешён. Плюс постоянный переключатель в углу,
 * чтобы выбор можно было поменять и он запомнился.
 */

import { onLangChange, t } from "./i18n.js";

const KEY = "markii:sound";
const VOL_KEY = "markii:volume";

const clamp = (v) => Math.min(1, Math.max(0, v));

const stored = parseFloat(localStorage.getItem(VOL_KEY));

const state = {
  unlocked: false,                 // пользователь уже кликал по странице
  enabled: localStorage.getItem(KEY) !== "off",
  // Общий уровень громкости. Единица — «как задумано»: ролики под курсором
  // звучат вполсилы, раскрытая карточка в полную. Ползунок в углу двигает
  // не их, а этот множитель, поэтому соотношение между ними сохраняется.
  volume: Number.isFinite(stored) ? clamp(stored) : 1,
};

const listeners = new Set();

/* Кто сейчас просит звук. Нужно фоновой музыке: пока под курсором звучит
   ролик, она отходит. Считаем именно множеством, а не флагом: курсор может
   уйти с одного ролика на соседний, и на этом стыке звук просят оба разом -
   с флагом музыка успела бы вернуться и снова уйти. */
const wanting = new Set();
const duckers = new Set();

/** Подписка на «сейчас звучит ролик / больше не звучит». */
export function onDuck(fn) {
  duckers.add(fn);
  return () => duckers.delete(fn);
}

/* Уборка забытых.
   Ролик может исчезнуть, не сказав, что звук ему больше не нужен: раскрытую
   карточку играет копия, которую при закрытии просто выбрасывают из разметки,
   а пространство закрывают прямо из-под курсора - и «курсор ушёл» тогда
   не приходит. Без уборки такой ролик остаётся в списке навсегда, и музыка
   считает, что он всё ещё звучит: уходит вниз и больше не возвращается.

   Поэтому пока список не пуст, раз в полсекунды выкидываем из него всё,
   что уже не на странице или спрятано. Опрос идёт только в это время -
   в тишине таймера нет. */
let sweeper = 0;

const alive = (el) =>
  el.isConnected && !el.hidden && !el.closest("[hidden]") && el.offsetParent !== null;

function sweep() {
  let changed = false;
  for (const el of wanting) {
    if (alive(el)) continue;
    wanting.delete(el);
    changed = true;
  }
  if (!wanting.size) {
    clearInterval(sweeper);
    sweeper = 0;
  }
  if (changed) duckers.forEach((fn) => fn(wanting.size > 0));
}

// Ручка для снималки из tools/: увидеть, кто именно держит музыку внизу.
if (typeof window !== "undefined") {
  window.__ducking = () =>
    [...wanting].map((el) => `${el.className || el.tagName}|${(el.currentSrc || "").split("/").pop()}`);
}

function markWanting(el, wants) {
  const had = wanting.has(el);
  if (wants === had) return;
  if (wants) wanting.add(el);
  else wanting.delete(el);

  if (wanting.size && !sweeper) sweeper = setInterval(sweep, 500);
  if (!wanting.size && sweeper) {
    clearInterval(sweeper);
    sweeper = 0;
  }

  duckers.forEach((fn) => fn(wanting.size > 0));
}

/** Звук можно давать: и разрешён браузером, и не выключен пользователем. */
export function soundAllowed() {
  return state.unlocked && state.enabled;
}

export function soundEnabled() {
  return state.enabled;
}

/** Общий уровень, выставленный ползунком. */
export function soundVolume() {
  return state.volume;
}

export function setSoundVolume(v) {
  state.volume = clamp(v);
  localStorage.setItem(VOL_KEY, String(state.volume));
  notify();
}

/** Вызывается из обработчика реального клика — иначе смысла нет. */
export function unlockSound() {
  if (state.unlocked) return;
  state.unlocked = true;
  notify();
}

export function setSoundEnabled(on) {
  state.enabled = on;
  localStorage.setItem(KEY, on ? "on" : "off");
  notify();
}

export function onSoundChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => fn(soundAllowed()));
}

/** Переключатель в углу экрана. */
export function initSoundToggle(button) {
  if (!button) return;

  const label = button.querySelector("[data-sound-label]");

  const paint = () => {
    button.dataset.on = String(state.enabled);
    button.setAttribute("aria-pressed", String(state.enabled));
    button.setAttribute(
      "aria-label",
      state.enabled ? t("soundDisable") : t("soundEnable")
    );
    // Состояние пишем словом. С одной подписью «Звук» непонятно, включён он
    // сейчас или это предложение включить, — и тот, у кого звука нет, жмёт
    // на кнопку и выключает его окончательно.
    if (label) label.textContent = state.enabled ? t("soundOn") : t("soundOff");
  };

  button.addEventListener("click", () => {
    // Клик по переключателю — тоже действие пользователя, оно разблокирует звук
    unlockSound();
    setSoundEnabled(!state.enabled);
    paint();
  });

  onSoundChange(paint);
  onLangChange(paint); // подписи ставит скрипт, значит и менять их ему
  paint();
}

/**
 * Плавное ведение громкости. Резкое включение слышно как щелчок,
 * поэтому и вход, и выход всегда через рампу.
 *
 * Общий уровень с ползунка применяется здесь, а не у каждого вызова.
 * Через эту функцию проходит весь звук на сайте — карточки, раскрытая
 * карточка, ролики во всех трёх пространствах, — и умножать на множитель
 * в одном месте надёжнее, чем помнить про него в десяти. Вызывающая сторона
 * продолжает говорить, чего она хочет: «вполсилы», «в полную».
 */
export function fadeVolume(video, to, ms) {
  clearInterval(video.__fade);
  const target = clamp(to) * state.volume;
  // Через эту функцию проходит весь звук роликов, поэтому здесь же видно,
  // когда музыке пора отойти, а когда вернуться.
  markWanting(video, clamp(to) > 0);
  const from = video.volume;
  const started = performance.now();

  if (ms <= 0) {
    video.volume = target;
    return;
  }

  video.__fade = setInterval(() => {
    const t = Math.min(1, (performance.now() - started) / ms);
    video.volume = from + (target - from) * t;
    if (t === 1) clearInterval(video.__fade);
  }, 16);
}

/**
 * Ползунок общей громкости рядом с переключателем.
 *
 * Двигать его — тоже действие пользователя, поэтому он, как и кнопка,
 * снимает браузерный запрет на звук. И наоборот: если увести ползунок
 * в ноль при включённом звуке, получится «звук вкл, но тишина», и человек
 * пойдёт искать поломку. Поэтому ноль выключает звук, а первый шаг вверх
 * из нуля включает его обратно.
 */
export function initSoundMixer(input) {
  if (!input) return;

  const paint = () => {
    const pct = Math.round(state.volume * 100);
    if (document.activeElement !== input) input.value = String(pct);
    input.setAttribute("aria-valuetext", t("percent", pct));
    // Заливка дорожки до бегунка — иначе на тонкой полоске не видно,
    // где стоит уровень.
    input.style.setProperty("--fill", `${pct}%`);
  };

  input.addEventListener("input", () => {
    unlockSound();
    const v = Number(input.value) / 100;
    if (v > 0 && !state.enabled) setSoundEnabled(true);
    if (v === 0 && state.enabled) setSoundEnabled(false);
    setSoundVolume(v);
    paint();
  });

  onSoundChange(paint);
  onLangChange(paint);
  paint();
}
