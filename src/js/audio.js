/**
 * Общее состояние звука.
 *
 * Браузеры не дают включить звук без действия пользователя, и наведение
 * таким действием не считается. Поэтому до первого клика по странице всё
 * играет беззвучно. Кнопка входа на прелоадере и есть это действие —
 * после неё звук разрешён. Плюс постоянный переключатель в углу,
 * чтобы выбор можно было поменять и он запомнился.
 */

const KEY = "markii:sound";

const state = {
  unlocked: false,                 // пользователь уже кликал по странице
  enabled: localStorage.getItem(KEY) !== "off",
};

const listeners = new Set();

/** Звук можно давать: и разрешён браузером, и не выключен пользователем. */
export function soundAllowed() {
  return state.unlocked && state.enabled;
}

export function soundEnabled() {
  return state.enabled;
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
      state.enabled ? "Выключить звук" : "Включить звук"
    );
    // Состояние пишем словом. С одной подписью «Звук» непонятно, включён он
    // сейчас или это предложение включить, — и тот, у кого звука нет, жмёт
    // на кнопку и выключает его окончательно.
    if (label) label.textContent = state.enabled ? "Звук вкл" : "Звук выкл";
  };

  button.addEventListener("click", () => {
    // Клик по переключателю — тоже действие пользователя, оно разблокирует звук
    unlockSound();
    setSoundEnabled(!state.enabled);
    paint();
  });

  onSoundChange(paint);
  paint();
}

/**
 * Плавное ведение громкости. Резкое включение слышно как щелчок,
 * поэтому и вход, и выход всегда через рампу.
 */
export function fadeVolume(video, to, ms) {
  clearInterval(video.__fade);
  const from = video.volume;
  const started = performance.now();

  if (ms <= 0) {
    video.volume = to;
    return;
  }

  video.__fade = setInterval(() => {
    const t = Math.min(1, (performance.now() - started) / ms);
    video.volume = from + (to - from) * t;
    if (t === 1) clearInterval(video.__fade);
  }, 16);
}
