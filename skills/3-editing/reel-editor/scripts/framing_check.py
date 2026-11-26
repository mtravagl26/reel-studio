#!/usr/bin/env python3
"""Added by By Mel Ross (0.12.0). Check a clip BEFORE editing: is it filmed in a way the editor can make a good reel from?

Usage: python3 framing_check.py <clip> [--json] [--frame out.jpg]

Seven checks. Each ends as  pass | note | retake | skipped :
  upright     taller than wide; notes 4K, more than 30 fps, HDR (heavier than a 1080p reel needs)
  length      long enough to edit; a note past the brand's "max_seconds" target
  movement    the camera holds still (a guess from how much the edges of the picture change)
  light       the face is neither too dark nor blown out
  headroom    room above the head for a title
  safe        the face is clear of the parts Instagram covers with its buttons and caption
  whole       the head is not cut off or pushed to an edge, and is a sensible size

The last three need to know where the head is. On a Mac that comes from Apple Vision (the same tool the cutout uses).
Elsewhere OpenCV's face finder is used if it is installed (pip install opencv-python-headless). With neither, those three
are "skipped" and said so: never guessed. Verdict: "retake" if any check says retake, else "good".

Thresholds are fractions of the frame, in ZONES below. The Instagram cover areas are approximate; Instagram moves them.
Everything runs on this computer. Exit code is 0 unless the clip cannot be read."""

import json, os, subprocess, sys, tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

# what Instagram's own interface covers
ZONES = {
    "ig_top": 220 / 1920,
    "ig_bottom": 420 / 1920,
    "ig_right": 150 / 1080,
    # top of head, from the top of the frame
    "headroom_good": 0.22,
    "headroom_min": 0.14,
    # head width as a share of frame width
    "head_small": 0.17,
    "head_big": 0.62,
}


def _probe(clip):
    r = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height,r_frame_rate,avg_frame_rate,codec_name,color_transfer,color_primaries:stream_side_data=rotation:format=duration",
            "-of",
            "json",
            str(clip),
        ],
        capture_output=True,
        text=True,
    )
    d = json.loads(r.stdout or "{}")
    st = (d.get("streams") or [{}])[0]
    if not st.get("width"):
        raise SystemExit(f"can't read a video in {clip}")
    w, h = int(st["width"]), int(st["height"])
    rot = next((abs(int(float(s["rotation"]))) for s in st.get("side_data_list") or [] if "rotation" in s), 0)
    if rot in (90, 270):
        w, h = h, w
    n, _, dn = str(st.get("r_frame_rate", "30/1")).partition("/")
    # Added by By Mel Ross (0.38.5): what the format check needs: frame rate kept steady or not, the codec, a sound track,
    # and whether the phone was turned (the picture is shown upright either way)
    an, _, ad = str(st.get("avg_frame_rate", "0/1")).partition("/")
    try:
        avg = float(an or 0) / (float(ad or 1) or 1)
    except ValueError:
        avg = 0.0
    aud = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "a",
            "-show_entries",
            "stream=codec_type",
            "-of",
            "csv=p=0",
            str(clip),
        ],
        capture_output=True,
        text=True,
    ).stdout.strip()
    return {
        "w": w,
        "h": h,
        "fps": float(n) / (float(dn or 1) or 1),
        "dur": float((d.get("format") or {}).get("duration") or 0),
        "hdr": st.get("color_transfer") in ("arib-std-b67", "smpte2084") or st.get("color_primaries") == "bt2020",
        "avg_fps": avg,
        "codec": st.get("codec_name") or "",
        "audio": bool(aud),
        "rotation": rot,
    }


def _gray(clip, t0, secs, fps, w, h):
    """Small gray frames as a list of bytes objects."""
    raw = subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-ss",
            f"{t0:.2f}",
            "-t",
            f"{secs:.2f}",
            "-i",
            str(clip),
            "-vf",
            f"fps={fps},scale={w}:{h}:flags=area,format=gray",
            "-f",
            "rawvideo",
            "-",
        ],
        capture_output=True,
    ).stdout
    return [raw[i : i + w * h] for i in range(0, len(raw) - w * h + 1, w * h)]


def _head_from_matte(clip, p, t0, secs, own_matte=None):
    import cutout

    with tempfile.TemporaryDirectory() as tmp:
        sample = Path(tmp) / "sample.mp4"
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-y",
                "-ss",
                f"{t0:.2f}",
                "-t",
                f"{secs:.2f}",
                "-i",
                str(clip),
                "-an",
                "-vf",
                "fps=10,scale=540:960:force_original_aspect_ratio=increase,crop=540:960",
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-pix_fmt",
                "yuv420p",
                str(sample),
            ],
            check=True,
        )
        if not cutout.build_matte(tmp, str(sample), "fast", own_matte=own_matte, fps=10):
            return None
        b = cutout.head_box(tmp, 0, secs, 1000, 1000)
    return (
        {
            "cx": b["cx"] / 1000,
            "top": b["top"] / 1000,
            "w": b["w"] / 1000,
            "h": b["h"] / 1000 * 9 / 16,
            "how": "the outline of the person",
        }
        if b
        else None
    )


def _head_from_faces(clip, p, t0, secs):
    try:
        import cv2, numpy as np
    except ImportError:
        return None
    xml = Path(getattr(getattr(cv2, "data", None), "haarcascades", "")) / "haarcascade_frontalface_default.xml"
    # some OpenCV builds ship without the face finder's data file
    if not xml.is_file():
        return None
    det = cv2.CascadeClassifier(str(xml))
    if det.empty():
        return None
    w, h = 360, 640
    found = []
    for fr in _gray(clip, t0, secs, 2, w, h)[:8]:
        img = np.frombuffer(fr, dtype=np.uint8).reshape(h, w)
        faces = det.detectMultiScale(img, 1.1, 6, minSize=(40, 40))
        if len(faces):
            x, y, fw, fh = max(faces, key=lambda f: f[2] * f[3])
            # a face box runs brow to chin: the head (with hair) starts about a third of a face higher and is a little wider
            found.append(((x + fw / 2) / w, max(0.0, (y - 0.33 * fh) / h), fw * 1.15 / w, fh * 1.4 / h))
    if not found:
        return None
    found.sort(key=lambda f: f[1])
    cx, top, hw, hh = found[len(found) // 2]
    return {"cx": cx, "top": top, "w": hw, "h": hh, "how": "face finding"}


def find_head(clip, p, t0, secs):
    """{"cx","top","w","h"} as fractions of the frame (h of the frame's height), plus "how". None when no tool can tell."""
    # tests: a ready-made matte, like cutout.py's --matte
    own = os.environ.get("REEL_FRAMING_MATTE")
    try:
        if own or sys.platform == "darwin":
            b = _head_from_matte(clip, p, t0, secs, own)
            if b:
                return b
    # the Mac tool missing or failing must not sink the check
    except Exception as e:
        print(f"note: could not outline the person ({e}); trying face finding", file=sys.stderr)
    if os.environ.get("REEL_FRAMING_NO_FACES"):
        return None
    return _head_from_faces(clip, p, t0, secs)


def check(clip, max_seconds=180, frame_out=None):
    clip = Path(clip).expanduser()
    p = _probe(clip)
    out = []

    def add(i, label, state, detail, fix=""):
        out.append({"id": i, "label": label, "state": state, "detail": detail, "fix": fix})

    t0 = min(max(p["dur"] * 0.25, 0.0), max(p["dur"] - 4, 0))
    secs = min(4.0, max(p["dur"], 0.5))

    # 1. upright
    heavy = [
        x
        for x in (
            "4K" if min(p["w"], p["h"]) > 1100 else "",
            f"{p['fps']:.0f} frames a second" if p["fps"] > 31 else "",
            "HDR" if p["hdr"] else "",
        )
        if x
    ]
    if p["w"] >= p["h"]:
        add(
            "upright",
            "Upright, frame rate",
            "retake",
            f"The clip is sideways or square ({p['w']} x {p['h']}).",
            "Hold the phone upright and film again.",
        )
    elif heavy:
        add(
            "upright",
            "Upright, frame rate",
            "note",
            f"Upright. It is {', '.join(heavy)}, which is more than a reel needs.",
            "It will work. Next time film in 1080p at 30 frames a second with HDR off: same result, faster edits.",
        )
    else:
        add(
            "upright", "Upright, frame rate", "pass", f"Upright, {p['w']} x {p['h']} at {p['fps']:.0f} frames a second."
        )
    # 2. length
    if p["dur"] < 3:
        add("length", "Length", "retake", f"Only {p['dur']:.1f} seconds.", "Film at least a few sentences.")
    elif p["dur"] > max_seconds:
        add(
            "length",
            "Length",
            "note",
            f"{p['dur']:.0f} seconds, past your {max_seconds}-second target.",
            "Fine to edit. The cut will likely need to lose some lines.",
        )
    else:
        add("length", "Length", "pass", f"{p['dur']:.0f} seconds.")
    # Added by By Mel Ross (0.38.5): 2b. the format, and what the edit does about it, said before the edit starts
    fmt_notes, fmt_bad = [], None
    if not p["audio"]:
        fmt_bad = "There's no sound in this clip. Captions and cuts come from your voice, so the edit can't run."
    if p["hdr"]:
        fmt_notes.append(
            "HDR color: it's converted to standard color when the cut is made"
            + (
                " (macOS does this, a short extra step)."
                if sys.platform == "darwin"
                else ". This needs a Mac; elsewhere the color is close but not exact."
            )
        )
    if p["avg_fps"] and abs(p["avg_fps"] - p["fps"]) / max(p["fps"], 1) > 0.02:
        fmt_notes.append(
            f"The frame rate changes during the clip (about {p['avg_fps']:.1f} on average; phones do this in low light). "
            "The cut evens it to 30 frames a second, so sound and picture stay together."
        )
    if p["codec"] and p["codec"] not in ("h264", "hevc", "prores", "mpeg4", "vp9", "av1"):
        fmt_notes.append(f"An unusual video format ({p['codec']}). The cut converts it.")
    if p["rotation"]:
        fmt_notes.append("Filmed with the phone turned. It's shown upright.")
    if fmt_bad:
        add("format", "Format", "retake", fmt_bad, "Film again with the phone's own camera app, sound on.")
    elif fmt_notes:
        add("format", "Format", "note", " ".join(fmt_notes))
    else:
        add(
            "format",
            "Format",
            "pass",
            f"{(p['codec'] or 'video').upper()}, steady frame rate, standard color, with sound.",
        )
    # 3. movement: how much the outer edges of the picture change between frames (the middle is the person talking)
    w, h = 54, 96
    fr = _gray(clip, t0, min(8.0, p["dur"]), 5, w, h)
    move = None
    if len(fr) >= 3:
        edge = [i for i in range(w * h) if (i % w) < 8 or (i % w) >= w - 8 or (i // w) < 10]
        diffs = sorted(sum(abs(a[i] - b[i]) for i in edge) / len(edge) for a, b in zip(fr, fr[1:]))
        move = diffs[len(diffs) // 2]
    if move is None:
        add("movement", "Movement", "skipped", "Too short to tell.")
    elif move > 9:
        add(
            "movement",
            "Movement",
            "note",
            "The camera looks like it is moving.",
            "Prop the phone on something solid. Graphics behind you need a still background.",
        )
    else:
        add("movement", "Movement", "pass", "The camera is steady.")
    # 4-7 need the head
    head = find_head(clip, p, t0, secs)
    # 4. light: the face if we know where it is, else the middle of the frame
    lw, lh = 90, 160
    lf = _gray(clip, t0, 1.0, 2, lw, lh)
    if lf:
        if head:
            x0, x1, y0, y1 = (
                max(0, int((head["cx"] - head["w"] / 2) * lw)),
                min(lw, int((head["cx"] + head["w"] / 2) * lw) + 1),
                max(0, int((head["top"] + head["h"] * 0.3) * lh)),
                min(lh, int((head["top"] + head["h"]) * lh) + 1),
            )
        else:
            x0, x1, y0, y1 = lw // 4, 3 * lw // 4, lh // 5, 3 * lh // 5
        px = [lf[0][y * lw + x] for y in range(y0, y1) for x in range(x0, x1)] or [128]
        luma = sum(px) / len(px)
        hot = sum(1 for v in px if v > 245) / len(px)
        where = "Your face" if head else "The middle of the picture"
        if luma < 50:
            add(
                "light",
                "Light",
                "retake",
                f"{where} is too dark.",
                "Face a window or a lamp. Light should be in front of you, never behind.",
            )
        elif luma < 80:
            add(
                "light",
                "Light",
                "note",
                f"{where} is a little dark.",
                "More light on your face will look sharper. Face a window.",
            )
        elif hot > 0.25 or luma > 215:
            add(
                "light",
                "Light",
                "note",
                f"{where} is very bright, with detail lost.",
                "Step back from the light, or turn so it hits you from the side.",
            )
        else:
            add("light", "Light", "pass", f"{where} is well lit.")
    else:
        add("light", "Light", "skipped", "Couldn't read a frame.")
    Z = ZONES
    if not head:
        why = "This needs the Mac's vision tool or OpenCV, and neither is available here. Check by eye: leave about a quarter of the frame empty above your head."
        for i, label in (("headroom", "Space above your head"), ("safe", "Safe zones"), ("whole", "Not cut off")):
            add(i, label, "skipped", why)
    else:
        top, left, right, bottom = (
            head["top"],
            head["cx"] - head["w"] / 2,
            head["cx"] + head["w"] / 2,
            head["top"] + head["h"],
        )
        # 5. headroom
        if top < Z["headroom_min"]:
            add(
                "headroom",
                "Space above your head",
                "retake",
                f"Your head starts {top:.0%} down the frame. A title has nowhere to go.",
                "Step back or tilt the phone up so about a quarter of the frame is empty above your head.",
            )
        elif top < Z["headroom_good"]:
            add(
                "headroom",
                "Space above your head",
                "note",
                f"Tight: your head starts {top:.0%} down the frame.",
                "Small titles fit. For big titles and cards, leave about a quarter of the frame empty above your head.",
            )
        else:
            add(
                "headroom",
                "Space above your head",
                "pass",
                f"Room for a title: your head starts {top:.0%} down the frame.",
            )
        # 6. safe zones
        bad = [
            x
            for x in (
                "the bottom, where the caption and buttons sit" if bottom > 1 - Z["ig_bottom"] else "",
                "the right edge, where the like and share buttons sit" if right > 1 - Z["ig_right"] + 0.04 else "",
                "the very top, under Instagram's header" if top < Z["ig_top"] * 0.5 else "",
            )
            if x
        ]
        if bad:
            add(
                "safe",
                "Safe zones",
                "retake",
                "Your face reaches " + " and ".join(bad) + ".",
                "Move toward the middle of the frame, with your face in the upper middle.",
            )
        else:
            add("safe", "Safe zones", "pass", "Your face is clear of Instagram's buttons and caption.")
        # 7. whole and a sensible size
        if left < 0.01 or right > 0.99 or top < 0.005:
            add(
                "whole",
                "Not cut off",
                "retake",
                "Your head is cut off by the edge of the frame.",
                "Move so your whole head and shoulders are inside the picture.",
            )
        elif head["w"] > Z["head_big"]:
            add(
                "whole",
                "Not cut off",
                "retake",
                "You are very close to the camera.",
                "Step back until your head and shoulders fit with room to spare.",
            )
        elif head["w"] < Z["head_small"]:
            add(
                "whole",
                "Not cut off",
                "note",
                "You are far from the camera.",
                "Step closer. Your head should be about a third of the frame's width.",
            )
        elif not 0.3 <= head["cx"] <= 0.7:
            add(
                "whole",
                "Not cut off",
                "note",
                "You are off to one side.",
                "Stand in the middle unless you want the empty side for graphics.",
            )
        else:
            add("whole", "Not cut off", "pass", "Head and shoulders are in the picture and a good size.")
    if frame_out:
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-y",
                "-ss",
                f"{t0 + secs / 2:.2f}",
                "-i",
                str(clip),
                "-frames:v",
                "1",
                "-vf",
                "scale=540:960:force_original_aspect_ratio=decrease",
                "-q:v",
                "4",
                str(frame_out),
            ]
        )
    retakes = [c for c in out if c["state"] == "retake"]
    return {
        "verdict": "retake" if retakes else "good",
        "headline": (
            retakes[0]["detail"]
            if retakes
            else (
                "Nothing wrong found, but the head checks could not run here. Check the space above your head by eye."
                if any(c["state"] == "skipped" and c["id"] in ("headroom", "safe", "whole") for c in out)
                else "Good to edit, with a few notes." if any(c["state"] == "note" for c in out) else "Good to edit."
            )
        ),
        "checks": out,
        "head": head,
        "zones": Z,
        "clip": {"name": clip.name, **{k: p[k] for k in ("w", "h", "dur")}, "fps": round(p["fps"], 2)},
    }


if __name__ == "__main__":
    a = [x for x in sys.argv[1:] if not x.startswith("--")]
    if not a:
        sys.exit(__doc__)
    frame = sys.argv[sys.argv.index("--frame") + 1] if "--frame" in sys.argv[:-1] else None
    if frame:
        a = [x for x in a if x != frame]
    try:
        ms = json.load(open(Path(os.environ.get("REELS_HOME", "~/reels")).expanduser() / "brand.json")).get(
            "max_seconds", 180
        )
    except (OSError, ValueError):
        ms = 180
    res = check(a[0], ms, frame)
    if "--json" in sys.argv:
        print(json.dumps(res))
    else:
        mark = {"pass": "ok     ", "note": "note   ", "retake": "RETAKE ", "skipped": "skipped"}
        for c in res["checks"]:
            print(f"{mark[c['state']]} {c['label']}: {c['detail']}" + (f"  -> {c['fix']}" if c["fix"] else ""))
        print(("RETAKE: " if res["verdict"] == "retake" else "GOOD: ") + res["headline"])
