#!/usr/bin/env python3
"""Added by By Mel Ross. Studio look for talking-head footage: gentle, natural, on by default.

What it does (all in ffmpeg, all local):
  exposure   nudges the picture toward a comfortable middle brightness (only as far as the clip needs, never more than a small step)
  colour     a touch of contrast and saturation, a hint of warmth; no hue shifts, so skin tones stay skin tones
  denoise    mild temporal/spatial denoise (hqdn3d) for phone grain
  sharpen    mild sharpening of brightness only (no colour fringes)
  background a slight blur behind the speaker (cutout.py soften), the speaker stays sharp; skipped when there's no cutout
It does NOT smooth skin: no plastic look.

brand.json "enhance" (all optional; each amount is a multiplier, 1 = the default, 0 = off, 2 = twice as much):
  {"on": true, "strength": 1.0, "color": 0.0, "exposure": 0.0, "denoise": 1.0, "sharpen": 1.0, "background": 0.0, "warmth": 0.0}   (defaults shown: colour, exposure, warmth and background blur are OFF; set any to 1 to turn it on)
A reel can override these in edl.json under "enhance". "on": false turns the whole thing off.

  python3 enhance.py <reel> compare [--at <seconds-into-the-cut>]   writes <reel>/enhance_before_after.jpg (before | after) to review
cut.py calls filters() while it cuts, so the look is applied in the same encode as the cut (no extra generation of video loss).
"""
import json, os, re, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULTS = {"on": True, "strength": 1.0, "color": 0.0, "exposure": 0.0, "denoise": 1.0, "sharpen": 1.0, "background": 0.0, "warmth": 0.0}   # natural by default: no colour grade, no background blur; ask for them with 1
TARGET_Y = 120            # comfortable mean brightness of the 16-235 video range for a face-to-camera clip


def settings(brand, edl=None):
    s = {**DEFAULTS, **(brand.get("enhance") or {}), **((edl or {}).get("enhance") or {})}
    if s["on"] is False: s = {k: (False if k == "on" else 0.0) for k in s}
    return s


def sample_brightness(src, times):
    """Mean luma (0-255 video range) of single frames at the given source times; None if it can't be read."""
    vals = []
    for t in times:
        r = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", str(src), "-frames:v", "1", "-vf",
                            "signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-", "-f", "null", "-"], capture_output=True, text=True)
        m = re.search(r"YAVG=([\d.]+)", r.stdout)
        if m: vals.append(float(m.group(1)))
    return sum(vals) / len(vals) if vals else None


def is_hdr(src):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=color_transfer", "-of", "csv=p=0", str(src)],
                       capture_output=True, text=True).stdout.strip()
    return r in ("arib-std-b67", "smpte2084")


def filters(src, spans, brand, edl=None):
    """(pre, post) ffmpeg filter lists. pre runs before the scale to the delivery size, post after it. Empty if switched off."""
    s = settings(brand, edl)
    if s["on"] is False: return [], [], {"on": False}
    k = s["strength"]
    pre, post, info = [], [], {"on": True, "settings": {a: round(b * k, 3) for a, b in s.items() if a not in ("on", "strength")}}
    dn = s["denoise"] * k
    if dn > 0: pre.append(f"hqdn3d={1.2 * dn:.2f}:{1.0 * dn:.2f}:{2.0 * dn:.2f}:{1.5 * dn:.2f}")
    # exposure: bounded nudge toward TARGET_Y, from a few frames across the kept spans
    lift = 0.0
    if s["exposure"] * k > 0 and spans:
        mids = [(a + b) / 2 for a, b in spans]
        n = min(6, len(mids))
        pick = [mids[round(i * (len(mids) - 1) / max(n - 1, 1))] for i in range(n)]
        y = sample_brightness(src, pick)
        if y is not None:
            lift = max(-0.04, min(0.05, (TARGET_Y - y) / 219 * 0.35)) * s["exposure"] * k
            info["measured_brightness"] = round(y, 1)
        if abs(lift) < 0.004: lift = 0.0
    c = s["color"] * k
    # Modified by By Mel Ross: cut.py converts HDR clips to SDR with macOS avconvert before this point, so `src` is normally SDR here.
    # Only a clip that could not be converted still reads as HDR, and then the colour really is approximate.
    hdr = is_hdr(src)
    if hdr: info["note"] = "HDR (HLG/PQ) footage that could not be converted properly (needs macOS avconvert): colour is only approximate, it comes out lighter, greyer and cooler than the real picture"
    contrast, sat = 1 + (0.045 if hdr else 0.03) * c, 1 + (0.08 if hdr else 0.04) * c
    if lift or c > 0: pre.append(f"eq=brightness={lift:.4f}:contrast={contrast:.3f}:saturation={sat:.3f}")
    w = s["warmth"] * k
    if w > 0: pre.append(f"colorbalance=rm={0.008 * w:.4f}:bm={-0.010 * w:.4f}:rh={0.005 * w:.4f}:bh={-0.006 * w:.4f}")
    sh = s["sharpen"] * k
    if sh > 0: post.append(f"unsharp=5:5:{0.30 * sh:.3f}:5:5:0.0")
    info["lift"] = round(lift, 4)
    return pre, post, info


def compare(reel, at=None):
    """before | after for one frame of the cut, written to enhance_before_after.jpg (540x960 each)."""
    reel = Path(reel)
    home = Path(os.environ.get("REELS_HOME", "~/reels")).expanduser()
    brand = json.load(open(home / "brand.json"))
    edl = json.load(open(reel / "edl.json")) if (reel / "edl.json").exists() else {}
    spans = edl.get("keep") or []
    src = reel / edl["source"] if edl.get("source") else None
    if not src or not src.exists():
        sys.exit("needs the reel's edl.json and source clip (run it from a reel folder after the cut)")
    import hdr2sdr; src = hdr2sdr.working_source(src, reel)[0]   # Added by By Mel Ross: the before/after uses the same SDR picture the cut used
    t = float(at) if at is not None else (spans[0][0] + min(2.0, (spans[0][1] - spans[0][0]) / 2) if spans else 1.0)
    pre, post, info = filters(src, spans, brand, edl)
    base = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920"
    tmp = reel / "_ba"; tmp.mkdir(exist_ok=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.3f}", "-i", str(src), "-frames:v", "1", "-vf", base, str(tmp / "before.png")], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.3f}", "-i", str(src), "-frames:v", "1", "-vf", ",".join(pre + [base] + post), str(tmp / "after.png")], check=True)
    note = "background softening not shown (it needs the cutout)"
    s = settings(brand, edl)
    if s["on"] is not False and s["background"] * s["strength"] > 0:
        sys.path.insert(0, str(HERE)); import cutout
        tool = cutout.matte_tool()
        if tool:
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-t", "0.2", "-i", str(tmp / "before.png"), "-r", "30", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(tmp / "one.mp4")], check=True)
            raw = subprocess.run([str(tool), str(tmp / "one.mp4"), "1080", "1920", "accurate"], capture_output=True).stdout[:1080 * 1920]
            if len(raw) == 1080 * 1920:
                (tmp / "m.gray").write_bytes(raw)
                sg = 3.2 * s["background"] * s["strength"]
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(tmp / "after.png"), "-f", "rawvideo", "-pix_fmt", "gray", "-s", "1080x1920", "-i", str(tmp / "m.gray"),
                                "-filter_complex", f"[0:v]format=gbrp,split[a][b];[b]gblur=sigma={sg:.2f}[bl];[1:v]{cutout.clean_filter()},format=gbrp[m];[bl][a][m]maskedmerge,format=rgb24[o]",
                                "-map", "[o]", "-frames:v", "1", str(tmp / "after2.png")], check=True)
                os.replace(tmp / "after2.png", tmp / "after.png"); note = "background softening shown"
    out = reel / "enhance_before_after.jpg"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(tmp / "before.png"), "-i", str(tmp / "after.png"), "-filter_complex",
                    "[0:v]scale=540:960[a];[1:v]scale=540:960[b];[a][b]hstack", "-frames:v", "1", "-q:v", "3", str(out)], check=True)
    for f in tmp.iterdir(): f.unlink()
    tmp.rmdir()
    print(out); print(f"frame at source {t:.1f}s (left before, right after); {note}"); print(json.dumps(info))
    return out


if __name__ == "__main__":
    a = sys.argv[1:]
    if len(a) >= 2 and a[1] == "compare":
        compare(a[0], a[a.index("--at") + 1] if "--at" in a else None)
    else:
        sys.exit(__doc__)
