#!/usr/bin/env bash
# Материалы третьего пространства — «Культ JDM».
#
# Здесь два разных случая, и настройки у них разные.
#
# Фон. Оригинал — шесть минут в 2560 при 60 кадрах, 776 МБ. Целиком он не нужен
# ни по смыслу, ни по весу: это фон, который по замыслу не должен притягивать
# взгляд, и показывается он притушенным и размытым средствами CSS. Поэтому
# берётся кусок в двадцать четыре секунды и крутится петлёй, кадровая частота
# срезается вдвое, ширина — до 1920. Сжатие плотное: под затемнением и размытием
# артефакты не видны, а разница в весе — десятки мегабайт.
#
# Ролики и кадры в самом пространстве, наоборот, ничем не притушены и лежат
# на переднем плане. Их жмём аккуратно и в родном размере: ни один не
# растягивается, обрезает только контейнер.
set -e

FFDIR="/c/Users/fallm/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0-full_build/bin"
[ -d "$FFDIR" ] && export PATH="$FFDIR:$PATH"

A="$(cd "$(dirname "$0")/.." && pwd)/assets"
W="$A/web"
mkdir -p "$W"

# --- фон ---
if [ -f "$A/cult-bg.mp4" ]; then
  echo "cult-bg: 24 с из шести минут, 1920, 30 кадров…" >&2
  ffmpeg -y -v error -ss 0 -t 24 -i "$A/cult-bg.mp4" -an \
    -vf "hqdn3d=3:2:4:4,scale=1920:-2:flags=lanczos,fps=30" \
    -c:v libx264 -preset slow -crf 28 -pix_fmt yuv420p -profile:v high \
    -x264-params "aq-mode=3:aq-strength=1.0" -movflags +faststart "$W/cult-bg.mp4"
  ffmpeg -y -v error -i "$W/cult-bg.mp4" -frames:v 1 -q:v 80 "$W/cult-bg-poster.webp"
else
  echo "cult-bg.mp4 нет в /assets — веб-копия оставлена как есть" >&2
fi

# --- ролики пространства: звук сохраняем, он нужен наведению ---
PARAMS="aq-mode=3:aq-strength=1.1:psy-rd=1.0,0.15"

# $1 имя  $2 ширина  $3 высота  $4 crf  $5 обрезка (необязательно)
#
# Обрезка нужна первому ролику: он приехал в 4:3, но кадр внутри широкий,
# а сверху и снизу залиты чёрные поля. Это не часть съёмки, а упаковка,
# и на карточке она читалась бы как дефект вёрстки.
clip () {
  echo "$1 -> $2x$3" >&2
  ffmpeg -y -v error -i "$A/$1.mp4" \
    -vf "${5:+$5,}hqdn3d=1.5:1:2:2,scale=$2:$3:flags=lanczos+accurate_rnd+full_chroma_int,cas=0.45,fps=30" \
    -c:v libx264 -preset slow -crf $4 -pix_fmt yuv420p -profile:v high \
    -x264-params "$PARAMS" \
    -c:a aac -b:a 96k -ac 2 -movflags +faststart "$W/$1.mp4"
  ffmpeg -y -v error -i "$W/$1.mp4" -frames:v 1 -q:v 82 "$W/$1-poster.webp"
}

clip cult-clip-1 1280 660 23 "crop=1280:660:0:150"   # чёрно-белые крупные планы
clip cult-clip-2  720 1280 23  # зимний кадр, вертикальный

ls -la "$W"/cult-*.mp4
echo DONE
