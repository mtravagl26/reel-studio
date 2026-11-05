#!/usr/bin/env bash
# Build the reel from edit.json and render it. Logs how long each part took to <reel>/timings.log.
# Usage: render.sh <reel-folder> [--capcut] [--final]
# Gentle by default: 2 Chrome workers at low priority, 1080p preview. --final renders at the brand resolution (4K).
set -euo pipefail
REEL="$(cd "$1" && pwd)"; shift
FINAL=0; ARGS=(); for a in "$@"; do [ "$a" = "--final" ] && FINAL=1 || ARGS+=("$a"); done
WORKERS="${REEL_WORKERS:-2}"                     # each worker is a Chrome; 2 keeps a 16 GB Mac usable
S="$(cd "$(dirname "$0")" && pwd)"
# Modified by By Mel Ross: the final mix is mix_audio.py (three levels, music ducking, -14 LUFS, true-peak check); telemetry off unless you opt in, and REEL_NO_NICE=1 (render-nonice.sh) skips "nice",
# because HyperFrames fails with "uv_os_setpriority EACCES" under nice when started from a background runner.
export HYPERFRAMES_NO_TELEMETRY="${HYPERFRAMES_NO_TELEMETRY:-1}" DO_NOT_TRACK="${DO_NOT_TRACK:-1}"
NICE=(nice -n 15); [ -n "${REEL_NO_NICE:-}" ] && NICE=()
BRAND="${REELS_HOME:-$HOME/reels}/brand.json"
RES="$(python3 -c "import json;r=json.load(open('$BRAND')).get('resolution',[1080,1920]);print('portrait-4k' if r[0]>=2160 else 'portrait')")"
[ "$FINAL" = 1 ] || RES=portrait                 # previews at 1080p: a quarter of the pixels of 4K
stamp() { echo "$(date +%s) $1" >> "$REEL/timings.log"; }

# a preview cut leaves a 1080p master.mp4; re-cut it at the brand resolution so the final isn't an upscale
if [ "$FINAL" = 1 ]; then
  WANT="$(python3 -c "import json;print(json.load(open('$BRAND')).get('resolution',[1080,1920])[1])")"
  HAVE="$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$REEL/master.mp4")"
  if [ "$HAVE" -lt "$WANT" ]; then echo "master.mp4 is ${HAVE}p, re-cutting at ${WANT}p for the final"; env -u REEL_PREVIEW python3 "$S/cut.py" "$REEL"; fi
fi

[ -s "$S/../engine/gsap.min.js" ] || bash "$S/setup_engine.sh"
stamp "build:start"; python3 "$S/build_reel.py" "$REEL" ${ARGS[@]+"${ARGS[@]}"}; stamp "build:end"
stamp "render:start"
${NICE[@]+"${NICE[@]}"} npx -y hyperframes@0.8.145 render "$REEL/proj" --workers "$WORKERS" -o "$REEL/final.mp4" --resolution "$RES" --quality delivery --quiet
stamp "render:end"
# Final mix (Modified by By Mel Ross): mix_audio.py puts the voice, the music bed (brand.json "music", it dips while they speak and
# rises in the gaps) and the sound effects (sfx_events.json) at three levels, then brings the result to -14 LUFS with a true
# peak under -1.5 dBTP and checks it (mix_report.json). The video is copied, not re-encoded.
python3 "$S/mix_audio.py" "$REEL" --video final.mp4 --out final_ln.mp4
mv "$REEL/final_ln.mp4" "$REEL/final.mp4"
python3 "$S/timings.py" "$REEL"
