#!/usr/bin/env python3
"""Added by By Mel Ross. Speaker cutout: the matte that lets a graphic sit behind the speaker, and softens the background.

  python3 cutout.py <reel> build [--src master.mp4] [--quality accurate|balanced|fast]
      <reel>/cutout/matte.mkv     clean person matte (gray, frame-locked to the video)
      <reel>/cutout/person.webm   the speaker alone on transparent (VP9 with alpha); HyperFrames puts it above the "behind" graphics
      <reel>/cutout/stats.json    per-frame checks used to decide, shot by shot, whether the edges are good enough
  python3 cutout.py <reel> check <start> <end>   print whether the cutout is good enough for that stretch (exit 0 = yes)
  python3 cutout.py <reel> soften [--strength 1.0]   blur the background a touch (keeps the speaker sharp); master.mp4 is replaced,
                                                 the original is kept as master_sharp.mp4
  python3 cutout.py <reel> sheet                 cutout_check.jpg: frame | matte | speaker on magenta, to look at the edges

The matte comes from Apple Vision person segmentation (built into macOS, runs on this computer, nothing downloaded or sent).
Elsewhere, or if the Swift compiler is missing, there is no built-in matte: pass your own white-on-black matte video with
--matte <file> (any segmentation tool), or layered graphics fall back to a plain overlay in front. Needs ffmpeg; swiftc on macOS.
Edge checks (per shot): the speaker must fill a plausible share of the frame, the matte must not jump or flicker, and its
edges must be clean rather than mushy. A shot that fails is drawn as a plain overlay and the build says so.
"""
import hashlib, json, os, shutil, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
W, H = 1080, 1920
LIMITS = {"cov_min": 0.04, "cov_max": 0.80, "jump": 0.10, "flicker": 0.07, "mushy": 0.30}


def run(cmd, **kw):
    return subprocess.run([str(c) for c in cmd], check=True, **kw)


def probe(path, entries):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", entries, "-of", "json", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)["streams"][0]


def key_of(p):
    p = Path(p); h = hashlib.sha1(); sz = p.stat().st_size
    with open(p, "rb") as f:
        h.update(f.read(1 << 18)); f.seek(max(sz - (1 << 18), 0)); h.update(f.read(1 << 18))
    return f"{sz}-{h.hexdigest()[:16]}"


def matte_tool():
    """Compile cutout_matte.swift once (cached under ~/Library/Caches) and return the binary, or None if not possible."""
    if os.environ.get("REEL_NO_CUTOUT") or sys.platform != "darwin" or not shutil.which("swiftc"):
        return None            # REEL_NO_CUTOUT=1 pretends there is no cutout (tests, or to skip the wait)
    src = HERE / "cutout_matte.swift"
    out = Path.home() / "Library/Caches/reel-editor/cutout-matte"
    if not out.exists() or out.stat().st_mtime < src.stat().st_mtime:
        out.parent.mkdir(parents=True, exist_ok=True)
        r = subprocess.run(["swiftc", "-O", str(src), "-o", str(out)], capture_output=True, text=True)
        if r.returncode:
            print("could not compile the matte tool:\n" + r.stderr[-600:], file=sys.stderr); return None
    return out


# the matte clean-up, in ffmpeg: tighten the edge (removes the halo), 1 px feather, steady across 3 frames, optional boxes
def clean_filter(boxes=None):
    f = ["format=gray",
         "lut=y='st(0,clip((val/255-0.22)/0.56,0,1));255*ld(0)*ld(0)*(3-2*ld(0))'",
         "gblur=sigma=1.0", "tmix=frames=3:weights='1 2 1'"]
    for b in (boxes or {}).get("exclude", []): f.append(f"drawbox=x={b[0]}:y={b[1]}:w={b[2]}:h={b[3]}:color=black:t=fill")
    for b in (boxes or {}).get("include", []): f.append(f"drawbox=x={b[0]}:y={b[1]}:w={b[2]}:h={b[3]}:color=white:t=fill")
    return ",".join(f)


def build_matte(reel, src, quality="accurate", own_matte=None, boxes=None, fps=30):
    """Make <reel>/cutout/matte.mkv for `src` (cached: reused while src is unchanged). Returns the matte path or None."""
    d = Path(reel) / "cutout"; d.mkdir(exist_ok=True)
    meta, mpath = d / "meta.json", d / "matte.mkv"
    k = key_of(src) + f"-{quality}-{bool(own_matte)}-{json.dumps(boxes, sort_keys=True)}"
    if mpath.exists() and meta.exists() and json.load(open(meta)).get("key") == k:
        return mpath
    if own_matte:
        run(["ffmpeg", "-v", "error", "-y", "-i", own_matte, "-vf", f"fps={fps},scale={W}:{H},{clean_filter(boxes)}", "-c:v", "ffv1", "-level", "3", mpath])
    else:
        tool = matte_tool()
        if not tool: return None
        p = subprocess.Popen([str(tool), str(src), str(W), str(H), quality], stdout=subprocess.PIPE)
        run(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", f"{W}x{H}", "-r", str(fps), "-i", "-",
             "-vf", clean_filter(boxes), "-c:v", "ffv1", "-level", "3", mpath], stdin=p.stdout)
        p.wait()
        if p.returncode: return None
    meta.write_text(json.dumps({"key": k, "src": str(Path(src).name), "quality": quality}))
    stats = d / "stats.json"
    if stats.exists(): stats.unlink()
    return mpath


# ---- edge checks ---------------------------------------------------------------------------------------------------
def frame_stats(matte, fps=30):
    """Per frame: speaker share of the frame, and the share of edge pixels that are neither clearly in nor clearly out."""
    w, h = 108, 192
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-i", str(matte), "-vf", f"scale={w}:{h}:flags=area,format=gray", "-f", "rawvideo", "-"],
                         stdout=subprocess.PIPE)
    tbl_in = bytes(1 if v >= 128 else 0 for v in range(256))
    tbl_mid = bytes(1 if 40 <= v <= 215 else 0 for v in range(256))
    out, prev = [], None
    n = w * h
    while True:
        b = p.stdout.read(n)
        if len(b) < n: break
        binary = b.translate(tbl_in)
        inside = binary.count(1)
        mid = b.translate(tbl_mid).count(1)
        flip = sum(1 for x, y in zip(binary, prev) if x != y) if prev is not None else 0
        out.append({"cov": inside / n, "mushy": mid / max(inside, 1), "flip": flip / max(inside, 1)})
        prev = binary
    p.wait()
    return out


def stats_for(reel, fps=30):
    d = Path(reel) / "cutout"; sp = d / "stats.json"
    if sp.exists(): return json.load(open(sp))
    st = frame_stats(d / "matte.mkv", fps)
    sp.write_text(json.dumps(st)); return st


def check(reel, a, b, fps=30):
    """(ok, reason) for the stretch a..b seconds."""
    if not (Path(reel) / "cutout" / "matte.mkv").exists(): return False, "no cutout available"
    st = stats_for(reel, fps)[int(a * fps):max(int(b * fps), int(a * fps) + 1)]
    if not st: return False, "no frames"
    cov = [s["cov"] for s in st]
    if min(cov) < LIMITS["cov_min"]: return False, f"speaker not found in part of the shot (share {min(cov):.0%})"
    if max(cov) > LIMITS["cov_max"]: return False, f"cutout covers almost the whole frame ({max(cov):.0%})"
    jump = max((abs(x - y) for x, y in zip(cov, cov[1:])), default=0)
    if jump > LIMITS["jump"]: return False, f"cutout jumps between frames ({jump:.0%})"
    flick = sum(s["flip"] for s in st) / len(st)
    if flick > LIMITS["flicker"]: return False, f"cutout edge flickers ({flick:.0%} of the speaker's pixels per frame)"
    mush = sum(s["mushy"] for s in st) / len(st)
    if mush > LIMITS["mushy"]: return False, f"cutout edges are soft/mushy ({mush:.0%})"
    return True, "ok"


# ---- outputs -------------------------------------------------------------------------------------------------------
def build_person(reel, video, matte):
    out = Path(reel) / "cutout" / "person.webm"
    stamp = key_of(video) + key_of(matte)
    s = Path(reel) / "cutout" / "person.key"
    if out.exists() and s.exists() and s.read_text() == stamp: return out
    vs = probe(video, "stream=width,height")
    run(["ffmpeg", "-v", "error", "-y", "-i", video, "-i", matte, "-filter_complex",
         f"[1:v]scale={vs['width']}:{vs['height']}:flags=bicubic,format=gray[m];[0:v]format=yuv420p[v];[v][m]alphamerge,format=yuva420p[o]",
         "-map", "[o]", "-an", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "22", "-deadline", "realtime", "-cpu-used", "5",
         "-row-mt", "1", "-auto-alt-ref", "0", out])
    s.write_text(stamp); return out


def soften(reel, strength=1.0, quality="accurate", own_matte=None, boxes=None):
    """Blur the background (not the speaker) of master.mp4. Returns True if applied."""
    reel = Path(reel); master = reel / "master.mp4"; sharp = reel / "master_sharp.mp4"
    if sharp.exists(): master_in = sharp      # already softened once: start from the sharp one
    else: master_in = master
    m = build_matte(reel, master_in, quality, own_matte, boxes)
    if not m: return False
    vs = probe(master_in, "stream=width,height")
    sigma = max(0.5, 3.2 * strength * vs["width"] / 1080)
    tmp = reel / "master_soft.mp4"
    run(["ffmpeg", "-v", "error", "-y", "-i", master_in, "-i", m, "-filter_complex",
         f"[0:v]format=gbrp,split[a][b];[b]gblur=sigma={sigma:.2f}[bl];[1:v]scale={vs['width']}:{vs['height']}:flags=bicubic,format=gbrp[m];"
         "[bl][a][m]maskedmerge,format=yuv420p[o]",
         "-map", "[o]", "-map", "0:a?", "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", "-c:a", "copy",
         "-movflags", "+faststart", tmp])
    if not sharp.exists(): shutil.copy2(master, sharp)
    os.replace(tmp, master)
    return True


def sheet(reel):
    reel = Path(reel); d = reel / "cutout"
    src = reel / "master_sharp.mp4" if (reel / "master_sharp.mp4").exists() else reel / "master.mp4"
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(src)], capture_output=True, text=True).stdout)
    tmp = d / "sheet"; tmp.mkdir(exist_ok=True)
    for i, t in enumerate([dur * f for f in (0.15, 0.5, 0.85)]):
        # three panels per row: the frame, the matte, the speaker alone on magenta
        run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.2f}", "-i", src, "-frames:v", "1", "-vf", "scale=360:640", tmp / f"a{i}.png"])
        run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.2f}", "-i", d / "matte.mkv", "-frames:v", "1", "-vf", "scale=360:640,format=gray", tmp / f"m{i}.png"])
        run(["ffmpeg", "-v", "error", "-y", "-i", tmp / f"a{i}.png", "-i", tmp / f"m{i}.png", "-filter_complex",
             "[0:v]format=rgba[a];[1:v]format=gray[m];[a][m]alphamerge[fg];color=c=0xff00ff:s=360x640:r=30[bg];[bg][fg]overlay=shortest=1:format=auto[cut];"
             "[1:v]format=rgba[mm];[0:v][mm][cut]hstack=inputs=3", "-frames:v", "1", tmp / f"s{i}.png"])
    run(["ffmpeg", "-v", "error", "-y", "-i", tmp / "s0.png", "-i", tmp / "s1.png", "-i", tmp / "s2.png", "-filter_complex", "vstack=inputs=3",
         "-frames:v", "1", reel / "cutout_check.jpg"])
    shutil.rmtree(tmp)
    return reel / "cutout_check.jpg"


def main():
    a = sys.argv[1:]
    if len(a) < 2: sys.exit(__doc__)
    reel, cmd = Path(a[0]).expanduser().resolve(), a[1]
    opt = lambda k, d=None: a[a.index(k) + 1] if k in a else d
    edit = json.load(open(reel / "edit.json")) if (reel / "edit.json").exists() else {}
    boxes = (edit.get("cutout") or {}) if isinstance(edit.get("cutout"), dict) else None
    q = opt("--quality", "balanced" if os.environ.get("REEL_PREVIEW") else "accurate")
    if cmd == "build":
        src = reel / opt("--src", "master_sharp.mp4" if (reel / "master_sharp.mp4").exists() else "master.mp4")
        m = build_matte(reel, src, q, opt("--matte"), boxes)
        if not m: sys.exit("no cutout: this needs macOS with the Swift compiler (xcode-select --install), or pass --matte <white-on-black matte video>")
        p = build_person(reel, reel / opt("--src", "master.mp4"), m)
        print(m); print(p)
    elif cmd == "check":
        ok, why = check(reel, float(a[2]), float(a[3])); print(("OK: " if ok else "FAIL: ") + why); sys.exit(0 if ok else 1)
    elif cmd == "soften":
        done = soften(reel, float(opt("--strength", 1.0)), q, opt("--matte"), boxes)
        print("background softened" if done else "background softening skipped: no cutout available (macOS + Swift needed, or --matte)")
    elif cmd == "sheet":
        print(sheet(reel))
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
