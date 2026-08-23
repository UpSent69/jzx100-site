#!/usr/bin/env bash
# Ролики второго пространства («Keep it street»).
#
# Все они лежат внутри слоя, который открывается кнопкой, и грузятся только
# когда до них дошли. Прокруткой их никто не перематывает — они идут петлёй,
# пока видны. Отсюда обычный интервал ключевых кадров: сплошные нужны были бы
# только под перемотку.
#
# Обвязка та же, что у ролика второго экрана, и по той же причине: съёмка
# ночная и зернистая, а половину роликов приходится растягивать. Слабое
# шумоподавление снимает зерно до растяжения, cas возвращает контуры после,
# aq-mode=3 не даёт рассыпаться теням.
set -e

FFDIR="/c/Users/fallm/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0-full_build/bin"
[ -d "$FFDIR" ] && export PATH="$FFDIR:$PATH"

A="$(cd "$(dirname "$0")/.." && pwd)/assets"
W="$A/web"
mkdir -p "$W"

PARAMS="aq-mode=3:aq-strength=1.1:psy-rd=1.0,0.15:deblock=-1,-1"
CLEAN="hqdn3d=1.5:1:2:2"
FLAGS="lanczos+accurate_rnd+full_chroma_int"

# Кадровую частоту прижимаем к 30. Один из исходников снят в 120, и без этого
# он весил столько же, сколько все остальные вместе: на глаз разницы никакой,
# а битрейт вчетверо.
#
# $1 имя  $2 ширина  $3 высота  $4 crf
clip () {
  echo "$1 -> $2x$3" >&2
  ffmpeg -y -v error -i "$A/$1.mp4" -an \
    -vf "$CLEAN,scale=$2:$3:flags=$FLAGS,cas=0.5,fps=30" \
    -c:v libx264 -preset veryslow -crf $4 -pix_fmt yuv420p -profile:v high \
    -x264-params "$PARAMS" -movflags +faststart "$W/$1.mp4"
  ffmpeg -y -v error -i "$W/$1.mp4" -frames:v 1 -q:v 82 "$W/$1-poster.webp"
}

# Фон вступления: показывается во весь экран и притемнён, поэтому жмётся плотнее.
clip street-intro  1536 864 26

# Ролики актов занимают половину экрана — там видно каждый пиксель.
clip street-clip-1  864 1536 24   # неоновый паркинг
clip street-clip-2 1536  864 27   # проезд у стены с граффити
clip street-clip-3  864  864 24   # ночной город, чёрно-белый
clip street-clip-4  810 1440 25   # заправка в синем свете
clip street-clip-5  768 1024 24   # подъезд и корма в паркинге

ls -la "$W"/street-*.mp4
echo DONE
