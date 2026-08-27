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
    # Второе пространство, «Keep it street». Иллюстрация карточки в паузе
    # и пять ночных кадров, которые лежат внутри пространства мозаикой.
    ("street-promo.png",   "street-promo",  [1672, 1280, 828]),
    ("street-shot-1.jpg",  "street-shot-1", [1080, 828]),
    ("street-shot-2.jpg",  "street-shot-2", [1080, 828]),
    ("street-shot-3.jpg",  "street-shot-3", [1080, 828]),
    ("street-shot-5.jpg",  "street-shot-5", [1080, 828]),
    ("street-shot-6.jpg",  "street-shot-6", [1080, 828]),
    # Третье пространство, «Культ JDM». Иллюстрация карточки в паузе и семь
    # ночных кадров: три вертикальных, три широких и один квадратный.
    ("cult-promo.png",     "cult-promo",    [1672, 1280, 828]),
    ("cult-shot-1.jpg",    "cult-shot-1",   [1080, 828]),
    ("cult-shot-2.jpg",    "cult-shot-2",   [1080, 828]),
    ("cult-shot-3.jpg",    "cult-shot-3",   [1080, 828]),
    ("cult-shot-4.jpg",    "cult-shot-4",   [1080, 828]),
    ("cult-shot-5.jpg",    "cult-shot-5",   [1080, 828]),
    ("cult-shot-6.jpg",    "cult-shot-6",   [1080, 828]),
    ("cult-shot-7.jpg",    "cult-shot-7",   [828]),
    # Четвёртое пространство, «Душа машины». Иллюстрация карточки в третьей
    # паузе и шесть кадров: вертикальные, квадратный и два широких.
    ("soul-promo.png",     "soul-promo",    [1672, 1280, 828]),
    ("soul-shot-1.jpg",    "soul-shot-1",   [736]),
    ("soul-shot-2.jpg",    "soul-shot-2",   [736]),
    ("soul-shot-3.jpg",    "soul-shot-3",   [1080, 828]),
    ("soul-shot-4.jpg",    "soul-shot-4",   [1080, 828]),
    ("soul-shot-5.jpg",    "soul-shot-5",   [960, 828]),
    ("soul-shot-6.jpg",    "soul-shot-6",   [735]),
    # Пятое пространство, «Самурай в цветах сакуры». Иллюстрация карточки
    # в четвёртой паузе и тринадцать кадров. Верхняя ширина у каждого своя
    # и равна родной: материал пришёл небольшим, и вторая ширина есть только
    # там, где оригинал шире 828.
    ("saku-promo.png",     "saku-promo",    [1672, 1280, 828]),
    ("saku-shot-1.jpg",    "saku-shot-1",   [736]),
    ("saku-shot-2.jpg",    "saku-shot-2",   [736]),
    ("saku-shot-3.jpg",    "saku-shot-3",   [736]),
    ("saku-shot-4.jpg",    "saku-shot-4",   [1200, 828]),
    ("saku-shot-5.jpg",    "saku-shot-5",   [736]),
    ("saku-shot-6.jpg",    "saku-shot-6",   [1080, 828]),
    ("saku-shot-7.jpg",    "saku-shot-7",   [1080, 828]),
    ("saku-shot-8.jpg",    "saku-shot-8",   [750]),
    ("saku-shot-9.jpg",    "saku-shot-9",   [960, 828]),
    ("saku-shot-10.jpg",   "saku-shot-10",  [900, 828]),
    ("saku-shot-11.jpg",   "saku-shot-11",  [736]),
    ("saku-shot-12.jpg",   "saku-shot-12",  [640]),
    ("saku-shot-13.jpg",   "saku-shot-13",  [1080, 828]),
]

# Кадры, которым обычного сжатия мало.
#
# Иллюстрация в чёрной паузе — тёмная, зернистая и почти вся в плавных
# переходах неба. На общих 80 она разваливалась на пятна и полосы: в тенях
# кодеку нечего экономить, он выкидывает как раз то, из чего этот кадр состоит.
# Показывается она крупно, на полэкрана, и каждый артефакт виден.
# Ночные кадры второго пространства — та же беда: почти всё кадром в тенях,
# плюс плёночное зерно, которое на общих настройках слипается в кашу.
HIQ = {"promo-drift": (94, 92), "street-promo": (94, 92), "cult-promo": (94, 92),
       "soul-promo": (94, 92), "saku-promo": (94, 92)}  # (jpeg, webp)
for _n in (1, 2, 3, 5, 6):
    HIQ[f"street-shot-{_n}"] = (90, 88)
# Кадры третьего пространства сняты в темноте и почти целиком лежат
# в тенях: на общих настройках они разваливаются на пятна.
for _n in range(1, 8):
    HIQ[f"cult-shot-{_n}"] = (91, 89)
# Кадры четвёртого пространства тоже почти целиком в тенях
for _n in range(1, 7):
    HIQ[f"soul-shot-{_n}"] = (91, 89)  # четвёртый кадр из вёрстки убран
# Кадры пятого пространства пришли уже пережатыми и небольшими: часть с зерном
# и цветным тонированием. Второй раз давить их на общих настройках нельзя -
# розовое как раз и рассыпается первым.
for _n in range(1, 14):
    HIQ[f"saku-shot-{_n}"] = (92, 90)

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
