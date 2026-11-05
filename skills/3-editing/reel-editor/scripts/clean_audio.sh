#!/usr/bin/env bash
# Modified by By Mel Ross: gentler chain (DeepFilterNet 20 dB, no gate, no presence or air boost) and -16 LUFS / -2 dBTP.
# Clean a talking-head voice track: gentle noise removal (DeepFilterNet 20 dB, no gate), de-essing, light EQ + 2:1 compression, two-pass loudness to -16 LUFS.
# Usage: clean_audio.sh <clip> <out.wav> [--no-denoise]   (noise removal is ON by default: birds, traffic, fans, room hiss)
set -euo pipefail
IN="$1"; OUT="$2"; DENOISE="${3:---denoise}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

ffmpeg -v error -y -i "$IN" -vn -ac 1 -ar 48000 "$TMP/raw.wav"
SRC="$TMP/raw.wav"

if [[ "$DENOISE" == "--denoise" ]]; then
  if command -v deepFilter >/dev/null 2>&1; then
    deepFilter -a "${DENOISE_DB:-20}" "$SRC" -o "$TMP/dfn" >/dev/null 2>&1   # 20 dB: gentler than the old 30, keeps the voice natural (quiet recordings were distorting)
    SRC="$(ls "$TMP"/dfn/*.wav | head -1)"
  else
    echo "note: DeepFilterNet not installed, using ffmpeg's built-in denoiser (weaker on birds/traffic)" >&2
    ffmpeg -v error -y -i "$SRC" -af "afftdn=nf=-25" "$TMP/dn.wav"
    SRC="$TMP/dn.wav"
  fi
fi

# Gentle chain (chosen by listening to test versions): no gate, no presence or air boost. Rumble cut, take out boxiness, tame "s" sounds,
# roll off above 11 kHz, light 2:1 compression. Loudness -16 LUFS (quiet recordings used to be pushed to -14 with a lot of gain
# through a boosted chain, which distorted). Override with LUFS=-14 etc. in the environment if a platform needs it.
CHAIN="highpass=f=80,equalizer=f=220:t=q:w=1:g=-2,deesser=i=0.8:m=0.7:f=0.45,lowpass=f=11000,acompressor=ratio=2:threshold=-22dB:attack=8:release=120"
LN="loudnorm=I=${LUFS:--16}:TP=${TRUEPEAK:--2}:LRA=${LRA:-9}"

J="$(ffmpeg -hide_banner -i "$SRC" -af "$CHAIN,$LN:print_format=json" -f null - 2>&1 | sed -n '/^{/,/^}/p')"
m() { printf '%s' "$J" | python3 -c "import sys,json;print(json.load(sys.stdin)['$1'])"; }

ffmpeg -v error -y -i "$SRC" -af "$CHAIN,$LN:measured_I=$(m input_i):measured_TP=$(m input_tp):measured_LRA=$(m input_lra):measured_thresh=$(m input_thresh):offset=$(m target_offset):linear=true" -ar 48000 "$OUT"
# Sound-engineer check: the gaps between words must be quiet. 10th-percentile 50 ms level = the background.
FLOOR="$(python3 - "$OUT" <<'PY'
import array, math, sys, wave
w = wave.open(sys.argv[1]); sr = w.getframerate(); a = array.array("h"); a.frombytes(w.readframes(w.getnframes()))
hop = int(sr * 0.05)
lev = sorted(20 * math.log10(max(1.0, math.sqrt(sum(x * x for x in a[i:i + hop:4]) / (hop / 4))) / 32768) for i in range(0, len(a) - hop, hop))
print(round(lev[len(lev) // 10]))
PY
)"
echo "background noise between words: ${FLOOR} dB (want -45 or quieter)" >&2
[ "$FLOOR" -le -45 ] || echo "WARNING: still noisy - check the raw clip (wind/handling noise can't be fully removed)" >&2
echo "$OUT"
