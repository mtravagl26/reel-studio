#!/usr/bin/env python3
"""Apply the approved rough cut: keep spans from edl.json (in play order), speed up, optional color grade, scale to the
brand resolution. Writes master.mp4 in the reel folder.
Usage: python3 cut.py <reel-folder>      (reads <reel-folder>/edl.json and ~/reels/brand.json)
Modified by By Mel Ross: the studio look (enhance.py: gentle exposure/colour, mild denoise and sharpen, in the same encode as
the cut; then a slight background blur behind the speaker via cutout.py). On by default; brand.json "enhance" adjusts or
turns it off. Writes enhance.json and enhance_before_after.jpg for review."""

import json, os, subprocess, sys
from pathlib import Path

reel = Path(sys.argv[1]).expanduser()
home = Path(os.environ.get("REELS_HOME", "~/reels")).expanduser()
# the reel's look (speed, resolution, sfx ...) is laid over brand.json
sys.path.insert(0, str(Path(__file__).resolve().parent))
import theme as _theme

brand = _theme.load_brand(home, reel, quiet=True)
edl = json.load(open(reel / "edl.json"))

src, audio = reel / edl["source"], reel / edl.get("audio", "voice.wav")
spans = edl["keep"]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from pacing import pacing
import enhance, cutout, hdr2sdr, draft  # Added by By Mel Ross: studio look, HDR to SDR
import shutil

# Added by By Mel Ross: HDR phone clips (HLG / PQ / BT.2020) are converted to SDR up front with macOS avconvert; SDR clips are untouched.
# If that is not possible the clip is used as it is and the output says the color is only approximate.
src, SRC_COLOR = hdr2sdr.working_source(src, reel)
if SRC_COLOR.get("hdr") and not SRC_COLOR.get("converted"):
    print("WARNING:", SRC_COLOR["note"])


# Added by By Mel Ross (0.10.3): say so, once per cut, when the clip is heavier than a 1080p reel needs. Never a failure.
def filming_tip(w, h, fps, hdr):
    heavy = [
        x for x in ("4K" if min(w, h) > 1100 else "", f"{fps:.0f} fps" if fps > 31 else "", "HDR" if hdr else "") if x
    ]
    return (
        (
            "TIP (tell them once): this clip is "
            + ", ".join(heavy)
            + ". The reel is built at 1080p and 30 fps, so next time film in 1080p at 30 fps "
            "with HDR off: same result, much faster edits. iPhone: Settings > Camera > Record Video."
        )
        if heavy
        else ""
    )


try:
    _p = (
        subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=width,height,r_frame_rate",
                "-of",
                "csv=p=0",
                str(src),
            ],
            capture_output=True,
            text=True,
        )
        .stdout.strip()
        .split(",")
    )
    _n, _d = (_p[2].split("/") + ["1"])[:2]
    _tip = filming_tip(int(_p[0]), int(_p[1]), float(_n) / (float(_d) or 1), bool(SRC_COLOR.get("hdr")))
    if _tip:
        print(_tip)
except (ValueError, IndexError, ZeroDivisionError, OSError):
    pass
# a new cut makes the old background-softening and cutout obsolete
(reel / "master_sharp.mp4").unlink(missing_ok=True)
shutil.rmtree(reel / "cutout", ignore_errors=True)
speed = pacing(brand)["speed"]
w, h = brand.get("resolution", [1080, 1920])
if os.environ.get("REEL_PREVIEW"):
    w, h = 1080, 1920  # previews cut at 1080p: a quarter of the work
grade = brand.get("grade")
FADE = 0.012  # tiny audio fades at every join so cuts never click

vp, ap = [], []
# Added by By Mel Ross (0.5.0): edl.json "xfade" (seconds, e.g. 0.035) turns the dip-fade at each join into a true audio crossfade: each piece carries
# xfade extra seconds of the quiet that follows its cut and acrossfade overlaps them, so reel time stays frame-exact with the picture.
XF = float(edl.get("xfade", 0) or 0)
for k, (a, b) in enumerate(spans):
    vp.append(f"[0:v]trim=start={a}:end={b},setpts=PTS-STARTPTS[v{k}]")
    if XF:
        bb = b + XF if k < len(spans) - 1 else b
        ap.append(f"[1:a]atrim=start={a}:end={bb:.4f},asetpts=PTS-STARTPTS[a{k}]")
    else:
        ap.append(
            f"[1:a]atrim=start={a}:end={b},asetpts=PTS-STARTPTS,"
            f"afade=t=in:d={FADE},afade=t=out:st={max(b - a - FADE, 0):.3f}:d={FADE}[a{k}]"
        )
n = len(spans)
post = [f"setpts=PTS/{speed}", f"scale={w}:{h}:force_original_aspect_ratio=increase", f"crop={w}:{h}", "fps=30"]
if grade:
    if edl.get("grade_from") is not None:  # grade switches on at this reel second (a "before/after" moment)
        # shortcut: splits filters on commas, so a filter option containing a comma breaks; quote-aware split if one ever does
        grade = ",".join(
            f + (":" if "=" in f else "=") + f"enable='gte(t,{float(edl['grade_from']):.3f})'" for f in grade.split(",")
        )
    post.insert(1, grade)
try:
    PRE, POST, EINFO = enhance.filters(src, spans, brand, edl)  # studio look: before the scale, and after it
except Exception as e:  # a nicety: never lose the cut over it
    PRE, POST, EINFO = [], [], {"on": False, "error": str(e)}
    print(f"studio look skipped: {e}")
post[(2 if grade else 1) : (2 if grade else 1)] = PRE
post += POST
post.append(hdr2sdr.TAG_FILTER)  # label the frames BT.709 so the file carries the full set of tags
vcat = "".join(f"[v{k}]" for k in range(n)) + f"concat=n={n}:v=1:a=0," + ",".join(post) + "[vout]"
if XF and n > 1:
    chain, prev = [], "a0"
    for k in range(1, n):
        out = f"x{k}" if k < n - 1 else "xall"
        chain.append(f"[{prev}][a{k}]acrossfade=d={XF}:c1=tri:c2=tri[{out}]")
        prev = out
    acat = ";".join(chain) + f";[xall]atempo={speed}[aout]"
else:
    acat = "".join(f"[a{k}]" for k in range(n)) + f"concat=n={n}:v=0:a=1,atempo={speed}[aout]"

script = reel / "cut_filter.txt"
script.write_text(";".join(vp + ap) + ";" + vcat + ";" + acat)
kept = sum(b - a for a, b in spans)
print(f"{n} spans, {kept:.1f}s kept -> {kept / speed:.1f}s at {speed}x, {w}x{h}")
# Modified by By Mel Ross (0.10.1): the default was 60 s. Instagram stops recommending a reel to non-followers past 3 minutes,
# so that is the default line; "max_seconds" in brand.json sets a personal target. It is a note, never a reason to speed up or cut.
MAXS = brand.get("max_seconds", 180)
if kept / speed > MAXS:
    print(f"note: {kept / speed:.0f}s is past the {MAXS}s target - say so, and let them decide whether to cut")

# Modified by By Mel Ross: ffmpeg 7+ reads a filter script with "-/filter_complex" (the old -filter_complex_script
# is deprecated, then removed); REEL_NO_NICE=1 skips the low-priority wrapper, which some background runners refuse.
import re

_v = re.search(r"version n?(\d+)\.", subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True).stdout)
FILTER_FLAG = "-filter_complex_script" if _v and int(_v.group(1)) < 7 else "-/filter_complex"
NICE = [] if os.environ.get("REEL_NO_NICE") else ["nice", "-n", "15"]
subprocess.run(
    [
        *NICE,
        "ffmpeg",
        "-y",
        "-v",
        "error",
        "-stats",
        "-i",
        str(src),
        "-i",
        str(audio),
        FILTER_FLAG,
        str(script),
        "-map",
        "[vout]",
        "-map",
        "[aout]",
        *(
            (
                ["-c:v", "h264_videotoolbox", "-b:v", "12M"]
                if sys.platform == "darwin"
                else ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20"]
            )
            if draft.is_draft()
            else ["-c:v", "libx264", "-preset", "medium", "-crf", "16"]
        ),
        "-pix_fmt",
        "yuv420p",
        *hdr2sdr.TAG_BT709,
        # Modified by By Mel Ross (0.10.1): a keyframe every second. The render seeks into this file frame by frame, and HyperFrames warned of freezes at the 6 s gaps the encoders pick on their own.
        "-g",
        "30",
        "-c:a",
        "aac",
        "-b:a",
        "256k",
        "-movflags",
        "+faststart",
        str(reel / "master.mp4"),
    ],
    check=True,
)
ES = enhance.settings(brand, edl)
EINFO["source_colour"] = SRC_COLOR.get("note")
EINFO["background"] = "off"
if ES["on"] is not False and ES["background"] * ES["strength"] > 0:
    try:
        ok = cutout.soften(reel, ES["background"] * ES["strength"], "balanced" if draft.is_draft() else "accurate")
        EINFO["background"] = "softened" if ok else "skipped (no cutout available: needs macOS with the Swift compiler)"
    except Exception as e:  # the look is a nicety: never lose the cut over it
        EINFO["background"] = f"skipped ({e})"
json.dump(EINFO, open(reel / "enhance.json", "w"), indent=1)
print(
    "studio look:",
    "off" if ES["on"] is False else f"on, background {EINFO['background']}",
    "-> enhance_before_after.jpg" if ES["on"] is not False else "",
)
if ES["on"] is not False:
    try:
        enhance.compare(reel)
    except Exception as e:
        print(f"(before/after frame skipped: {e})")
print(reel / "master.mp4")
