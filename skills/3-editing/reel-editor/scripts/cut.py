#!/usr/bin/env python3
"""Apply the approved rough cut: keep spans from edl.json (in play order), speed up, optional colour grade, scale to the
brand resolution. Writes master.mp4 in the reel folder.
Usage: python3 cut.py <reel-folder>      (reads <reel-folder>/edl.json and ~/reels/brand.json)
Modified by By Mel Ross: the studio look (enhance.py: gentle exposure/colour, mild denoise and sharpen, in the same encode as
the cut; then a slight background blur behind the speaker via cutout.py). On by default; brand.json "enhance" adjusts or
turns it off. Writes enhance.json and enhance_before_after.jpg for review."""
import json, os, subprocess, sys
from pathlib import Path

reel = Path(sys.argv[1]).expanduser()
home = Path(os.environ.get("REELS_HOME", "~/reels")).expanduser()
brand = json.load(open(home / "brand.json"))
edl = json.load(open(reel / "edl.json"))

src, audio = reel / edl["source"], reel / edl.get("audio", "voice.wav")
spans = edl["keep"]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from pacing import pacing
import enhance, cutout   # Added by By Mel Ross: studio look
import shutil
(reel / "master_sharp.mp4").unlink(missing_ok=True)     # a new cut makes the old background-softening and cutout obsolete
shutil.rmtree(reel / "cutout", ignore_errors=True)
speed = pacing(brand)["speed"]
w, h = brand.get("resolution", [1080, 1920])
if os.environ.get("REEL_PREVIEW"): w, h = 1080, 1920          # previews cut at 1080p: a quarter of the work
grade = brand.get("grade")
FADE = 0.012  # tiny audio fades at every join so cuts never click

vp, ap = [], []
for k, (a, b) in enumerate(spans):
    vp.append(f"[0:v]trim=start={a}:end={b},setpts=PTS-STARTPTS[v{k}]")
    ap.append(f"[1:a]atrim=start={a}:end={b},asetpts=PTS-STARTPTS,"
              f"afade=t=in:d={FADE},afade=t=out:st={max(b - a - FADE, 0):.3f}:d={FADE}[a{k}]")
n = len(spans)
post = [f"setpts=PTS/{speed}", f"scale={w}:{h}:force_original_aspect_ratio=increase", f"crop={w}:{h}", "fps=30"]
if grade:
    if edl.get("grade_from") is not None:   # grade switches on at this reel second (a "before/after" moment)
        # shortcut: splits filters on commas, so a filter option containing a comma breaks; quote-aware split if one ever does
        grade = ",".join(f + (":" if "=" in f else "=") + f"enable='gte(t,{float(edl['grade_from']):.3f})'" for f in grade.split(","))
    post.insert(1, grade)
try:
    PRE, POST, EINFO = enhance.filters(src, spans, brand, edl)   # studio look: before the scale, and after it
except Exception as e:                                           # a nicety: never lose the cut over it
    PRE, POST, EINFO = [], [], {"on": False, "error": str(e)}; print(f"studio look skipped: {e}")
post[(2 if grade else 1):(2 if grade else 1)] = PRE
post += POST
vcat = "".join(f"[v{k}]" for k in range(n)) + f"concat=n={n}:v=1:a=0," + ",".join(post) + "[vout]"
acat = "".join(f"[a{k}]" for k in range(n)) + f"concat=n={n}:v=0:a=1,atempo={speed}[aout]"

script = reel / "cut_filter.txt"
script.write_text(";".join(vp + ap) + ";" + vcat + ";" + acat)
kept = sum(b - a for a, b in spans)
print(f"{n} spans, {kept:.1f}s kept -> {kept / speed:.1f}s at {speed}x, {w}x{h}")
if kept / speed > brand.get("max_seconds", 60):
    print(f"warning: longer than {brand.get('max_seconds', 60)}s - suggest more cuts")

# Modified by By Mel Ross: ffmpeg 7+ reads a filter script with "-/filter_complex" (the old -filter_complex_script
# is deprecated, then removed); REEL_NO_NICE=1 skips the low-priority wrapper, which some background runners refuse.
import re
_v = re.search(r"version n?(\d+)\.", subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True).stdout)
FILTER_FLAG = "-filter_complex_script" if _v and int(_v.group(1)) < 7 else "-/filter_complex"
NICE = [] if os.environ.get("REEL_NO_NICE") else ["nice", "-n", "15"]
subprocess.run([*NICE, "ffmpeg", "-y", "-v", "error", "-stats", "-i", str(src), "-i", str(audio),
                FILTER_FLAG, str(script), "-map", "[vout]", "-map", "[aout]",
                *((["-c:v", "h264_videotoolbox", "-b:v", "12M"] if sys.platform == "darwin" else ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20"]) if os.environ.get("REEL_PREVIEW") else ["-c:v", "libx264", "-preset", "medium", "-crf", "16"]), "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", str(reel / "master.mp4")], check=True)
ES = enhance.settings(brand, edl)
EINFO["background"] = "off"
if ES["on"] is not False and ES["background"] * ES["strength"] > 0:
    try:
        ok = cutout.soften(reel, ES["background"] * ES["strength"], "balanced" if os.environ.get("REEL_PREVIEW") else "accurate")
        EINFO["background"] = "softened" if ok else "skipped (no cutout available: needs macOS with the Swift compiler)"
    except Exception as e:                     # the look is a nicety: never lose the cut over it
        EINFO["background"] = f"skipped ({e})"
json.dump(EINFO, open(reel / "enhance.json", "w"), indent=1)
print("studio look:", "off" if ES["on"] is False else f"on, background {EINFO['background']}", "-> enhance_before_after.jpg" if ES["on"] is not False else "")
if ES["on"] is not False:
    try: enhance.compare(reel)
    except Exception as e: print(f"(before/after frame skipped: {e})")
print(reel / "master.mp4")
