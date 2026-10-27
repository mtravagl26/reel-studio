#!/usr/bin/env python3
"""Added by By Mel Ross. Make the Reel cover: a 1080x1920 JPG from a still of the clip plus a short topic title.
Every reel gets one (Instagram shows it on your grid and in the Reels tab).

Usage:
  python3 cover.py <reel-folder> candidates
      Saves cover_candidates.jpg: frames every 0.5 s from the first and last 4 s of master.mp4, left to right, top to
      bottom, and prints their times. Look at the sheet and pick a frame where they're smiling, eyes open, mouth closed
      or mid-smile (not mid-word).
  python3 cover.py <reel-folder> --at <seconds> --title "short / topic title" [--y 300]
      Saves cover.jpg. "/" starts a new line; keep it to 2-3 lines of a few words. Title uses the brand's head font and
      main colour with the hook-title outline, placed high in the 3:4 middle of the frame, which is what the profile grid
      shows, and clear of the caption and button areas.

The still comes from master.mp4 (the cut, before captions and graphics), so the cover is clean. Needs Chrome,
Chromium or Edge (the same browser screenshot.sh uses) and ffmpeg.
"""
import html, json, os, shutil, subprocess, sys, tempfile
from pathlib import Path

W, H = 1080, 1920
SAFE_TOP, SAFE_BOTTOM = 240, 1680          # the profile grid crops the cover to the middle 1080x1440
reel = Path(sys.argv[1]).expanduser().resolve()
home = Path(os.environ.get("REELS_HOME", "~/reels")).expanduser()
brand = json.load(open(home / "brand.json"))
src = reel / "master.mp4"
if not src.exists():
    src = reel / "final.mp4"
if not src.exists():
    sys.exit(f"no master.mp4 or final.mp4 in {reel}: cut the reel first")


def duration(p):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                                capture_output=True, text=True, check=True).stdout)


def frame(t, out, w=W, h=H):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.3f}", "-i", str(src), "-frames:v", "1",
                    "-vf", f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}", str(out)], check=True)


if sys.argv[2:3] == ["candidates"]:
    d = duration(src)
    times = [round(x * 0.5, 2) for x in range(9)] + [round(max(d - 4 + x * 0.5, 0), 2) for x in range(8)]
    tmp = Path(tempfile.mkdtemp())
    for i, t in enumerate(times):
        frame(t, tmp / f"c{i:02d}.png", 270, 480)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(tmp / "c%02d.png"), "-vf", "tile=9x2:padding=6:color=white",
                    "-frames:v", "1", str(reel / "cover_candidates.jpg")], check=True)
    shutil.rmtree(tmp)
    print(reel / "cover_candidates.jpg")
    print("top row (start):   " + "  ".join(f"{t}s" for t in times[:9]))
    print("bottom row (end):  " + "  ".join(f"{t}s" for t in times[9:]))
    sys.exit(0)

args = sys.argv[2:]
opt = lambda name, default=None: args[args.index(name) + 1] if name in args else default
if opt("--at") is None or not opt("--title"):
    sys.exit(__doc__)
at, title, top = float(opt("--at")), opt("--title"), int(opt("--y", brand.get("cover_title_y", 300)))

C = brand["colors"]
head = (brand.get("fonts") or {}).get("head", {})
font_file = Path(os.path.expanduser(head.get("file", ""))) if head.get("file") else None
face = (f"@font-face {{ font-family: 'BrandHead'; src: url('{font_file.as_uri()}'); font-weight: {head.get('weight', 700)}; }}"
        if font_file and font_file.exists() else "")
family = f"'BrandHead', '{head.get('family', 'Helvetica Neue')}', Georgia, sans-serif"
lines = [ln.strip() for ln in title.split("/") if ln.strip()]
EM = 0.6                                   # rough glyph width; keeps the longest line inside 900 px
size = max(48, min(150, int(900 / (max(map(len, lines)) * EM))))
case = (lambda s: s.lower()) if brand.get("captions", {}).get("case") == "lower" else (lambda s: s)
outline = brand.get("title_outline", "#FFFFFF")
stroke = max(2, size // 22)
if top + len(lines) * size * 0.95 > SAFE_BOTTOM - 300:
    print("warning: the title runs low; shorten it or lower --y")

tmp = Path(tempfile.mkdtemp())
frame(at, tmp / "still.png")
(tmp / "cover.html").write_text(f"""<!doctype html><html><head><meta charset="utf-8"><style>
{face}
html, body {{ margin: 0; width: {W}px; height: {H}px; overflow: hidden; }}
body {{ background: url('still.png') center / cover; }}
.t {{ position: absolute; left: 90px; right: 90px; top: {max(top, SAFE_TOP)}px; text-align: center;
      font-family: {family}; font-weight: {head.get('weight', 700)}; font-size: {size}px; line-height: .95;
      letter-spacing: {brand.get('title_tracking', -0.03)}em; color: {C['main']};
      -webkit-text-stroke: {stroke * 2}px {outline}; paint-order: stroke fill;
      text-shadow: 0 6px 34px rgba(0,0,0,.25); }}
</style></head><body><div class="t">{'<br>'.join(html.escape(case(ln)) for ln in lines)}</div></body></html>""")

chrome = next((c for c in ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                           "/Applications/Chromium.app/Contents/MacOS/Chromium",
                           "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
                           shutil.which("google-chrome") or "", shutil.which("chromium") or ""] if c and os.access(c, os.X_OK)), None)
if not chrome:
    sys.exit("no Chrome/Chromium/Edge found - install Chrome to make the cover")
subprocess.run([chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
                "--allow-file-access-from-files", f"--window-size={W},{H}", "--virtual-time-budget=1500",
                f"--screenshot={tmp / 'cover.png'}", (tmp / "cover.html").as_uri()],
               capture_output=True, check=True)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(tmp / "cover.png"), "-vf", f"scale={W}:{H}", "-q:v", "2",
                str(reel / "cover.jpg")], check=True)
shutil.rmtree(tmp)
if not face:
    print(f"note: head font file not found ({head.get('file')}), the title used a fallback font")
print(reel / "cover.jpg")
