"""Дожимаем слои с прозрачностью и убираем из /web лишние варианты."""
import os
from PIL import Image

W = r"c:\markii\assets\web"

# hero-clean в /web не нужен: его роль играет hero-plate, приведённый к грейду
# композиции. Два разных «чистых кадра» в одной папке только путают.
for f in os.listdir(W):
    if f.startswith("hero-clean"):
        os.remove(os.path.join(W, f))

car = Image.open(os.path.join(W, "hero-car.png"))
car.save(os.path.join(W, "hero-car.webp"), quality=90, method=6, lossless=False)
for w in (1280, 828):
    h = round(car.height * w / car.width)
    r = car.resize((w, h), Image.LANCZOS)
    r.save(os.path.join(W, "hero-car-%d.png" % w), optimize=True)
    r.save(os.path.join(W, "hero-car-%d.webp" % w), quality=88, method=6)

letters = Image.open(os.path.join(W, "hero-letters.png"))
letters.save(os.path.join(W, "hero-letters.webp"), quality=92, method=6)

total = 0
for f in sorted(os.listdir(W)):
    s = os.path.getsize(os.path.join(W, f))
    total += s
    print("%-28s %7d KB" % (f, s // 1024))
print("итого /web: %.1f МБ" % (total / 1024 / 1024))
