#!/usr/bin/env python3
"""Added by By Mel Ross (0.23.0): a gold sparkle trail that follows the hand.

  python3 hand_track.py <reel> [--src master.mp4]      <reel>/hands/hands.json  (where the hand is in every frame; cached)
  python3 hand_track.py <reel> spans                  lists the stretches where a hand is clearly visible and moving (candidates for a trail)

Apple Vision hand pose (built into macOS, runs on this computer, nothing downloaded or sent). Needs swiftc. build_reel.py calls
path() for the "hand_trail" entries in edit.json; see references/hand-trail.md.
"""
import hashlib, json, os, shutil, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def tool():
    """Compile hand_track.swift once (cached under ~/Library/Caches) and return the binary, or None."""
    if sys.platform != "darwin" or not shutil.which("swiftc"):
        return None
    src = HERE / "hand_track.swift"
    out = Path.home() / "Library/Caches/reel-editor/hand-track"
    if not out.exists() or out.stat().st_mtime < src.stat().st_mtime:
        out.parent.mkdir(parents=True, exist_ok=True)
        r = subprocess.run(["swiftc", "-O", str(src), "-o", str(out)], capture_output=True, text=True)
        if r.returncode:
            print("could not compile the hand tracker:\n" + r.stderr[-600:], file=sys.stderr); return None
    return out


def key_of(p):
    p = Path(p); h = hashlib.sha1(); sz = p.stat().st_size
    with open(p, "rb") as f:
        h.update(f.read(1 << 18)); f.seek(max(sz - (1 << 18), 0)); h.update(f.read(1 << 18))
    return f"{sz}-{h.hexdigest()[:16]}"


def load(reel, src="master.mp4"):
    """hands.json for this reel's master, tracked now if missing or the master changed."""
    reel = Path(reel); out = reel / "hands" / "hands.json"; srcp = reel / src
    if not srcp.exists(): print(f"hand trail: {src} is not there yet - skipped", file=sys.stderr); return None
    key = key_of(srcp)
    if out.exists():
        d = json.load(open(out))
        if d.get("key") == key: return d
    t = tool()
    if not t:   # not a Mac, or no Swift compiler: the reel builds without the trail
        print("hand trail skipped: it needs a Mac with the Swift compiler (xcode-select --install)", file=sys.stderr); return None
    print(f"tracking hands in {src} (about 15 s per minute of video) ...", file=sys.stderr)
    r = subprocess.run([str(t), str(srcp)], capture_output=True, text=True)
    if r.returncode: print("hand trail skipped: the tracker failed: " + r.stderr[-400:], file=sys.stderr); return None
    d = json.loads(r.stdout); d["key"] = key
    out.parent.mkdir(exist_ok=True); json.dump(d, open(out, "w"))
    return d


def path(d, t0, t1, joint="palm", side=None, max_gap=0.25, smooth=2):
    """[(t, x, y)] at the video frame rate for t0..t1: one hand followed frame to frame, short gaps filled, lightly smoothed. Breaks (None) mark
    stretches where the hand was lost for longer than max_gap, so no trail is drawn through them."""
    fr = [f for f in d["frames"] if t0 - 0.2 <= f["t"] <= t1 + 0.2]
    pts, last = [], None
    for f in fr:
        hs = [h for h in f["hands"] if side in (None, h["side"])]
        best = None
        for h in hs:
            p = h.get(joint) or h["palm"]
            score = h["conf"] - (0.002 * ((p[0] - last[0]) ** 2 + (p[1] - last[1]) ** 2) ** 0.5 if last else 0)
            if best is None or score > best[0]: best = (score, p)
        if best: last = best[1]; pts.append((f["t"], best[1][0], best[1][1]))
        else: pts.append((f["t"], None, None))
    # fill short gaps
    out, i = [], 0
    while i < len(pts):
        if pts[i][1] is not None: out.append(list(pts[i])); i += 1; continue
        j = i
        while j < len(pts) and pts[j][1] is None: j += 1
        a = out[-1] if out and out[-1][1] is not None else None
        b = pts[j] if j < len(pts) else None
        for k in range(i, j):
            if a and b and b[0] - a[0] <= max_gap + 1e-6:
                u = (pts[k][0] - a[0]) / (b[0] - a[0]); out.append([pts[k][0], a[1] + u * (b[1] - a[1]), a[2] + u * (b[2] - a[2])])
            else: out.append([pts[k][0], None, None])
        i = j
    # centred moving average
    sm = []
    for k, p in enumerate(out):
        if p[1] is None: sm.append(tuple(p)); continue
        win = [q for q in out[max(0, k - smooth): k + smooth + 1] if q[1] is not None]
        sm.append((p[0], sum(q[1] for q in win) / len(win), sum(q[2] for q in win) / len(win)))
    return [p for p in sm if t0 <= p[0] <= t1]


def spans(d, min_len=0.5, min_speed=250):
    """Stretches (start, end) where one hand is visible and moving faster than min_speed px/s on average."""
    res, cur = [], []
    pts = path(d, 0, d["frames"][-1]["t"])
    for p in pts + [(1e9, None, None)]:
        if p[1] is None:
            if len(cur) >= 3:
                sp = sum(((cur[k][1] - cur[k - 1][1]) ** 2 + (cur[k][2] - cur[k - 1][2]) ** 2) ** 0.5 / max(cur[k][0] - cur[k - 1][0], 1e-3) for k in range(1, len(cur))) / (len(cur) - 1)
                if cur[-1][0] - cur[0][0] >= min_len and sp >= min_speed: res.append((round(cur[0][0], 2), round(cur[-1][0], 2), round(sp)))
            cur = []
        else: cur.append(p)
    return res


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a: sys.exit(__doc__)
    reel = Path(a[0]); src = a[a.index("--src") + 1] if "--src" in a else "master.mp4"
    d = load(reel, src)
    if d is None: sys.exit(1)
    if len(a) > 1 and a[1] == "spans":
        for s, e, sp in spans(d): print(f"{s:7.2f} - {e:7.2f}  ({e - s:.1f} s, {sp} px/s)")
    else:
        n = sum(1 for f in d["frames"] if f["hands"]); print(f"hands.json: {len(d['frames'])} frames, hand seen in {n} ({100 * n // max(len(d['frames']), 1)}%)")
