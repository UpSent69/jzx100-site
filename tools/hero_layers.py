"""Разбор первого экрана на слои: фон без надписи + шесть отдельных знаков.

hero-composed отгрейжен относительно hero-clean (темнее, глуше, с виньеткой),
а сама надпись положена с неполной непрозрачностью — сквозь неё едва видна сцена.
Поэтому:
  * маска букв берётся как разница composed и clean;
  * цвет букв берётся прямо из composed, чтобы просвет сохранился;
  * фон под буквами собирается из clean, подогнанного под грейд композиции
    канальной таблицей плюс низкочастотной поправкой — она гасит виньетку
    и делает шов по краю заливки невидимым.
Катакана и подпись внизу — часть композиции, они остаются в фоне.
"""
import json
import os

import numpy as np
from PIL import Image, ImageFilter

A = r"c:\markii\assets"
W = os.path.join(A, "web")
SP = r"C:\Users\fallm\AppData\Local\Temp\claude\c--markii\c5bda0ba-1047-4887-a67a-a61c384e5ffe\scratchpad"
os.makedirs(W, exist_ok=True)

comp = np.asarray(Image.open(os.path.join(A, "hero-composed.jpg")).convert("RGB"), np.float32)
clean = np.asarray(Image.open(os.path.join(A, "hero-clean.png")).convert("RGB"), np.float32)
assert comp.shape == clean.shape
H, WD = comp.shape[:2]


def _box(a, r, axis):
    n = a.shape[axis]
    pad = [(0, 0)] * a.ndim
    pad[axis] = (r + 1, r)
    c = np.cumsum(np.pad(a, pad, mode="edge"), axis=axis)
    hi = np.take(c, np.arange(2 * r + 1, n + 2 * r + 1), axis=axis)
    lo = np.take(c, np.arange(0, n), axis=axis)
    return (hi - lo) / (2 * r + 1)


def blur(a, sigma):
    """Тройной box-фильтр — практически гаусс, но без ограничений PIL по режимам."""
    r = max(1, int(round(sigma * 0.6)))
    for _ in range(3):
        a = _box(_box(a, r, 0), r, 1)
    return a


def grow(a, px):
    """Расширение маски на px пикселей (максимум по окну 3x3, повторённый)."""
    for _ in range(px):
        p = np.pad(a, 1, mode="edge")
        a = np.max(np.stack([p[y:y + H, x:x + WD] for y in range(3) for x in range(3)]), axis=0)
    return a


def shrink(a, px):
    for _ in range(px):
        p = np.pad(a, 1, mode="edge")
        a = np.min(np.stack([p[y:y + H, x:x + WD] for y in range(3) for x in range(3)]), axis=0)
    return a


# ---------------------------------------------------------------- маска букв
# Надпись непрозрачная, но грейд опускает её белую точку примерно до 226.
# Поэтому меру «сколько здесь краски» считаем не до 255, а до реального цвета
# краски PAINT: иначе на светлых участках сцены (бетонный отбойник) альфа
# просела бы и сквозь буквы проступила бы стена.
first = np.clip((comp - clean) / np.clip(255.0 - clean, 1.0, None), 0.0, 1.0).mean(axis=2)
PAINT = np.median(comp[first > 0.75], axis=0)

den = PAINT - clean
usable = den > 20.0
frac = np.where(usable, (comp - clean) / np.where(usable, den, 1.0), np.nan)
alpha = np.clip(np.nanmean(np.where(usable, frac, np.nan), axis=2), 0.0, 1.0)
# там, где сцена сама светлее краски, разделить их по яркости нельзя —
# считаем краской то, что совпало с её цветом
flat = (~usable).all(axis=2)
alpha[flat] = (np.abs(comp - PAINT).max(axis=2) < 10)[flat]

LO, HI = 0.30, 0.85
alpha = np.clip((alpha - LO) / (HI - LO), 0.0, 1.0)
alpha = grow(shrink(alpha, 1), 1)          # снимаем одиночные точки JPEG-шума
print("цвет краски:", PAINT.round(1))

# Подпись и катакана внизу тоже светлее фона и попадают в разницу.
# Надпись MARK II — единственное, что даёт высокие сплошные столбцы,
# поэтому отсекаем всё за пределами её строки.
solid = alpha > 0.5
rows = np.where(solid.sum(axis=1) > WD * 0.01)[0]
ry0, ry1 = int(rows[0]), int(rows[-1]) + 1
alpha[:ry0] = 0
alpha[ry1:] = 0
print("строка надписи: y %d..%d" % (ry0, ry1))

# ------------------------------------------------- фон в грейде композиции
# Грейд не сводится к одной кривой: есть виньетка и падение контраста.
# Поэтому согласуем локально — среднее и разброс в окне вокруг каждого пикселя.
# Статистика composed считается только по пикселям вне букв (там она известна).
outside = alpha < 0.02
valid = outside.astype(np.float32)[..., None]

# Окно берём широким: в узком окне статистика возле букв считается по горстке
# валидных пикселей и вокруг машины проступает ложный ореол.
SIGMA = 90


def local(x):
    """Среднее по окну, посчитанное только по валидным пикселям."""
    return blur(x * valid, SIGMA) / np.clip(blur(valid, SIGMA), 1e-4, None)


mean_c, mean_k = local(comp), local(clean)
var_c = np.clip(local((comp - mean_c) ** 2), 1e-3, None)
var_k = np.clip(local((clean - mean_k) ** 2), 1e-3, None)
gain = np.clip(np.sqrt(var_c / var_k), 0.35, 1.8)

regraded = (clean - mean_k) * gain + mean_c

resid = np.abs(regraded - comp)[outside]
print("остаток подгонки вне букв: mean %.2f  p99 %.1f" % (resid.mean(), np.percentile(resid, 99)))

# Фон берём приведённым кадром целиком, а не вклейкой в composed: в чистом кадре
# заметно больше мелкой детали, и любая локальная подстановка читалась бы силуэтом
# букв. Целиком приведённый кадр однороден — стыка нет нигде.
# Катакана и подпись в фон не переносятся: на сайте они набираются текстом.
plate_img = Image.fromarray(regraded.round().clip(0, 255).astype(np.uint8), "RGB")

# ------------------------------------------------------------- слои надписи
rgba = np.zeros((H, WD, 4), np.uint8)
rgba[..., :3] = PAINT.round().clip(0, 255).astype(np.uint8)
rgba[..., 3] = (alpha * 255).round().astype(np.uint8)
letters_img = Image.fromarray(rgba, "RGBA")

# --- разрез на знаки вертикальными линиями по пустым столбцам ---
cols = alpha.sum(axis=0)
on = cols > 0.5
groups, start = [], None
for x in range(WD):
    if on[x] and start is None:
        start = x
    elif not on[x] and start is not None:
        groups.append((start, x))
        start = None
if start is not None:
    groups.append((start, WD))
groups = [g for g in groups if g[1] - g[0] > WD * 0.005]
print("связных областей:", len(groups), groups)

# Машина закрывает середину слова: A, R и K видны фрагментами, K разорвана
# на стойку и верхний луч — эти две области относятся к одному знаку.
NAMES = ["m", "a", "r", "k", "i1", "i2"]
MERGE = {3: 4}
cells, skip = [], set()
for i, g in enumerate(groups):
    if i in skip:
        continue
    x0, x1 = g
    if i in MERGE:
        x1 = groups[MERGE[i]][1]
        skip.add(MERGE[i])
    cells.append([x0, x1])
assert len(cells) == len(NAMES), "ожидалось 6 знаков, вышло %d: %s" % (len(cells), cells)

# границы ячеек ведём по середине просветов — там альфа нулевая, стык не виден
for i in range(len(cells) - 1):
    mid = (cells[i][1] + cells[i + 1][0]) // 2
    cells[i][1] = mid
    cells[i + 1][0] = mid
cells[0][0] = max(0, cells[0][0] - 2)
cells[-1][1] = min(WD, cells[-1][1] + 2)

meta = []
for name, (x0, x1) in zip(NAMES, cells):
    r = np.where(alpha[:, x0:x1].sum(axis=1) > 0.5)[0]
    y0, y1 = int(r[0]), int(r[-1]) + 1
    letters_img.crop((x0, y0, x1, y1)).save(os.path.join(W, "hero-letter-%s.png" % name))
    meta.append({"name": name,
                 "left": round(x0 / WD, 6), "top": round(y0 / H, 6),
                 "width": round((x1 - x0) / WD, 6), "height": round((y1 - y0) / H, 6)})

letters_img.save(os.path.join(W, "hero-letters.png"))
with open(os.path.join(W, "hero-letters.json"), "w", encoding="utf-8") as f:
    json.dump({"frame": {"width": WD, "height": H},
               "note": "left/top/width/height — доли кадра; слой ставится поверх hero-plate",
               "letters": meta}, f, ensure_ascii=False, indent=2)

# --------------------------------------------------------------- сохранение
plate_img.save(os.path.join(W, "hero-plate.jpg"), quality=88, optimize=True,
               progressive=True, subsampling=1)
plate_img.save(os.path.join(W, "hero-plate.webp"), quality=84, method=6)
for w in (1280, 828):
    h = round(H * w / WD)
    r = plate_img.resize((w, h), Image.LANCZOS)
    r.save(os.path.join(W, "hero-plate-%d.jpg" % w), quality=82, optimize=True,
           progressive=True, subsampling=1)
    r.save(os.path.join(W, "hero-plate-%d.webp" % w), quality=80, method=6)

# ------------------------------------------------------------- контроль сборки
back = np.asarray(plate_img, np.float32)
la = alpha[..., None]
rebuilt = back * (1 - la) + rgba[..., :3].astype(np.float32) * la
d = np.abs(rebuilt - comp)
print("фон + буквы vs оригинал: mean %.2f  max %.0f  пикселей >12: %d из %d"
      % (d.mean(), d.max(), int((d.max(axis=2) > 12).sum()), H * WD))
Image.fromarray(rebuilt.round().clip(0, 255).astype(np.uint8), "RGB").save(
    os.path.join(SP, "rebuilt.jpg"), quality=92)
for m in meta:
    print(m)
