#!/usr/bin/env python3
"""Find false starts in a transcript (Added by By Mel Ross, 0.26.0).

review_sync.py export runs this on every reel, so the review page shows false starts as suggested cuts, already ticked,
labelled "false start". Nothing is cut without the person's yes: they untick any they want to keep.

Four patterns, all from the words and their times:
  doubled   the same word twice within about 1 s ("with with"): the first one goes
  restart   a phrase started, dropped and started again with the same 2-4 words ("the app you, the app you open"): the first try goes
  cut-off   a short word broken off before a pause, then said again ("expl- explain"): the broken word goes
  retake    the same sentence said twice in a row: the earlier take goes, since the last one is usually the one meant

Usage: python3 false_starts.py <reel-folder>     prints what it finds in transcript.json (the export does this by itself)
"""

import difflib
import json
import re
import sys
from pathlib import Path

# words people really do say twice on purpose
OK_TWICE = {
    "had",
    "that",
    "very",
    "so",
    "no",
    "yes",
    "yeah",
    "really",
    "bye",
    "ha",
    "go",
    "knock",
    "now",
    "never",
    "more",
    "far",
    "long",
}


def norm(t):
    return re.sub(r"[^\w']+", "", str(t).lower())


def find(words, cut=()):
    """words: [{"text", "s", "e", "filler"?}] in time order. cut: indices already cut. Returns
    [{"w": [indices to cut], "kind": "doubled" | "restart" | "cut-off" | "retake", "why": "..."}], no overlaps."""
    cut = set(cut)
    live = [i for i, w in enumerate(words) if not w.get("filler") and i not in cut]
    n = [norm(words[i]["text"]) for i in live]
    found, taken = [], set()

    def add(idx, kind, why):
        idx = [i for i in idx if i not in taken]
        if idx:
            found.append({"w": idx, "kind": kind, "why": why})
            taken.update(idx)

    gap = lambda a, b: words[live[b]]["s"] - words[live[a]]["e"]  # pause between live word a and live word b
    # sentences, for retakes
    sents, cur = [], []
    for k, i in enumerate(live):
        cur.append(k)
        if re.search(r"[.?!]$", words[i]["text"]) or k == len(live) - 1:
            sents.append(cur)
            cur = []
    for a, b in zip(sents, sents[1:]):
        ta, tb = [n[k] for k in a], [n[k] for k in b]
        if len(ta) >= 4 and len(tb) >= 4 and difflib.SequenceMatcher(None, ta, tb).ratio() >= 0.75:
            add([live[k] for k in a], "retake", "said twice; the second take is kept")
    # restarts: 2-4 words repeated within the next few words, with the first try cut short
    for k in range(len(live)):
        if live[k] in taken:
            continue
        for size in (4, 3, 2):
            if k + size > len(live):
                continue
            head = n[k : k + size]
            if not all(head) or all(h in OK_TWICE for h in head):
                continue
            for j in range(k + 1, min(k + 9, len(live) - size + 1)):
                if n[j : j + size] == head and gap(j - 1, j) > -0.05 and words[live[j]]["s"] - words[live[k]]["s"] < 6:
                    # a finished sentence is not a false start
                    if any(re.search(r"[.?!]$", words[live[m]]["text"]) for m in range(k, j)):
                        break
                    if any(live[m] in taken for m in range(k, j)):
                        break  # part of a false start already found
                    add(live[k:j], "restart", "started again: the second try is kept")
                    break
            else:
                continue
            break
    # doubled words
    for k in range(len(live) - 1):
        if n[k] and n[k] == n[k + 1] and n[k] not in OK_TWICE and gap(k, k + 1) < 1.0:
            add([live[k]], "doubled", "the same word twice")
    # cut-off words: very short, a pause after, and the next word starts the same way
    for k in range(len(live) - 1):
        w, nx = words[live[k]], n[k + 1]
        if (
            len(n[k]) >= 2
            and w["e"] - w["s"] <= 0.18
            and gap(k, k + 1) >= 0.25
            and nx.startswith(n[k][:2])
            and nx != n[k]
        ):
            add([live[k]], "cut-off", "a word broken off and said again")
    found.sort(key=lambda f: f["w"][0])
    return found


if __name__ == "__main__":
    reel = Path(sys.argv[1]).expanduser()
    src = [w for w in json.load(open(reel / "transcript.json")) if w["text"].strip()]
    ws = [{"text": w["text"], "s": w["start"], "e": w["end"]} for w in src]
    for f in find(ws):
        print(
            f'{ws[f["w"][0]]["s"]:7.2f}s  {f["kind"]:8s} cut "{" ".join(ws[i]["text"] for i in f["w"])}"  ({f["why"]})'
        )
