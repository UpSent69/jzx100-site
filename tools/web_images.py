"""Облегчённые версии кадров для /assets/web. Оригиналы не трогаем."""
import os
from PIL import Image

A = r"c:\markii\assets"
W = os.path.join(A, "web")
os.makedirs(W, exist_ok=True)

# (исходник, базовое имя, ширины) — верхняя ширина не превышает оригинал,
# апскейл только испортит и утяжелит
JOBS = [
    ("hero-composed.jpg",  "hero-composed", [1672, 1280, 828]),
    ("hero-clean.png",     "hero-clean",    [1672, 1280, 828]),
    ("jzx100-clean.jpg",   "jzx100-clean",  [1280, 828]),
    ("jzx100-night.jpg",   "jzx100-night",  [1280, 828]),
    ("motion-still-1.jpg", "motion-still-1", [1280, 828]),
    ("motion-still-2.jpg", "motion-still-2", [1280, 828]),
    # Вертикальный кадр под левую колонку пятого экрана. Оригинал 736×1308,
    # выше не поднимаемся — апскейл только испортит и утяжелит.
    ("reading-1.jpg",      "reading-1",     [736]),
    # Иллюстрация карточки «Подробнее» в первой чёрной паузе. Показывается
    # вертикальным кадром, но обрезает её контейнер — файл не трогаем.
    ("promo-drift.png",    "promo-drift",   [1672, 1280, 828]),
]

# Кадры, которым обычного сжатия мало.
#
# Иллюстрация в чёрной паузе — тёмная, зернистая и почти вся в плавных
# переходах неба. На общих 80 она разваливалась на пятна и полосы: в тенях
# кодеку нечего экономить, он выкидывает как раз то, из чего этот кадр состоит.
# Показывается она крупно, на полэкрана, и каждый артефакт виден.
HIQ = {"promo-drift": (94, 92)}  # (jpeg, webp)

for src, base, widths in JOBS:
    im = Image.open(os.path.join(A, src)).convert("RGB")
    jq, wq = HIQ.get(base, (82, 80))
    for w in widths:
        if w > im.width:
            continue
        h = round(im.height * w / im.width)
        r = im.resize((w, h), Image.LANCZOS)
        suffix = "" if w == widths[0] else f"-{w}"
        r.save(os.path.join(W, f"{base}{suffix}.jpg"), quality=jq,
               optimize=True, progressive=True, subsampling=1)
        r.save(os.path.join(W, f"{base}{suffix}.webp"), quality=wq, method=6)

# постеры карточек — вертикальные 9:16, отдаются сразу, поэтому жмём плотнее
for n in (1, 2):
    p = os.path.join(W, f"card-{n}-poster.jpg")
    im = Image.open(p).convert("RGB")
    im.save(p, quality=78, optimize=True, progressive=True, subsampling=1)
    im.save(os.path.join(W, f"card-{n}-poster.webp"), quality=76, method=6)

for f in sorted(os.listdir(W)):
    print(f"{f:34s} {os.path.getsize(os.path.join(W, f)) // 1024:6d} KB")
