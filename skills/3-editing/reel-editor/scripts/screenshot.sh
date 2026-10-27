#!/usr/bin/env bash
# Screenshot a website for a "shot" card (e.g. the homepage of a tool you mention). ~5-10 s.
# Usage: screenshot.sh <url> <out.png>
set -euo pipefail
URL="$1"; OUT="$2"
for c in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
         "/Applications/Chromium.app/Contents/MacOS/Chromium" \
         "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
         "$(command -v google-chrome || true)" "$(command -v chromium || true)"; do
  [ -n "$c" ] && [ -x "$c" ] && CH="$c" && break
done
[ -n "${CH:-}" ] || { echo "no Chrome/Chromium/Edge found - install Chrome, or use your own screenshot" >&2; exit 1; }
"$CH" --headless=new --disable-gpu --hide-scrollbars --window-size=1280,900 --screenshot="$OUT" "$URL" >/dev/null 2>&1
# Some sites (claude.ai, anything behind Cloudflare) answer bots with a blank "verifying you are human" page.
# Flag near-uniform screenshots so they never land in a reel.
STD="$(ffmpeg -v error -i "$OUT" -vf "scale=48:32,format=gray" -f rawvideo - | python3 -c "import sys,statistics;print(int(statistics.pstdev(sys.stdin.buffer.read())))")"
if [ "$STD" -lt 14 ]; then
  echo "blocked or blank screenshot (contrast $STD): try the tool's marketing site, or take the screenshot yourself" >&2; rm -f "$OUT"; exit 2
fi
echo "$OUT"
