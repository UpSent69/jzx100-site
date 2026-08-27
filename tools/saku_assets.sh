#!/usr/bin/env bash
# Материалы пятого пространства - «Самурай в цветах сакуры».
#
# Ролик вступления. Оригинал вертикальный, 1080x1920 при 60 кадрах, 22 МБ.
# Стоит он не фоном во весь экран, а вертикальным кадром высотой в две трети
# экрана - то есть показывается примерно в 400 точек по ширине, и 720 в файле
# хватает даже на плотном экране. Родные 1080 при 60 кадрах дают 32 МБ:
# камера идёт вдоль аллеи, и каждый кадр целиком состоит из мелких лепестков -
# худшее, что можно дать кодеку. Берётся спокойный кусок в 12 секунд и крутится
# петлёй. Звук оставляем: ролик стоит кадром на виду, а не фоном за текстом,
# и на наведении должен звучать так же, как второй.
#
# Ролик внутри ленты. Сверху в кадре стоит водяной знак монтажки, и убрать
# его иначе, чем срезать полосу, нельзя. Срезаем 80 точек из 1280 - это
# верхушка ветки, ничего важного, - и получаем 720x1200. Последние полсекунды
# уходят в чёрное, поэтому режем на 9.2. Звук остаётся: на наведении он нужен.
set -e

FFDIR="/c/Users/fallm/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0-full_build/bin"
[ -d "$FFDIR" ] && export PATH="$FFDIR:$PATH"

A="$(cd "$(dirname "$0")/.." && pwd)/assets"
W="$A/web"
mkdir -p "$W"

PARAMS="aq-mode=3:aq-strength=1.1:psy-rd=1.0,0.15"

echo "saku-intro: 720x1280, 12 c, so zvukom" >&2
ffmpeg -y -v error -ss 0.5 -t 12 -i "$A/saku-intro.mp4" \
  -vf "hqdn3d=2:1.5:3:3,scale=720:1280:flags=lanczos+accurate_rnd+full_chroma_int,cas=0.4,fps=30" \
  -c:v libx264 -preset slow -crf 25 -pix_fmt yuv420p -profile:v high \
  -x264-params "$PARAMS" \
  -c:a aac -b:a 96k -ac 2 -movflags +faststart "$W/saku-intro.mp4"
ffmpeg -y -v error -i "$W/saku-intro.mp4" -frames:v 1 -q:v 82 "$W/saku-intro-poster.webp"

echo "saku-clip-1: srez vodyanogo znaka, 720x1200" >&2
ffmpeg -y -v error -i "$A/saku-clip-1.mp4" -t 9.2 \
  -vf "crop=720:1200:0:80,hqdn3d=1.5:1:2:2,cas=0.45,fps=30" \
  -c:v libx264 -preset slow -crf 22 -pix_fmt yuv420p -profile:v high \
  -x264-params "$PARAMS" \
  -c:a aac -b:a 96k -ac 2 -movflags +faststart "$W/saku-clip-1.mp4"
ffmpeg -y -v error -i "$W/saku-clip-1.mp4" -frames:v 1 -q:v 82 "$W/saku-clip-1-poster.webp"

ls -la "$W"/saku-*.mp4
echo DONE
