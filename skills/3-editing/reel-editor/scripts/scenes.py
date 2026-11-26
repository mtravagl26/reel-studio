#!/usr/bin/env python3
"""Added by By Mel Ross (0.35.0). The storyboard: a rendered reel split into scenes, one still each, with what is said, what
is on screen, and anything that needs a look. Made after every render. The person reads it on the Edit page's Storyboard tab
and leaves a note per scene; Claude reads it (sheet.jpg and the printed flags) before showing any preview.

  python3 scenes.py <reel> [--video renders/v003-phone.mp4] [--out editor/storyboard/v003]

Default video: the newest renders/v*-phone.mp4 when it is newer than final.mp4, else final.mp4.
Writes <out>/scenes.json, <out>/scene-01.jpg ... and <out>/sheet.jpg (every still in one picture, 4 across).
Times are reel times, the same as edit.json.
"""

import argparse, json, re, subprocess, sys
from pathlib import Path

MIN_S, MAX_S, AIM_S = 1.5, 5.0, 3.5  # scene length: shortest, longest, the length a cut point near is preferred
GAP = 1.0  # seconds with no words inside a scene that count as dead air
EDGE = 0.6  # ... at the very start or end of the reel


def dur_of(f):
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(f)],
        capture_output=True,
        text=True,
    )
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 0.0


def words_of(reel, edit):
    """Spoken words with start and end, in reel time: the transcript when there is one, else the caption words."""
    tr = reel / "master_transcript.json"
    if tr.exists():
        try:
            ws = [
                {"text": w["text"], "s": float(w["start"]), "e": float(w["end"])}
                for w in json.load(open(tr))
                if str(w.get("text", "")).strip()
            ]
            if ws:
                return ws
        except (ValueError, KeyError, TypeError):
            pass
    out = []
    for c in edit.get("captions", []):
        ws = c.get("words", [])
        for k, w in enumerate(ws):
            e = ws[k + 1]["t"] if k + 1 < len(ws) else c["end"]
            out.append({"text": w["text"], "s": float(w["t"]), "e": float(e)})
    return out


def card_words(c):
    parts = [c.get(k) for k in ("text", "title", "label", "sub", "value", "overline")]
    for k in ("rows", "items"):
        for r in c.get(k) or []:
            parts.append(r if isinstance(r, str) else (r or {}).get("text"))
    return " ".join(str(p) for p in parts if isinstance(p, (str, int, float)))


def card_label(c):
    t = re.sub(r"[*/]", " ", card_words(c))
    t = re.sub(r"\s+", " ", t).strip()
    name = {
        "title": "Title",
        "tag": "Pill",
        "card": "List",
        "cta": "Ending",
        "quote": "Quote",
        "note": "Note",
        "stat": "Number",
    }
    return (name.get(c.get("type"), (c.get("type") or "graphic").capitalize()) + (f": {t[:60]}" if t else "")).strip()


def norm(w):
    return re.sub(r"[^a-z0-9']", "", w.lower().replace("’", "'"))


def split(dur, cards, caps):
    """Scene boundaries. Card starts and ends come first, then pauses between captions, then a hard cut every 5 s."""
    card_pts = {round(t, 2) for c in cards for t in (c["start"], c["end"]) if 0.2 < t < dur - 0.2}
    cap_pts = set()
    for a, b in zip(caps, caps[1:]):
        if b["start"] - a["end"] >= 0.25:
            cap_pts.add(round(b["start"], 2))
    cur, out = 0.0, []
    while cur < dur - 0.05:
        if dur - cur <= MAX_S:
            out.append((cur, dur))
            break
        win = lambda pts: sorted(p for p in pts if cur + MIN_S <= p <= cur + MAX_S)
        cand = win(card_pts) or win(cap_pts)
        end = min(cand, key=lambda p: abs(p - (cur + AIM_S))) if cand else cur + AIM_S
        if dur - end < MIN_S:
            end = dur
        out.append((cur, end))
        cur = end
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("reel")
    ap.add_argument("--video")
    ap.add_argument("--out")
    a = ap.parse_args()
    reel = Path(a.reel).expanduser().resolve()
    edit = json.load(open(reel / "edit.json"))
    if a.video:
        video = (reel / a.video) if not Path(a.video).is_absolute() else Path(a.video)
    else:
        phones = sorted((reel / "renders").glob("v*-phone.mp4"))
        fin = reel / "final.mp4"
        video = (
            phones[-1] if phones and (not fin.exists() or phones[-1].stat().st_mtime >= fin.stat().st_mtime) else fin
        )
    if not video.exists():
        sys.exit(f"no rendered video yet ({video.name}); render first")
    tag = re.match(r"(v\d+)", video.name)
    out = Path(a.out) if a.out else reel / "editor" / "storyboard" / (tag.group(1) if tag else "final")
    if not out.is_absolute():
        out = reel / out
    out.mkdir(parents=True, exist_ok=True)
    dur = dur_of(video)
    if dur <= 0:
        sys.exit(f"can't read the length of {video.name}")

    cards = [c for c in edit.get("cards", []) if not c.get("off") and c.get("start") is not None]
    for c in cards:
        c["end"] = float(c.get("end") if c.get("end") is not None else min(c["start"] + 3, dur))
    caps = sorted((c for c in edit.get("captions", []) if c.get("words")), key=lambda c: c["start"])
    words = words_of(reel, edit)
    said = {norm(w["text"]) for w in words}

    scenes = []
    for n, (s, e) in enumerate(split(dur, cards, caps), 1):
        here = [c for c in cards if c["start"] < e - 0.1 and c["end"] > s + 0.1]
        ws = [w for w in words if s - 0.05 <= (w["s"] + w["e"]) / 2 < e]
        flags = []
        # dead air: a stretch with no words, inside the scene or at the reel's very start or end
        marks = [s] + [x for w in ws for x in (w["s"], w["e"])] + [e]
        for x, y in zip(marks[::2], marks[1::2]):
            limit = EDGE if (x <= 0.05 or y >= dur - 0.05) else GAP
            if y - x > limit:
                flags.append(f"{y - x:.1f} s with no talking at {x:.1f} s")
        # words with no caption (and no graphic up to carry them)
        missing = [
            w
            for w in ws
            if not any(c["start"] - 0.05 <= w["s"] < c["end"] + 0.05 and c.get("pos") != "hide" for c in caps)
            and not any(c["start"] <= w["s"] < c["end"] for c in here)
        ]
        if missing:
            flags.append(
                f"{len(missing)} {'word' if len(missing) == 1 else 'words'} with no caption: "
                + " ".join(w["text"] for w in missing[:8])
            )
        # card words that are never said (the rule: card text comes from words they say and kept)
        for c in here:
            odd = [
                x
                for x in re.findall(r"[A-Za-z][A-Za-z'’]{3,}", card_words(c))
                if norm(x) not in said and norm(x).rstrip("s") not in said
            ]
            if odd and c.get("type") not in ("cta",):
                flags.append(
                    f"{card_label(c).split(':')[0]} has words you don't say: {', '.join(dict.fromkeys(odd[:6]))}"
                )
        # the still: past a card's way in, so it shows the way it sits
        t = s + 0.6 * (e - s)
        for c in here:
            if c["start"] >= s:
                t = min(max(t, c["start"] + 0.7), e - 0.1)
                break
        t = max(s + 0.3, min(t, dur - 0.1))
        img = out / f"scene-{n:02d}.jpg"
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-y",
                "-ss",
                f"{t:.2f}",
                "-i",
                str(video),
                "-frames:v",
                "1",
                "-vf",
                "scale=360:-2",
                "-q:v",
                "4",
                str(img),
            ],
            check=False,
        )
        scenes.append(
            {
                "n": n,
                "start": round(s, 2),
                "end": round(e, 2),
                "at": round(t, 2),
                "still": img.name,
                "said": " ".join(w["text"] for w in ws),
                "cards": [{"id": c.get("id"), "type": c.get("type"), "label": card_label(c)} for c in here],
                "flags": flags,
            }
        )

    # every still in one picture, 4 across, so the whole reel can be checked in one look
    sheet = out / "sheet.jpg"
    cols = 4
    rows = (len(scenes) + cols - 1) // cols
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-framerate",
            "1",
            "-i",
            str(out / "scene-%02d.jpg"),
            "-vf",
            f"scale=270:-2,pad=iw+8:ih+8:4:4:color=white,tile={cols}x{rows}:color=white",
            "-frames:v",
            "1",
            "-q:v",
            "4",
            str(sheet),
        ],
        check=False,
    )
    rel = video.relative_to(reel) if video.is_relative_to(reel) else video
    json.dump(
        {"video": str(rel), "length": round(dur, 2), "scenes": scenes, "sheet": sheet.name if sheet.exists() else None},
        open(out / "scenes.json", "w"),
        indent=1,
    )
    n_flags = sum(len(x["flags"]) for x in scenes)
    print(f"storyboard: {len(scenes)} scenes from {rel}, {n_flags} to look at. Stills in {out}")
    for x in scenes:
        for f in x["flags"]:
            print(f"  scene {x['n']} ({x['start']:.1f}-{x['end']:.1f} s): {f}")
    print(f"sheet: {sheet}")


if __name__ == "__main__":
    main()
