#!/usr/bin/env python3
"""Show looks on the person's own clip, as stills (Added by By Mel Ross, 0.27.0).

The "Show me on my clip" button in the looks gallery runs this. It is storyboard.py with the setup done for you:
  - a reel that is already cut (master.mp4 + edit.json) is used as it is;
  - a reel that is not cut yet, or a clip checked on the home page, gets a throw-away copy of its first stretch, sized for a
    reel, with stand-in captions (from transcript.json when there is one, else a sample line), so the looks have something to sit on.
Nothing in the reel folder or the clip is changed. Everything goes under --out, which must be a new folder.

Usage: python3 look_preview.py <reel-folder | clip> --out <new-folder> --ids H3,C2,L8 [--theme bold] [--at L8=31.2,H3=0.5]
Prints the path of storyboard.jpg on the last line. REEL_STORYBOARD (tests) replaces storyboard.py.
"""
import argparse, json, os, re, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
VIDEO = (".mov", ".mp4", ".m4v", ".webm", ".mkv")
SAMPLE = "this is how your captions will look on your own video".split()

ap = argparse.ArgumentParser()
ap.add_argument("src"); ap.add_argument("--out", required=True); ap.add_argument("--ids", default=""); ap.add_argument("--theme", default="")
ap.add_argument("--at", default="")
a = ap.parse_args()
src, out = Path(a.src).expanduser().resolve(), Path(a.out).expanduser().resolve()
if out.exists() and any(out.iterdir()): sys.exit(f"{out} already has files")
ids = [i.strip().upper() for i in a.ids.split(",") if i.strip()]
if a.theme and not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,40}", a.theme): sys.exit("bad theme name")
if not ids and not a.theme: sys.exit("pick at least 1 look or a theme")
at = {}
for part in filter(None, a.at.split(",")):
    k, _, v = part.partition("=")
    try: at[k.strip().upper()] = max(0.0, float(v))
    except ValueError: sys.exit(f"bad --at {part!r}")

probe = lambda f: float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(f)], capture_output=True, text=True).stdout or 0)
out.mkdir(parents=True, exist_ok=True)
if src.is_dir() and (src / "master.mp4").exists() and (src / "edit.json").exists():
    reel, dur = src, probe(src / "master.mp4")
else:
    clip = src if src.is_file() else next((p for p in sorted(src.glob("raw.*")) if p.suffix.lower() in VIDEO), None)
    if not clip or not clip.exists(): sys.exit("no clip to show the looks on: check a clip first")
    full = probe(clip)
    dur = round(min(full, max(30.0, max(at.values(), default=0) + 6), 90.0), 2)          # the first stretch, long enough for the moments picked
    reel = out / "clip"; reel.mkdir()
    r = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(clip), "-t", str(dur), "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30",
                        "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ac", "2", str(reel / "master.mp4")], capture_output=True, text=True)
    if r.returncode: sys.exit("could not read the clip: " + r.stderr[-300:])
    words = []
    tj = src / "transcript.json" if src.is_dir() else None
    if tj and tj.exists():
        words = [{"text": w["text"].strip(), "t": round(w["start"], 2)} for w in json.load(open(tj)) if w["text"].strip() and w["start"] < dur - 0.3]
    if not words:                                                     # no transcript yet: a sample line, 1 word every 0.35 s, repeated
        words = [{"text": SAMPLE[k % len(SAMPLE)], "t": round(0.3 + 0.35 * k, 2)} for k in range(int((dur - 0.6) / 0.35))]
    caps, cur = [], []
    for w in words:                                                   # 3 words a caption, or fewer at a sentence end
        cur.append({"text": re.sub(r"[.,!?;:]+$", "", w["text"]), "t": w["t"], "accent": False})
        if len(cur) == 3 or re.search(r"[.?!]$", w["text"]): caps.append(cur); cur = []
    if cur: caps.append(cur)
    edit = {"captions": [{"start": c[0]["t"], "end": round(min((caps[k + 1][0]["t"] if k + 1 < len(caps) else c[-1]["t"] + 0.8), dur), 2), "words": c}
                         for k, c in enumerate(caps)], "punch": [], "cards": []}
    json.dump(edit, open(reel / "edit.json", "w"), indent=1)

# moments: each pinned look's time, then the usual spread, 2 to 4 in all
moments = sorted({round(min(t, dur - 0.3), 2) for t in at.values()})
first = round(dur * .08, 2)                                           # a hook always goes on the earliest moment: keep one near the start, before any pinned look
if all(m - first > 1 for m in moments): moments.insert(0, first)
for f in (.12, .45, .78):
    if len(moments) >= 4: break
    m = round(dur * f, 2)
    if all(abs(m - x) > 2 for x in moments): moments.append(m)
moments = sorted(moments)[:4]
if len(moments) < 2: moments = sorted({moments[0] if moments else 0.5, round(dur * 0.6, 2)})
content = {"at": {k: min(moments, key=lambda m: abs(m - v)) for k, v in at.items() if k in ids}}
json.dump(content, open(out / "content.json", "w"))
opt = "A=" + ",".join(ids + ([f"theme:{a.theme}"] if a.theme else []))
cmd = os.environ.get("REEL_STORYBOARD") or str(HERE / "storyboard.py")
env = dict(os.environ)
home = Path(env.get("REELS_HOME", "~/reels")).expanduser()
if not (home / "brand.json").exists():                                # first reel, no brand yet: show the looks with the example brand
    ex = HERE.parents[3] / "brand" / "brand.example.json"
    (out / "home").mkdir(exist_ok=True); (out / "home" / "brand.json").write_text(ex.read_text() if ex.exists() else '{"colors": {"main": "#0d2b2d", "pop": "#B9C8A5", "light": "#f5f2ec"}}')
    env["REELS_HOME"] = str(out / "home"); print("note: You have no brand settings yet, so these stills use the example colors and fonts.")
r = subprocess.run([sys.executable, cmd, str(reel), "--out", str(out / "board"), "--option", opt, "--at", ",".join(f"{m:g}" for m in moments),
                    "--content", str(out / "content.json")], capture_output=True, text=True, env=env)
print(r.stdout.strip())
if r.returncode: sys.exit("storyboard failed: " + (r.stderr or r.stdout)[-800:])
img = out / "board" / "storyboard.jpg"
if not img.exists(): sys.exit("storyboard made no picture")
print(img)
