#!/usr/bin/env python3
"""Added by By Mel Ross. Proper HDR to SDR conversion for iPhone footage (HLG / PQ / BT.2020, Dolby Vision).

Why: ffmpeg without a tone-mapper (no zscale / libplacebo) only relabels HDR pixels as SDR, so the picture comes out
lifted, grey and cooler than the real scene. macOS ships a real HDR to SDR converter, `avconvert` (part of macOS, nothing
to install, nothing leaves the Mac). This step runs it up front and the rest of the pipeline works from the converted file.

What it does:
  - detects HDR: colour transfer arib-std-b67 (HLG) or smpte2084 (PQ), or BT.2020 primaries
  - converts with avconvert to H.264 8-bit, tagged BT.709, keeping the whole duration, the audio and the upright orientation
  - checks the result with ffprobe (upright size, duration, audio, BT.709 tags); if anything is off it is not used
  - SDR sources are left alone (nothing is converted, nothing is copied)
  - not on macOS, or avconvert fails: the original file is used and the result says plainly that the colour is only approximate

  python3 hdr2sdr.py <clip> <out.mp4> [--start S --duration D] [--check]   convert one clip (or a span of it) if it is HDR
  python3 hdr2sdr.py <clip> --check                                          just say whether the clip is HDR
cut.py calls working_source() itself, so an HDR clip in a reel folder is converted once (source_sdr.mp4) and reused.
"""
import json, os, subprocess, sys, tempfile
from pathlib import Path

HDR_TRANSFERS = ("arib-std-b67", "smpte2084")
TAG_BT709 = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"]   # label every encode we make as BT.709 (what the picture is)
TAG_FILTER = "setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv"   # also set on the frames: some ffmpeg builds only write the matrix from the -colorspace flag
APPROX = "HDR source used without a proper conversion: colour is only approximate (it comes out lighter, greyer and cooler than the real picture)"


def probe(path):
    """First video stream facts: transfer, primaries, size as displayed (rotation applied), duration, audio present."""
    r = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)], capture_output=True, text=True)
    j = json.loads(r.stdout or "{}")
    v = next((s for s in j.get("streams", []) if s.get("codec_type") == "video"), {})
    rot = 0
    for sd in v.get("side_data_list") or []:
        if "rotation" in sd: rot = int(round(float(sd["rotation"])))
    try: rot = int(v.get("tags", {}).get("rotate", rot))
    except (TypeError, ValueError): pass
    w, h = int(v.get("width") or 0), int(v.get("height") or 0)
    if abs(rot) % 180 == 90: w, h = h, w
    return {"transfer": v.get("color_transfer") or "", "primaries": v.get("color_primaries") or "", "space": v.get("color_space") or "",
            "range": v.get("color_range") or "", "w": w, "h": h, "rotation": rot, "codec": v.get("codec_name") or "",
            "duration": float(j.get("format", {}).get("duration") or 0), "audio": any(s.get("codec_type") == "audio" for s in j.get("streams", []))}


def is_hdr(path_or_probe):
    p = path_or_probe if isinstance(path_or_probe, dict) else probe(path_or_probe)
    return p["transfer"] in HDR_TRANSFERS or p["primaries"] == "bt2020"


def tagged_bt709(p):
    return p["transfer"] == "bt709" and p["primaries"] == "bt709" and p["space"] == "bt709"


def can_convert():
    if os.environ.get("REEL_NO_AVCONVERT"): return False        # force the fallback (for testing, or to compare)
    return sys.platform == "darwin" and subprocess.run(["which", "avconvert"], capture_output=True).returncode == 0


def preset_for(p):
    """avconvert keeps the picture inside the preset size and does not enlarge, so pick one at least as big as the clip."""
    return "Preset3840x2160" if max(p["w"], p["h"]) > 2000 else "Preset1920x1080"


def convert(src, dst, start=None, duration=None):
    """Convert one HDR clip (or a span of it) to SDR. Returns {"ok": bool, "method": ..., "note": ...}; never raises for a failed conversion."""
    src, dst = Path(src), Path(dst)
    sp = probe(src)
    if not can_convert():
        return {"ok": False, "method": "none", "note": APPROX + " (avconvert is not available here: it needs macOS)"}
    tmp = Path(tempfile.mkdtemp(prefix="hdr2sdr-", dir=str(dst.parent if dst.parent.exists() else None)))
    out = tmp / "sdr.mp4"
    cmd = ["avconvert", "--source", str(src), "--preset", preset_for(sp), "--output", str(out), "--replace", "--multiPass"]
    if start: cmd += ["--start", f"{float(start):.3f}"]
    if duration: cmd += ["--duration", f"{float(duration):.3f}"]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0 or not out.exists():
            return {"ok": False, "method": "avconvert", "note": APPROX + f" (avconvert failed: {(r.stderr or r.stdout).strip()[:160]})"}
        op = probe(out)
        want = duration if duration else sp["duration"] - (float(start) if start else 0)
        problems = []
        if (op["w"], op["h"]) != (sp["w"], sp["h"]): problems.append(f"size {op['w']}x{op['h']} instead of {sp['w']}x{sp['h']}")
        if op["rotation"] % 360 != 0: problems.append(f"still rotated {op['rotation']}")
        if abs(op["duration"] - want) > 0.25: problems.append(f"length {op['duration']:.2f}s instead of {want:.2f}s")
        if sp["audio"] and not op["audio"]: problems.append("audio missing")
        if not tagged_bt709(op) or op["codec"] != "h264": problems.append(f"not BT.709 H.264 ({op['codec']}, {op['transfer']})")
        if problems:
            return {"ok": False, "method": "avconvert", "note": APPROX + " (conversion check failed: " + "; ".join(problems) + ")"}
        os.replace(out, dst)
        return {"ok": True, "method": "avconvert", "note": f"HDR ({sp['transfer'] or sp['primaries']}) converted to SDR BT.709 with macOS avconvert ({preset_for(sp)})"}
    finally:
        for f in tmp.iterdir(): f.unlink()
        tmp.rmdir()


def working_source(src, reel):
    """(path_to_use, info). SDR clips come back untouched. HDR clips are converted once to <reel>/source_sdr.mp4 (reused while
    the original is unchanged); if that is not possible the original comes back and info["note"] says the colour is approximate."""
    src, reel = Path(src), Path(reel)
    if (str(src), str(reel)) in _DONE: return _DONE[(str(src), str(reel))]
    r = _working_source(src, reel); _DONE[(str(src), str(reel))] = r; return r


_DONE = {}


def _working_source(src, reel):
    p = probe(src)
    if not is_hdr(p):
        return src, {"hdr": False, "converted": False, "note": "SDR source, not converted"}
    dst, meta = reel / "source_sdr.mp4", reel / "source_color.json"
    if dst.exists() and meta.exists():
        m = json.load(open(meta))
        if m.get("source_size") == src.stat().st_size and m.get("source_mtime") == int(src.stat().st_mtime) and abs(probe(dst)["duration"] - p["duration"]) < 0.25:
            return dst, {**m, "reused": True}
    print(f"HDR clip ({p['transfer'] or p['primaries']}): converting to SDR with macOS avconvert ...", flush=True)
    r = convert(src, dst)
    info = {"hdr": True, "converted": r["ok"], "method": r["method"], "note": r["note"], "source_size": src.stat().st_size, "source_mtime": int(src.stat().st_mtime)}
    json.dump(info, open(meta, "w"), indent=1)
    print(("OK: " if r["ok"] else "WARNING: ") + r["note"], flush=True)
    return (dst if r["ok"] else src), info


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a: sys.exit(__doc__)
    if "--check" in a:
        p = probe(a[0]); print(json.dumps({**p, "hdr": is_hdr(p)})); sys.exit(0)
    if len(a) < 2: sys.exit(__doc__)
    s = float(a[a.index("--start") + 1]) if "--start" in a else None
    d = float(a[a.index("--duration") + 1]) if "--duration" in a else None
    if not is_hdr(a[0]): sys.exit("SDR clip: nothing to convert")
    r = convert(a[0], a[1], s, d); print(json.dumps(r))
    sys.exit(0 if r["ok"] else 1)
