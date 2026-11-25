"""Added by By Mel Ross (0.30.0, moved out of build_reel.py): pictures, GIFs, SVGs and video clips copied into a reel's
project folder for build_reel.py, with a cache of converted copies in <reel>/.asset-cache.

build_reel.py calls setup() once it knows the reel, project and home folders, then imports these functions."""

import json, os, re, shutil, subprocess
from pathlib import Path

reel = proj = HOME = ASSET_CACHE = None


def setup(reel_dir, proj_dir, home_dir, asset_cache):
    global reel, proj, HOME, ASSET_CACHE
    reel, proj, HOME, ASSET_CACHE = reel_dir, proj_dir, home_dir, asset_cache


def dur_of(p):
    return float(
        subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
            capture_output=True,
            text=True,
            check=True,
        ).stdout
    )


def _cached(cand, ext, *key):
    """(cache file, True if it is already there) for a converted copy of `cand` made with these settings."""
    import hashlib

    st = cand.stat()
    h = hashlib.sha1(json.dumps([str(cand), st.st_mtime_ns, st.st_size, *key]).encode()).hexdigest()[:20]
    f = ASSET_CACHE / f"{h}{ext}"
    return f, f.exists() and f.stat().st_size > 0


def _keep(dst, cache):
    try:
        ASSET_CACHE.mkdir(exist_ok=True)
        shutil.copyfile(dst, cache)
        old = sorted(ASSET_CACHE.iterdir(), key=lambda x: x.stat().st_mtime)
        for x in old[:-80]:
            x.unlink()  # keep the 80 newest
    except OSError:
        pass


def img(src):
    """Copy an image into the project and return its path there. Looks in the reel folder, ~/reels/assets/, then as given."""
    for cand in (reel / src, HOME / "assets" / src, Path(src).expanduser()):
        if cand.exists():
            # Added by By Mel Ross (0.15.0): an SVG is copied as it is, so it stays sharp at any size
            if cand.suffix.lower() == ".svg":
                dst = proj / "img" / f"{len(list((proj / 'img').iterdir()))}_{cand.stem}.svg"
                shutil.copyfile(cand, dst)
                return f"img/{dst.name}"
            dst = proj / "img" / f"{len(list((proj / 'img').iterdir()))}_{cand.stem}.png"
            subprocess.run(
                ["ffmpeg", "-v", "error", "-y", "-i", str(cand), "-vf", "scale='min(1280,iw)':-2", str(dst)], check=True
            )
            return f"img/{dst.name}"
    print(f"warning: image not found: {src}")
    return ""


def numf(v, dflt):
    """A number from edit.json, or the default when it is missing, null or not a number (audit 3: 'from': null crashed the build)."""
    try:
        return float(v) if v is not None and not isinstance(v, bool) else float(dflt)
    except (TypeError, ValueError):
        return float(dflt)


def svg_size(path):
    """Width and height of an SVG in pixels, from its width/height or its viewBox. None when the file is not an SVG."""
    try:
        text = re.sub(r"<!--.*?-->", "", Path(path).read_text(errors="replace"), flags=re.S)
    except OSError:
        return None
    m = re.search(r"<svg\b[^>]*>", text, re.I)
    if not m:
        return None

    def at(n):
        k = re.search(rf"""\s{n}\s*=\s*["']([^"']*)["']""", m.group(0), re.I)
        return k.group(1) if k else ""

    def px(v):
        k = re.match(r"^\s*([\d.]+)\s*(px)?\s*$", v or "", re.I)
        try:
            return float(k.group(1)) if k else 0.0
        except ValueError:
            return 0.0

    w, h = px(at("width")), px(at("height"))
    try:
        vb = [float(x) for x in re.split(r"[\s,]+", at("viewBox").strip())]
    except ValueError:
        vb = []
    if len(vb) == 4 and vb[2] > 0 and vb[3] > 0:
        if not w and not h:
            w, h = vb[2], vb[3]
        elif not w:
            w = h * vb[2] / vb[3]
        elif not h:
            h = w * vb[3] / vb[2]
    if w <= 0 or h <= 0:
        w = h = 512.0
    return max(int(round(w)), 1), max(int(round(h)), 1)


# Added by By Mel Ross (0.13.0): a popup can be a video clip (a screen recording, b-roll)
VIDEO_EXT = (".mp4", ".mov", ".m4v", ".webm")


def popup_asset(src, secs, start=0.0, loop=False):
    """Added by By Mel Ross (editor page). Copy a popup picture into the project: returns (kind, project path, width, height).
    Pictures become PNG like img(). An animated GIF becomes a looped transparent video (VP9 with alpha, 30 fps, long enough for
    `secs`) because the render draws the page frame by frame and a plain <img> GIF would sit on its first frame."""
    for cand in (reel / src, HOME / "assets" / src, Path(src).expanduser()):
        if cand.exists():
            break
    else:
        print(f"warning: popup file not found: {src}")
        return None
    n = len(list((proj / "img").iterdir()))
    if cand.suffix.lower() == ".svg":  # 0.15.0: ffprobe can't always read an SVG; its size comes from the file
        wh = svg_size(cand)
        if not wh:
            print(f"warning: popup {src} is not an SVG picture: skipped")
            return None
        return "img", img(src), wh[0], wh[1]
    _chk = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-of",
            "csv=p=0",
            str(cand),
        ],
        capture_output=True,
        text=True,
    )
    try:
        _cw, _ch = [int(x) for x in _chk.stdout.strip().split(",")[:2]]
    except ValueError:
        _cw = _ch = 0
    # a damaged file (ffprobe reports 0x0); looping one would make ffmpeg spin forever, so look first
    if _chk.returncode != 0 or _cw <= 0 or _ch <= 0:
        print(f"warning: popup {src} is not a picture or video this machine can read: skipped")
        return None
    if cand.suffix.lower() in VIDEO_EXT:
        # Added by By Mel Ross (0.13.0). A video clip: cut to the part that shows (from `start`, for `secs`), 30 fps, no sound, a keyframe
        # every half second so the render can seek it frame by frame. A clip shorter than its time on screen holds its last frame,
        # or starts again with "loop": true. Phone clips filmed sideways are turned upright (ffmpeg reads the rotation flag).
        dst = proj / "img" / f"{n}_{cand.stem}.mp4"
        _cf, _hit = _cached(cand, ".mp4", "clip", round(float(secs), 2), numf(start, 0), bool(loop))
        if _hit:
            shutil.copyfile(_cf, dst)
            wh = (
                subprocess.run(
                    [
                        "ffprobe",
                        "-v",
                        "error",
                        "-select_streams",
                        "v:0",
                        "-show_entries",
                        "stream=width,height",
                        "-of",
                        "csv=p=0",
                        str(dst),
                    ],
                    capture_output=True,
                    text=True,
                )
                .stdout.strip()
                .split(",")
            )
            if len(wh) >= 2 and wh[0].isdigit() and wh[1].isdigit():
                return "clip", f"img/{dst.name}", int(wh[0]), int(wh[1])
        # audit 3: a start point past the end of the clip made an empty file and crashed the build; start inside the clip instead
        try:
            clip_len = float(
                subprocess.run(
                    ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(cand)],
                    capture_output=True,
                    text=True,
                ).stdout.strip()
                or 0
            )
        except ValueError:
            clip_len = 0.0
        start = numf(start, 0)
        if clip_len and start > clip_len - 0.5:
            print(
                f"note: video clip {src} is {clip_len:.1f}s long, so it can't start {start:.1f}s in: starting it at 0"
            )
            start = 0.0
        try:
            r = subprocess.run(
                [
                    "ffmpeg",
                    "-v",
                    "error",
                    "-y",
                    *(["-stream_loop", "-1"] if loop else []),
                    "-ss",
                    f"{max(float(start), 0):.2f}",
                    "-i",
                    str(cand),
                    "-t",
                    f"{secs + 0.5:.2f}",
                    "-vf",
                    f"fps=30,scale='min(720,iw)':-2:flags=lanczos,tpad=stop_mode=clone:stop_duration={secs + 1:.2f},format=yuv420p",
                    "-t",
                    f"{secs + 0.5:.2f}",
                    "-c:v",
                    "libx264",
                    "-preset",
                    "veryfast",
                    "-crf",
                    "20",
                    "-g",
                    "15",
                    "-an",
                    "-movflags",
                    "+faststart",
                    str(dst),
                ],
                capture_output=True,
                text=True,
                timeout=300,
            )
        except subprocess.TimeoutExpired:
            r = subprocess.CompletedProcess([], 1, "", "took too long")
        if r.returncode != 0 or not dst.exists():
            print(f"warning: video clip {src} could not be prepared ({r.stderr.strip()[:200]}): left out")
            return None
        wh = (
            subprocess.run(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-select_streams",
                    "v:0",
                    "-show_entries",
                    "stream=width,height",
                    "-of",
                    "csv=p=0",
                    str(dst),
                ],
                capture_output=True,
                text=True,
            )
            .stdout.strip()
            .split(",")
        )
        if len(wh) < 2 or not wh[0].isdigit() or not wh[1].isdigit():
            print(f"warning: video clip {src} has no picture in it: left out")
            return None
        _keep(dst, _cf)
        return "clip", f"img/{dst.name}", int(wh[0]), int(wh[1])
    if cand.suffix.lower() == ".gif":
        dst = proj / "img" / f"{n}_{cand.stem}.webm"
        _cf, _hit = _cached(cand, ".webm", "gif", round(float(secs), 2))
        if _hit:
            shutil.copyfile(_cf, dst)
            wh = (
                subprocess.run(
                    [
                        "ffprobe",
                        "-v",
                        "error",
                        "-select_streams",
                        "v:0",
                        "-show_entries",
                        "stream=width,height",
                        "-of",
                        "csv=p=0",
                        str(dst),
                    ],
                    capture_output=True,
                    text=True,
                )
                .stdout.strip()
                .split(",")
            )
            if len(wh) >= 2 and wh[0].isdigit() and wh[1].isdigit():
                return "video", f"img/{dst.name}", int(wh[0]), int(wh[1])
        # looping: the loop filter repeats the first N decoded frames (N = the GIF's frame count, at most 900), which cycles at the GIF's own
        # speed. ffmpeg's -stream_loop is not used: on a GIF whose container has no duration it never advances time and runs forever.
        try:
            nf = (
                subprocess.run(
                    [
                        "ffprobe",
                        "-v",
                        "error",
                        "-count_frames",
                        "-select_streams",
                        "v:0",
                        "-show_entries",
                        "stream=nb_read_frames",
                        "-of",
                        "csv=p=0",
                        str(cand),
                    ],
                    capture_output=True,
                    text=True,
                    timeout=60,
                )
                .stdout.strip()
                .split(",")[0]
            )
            nf = min(max(int(nf), 1), 900)
            r = subprocess.run(
                [
                    "ffmpeg",
                    "-v",
                    "error",
                    "-y",
                    "-i",
                    str(cand),
                    "-t",
                    f"{secs + 0.5:.2f}",
                    "-vf",
                    f"scale='min(720,iw)':-2:flags=lanczos,format=yuva420p,loop=loop=-1:size={nf}:start=0,fps=30",
                    "-c:v",
                    "libvpx-vp9",
                    "-pix_fmt",
                    "yuva420p",
                    "-b:v",
                    "0",
                    "-crf",
                    "30",
                    "-auto-alt-ref",
                    "0",
                    "-an",
                    str(dst),
                ],
                capture_output=True,
                text=True,
                timeout=120,
            )
        except (subprocess.TimeoutExpired, ValueError):  # a damaged GIF: give up rather than hang the render
            r = subprocess.CompletedProcess([], 1, "", "timed out or unreadable")
        if r.returncode != 0:
            print(f"warning: GIF {src} could not be converted ({r.stderr.strip()[:200]}): drawn as a still picture")
        else:
            wh = (
                subprocess.run(
                    [
                        "ffprobe",
                        "-v",
                        "error",
                        "-select_streams",
                        "v:0",
                        "-show_entries",
                        "stream=width,height",
                        "-of",
                        "csv=p=0",
                        str(dst),
                    ],
                    capture_output=True,
                    text=True,
                )
                .stdout.strip()
                .split(",")
            )
            _keep(dst, _cf)
            return "video", f"img/{dst.name}", int(wh[0]), int(wh[1])
    try:
        path = img(src)
        if not path:
            return None
        wh = (
            subprocess.run(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-select_streams",
                    "v:0",
                    "-show_entries",
                    "stream=width,height",
                    "-of",
                    "csv=p=0",
                    str(proj / path),
                ],
                capture_output=True,
                text=True,
                check=True,
            )
            .stdout.strip()
            .split(",")
        )
        return "img", path, int(wh[0]), int(wh[1])
    except (subprocess.CalledProcessError, ValueError, IndexError):
        print(f"warning: popup {src} is not a picture or video this machine can read: skipped")
        return None
