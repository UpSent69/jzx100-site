/**
 * Локализация: русский и английский.
 *
 * Русский лежит в разметке как есть - он и есть исходник. Английский стоит
 * рядом атрибутами: data-en на элементе меняет его текст, data-en-alt,
 * data-en-aria-label, data-en-title и data-en-content - соответствующие
 * атрибуты. Никакого словаря с ключами: ключ - сама русская строка, и её
 * видно там же, где перевод.
 *
 * Почему так, а не через ключи. Ключи требуют держать три вещи согласованными:
 * разметку, словарь и список ключей. При правке текста в разметке про словарь
 * забывают, и часть сайта тихо остаётся на прежнем языке. Здесь перевод стоит
 * вплотную к оригиналу: не заметить его, меняя строку, невозможно.
 *
 * Строки, которых нет в разметке, - подписи, которые ставит скрипт, - лежат
 * в UI ниже. Их немного, все они короткие и все служебные.
 */

const KEY = "markii:lang";

const UI = {
  ru: {
    soundOn: "Звук вкл",
    soundOff: "Звук выкл",
    soundEnable: "Включить звук",
    soundDisable: "Выключить звук",
    percent: (n) => `${n} процентов`,
    play: "Играть",
    pause: "Пауза",
    untitled: (n) => `Без названия - ${n}`,
    silence: "Тишина",
  },
  en: {
    soundOn: "Sound on",
    soundOff: "Sound off",
    soundEnable: "Turn sound on",
    soundDisable: "Turn sound off",
    percent: (n) => `${n} per cent`,
    play: "Play",
    pause: "Pause",
    untitled: (n) => `Untitled - ${n}`,
    silence: "Silence",
  },
};

const stored = localStorage.getItem(KEY);
let lang = stored === "en" ? "en" : "ru";

const listeners = new Set();

/** Текущий язык: "ru" или "en". */
export function currentLang() {
  return lang;
}

/** Служебная подпись на текущем языке. */
export function t(key, arg) {
  const v = (UI[lang] || UI.ru)[key];
  return typeof v === "function" ? v(arg) : v;
}

export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* Русский текст запоминаем при первой замене - в самой разметке его хранить
   негде, а переключаться нужно в обе стороны. Ключ - сам элемент, поэтому
   WeakMap: убрали элемент со страницы, ушла и запись. */
const original = new WeakMap();

const ATTRS = [
  ["data-en-alt", "alt"],
  ["data-en-aria-label", "aria-label"],
  ["data-en-title", "title"],
  ["data-en-content", "content"],
];

function swapText(el) {
  const en = el.getAttribute("data-en");
  if (en === null) return;
  let box = original.get(el);
  if (!box) {
    box = {};
    original.set(el, box);
  }
  if (box.text === undefined) box.text = el.textContent;
  el.textContent = lang === "en" ? en : box.text;
}

function swapAttr(el, from, to) {
  const en = el.getAttribute(from);
  if (en === null) return;
  let box = original.get(el);
  if (!box) {
    box = {};
    original.set(el, box);
  }
  if (box[to] === undefined) box[to] = el.getAttribute(to) ?? "";
  el.setAttribute(to, lang === "en" ? en : box[to]);
}

/**
 * Проходит по всему поддереву и приводит его к текущему языку.
 * Вызывается на всю страницу при переключении, а из скриптов - на кусок
 * разметки, который они только что создали (например, копию карточки).
 */
export function applyLang(root = document) {
  // Не body, а весь документ: описание страницы для поисковика лежит
  // в head, и на русском оно оставалось бы даже на английской версии.
  const scope = root === document ? document.documentElement : root;
  if (!scope) return;

  if (scope.nodeType === 1 && scope.hasAttribute("data-en")) swapText(scope);
  scope.querySelectorAll?.("[data-en]").forEach(swapText);

  for (const [from, to] of ATTRS) {
    if (scope.nodeType === 1 && scope.hasAttribute(from)) swapAttr(scope, from, to);
    scope.querySelectorAll?.(`[${from}]`).forEach((el) => swapAttr(el, from, to));
  }
}

/** Переключение языка. Запоминается и переживает перезагрузку. */
export function setLang(next) {
  lang = next === "en" ? "en" : "ru";
  localStorage.setItem(KEY, lang);
  document.documentElement.lang = lang;
  applyLang(document);
  listeners.forEach((fn) => fn(lang));
}

/** Ставится один раз при запуске: язык мог быть выбран в прошлый заход. */
export function initLang() {
  document.documentElement.lang = lang;
  if (lang === "en") applyLang(document);
}
