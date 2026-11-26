#!/usr/bin/env python3
"""3 looks recommended for this clip, each with its reason in plain words (Added by By Mel Ross, 0.34.0).

A new person meets 5 themes and 61 looks with IDs like "H3" and "L25". This picks 3 to start from, from what the clip shows:
  1. a theme, from how bright their top and the wall behind them are;
  2. a hook, from how much room there is above their head (and what they say, once there's a transcript);
  3. a layout or an ending, from the kind of reel and what they say.
The rules are simple on purpose, so every pick can say why. When a check can't run, its pick falls back to a safe default and
the reason says so.

Usage: python3 recommend.py <reel-folder | clip> [--style simple|full]
Prints JSON: {"picks": [{"kind": "theme"|"look", "id", "name", "why"}, ...], "checked": [...], "fallback": bool}
"""

import argparse, json, os, re, statistics, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKILL = HERE.parent
sys.path.insert(0, str(HERE))

VIDEO = (".mov", ".mp4", ".m4v", ".webm", ".mkv")
W, H = 90, 160  # small gray frames, 9:16 like the reel

ap = argparse.ArgumentParser()
ap.add_argument("src")
ap.add_argument("--style", default="full", choices=("simple", "full"))
a = ap.parse_args()
src = Path(a.src).expanduser().resolve()

if src.is_dir():
    clip = (
        src / "master.mp4"
        if (src / "master.mp4").exists()
        else next((p for p in sorted(src.glob("raw.*")) if p.suffix.lower() in VIDEO), None)
    )
    words = []
    for name in ("master_transcript.json", "transcript.json"):
        if (src / name).exists():
            try:
                words = [w.get("text", "") for w in json.load(open(src / name))]
            except (ValueError, TypeError, AttributeError):
                words = []
            break
else:
    clip, words = src, []
if not clip or not clip.exists():
    sys.exit("no clip to look at")
said = " ".join(words).lower()

menu = json.load(open(SKILL / "assets/style-menu.json"))["looks"]
look_name = lambda i: menu.get(i, {}).get("name", i)


def theme_name(t):
    try:
        return json.load(open(SKILL / "themes" / t / "theme.json"))["name"]
    except (OSError, ValueError, KeyError):
        return t.capitalize()


# ---- what the clip shows -----------------------------------------------------------------------------------------------
def frames(clip, n=3, span=12.0):
    dur = float(
        subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(clip)],
            capture_output=True,
            text=True,
        ).stdout
        or 0
    )
    out = []
    for k in range(n):
        t = min(dur, span) * (k + 1) / (n + 1)
        raw = subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-ss",
                f"{t:.2f}",
                "-i",
                str(clip),
                "-frames:v",
                "1",
                "-vf",
                f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},format=gray",
                "-f",
                "rawvideo",
                "-",
            ],
            capture_output=True,
        ).stdout
        if len(raw) >= W * H:
            out.append(raw[: W * H])
    return out, dur


def region(fr, x0, x1, y0, y1):
    xs, ys = range(int(x0 * W), max(int(x0 * W) + 1, int(x1 * W))), range(
        int(y0 * H), max(int(y0 * H) + 1, int(y1 * H))
    )
    return [fr[y * W + x] for y in ys for x in xs if 0 <= y < H and 0 <= x < W]


checked, fallback = [], False
frs, dur = frames(clip)
# tests: REEL_TEST_HEAD="top,h,cx" stands in for finding the head
if os.environ.get("REEL_TEST_HEAD"):
    _t, _h, _c = (float(x) for x in os.environ["REEL_TEST_HEAD"].split(","))
    head = {"top": _t, "h": _h, "cx": _c}
else:
    try:
        import framing_check as _fc

        head = _fc.find_head(clip, _fc._probe(clip), min(2.0, max(0.0, dur / 4)), min(4.0, max(1.0, dur / 2)))
    except Exception:
        head = None
top_head = head["top"] if head else None
# the head's bottom: its top plus its height (fractions of the frame); without a head, a usual framing
hb = (head["top"] + head["h"]) if head else 0.40
cx = head["cx"] if head else 0.5

shirt = wall = busy = None
if frs:
    s_px = [
        v
        for fr in frs
        for v in region(fr, max(0, cx - 0.18), min(1, cx + 0.18), min(0.92, hb + 0.06), min(0.98, hb + 0.30))
    ]
    w_px = [v for fr in frs for v in region(fr, 0.0, 0.16, 0.06, 0.30) + region(fr, 0.84, 1.0, 0.06, 0.30)]
    shirt, wall = statistics.mean(s_px), statistics.mean(w_px)
    busy = statistics.pstdev(w_px)
    tone = lambda v: "light" if v > 165 else "dark" if v < 95 else "mid-tone"
    checked.append(f"your top looks {tone(shirt)} and the wall behind you looks {tone(wall)}")
else:
    fallback = True
if top_head is not None:
    checked.append(f"there's {'plenty of' if top_head >= 0.14 else 'only a little'} room above your head")
else:
    fallback = True
if said:
    checked.append("what you say in the clip")

picks = []

# ---- 1. a theme --------------------------------------------------------------------------------------------------------
if shirt is None:
    picks.append(
        (
            "theme",
            "bold",
            "It reads well on almost any footage. The clip couldn't be checked, so this is the safe start.",
        )
    )
elif shirt > 165:
    picks.append(
        (
            "theme",
            "bold",
            "Your top is light, so cream or white text on it would get lost. Bold's dark-outlined titles and boxed captions stay readable.",
        )
    )
elif shirt < 95 and wall > 150:
    picks.append(
        (
            "theme",
            "minimal",
            "Your top is dark and your wall is light, so Minimal's cream caps stand out on your top and its small captions read on the wall.",
        )
    )
elif wall < 95:
    picks.append(
        (
            "theme",
            "editorial",
            "Your room is on the dark side, so Editorial's cream serif headlines stand out without shouting.",
        )
    )
elif busy is not None and busy > 48:
    picks.append(
        ("theme", "bold", "The wall behind you is busy, so captions in boxes keep the words readable over it.")
    )
else:
    picks.append(
        (
            "theme",
            "editorial",
            "Your footage is even and calm, so a quiet look keeps the attention on you: cream serif headlines and small captions.",
        )
    )

# ---- what they say -------------------------------------------------------------------------------------------------------
m_list = re.search(
    r"\b(\d+|two|three|four|five|six|seven)\s+(things|tips|ways|tools|steps|mistakes|reasons|apps|rules|habits)\b", said
)
m_stat = re.search(
    r"(\$\s?\d[\d,.]*|\b\d[\d,.]*\s?(%|percent|k\b|x\b|times\b|hours?\b|days?\b|minutes?\b|dollars?\b|followers\b))",
    said,
)
m_dont = re.search(r"\b(don'?t|do not|never|stop|avoid|mistakes?)\b", said)

# ---- 2. a hook -----------------------------------------------------------------------------------------------------------
room = top_head is None or top_head >= 0.14
if not room:
    picks.append(
        (
            "look",
            "L22",
            "There's only a little room above your head, so a small statement block in the top-left corner fits where a big title would cover your face.",
        )
    )
elif m_list:
    picks.append(
        ("look", "H17", f'You say "{m_list.group(0)}", so the hook can promise the list with the number in colour.')
    )
elif m_stat:
    picks.append(
        ("look", "H6", f'You say "{m_stat.group(0).strip()}", so opening on that number makes people stay to hear it.')
    )
elif top_head is None:
    picks.append(
        (
            "look",
            "L23",
            "A big two-line title is the most common hook. Your head couldn't be found, so check it sits above you, not on your face.",
        )
    )
else:
    picks.append(
        (
            "look",
            "L23",
            "You have room above your head for a big two-line title. The second line goes in your accent colour.",
        )
    )

# ---- 3. a layout or an ending -----------------------------------------------------------------------------------------
if m_list:
    picks.append(("look", "L16", "A numbered card lays out the steps as you say them, so people can screenshot it."))
elif m_dont:
    picks.append(
        (
            "look",
            "L6",
            f'You talk about what not to do ("{m_dont.group(0)}"), so a list with red X marks makes the point at a glance.',
        )
    )
elif m_stat:
    picks.append(("look", "L8", "A number card pops up when you say the number, so it sticks."))
elif a.style == "simple":
    picks.append(
        ("look", "L21", "A simple reel ends best on one clear ask: comment a keyword to get something from you.")
    )
else:
    picks.append(
        (
            "look",
            "L16",
            "With graphics on, a numbered card is the most useful one to start with: it fits most tips and steps.",
        )
    )

out = {
    "picks": [
        {"kind": k, "id": i, "name": theme_name(i) if k == "theme" else look_name(i), "why": why} for k, i, why in picks
    ],
    "checked": checked,
    "fallback": fallback,
}
print(json.dumps(out))
