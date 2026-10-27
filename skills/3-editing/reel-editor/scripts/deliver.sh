#!/usr/bin/env bash
# Make the upload copies and put them where the person will find them.
# Modified by By Mel Ross: delivers three files, not one, and can send them back to the footage folder.
#   <name>.mp4          full quality: same resolution, high-bitrate H.264, fast-start (the upload copy)
#   <name> (phone).mp4  small copy for sending and watching on a phone: H.264 CRF 26, AAC 128k, fast-start
#   <name> cover.jpg    the Reel cover (make it first with cover.py; delivery stops without one)
# Usage: deliver.sh <final.mp4> "<clear name>" [--to <folder>]
# Where: --to wins; else brand.json "deliver_dir". "footage" means the folder the raw clip came from (saved in
# <reel>/source_dir.txt when the clip was copied in), e.g. a cloud-synced folder the person filmed into.
set -euo pipefail
SRC="$1"; NAME="${2:-$(basename "${SRC%.*}")}"; TO=""
[ "${3:-}" = "--to" ] && TO="${4:?--to needs a folder}"
REEL="$(cd "$(dirname "$SRC")" && pwd)"
BRAND="${REELS_HOME:-$HOME/reels}/brand.json"
if [ -n "$TO" ]; then DIR="$TO"
else
  DIR="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get('deliver_dir','~/Movies/Reels'))" "$BRAND")"
  if [ "$DIR" = "footage" ]; then
    if [ -s "$REEL/source_dir.txt" ]; then DIR="$(head -n1 "$REEL/source_dir.txt")"
    else DIR="~/Movies/Reels"; echo "no source_dir.txt in the reel folder, delivering to ~/Movies/Reels" >&2; fi
  fi
fi
DIR="${DIR/#\~/$HOME}"
[ -s "$REEL/cover.jpg" ] || { echo "no cover.jpg yet: run cover.py <reel> candidates, pick a smiling frame, then cover.py <reel> --at <s> --title \"...\"" >&2; exit 1; }
mkdir -p "$DIR"; OUT="$DIR/$NAME.mp4"; PHONE="$DIR/$NAME (phone).mp4"; COVER="$DIR/$NAME cover.jpg"

H="$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$SRC")"
if [ "$H" -ge 3000 ]; then RATE=35M; MAX=45M; else RATE=16M; MAX=20M; fi   # 4K vs 1080p

if [ "$(uname)" = "Darwin" ]; then
  VENC=(-c:v h264_videotoolbox -profile:v high -b:v "$RATE" -maxrate "$MAX" -bufsize "$MAX")   # Apple hardware encoder: fast, quiet
else
  VENC=(-c:v libx264 -preset slow -b:v "$RATE" -maxrate "$MAX" -bufsize "$MAX")
fi
ffmpeg -hide_banner -loglevel error -y -i "$SRC" "${VENC[@]}" -pix_fmt yuv420p -tag:v avc1 \
  -c:a aac -b:a 256k -movflags +faststart "$OUT"
ffmpeg -hide_banner -loglevel error -y -i "$SRC" -vf "scale='min(1080,iw)':-2" -c:v libx264 -preset medium -crf 26 \
  -pix_fmt yuv420p -tag:v avc1 -c:a aac -b:a 128k -movflags +faststart "$PHONE"
cp "$REEL/cover.jpg" "$COVER"
printf '%s\n' "$OUT" "$PHONE" "$COVER"
