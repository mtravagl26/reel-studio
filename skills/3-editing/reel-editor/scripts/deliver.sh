#!/usr/bin/env bash
# Make the upload copies and put them where the person will find them.
# Modified by By Mel Ross: delivers three files, not one, and can send them back to the footage folder.
#   <name>.mp4          full quality: same resolution, high-bitrate H.264, fast-start (the upload copy)
#   <name> (phone).mp4  small copy for sending and watching on a phone: H.264 CRF 26, AAC 128k, fast-start
#   <name> cover.jpg    the Reel cover (make it first with cover.py; delivery stops without one)
# Usage: deliver.sh <final.mp4> "<clear name>" [--to <folder>] [--remember]
# Where: --to wins; else brand.json "deliver_dir". "footage" means the folder the raw clip came from (saved in
# <reel>/source_dir.txt when the clip was copied in), e.g. a cloud-synced folder the person filmed into.
set -euo pipefail
SRC="$1"; NAME="${2:-$(basename "${SRC%.*}")}"; TO=""; REMEMBER=""
shift; [ $# -gt 0 ] && shift
while [ $# -gt 0 ]; do
  case "$1" in
    --to) TO="${2:?--to needs a folder}"; shift 2;;
    --remember) REMEMBER=1; shift;;
    *) echo "unknown option: $1 (use --to <folder> and, when they said to always save there, --remember)" >&2; exit 2;;
  esac
done
REEL="$(cd "$(dirname "$SRC")" && pwd)"
HOME_REELS="${REELS_HOME:-$HOME/reels}"; BRAND="$HOME_REELS/brand.json"
# Added by By Mel Ross (0.21.0): ask where the finished reel goes. Without --to, and unless the person already said "always
# save there" (brand.json "deliver_ask": false), this stops and prints the choices to offer them. Nothing is written first.
SET_DIR="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get('deliver_dir','~/Movies/Reels'))" "$BRAND")"
ASK="$(python3 -c "import json,sys;print('no' if json.load(open(sys.argv[1])).get('deliver_ask', True) is False else 'yes')" "$BRAND")"
FOOT=""; [ -s "$REEL/source_dir.txt" ] && FOOT="$(head -n1 "$REEL/source_dir.txt")"
LAST=""; [ -s "$HOME_REELS/last_delivery.txt" ] && LAST="$(head -n1 "$HOME_REELS/last_delivery.txt")"
if [ -z "$TO" ] && [ "$ASK" = "yes" ]; then
  echo "ASK THEM FIRST: where should the finished reel be saved? Offer these, and let them name any other folder:" >&2
  [ -n "$LAST" ] && echo "  - the same place as last time: $LAST" >&2
  [ -n "$FOOT" ] && [ "$FOOT" != "$LAST" ] && echo "  - the folder the clip came from: $FOOT" >&2
  [ "$HOME/Movies/Reels" != "$LAST" ] && echo "  - their Movies folder: $HOME/Movies/Reels" >&2
  echo "  - their Desktop: $HOME/Desktop" >&2
  echo "Then run this again with --to \"<the folder they chose>\". If they say to always save there, add --remember and they won't be asked again." >&2
  exit 3
fi
if [ -n "$TO" ]; then DIR="$TO"
else
  DIR="$SET_DIR"
  if [ "$DIR" = "footage" ]; then
    if [ -n "$FOOT" ]; then DIR="$FOOT"
    else DIR="~/Movies/Reels"; echo "no source_dir.txt in the reel folder, delivering to ~/Movies/Reels" >&2; fi
  fi
fi
DIR="${DIR/#\~/$HOME}"
[ -s "$REEL/cover.jpg" ] || { echo "no cover.jpg yet: run cover.py <reel> candidates, pick a smiling frame, then cover.py <reel> --at <s> --title \"...\"" >&2; exit 1; }
[ "$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$REEL/cover.jpg" 2>/dev/null)" = "1080,1920" ] || {   # Modified by By Mel Ross: the cover must exist and be 1080x1920
  echo "cover.jpg is missing or not 1080x1920: make it with cover.py (candidates, then --at <s> --title \"...\")" >&2; exit 1; }
mkdir -p "$DIR"; OUT="$DIR/$NAME.mp4"; PHONE="$DIR/$NAME (phone).mp4"; COVER="$DIR/$NAME cover.jpg"

H="$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$SRC" | head -n1 | tr -d ",")"   # tr: some files carry side data (e.g. from the HDR conversion) that adds a trailing comma
if [ "$H" -ge 3000 ]; then RATE=35M; MAX=45M; else RATE=16M; MAX=20M; fi   # 4K vs 1080p

if [ "$(uname)" = "Darwin" ]; then
  VENC=(-c:v h264_videotoolbox -profile:v high -b:v "$RATE" -maxrate "$MAX" -bufsize "$MAX")   # Apple hardware encoder: fast, quiet
else
  VENC=(-c:v libx264 -preset slow -b:v "$RATE" -maxrate "$MAX" -bufsize "$MAX")
fi
TAG709=(-colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv); SETP="setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv"   # Added by By Mel Ross: every copy is labelled BT.709
ffmpeg -hide_banner -loglevel error -y -i "$SRC" -vf "$SETP" "${VENC[@]}" -pix_fmt yuv420p "${TAG709[@]}" -tag:v avc1 \
  -c:a aac -b:a 256k -movflags +faststart "$OUT"
ffmpeg -hide_banner -loglevel error -y -i "$SRC" -vf "scale='min(1080,iw)':-2,$SETP" -c:v libx264 -preset medium -crf 26 \
  -pix_fmt yuv420p "${TAG709[@]}" -tag:v avc1 -c:a aac -b:a 128k -movflags +faststart "$PHONE"
cp "$REEL/cover.jpg" "$COVER"
printf '%s\n' "$OUT" "$PHONE" "$COVER"
printf '%s\n' "$DIR" > "$HOME_REELS/last_delivery.txt" 2>/dev/null || true   # offered first next time
if [ -n "$REMEMBER" ]; then   # they said "always save there"
  python3 - "$BRAND" "$DIR" <<'PY'
import json, sys
f, d = sys.argv[1], sys.argv[2]
b = json.load(open(f)); b["deliver_dir"] = d; b["deliver_ask"] = False
json.dump(b, open(f, "w"), indent=2, ensure_ascii=False); open(f, "a").write("\n")
PY
  echo "saved: every reel now goes to $DIR without asking (brand.json deliver_dir; set \"deliver_ask\": true to be asked again)" >&2
fi
# Added by By Mel Ross (0.20.0): the caption they chose on the Caption page goes beside the video, ready to paste.
if [ -s "$REEL/caption.txt" ]; then cp "$REEL/caption.txt" "$DIR/$NAME caption.txt"; printf '%s\n' "$DIR/$NAME caption.txt"; fi
