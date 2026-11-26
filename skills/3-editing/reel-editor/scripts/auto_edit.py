#!/usr/bin/env python3
"""Draft edit.json from the cut master's transcript: captions chunked in the brand's caption mode and punch-ins on a
steady rhythm. Claude then only marks accent words and adds 3-6 cards - no design work.
Usage: python3 auto_edit.py <reel-folder>     (needs <reel-folder>/master_transcript.json; see SKILL.md step 5)"""

import json, os, re, sys
from pathlib import Path

reel = Path(sys.argv[1]).expanduser()
home = Path(os.environ.get("REELS_HOME", "~/reels")).expanduser()
# Added by By Mel Ross (themes): the look is laid over brand.json
sys.path.insert(0, str(Path(__file__).resolve().parent))
import theme as _theme

brand = _theme.load_brand(home, reel, quiet=True)
mode = brand.get("captions", {}).get("mode", "phrase")  # "word" = one word at a time, "phrase" = 2-4 words
words = [w for w in json.load(open(reel / "master_transcript.json")) if w["text"].strip()]


# Added by By Mel Ross (0.5.0): permanent word list. brand.json "vocabulary": {"corrections": {"acme corp": "Acme Corp", "akme": "Acme"}} fixes
# Whisper mishears of names and brand terms (keys lowercase, punctuation stripped, one or more words); the replacement keeps the
# punctuation that trailed the last matched word.
def _apply_vocab(ws, corr):
    key = lambda t: re.sub(r"[^\w']", "", t).lower()
    for k in sorted(corr, key=lambda x: -len(x.split())):
        parts = k.split()
        n = len(parts)
        i = 0
        while i <= len(ws) - n:
            if [key(w["text"]) for w in ws[i : i + n]] == parts:
                trail = re.search(r"[^\w']*$", ws[i + n - 1]["text"]).group(0)
                new = corr[k].split()
                for j in range(n):  # replace in place, then drop surplus or add missing words
                    if j < len(new):
                        ws[i + j]["text"] = new[j]
                    else:
                        ws[i + j]["_drop"] = True
                for extra in new[n:]:
                    ws.insert(i + n, {**ws[i + n - 1], "text": extra})
                last = i + max(n, len(new)) - 1
                while ws[last].get("_drop"):
                    last -= 1
                ws[last]["text"] += trail
                i += max(n, len(new))
            else:
                i += 1
        ws = [w for w in ws if not w.get("_drop")]
    return ws


_corr = brand.get("vocabulary", {}).get("corrections", {})
if _corr:
    words = _apply_vocab(words, _corr)


def clean(t):
    return re.sub(r"[^\w'’$%&+#@-]", "", t)


captions, cur = [], []


def flush():
    if cur:
        captions.append(
            {
                "start": round(cur[0]["start"], 2),
                "end": round(cur[-1]["end"], 2),
                "words": [{"text": clean(w["text"]), "t": round(w["start"], 2), "accent": False} for w in cur],
            }
        )
        cur.clear()


for i, w in enumerate(words):
    cur.append(w)
    gap = words[i + 1]["start"] - w["end"] if i + 1 < len(words) else 9
    if mode == "word" or len(cur) >= 3 or re.search(r"[.,!?;:]$", w["text"]) or gap > 0.35:
        flush()
flush()
for a, b in zip(captions, captions[1:]):  # hold each caption until the next one starts
    a["end"] = round(max(a["end"], min(b["start"], a["end"] + 0.6)), 2)

# zoom points: on sentence starts, spaced by brand.json "zoom" "every" (Modified by By Mel Ross: default 6 s, so each
# slow eased zoom has time to land; the original quick punch-ins used "every": 2.2)
EVERY = float(brand.get("zoom", {}).get("every", 6.0))
punch, last = [], -99.0
for i, w in enumerate(words):
    new_sentence = i == 0 or re.search(r"[.!?]$", words[i - 1]["text"])
    if new_sentence and w["start"] - last > EVERY or w["start"] - last > EVERY + 2.5:
        punch.append(round(w["start"], 2))
        last = w["start"]

json.dump({"captions": captions, "punch": punch, "cards": []}, open(reel / "edit.json", "w"), indent=1)
print(
    f"edit.json: {len(captions)} captions ({mode} mode), {len(punch)} punch-ins, 0 cards - now mark accents + add cards"
)
