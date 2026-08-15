"""Силуэт машины первого экрана — верхний слой, под ним проходят буквы.

Режем из hero-plate, а не из hero-clean: слой должен лечь на тот же фон
и в том же грейде, иначе на стыке будет видна кромка.
"""
import os
import numpy as np
from PIL import Image
from rembg import new_session, remove

W = r"c:\markii\assets\web"
SP = r"C:\Users\fallm\AppData\Local\Temp\claude\c--markii\c5bda0ba-1047-4887-a67a-a61c384e5ffe\scratchpad"

src = Image.open(os.path.join(W, "hero-plate.jpg")).convert("RGB")
cut = remove(src, session=new_session("isnet-general-use"),
             alpha_matting=True, alpha_matting_foreground_threshold=250,
             alpha_matting_background_threshold=20, alpha_matting_erode_size=8)

rgba = np.asarray(cut).astype(np.float32)
H, WD = rgba.shape[:2]

# Матирование оставляет по контуру светлую кайму от фона. Поджимаем альфу
# на пиксель внутрь и слегка растушёвываем — на тёмном фоне канта не видно.
a = rgba[..., 3] / 255.0
p = np.pad(a, 1, mode="edge")
a = np.min(np.stack([p[y:y + H, x:x + WD] for y in range(3) for x in range(3)]), axis=0)
p = np.pad(a, 1, mode="edge")
a = np.mean(np.stack([p[y:y + H, x:x + WD] for y in range(3) for x in range(3)]), axis=0)
rgba[..., 3] = a * 255.0

cut = Image.fromarray(rgba.round().clip(0, 255).astype(np.uint8), "RGBA")
ys, xs = np.where(a > 0.03)
print("габарит силуэта: x %d..%d  y %d..%d  из %dx%d" %
      (xs.min(), xs.max(), ys.min(), ys.max(), WD, H))
print("доля непрозрачных пикселей: %.1f%%" % (100 * (a > 0.5).mean()))
cut.save(os.path.join(W, "hero-car.png"))

# предпросмотр: силуэт на ровном фоне — видно, что зацепилось лишнего
prev = Image.new("RGB", cut.size, (200, 40, 40))
prev.paste(cut, (0, 0), cut)
prev.save(os.path.join(SP, "car_preview.jpg"), quality=90)

# --- контрольная сборка всех слоёв первого экрана ---
scene = Image.open(os.path.join(W, "hero-plate.jpg")).convert("RGBA")
letters = Image.open(os.path.join(W, "hero-letters.png"))
scene.alpha_composite(letters)
scene.alpha_composite(cut)
scene.convert("RGB").save(os.path.join(SP, "scene_check.jpg"), quality=92)
print("контрольная сборка:", os.path.join(SP, "scene_check.jpg"))
