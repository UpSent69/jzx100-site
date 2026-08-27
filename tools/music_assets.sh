#!/usr/bin/env bash
# Плейлист фоновой музыки.
#
# Оригиналы лежат в assets/music: двенадцать mp3 по 320 кбит/с и четыре m4a.
# В web они идут одним форматом - aac 128 кбит/с. Причина простая: это фон,
# он играет тихо и под видео, разницу между 320 и 128 на нём не слышно,
# а вес падает с 66 МБ до примерно 25 МБ. Меньше 128 брать нельзя - на тихих
# местах начинает звенеть верх.
#
# Имена файлов в web - номера. Названия треков лежат в плеере (src/js/music.js):
# в самих файлах тегов нет вовсе, ни названия, ни обложки.
set -e

FFDIR="/c/Users/fallm/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0-full_build/bin"
[ -d "$FFDIR" ] && export PATH="$FFDIR:$PATH"

A="$(cd "$(dirname "$0")/.." && pwd)/assets"
M="$A/music"
W="$A/web/music"
mkdir -p "$W"

n=0
for f in "$M"/*.mp3 "$M"/*.m4a; do
  [ -e "$f" ] || continue
  n=$((n + 1))
  out=$(printf "%s/%02d.m4a" "$W" "$n")
  echo "$(basename "$f") -> $(basename "$out")" >&2
  ffmpeg -y -v error -i "$f" -vn -c:a aac -b:a 128k -ac 2 -movflags +faststart "$out"
done

# Обложка. Своих обложек у треков нет - в файлах нет ни картинки, ни тегов,
# поэтому в плеере стоит одна общая, из материала сайта.
ffmpeg -y -v error -i "$A/web/cult-shot-1.webp" \
  -vf "crop='min(iw,ih)':'min(iw,ih)',scale=320:320:flags=lanczos" \
  -q:v 82 "$A/web/music-cover.webp"

ls -la "$W" | head -20
echo DONE
