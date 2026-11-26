#!/usr/bin/env python3
"""Every theme on the person's own clip, one still each (Added by By Mel Ross, 0.33.0).

The "See them on my clip" button next to the themes (home page and Touch-ups) runs this. For each theme it builds a
throw-away copy of the reel with a sample title and the captions on, and takes one still at the same moment, so the themes
can be compared side by side on the person's own face, top and room. The plain brand ("My brand as it is") comes first.

  - a reel that is already cut (master.mp4 + edit.json) is used as it is: its own captions, its cards left out;
  - a clip checked on the home page gets a throw-away copy of its first 12 seconds, sized for a reel, with a sample line as captions.
Nothing in the reel folder or the clip is changed. Everything goes under --out, which must be a new folder.

Usage: python3 theme_preview.py <reel-folder | clip> --out <new-folder> [--themes editorial,bold] [--at 2.5]
Prints "still: <theme> <path>" as each still is ready ("still: - <path>" for the plain brand), then "done" on the last line.
REEL_SNAPSHOT (tests) replaces the snapshot command: it is run as  <cmd> <proj> <seconds> <png>.
"""

import argparse, json, os, re, shutil, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import theme as _theme

VIDEO = (".mov", ".mp4", ".m4v", ".webm", ".mkv")
SAMPLE = "this is how your captions will look on your own video".split()

ap = argparse.ArgumentParser()
ap.add_argument("src")
ap.add_argument("--out", required=True)
ap.add_argument("--themes", default="")
ap.add_argument("--at", type=float, default=None)
a = ap.parse_args()
src, out = Path(a.src).expanduser().resolve(), Path(a.out).expanduser().resolve()
if out.exists() and any(out.iterdir()):
    sys.exit(f"{out} already has files")
out.mkdir(parents=True, exist_ok=True)

env = {**os.environ, "HYPERFRAMES_NO_TELEMETRY": "1", "DO_NOT_TRACK": "1"}
env.pop("GEMINI_API_KEY", None)  # snapshot would otherwise describe frames with an outside vision service
home = Path(env.get("REELS_HOME", "~/reels")).expanduser()
have = _theme.available(home)
names = [t for t in (x.strip() for x in a.themes.split(",")) if t in have] if a.themes else sorted(have)
if not names:
    sys.exit("no themes to show")

probe = lambda f: float(
    subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(f)],
        capture_output=True,
        text=True,
    ).stdout
    or 0
)

# ---- the clip: a cut reel as it is, or the first 12 s of a clip with a sample line -----------------------------------------
base = out / "base"
base.mkdir()
if src.is_dir() and (src / "master.mp4").exists() and (src / "edit.json").exists():
    master, dur = src / "master.mp4", probe(src / "master.mp4")
    caps = json.load(open(src / "edit.json")).get("captions", [])
else:
    clip = src if src.is_file() else next((p for p in sorted(src.glob("raw.*")) if p.suffix.lower() in VIDEO), None)
    if not clip or not clip.exists():
        sys.exit("no clip to show the themes on: check a clip first")
    dur = round(min(probe(clip), 12.0), 2)
    master = base / "master.mp4"
    r = subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-i",
            str(clip),
            "-t",
            str(dur),
            "-vf",
            "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "26",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-ac",
            "2",
            str(master),
        ],
        capture_output=True,
        text=True,
    )
    if r.returncode:
        sys.exit("could not read the clip: " + r.stderr[-300:])
    words = [{"text": SAMPLE[k % len(SAMPLE)], "t": round(0.3 + 0.35 * k, 2)} for k in range(int((dur - 0.6) / 0.35))]
    caps = [
        {
            "start": words[k]["t"],
            "end": round(words[k + 3]["t"] if k + 3 < len(words) else dur, 2),
            "words": words[k : k + 3],
        }
        for k in range(0, len(words), 3)
    ]
if dur < 1.5:
    sys.exit("the clip is too short to show the themes on")

# ---- the moment: a caption on screen, about a quarter of the way in --------------------------------------------------
t = a.at if a.at is not None else min(dur * 0.25, 4.0)
t = round(max(0.6, min(t, dur - 0.4)), 2)
cap = next((c for c in caps if c["start"] <= t < c["end"]), None) or min(
    caps, key=lambda c: abs(c["start"] - t), default=None
)
if cap:  # land just after the caption's first word, so every word in it is up
    t = round(min(max(t, cap["start"] + 0.35), cap["end"] - 0.05), 2)
    for w in cap["words"]:
        w["accent"] = False
    longest = max(cap["words"], key=lambda w: len(re.sub(r"\W", "", w["text"])))
    longest["accent"] = True  # so the highlight shows too
# the hook spot at the top, with its small line, so it sits clear of where any theme puts captions
title = {
    "type": "title",
    "text": "YOUR TITLE / LIVES HERE",
    "sub": "and a small line under it",
    "y": 150,
    "start": max(0.0, t - 0.8),
    "end": min(dur, t + 1.5),
    "quiet": False,
}


def edit_for(name):
    """The throw-away edit for one theme: captions one word at a time when the theme shows them that way."""
    mode = (_theme.load_brand(out / "brand", None, name or None, quiet=True).get("captions") or {}).get(
        "mode", "phrase"
    )
    cs = caps
    if mode == "word":
        cs = [
            {
                "start": w["t"],
                "end": round(c["words"][k + 1]["t"] if k + 1 < len(c["words"]) else c["end"], 2),
                "words": [w],
            }
            for c in caps
            for k, w in enumerate(c["words"])
        ]
    return {"captions": cs, "punch": [], "cards": [title]}


# first reel, no brand yet: the example brand
run_home = home
if not (home / "brand.json").exists():
    ex = HERE.parents[3] / "brand" / "brand.example.json"
    run_home = out / "home"
    run_home.mkdir()
    (run_home / "brand.json").write_text(
        ex.read_text() if ex.exists() else '{"colors": {"main": "#0d2b2d", "pop": "#B9C8A5", "light": "#f5f2ec"}}'
    )
    for d in ("themes", "fonts", "assets"):  # their own themes and fonts still count
        if (home / d).is_dir():
            os.symlink(home / d, run_home / d)
    print("note: You have no brand settings yet, so these stills use the example colors and fonts.", flush=True)
brand = json.load(open(run_home / "brand.json"))
brand.pop("theme", None)  # each still picks its own theme; "My brand as it is" means none
brand["sfx"] = "none"
(out / "brand").mkdir()
(out / "brand" / "brand.json").write_text(json.dumps(brand))
for d in ("themes", "fonts", "assets"):
    if (run_home / d).exists():
        os.symlink((run_home / d).resolve(), out / "brand" / d)


def snapshot(proj, png):
    cmd = os.environ.get("REEL_SNAPSHOT")
    if cmd:
        return (
            subprocess.run([cmd, str(proj), str(t), str(png)], capture_output=True, text=True, env=env).returncode == 0
        )
    shots = png.parent / (png.stem + "-shots")
    s = subprocess.run(
        [
            "npx",
            "-y",
            "hyperframes@0.8.145",
            "snapshot",
            str(proj),
            "--at",
            f"{t:g}",
            "--no-end",
            "--describe",
            "false",
            "-o",
            str(shots),
        ],
        capture_output=True,
        text=True,
        env=env,
    )
    frames = sorted(shots.glob("frame-*.png"))
    if s.returncode or not frames:
        return False
    shutil.move(str(frames[0]), png)
    shutil.rmtree(shots, ignore_errors=True)
    return True


made = 0
for name in [""] + names:
    tag = name or "-"
    work = out / "work" / (name or "brand")
    work.mkdir(parents=True)
    try:
        os.link(master, work / "master.mp4")
    except OSError:
        shutil.copy(master, work / "master.mp4")
    json.dump(edit_for(name), open(work / "edit.json", "w"))
    args = [sys.executable, str(HERE / "build_reel.py"), str(work)] + (["--theme", name] if name else [])
    b = subprocess.run(args, capture_output=True, text=True, env={**env, "REELS_HOME": str(out / "brand")})
    png = out / f"{name or 'brand'}.png"
    if b.returncode or not snapshot(work / "proj", png):
        print(f"note: the {name or 'plain brand'} still could not be made", flush=True)
        continue
    jpg = out / f"{name or 'brand'}.jpg"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", str(png), "-vf", "scale=540:-2", "-q:v", "4", str(jpg)],
        capture_output=True,
    )
    png.unlink(missing_ok=True)
    if jpg.exists():
        made += 1
        print(f"still: {tag} {jpg}", flush=True)
    shutil.rmtree(work, ignore_errors=True)
if not made:
    sys.exit("no stills could be made")
print("done", flush=True)
