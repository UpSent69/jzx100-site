#!/usr/bin/env bash
# Материалы четвёртого пространства — «Душа машины».
#
# Фон. Оригинал — три минуты в 1920 при 25 кадрах, 51 МБ. Целиком он не нужен:
# это фон, который по замыслу не должен притягивать взгляд, и показывается он
# притушенным. Берётся спокойный кусок с восемнадцатой по сорок восьмую
# секунду — там машина на ночной стоянке и проезд под мостом, без лиц
# и без резких склеек, — и крутится петлёй. Кадровая частота остаётся
# родной: 25 кадров тут не экономия, а то, как снято.
#
# Ролики и кадры в самом пространстве лежат на переднем плане и ничем
# не притушены. Их жмём аккуратно и в родном размере: ни один не
# растягивается, обрезает только контейнер.
set -e

FFDIR="/c/Users/fallm/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0-full_build/bin"
[ -d "$FFDIR" ] && export PATH="$FFDIR:$PATH"

A="$(cd "$(dirname "$0")/.." && pwd)/assets"
W="$A/web"
mkdir -p "$W"

# --- фон ---
echo "soul-bg: 30 с из трёх минут, 1920…" >&2
ffmpeg -y -v error -ss 18 -t 30 -i "$A/soul-bg.mp4" -an \
  -vf "hqdn3d=3:2:4:4,scale=1920:-2:flags=lanczos" \
  -c:v libx264 -preset slow -crf 28 -pix_fmt yuv420p -profile:v high \
  -x264-params "aq-mode=3:aq-strength=1.0" -movflags +faststart "$W/soul-bg.mp4"
ffmpeg -y -v error -i "$W/soul-bg.mp4" -frames:v 1 -q:v 80 "$W/soul-bg-poster.webp"

# --- ролики пространства: звук сохраняем, он нужен наведению ---
PARAMS="aq-mode=3:aq-strength=1.1:psy-rd=1.0,0.15"

# $1 имя  $2 ширина  $3 высота  $4 crf
clip () {
  echo "$1 -> $2x$3" >&2
  ffmpeg -y -v error -i "$A/$1.mp4" \
    -vf "hqdn3d=1.5:1:2:2,scale=$2:$3:flags=lanczos+accurate_rnd+full_chroma_int,cas=0.45,fps=30" \
    -c:v libx264 -preset slow -crf $4 -pix_fmt yuv420p -profile:v high \
    -x264-params "$PARAMS" \
    -c:a aac -b:a 96k -ac 2 -movflags +faststart "$W/$1.mp4"
  ffmpeg -y -v error -i "$W/$1.mp4" -frames:v 1 -q:v 82 "$W/$1-poster.webp"
}

clip soul-clip-1 1440  720 23   # чёрно-белый, широкий
clip soul-clip-2  576 1024 23   # вертикальный
clip soul-clip-3  720 1280 23   # вертикальный
clip soul-clip-4  720 1280 23   # вертикальный
clip soul-clip-5  720 1280 23   # вертикальный
clip soul-clip-6  720 1280 23   # вертикальный

# Седьмой не жмём: исходник пришёл уже сжатым - 684x576 при 450 кбит/с.
# Прогонять его через ту же чистку значит терять то немногое, что осталось,
# поэтому в web он просто перекладывается с faststart:
#   ffmpeg -i assets/soul-clip-7.mp4 -c copy -movflags +faststart assets/web/soul-clip-7.mp4

ls -la "$W"/soul-*.mp4
echo DONE
