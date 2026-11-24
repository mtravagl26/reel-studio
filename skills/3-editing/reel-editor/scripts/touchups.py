#!/usr/bin/env python3
"""Added by By Mel Ross (0.9.0). Keeps touch-ups when a reel is rebuilt from the review page.

`review_sync.py import` writes edit.json from the review decisions. Before this, that wiped everything done afterwards on the
touch-ups page (and anything fixed by hand in edit.json): added text, popups and sounds, fixed caption words, dropped pieces.

How it works. Each import saves what it wrote as editor/import-base.json. At the next import:
  1. collect(): compare that base with edit.json as it is now. The differences are the touch-ups. Times are turned into moments
     in the raw clip, so they survive a different cut.
  2. the pieces dropped on the touch-ups page become cut words in the review decisions (so the review page shows them cut too).
  3. apply(): lay the touch-ups over the freshly written edit. A touch-up whose moment is no longer in the reel is left out and
     reported, never guessed at.
The edit as it was before the import is kept in editor/pre-import/.
"""
import copy, json, secrets, shutil
from pathlib import Path

BUILT_KEYS = {"captions", "punch", "cards", "hash", "theme", "colors", "caption_highlight", "sfx", "sfx_events"}   # what an import writes; any other key in edit.json was added by hand
TIME_KEYS = ("start", "end")
EPS = 0.03


class Timeline:
    """Reel time <-> raw-clip time for a list of kept spans played at `speed`."""
    def __init__(self, keep, speed):
        self.keep = [(float(a), float(b)) for a, b in keep]; self.speed = float(speed) or 1.0
        self.starts, t = [], 0.0
        for a, b in self.keep: self.starts.append(t); t += (b - a) / self.speed
        self.length = t

    def to_src(self, t):
        if t is None or not self.keep: return None
        for (a, b), s in zip(self.keep, self.starts):
            if t < s + (b - a) / self.speed - 1e-9: return a + max(t - s, 0.0) * self.speed
        return self.keep[-1][1]

    def to_reel(self, src):
        """The reel time of a raw-clip moment, or None when that moment is cut."""
        if src is None: return None
        for (a, b), s in zip(self.keep, self.starts):
            if a - 1e-6 <= src <= b + 1e-6: return s + (min(max(src, a), b) - a) / self.speed
        return None


def _load(p, default=None):
    try: return json.load(open(p))
    except (OSError, ValueError): return default


def ensure_ids(edit):
    for c in edit.get("cards") or []:
        if not c.get("id"): c["id"] = secrets.token_hex(3)
    for e in edit.get("sfx_events") or []:
        if not e.get("id"): e["id"] = secrets.token_hex(3)


def save_base(reel, edit, keep, speed):
    d = Path(reel) / "editor"; d.mkdir(exist_ok=True)
    json.dump({"edit": edit, "keep": keep, "speed": speed}, open(d / "import-base.json", "w"), indent=1)


def _words(edit, tl):
    return [(tl.to_src(w["t"]), w) for c in edit.get("captions") or [] for w in c.get("words") or []]


def _items(base_list, cur_list, tl_base, tl_cur, time_keys):
    """Added / changed / deleted entries of a list of things with ids. Times are compared and carried as raw-clip moments."""
    base = {x["id"]: x for x in base_list if x.get("id")}
    out = {"added": [], "changed": [], "deleted": []}
    seen = set()
    for x in cur_list:
        i = x.get("id")
        src = {k: tl_cur.to_src(x[k]) for k in time_keys if x.get(k) is not None}
        if not i or i not in base:
            out["added"].append({"item": copy.deepcopy(x), "src": src}); continue
        seen.add(i); b = base[i]
        fields = {k: v for k, v in x.items() if k not in time_keys and k != "id" and b.get(k) != v}
        gone = [k for k in b if k not in x and k not in time_keys and k != "id"]
        moved = {k: src[k] for k in src if b.get(k) is None or abs(src[k] - tl_base.to_src(b[k])) > EPS * tl_cur.speed + 1e-6}
        if fields or gone or moved: out["changed"].append({"id": i, "set": copy.deepcopy(fields), "unset": gone, "src": moved})
    out["deleted"] = [i for i in base if i not in seen]
    return out


def collect(reel):
    """The touch-ups made since the last import, or None when there is nothing to compare with (first import, or an older reel)."""
    reel = Path(reel)
    base = _load(reel / "editor" / "import-base.json"); cur = _load(reel / "edit.json"); edl = _load(reel / "edl.json")
    if not base or not cur or not edl:
        # an older reel (imported before 0.9.0) has nothing to compare with: keep a copy of the edit so nothing is lost for good
        if cur and (reel / "editor" / "state.json").exists():
            backup = reel / "editor" / "pre-import"; backup.mkdir(parents=True, exist_ok=True)
            for n in ("edit.json", "edl.json"):
                if (reel / n).exists(): shutil.copyfile(reel / n, backup / n)
            return {"legacy": True}
        return None
    speed = base.get("speed") or 1.0
    tl_base, tl_cur = Timeline(base["keep"], speed), Timeline(edl.get("keep") or base["keep"], speed)
    state = _load(reel / "editor" / "state.json") or {}
    dropped = [[p["a"], p["b"]] for p in state.get("pieces") or [] if not p.get("kept", True)]
    if not dropped:                                              # no state file: a kept span that is gone from edl.json was dropped
        now = {(round(a, 3), round(b, 3)) for a, b in tl_cur.keep}
        dropped = [[a, b] for a, b in tl_base.keep if (round(a, 3), round(b, 3)) not in now and not any(x <= a and b <= y for x, y in tl_cur.keep)]
    was = [(s, w) for s, w in _words(base["edit"], tl_base)]
    fixes = []
    for src, w in _words(cur, tl_cur):
        b = next((bw for bs, bw in was if abs(bs - src) <= EPS * speed + 1e-6), None)
        if b and (b.get("text") != w.get("text") or bool(b.get("accent")) != bool(w.get("accent"))):
            fixes.append({"src": src, "text": w.get("text"), "accent": bool(w.get("accent")), "was": b.get("text")})
    t = {"speed": speed, "dropped": dropped, "words": fixes,
         "cards": _items(base["edit"].get("cards") or [], cur.get("cards") or [], tl_base, tl_cur, TIME_KEYS),
         "sounds": _items(base["edit"].get("sfx_events") or [], cur.get("sfx_events") or [], tl_base, tl_cur, ("t",)),
         "extra": {k: copy.deepcopy(v) for k, v in cur.items() if k not in BUILT_KEYS and base["edit"].get(k) != v},
         "theme": cur.get("theme") if cur.get("theme") != base["edit"].get("theme") else None,
         "colors": cur.get("colors") if cur.get("colors") != base["edit"].get("colors") else None,
         "highlight": cur.get("caption_highlight") if cur.get("caption_highlight") != base["edit"].get("caption_highlight") else None,   # 0.23.0
         "sfx": cur.get("sfx") if cur.get("sfx") != base["edit"].get("sfx") else None}   # 0.19.0: sound effects on or off for this reel   # 0.16.0: this reel's own colors
    # a card that only disappeared because its piece was dropped is not a deliberate delete
    in_drop = lambda src: src is not None and any(a - 1e-6 <= src <= b + 1e-6 for a, b in dropped)
    by_id = {c["id"]: c for c in base["edit"].get("cards") or [] if c.get("id")}
    t["cards"]["deleted"] = [i for i in t["cards"]["deleted"] if not in_drop(tl_base.to_src(by_id[i].get("start")))]
    backup = reel / "editor" / "pre-import"; backup.mkdir(parents=True, exist_ok=True)
    for n in ("edit.json", "edl.json"):
        if (reel / n).exists(): shutil.copyfile(reel / n, backup / n)
    # the dropped pieces are handed to the review decisions once; the touch-ups page starts its keep/drop list again from the new cut
    if (reel / "editor" / "state.json").exists(): shutil.move(str(reel / "editor" / "state.json"), str(backup / "state.json"))
    return t


def cut_words(touch, words):
    """Indexes of the review page's words that sit inside a piece dropped on the touch-ups page."""
    if not touch or touch.get("legacy"): return []
    return [i for i, w in enumerate(words) if any(a - 1e-6 <= w["s"] and w["e"] <= b + 1e-6 for a, b in touch["dropped"])]


def _place(src, tl, length):
    """Where a carried start/end lands in the new reel: (start, end), or None when the moment it starts on is cut."""
    s = tl.to_reel(src.get("start")); e = tl.to_reel(src.get("end")) if src.get("end") is not None else None
    if s is None: return None                                   # it was put on a moment that is gone: leave it out and say so
    if src.get("end") is not None:
        if e is None or e < s + 0.3: e = min(s + max(length or 2.5, 0.3), tl.length)
        return round(s, 3), round(max(e, s + 0.3), 3)
    return round(s, 3), None


def apply(touch, edit, keep, speed):
    """Lay the collected touch-ups over a freshly imported edit (in place). Returns (kept, not_kept): lists of plain sentences."""
    if not touch: return [], []
    if touch.get("legacy"):
        return [], ["this reel was built before touch-ups carried over, so changes made on the touch-ups page were replaced by this import. The edit as it was is saved in editor/pre-import/edit.json"]
    tl = Timeline(keep, speed); kept, lost = [], []
    name = lambda c: f'{c.get("type", "sound")} "{str(c.get("text") or c.get("name") or (c.get("src")[0] if isinstance(c.get("src"), list) else c.get("src")) or "")[:30]}"'
    cards = edit.setdefault("cards", [])
    for a in touch["cards"]["added"]:
        c = copy.deepcopy(a["item"]); span = (c.get("end") or 0) - (c.get("start") or 0)
        at = _place(a["src"], tl, span)
        if not at: lost.append(f"{name(c)}: the moment it sat on is cut now"); continue
        c["start"] = at[0]
        if at[1] is not None: c["end"] = at[1]
        cards.append(c); kept.append(f"{name(c)} at {at[0]:.1f}s")
    for ch in touch["cards"]["changed"]:
        c = next((x for x in cards if x.get("id") == ch["id"]), None)
        if not c: lost.append(f"a change to graphic {ch['id']}: that graphic is not in this cut"); continue
        c.update(copy.deepcopy(ch["set"]))
        for k in ch["unset"]: c.pop(k, None)
        if ch["src"]:
            src = {"start": ch["src"].get("start", tl.to_src(c.get("start"))), "end": ch["src"].get("end", tl.to_src(c.get("end")) if c.get("end") is not None else None)}
            at = _place(src, tl, (c.get("end") or 0) - (c.get("start") or 0))
            if at:
                c["start"] = at[0]
                if at[1] is not None: c["end"] = at[1]
        kept.append(f"your changes to {name(c)}")
    for i in touch["cards"]["deleted"]:
        n = len(cards); cards[:] = [x for x in cards if x.get("id") != i]
        if len(cards) < n: kept.append(f"graphic {i} stays deleted")
    cards.sort(key=lambda x: x.get("start") or 0)
    sounds = edit.get("sfx_events") or []
    for a in touch["sounds"]["added"]:
        e = copy.deepcopy(a["item"]); t = tl.to_reel(a["src"].get("t"))
        if t is None: lost.append(f"{name(e)}: the moment it sat on is cut now"); continue
        e["t"] = round(t, 3); sounds.append(e); kept.append(f"{name(e)} at {t:.1f}s")
    for ch in touch["sounds"]["changed"]:
        e = next((x for x in sounds if x.get("id") == ch["id"]), None)
        if not e: continue
        e.update(ch["set"])
        for k in ch["unset"]: e.pop(k, None)
        if "t" in ch["src"] and tl.to_reel(ch["src"]["t"]) is not None: e["t"] = round(tl.to_reel(ch["src"]["t"]), 3)
    sounds[:] = [x for x in sounds if x.get("id") not in set(touch["sounds"]["deleted"])]
    if sounds: edit["sfx_events"] = sorted(sounds, key=lambda x: x.get("t") or 0)
    now = _words(edit, tl); fixed = 0
    for f in touch["words"]:
        near = [(abs(s - f["src"]), w) for s, w in now if abs(s - f["src"]) <= EPS * speed + 1e-6]
        was = f.get("was")
        if was is not None:
            # 0.16.0: a fix goes on the word it was made on, never on a neighbour. When the word at that moment is a different
            # word now (timing moved by a re-cut or a caption edit on the review page), look a little either side for the
            # same word; if it is not there, say so instead of changing another word.
            same = lambda w: w.get("text") in (was, f["text"])
            hit = [x for x in near if same(x[1])] or sorted(((abs(s - f["src"]), w) for s, w in now if abs(s - f["src"]) <= 0.75 * speed and same(w)), key=lambda x: x[0])
            if not hit:
                if near: lost.append(f'the caption fix "{was}" to "{f["text"]}": the word at that moment is "{near[0][1].get("text")}" now, so it was left alone. Check that caption')
                continue                                        # no word there at all: it is cut now, nothing to fix
            w = hit[0][1]
        else:
            if not near: continue                               # that word is cut now: nothing to fix
            w = min(near, key=lambda x: x[0])[1]
        w["text"] = f["text"]; w["accent"] = f["accent"]; fixed += 1
    if fixed: kept.append(f"{fixed} caption word fix{'es' if fixed != 1 else ''}")
    for k, v in touch["extra"].items(): edit[k] = v; kept.append(f'the "{k}" setting added by hand')
    if touch.get("theme") and "theme" not in edit: edit["theme"] = touch["theme"]; kept.append(f'the {touch["theme"]} theme')
    if touch.get("sfx") and "sfx" not in edit: edit["sfx"] = touch["sfx"]; kept.append("sound effects " + ("off" if touch["sfx"] == "none" else "on"))
    if touch.get("colors") and "colors" not in edit: edit["colors"] = touch["colors"]; kept.append("this reel's colors")
    if touch.get("highlight") and "caption_highlight" not in edit: edit["caption_highlight"] = touch["highlight"]; kept.append("this reel's highlighted word colors")
    if touch["dropped"]: kept.append(f'{len(touch["dropped"])} dropped piece{"s" if len(touch["dropped"]) != 1 else ""} (now shown as cut words on the review page)')
    return kept, lost
