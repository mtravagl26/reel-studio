#!/usr/bin/env python3
"""Bridge between a reel folder and the Reel Review page.
  export <reel> <proposal.json> <out-dir>   build reel.json (the page's data) + assets to upload
  import <reel> <review.json>               turn the person's decisions into edl.json + edit.json for cut.py/render.sh
The cut timeline is computed by review/core.js (run with node), the same file the page uses, so review and render agree.

proposal.json (Claude writes this per reel):
  {"title", "proposedCut": [[srcStart, srcEnd], ...] (kept lines), "accentWords": ["claude", ...],
   "cards": [{"id","type","kind","what","anchor":"word","after":srcSec,"end_anchor"?,"place":[x,y,w,h], "sfx":{"name","db"}, ...build_reel fields}]}
"""

import json, os, re, shutil, subprocess, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pacing import pacing

HERE = Path(__file__).resolve().parent
CORE = HERE.parent / "review" / "core.js"
HOME = Path(os.environ.get("REELS_HOME", "~/reels")).expanduser()
norm = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())


def raw_clip(reel):  # the raw clip's name keeps its extension (raw.mov from an iPhone, raw.mp4 from Android)
    return next(iter(sorted(reel.glob("raw.*"))), reel / "raw.mov")


def node(reel_json, decisions):
    # data goes in on stdin: long clips would overflow the command-line length limit
    js = f"""const C=require({json.dumps(str(CORE))});const I=JSON.parse(require("fs").readFileSync(0,"utf8"));const R=I.r,D=I.d;
const P=C.plan(R,D);process.stdout.write(JSON.stringify({{spans:P.spans,cutDur:P.cutDur,pauses:P.pauses,
captions:C.captions(R,D,P),graphics:C.graphics(R,D,P),hash:C.hash(D)}}));"""
    return json.loads(
        subprocess.run(
            ["node", "-e", js],
            input=json.dumps({"r": reel_json, "d": decisions}),
            capture_output=True,
            text=True,
            check=True,
        ).stdout
    )


def export(reel, proposal, out):
    out.mkdir(parents=True, exist_ok=True)
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import theme as _theme  # Added by By Mel Ross (themes)

    brand = _theme.load_brand(HOME, reel, quiet=True)
    src = [w for w in json.load(open(reel / "transcript.json")) if w["text"].strip()]
    words = [{"text": w["text"], "s": round(w["start"], 3), "e": round(w["end"], 3)} for w in src]
    # Whisper's word times run back to back, hiding pauses. Measure real silences in the cleaned voice (threshold just
    # above this clip's noise floor) and pull word edges back to them, so pauses show up as gaps the review can trim.
    import array, math, wave

    wf = wave.open(str(reel / "voice.wav"))
    sr = wf.getframerate()
    pcm = array.array("h")
    pcm.frombytes(wf.readframes(wf.getnframes()))
    hop = int(sr * 0.05)
    lev = sorted(
        20 * math.log10(max(1.0, math.sqrt(sum(x * x for x in pcm[i : i + hop : 4]) / (hop / 4))) / 32768)
        for i in range(0, len(pcm) - hop, hop)
    )
    thresh = min(lev[len(lev) // 10] + 5, -20)
    sd = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-i",
            str(reel / "voice.wav"),
            "-af",
            f"silencedetect=noise={thresh:.1f}dB:d=0.15",
            "-f",
            "null",
            "-",
        ],
        capture_output=True,
        text=True,
    ).stderr
    sil = list(
        zip(
            map(float, re.findall(r"silence_start: ([\d.]+)", sd)), map(float, re.findall(r"silence_end: ([\d.]+)", sd))
        )
    )
    for a, b in sil:
        for w in words:
            if w["s"] < a < w["e"] and a - w["s"] > 0.08:
                w["e"] = round(a, 3)
            elif a <= w["s"] < b and w["e"] - b > 0.08:
                w["s"] = round(b, 3)
    # fillers ("um", "uh") found by tighten.py's Whisper pass: slot them in as removable words
    fj = reel / "fillers.json"
    if fj.exists():
        import false_starts as _fs

        _tr = json.load(open(fj))["transcription"]
        for _k, t in enumerate(_tr):
            txt = t["text"].strip()
            # 0.26.0: the filler pass also writes down a stumbled word said twice ("with with") that the main pass tidied away
            stumble = (
                _k + 1 < len(_tr)
                and norm(txt)
                and norm(txt) == norm(_tr[_k + 1]["text"])
                and norm(txt) not in _fs.OK_TWICE
                and _tr[_k + 1]["offsets"]["from"] - t["offsets"]["to"] < 1000
            )
            if norm(txt) in set(pacing(brand)["fillers"]) or stumble:
                s, e = t["offsets"]["from"] / 1000, t["offsets"]["to"] / 1000
                if not any(w["s"] < e - 0.05 and w["e"] > s + 0.05 for w in words):
                    words.append(
                        {
                            "text": txt.strip(",.").lower(),
                            "s": round(s, 3),
                            "e": round(max(e, s + (0.12 if stumble else 0.25)), 3),
                            "filler": True,
                            **({"stumble": True} if stumble else {}),
                        }
                    )
                else:  # Whisper folded the um into a neighbouring word: split it off so cutting it removes its audio
                    e = round(max(e, s + (0.12 if stumble else 0.25)), 3)
                    for w in words:
                        if w["s"] < e - 0.05 and w["e"] > s + 0.05 and not w.get("filler"):
                            # starts with the um: start after it
                            if w["s"] >= s - 0.05:
                                w["s"] = round(min(e, w["e"] - 0.05), 3)
                            elif w["e"] <= e + 0.05:
                                w["e"] = round(s, 3)  # word ends with the um: end before it
                    words.append(
                        {
                            "text": txt.strip(",.").lower() if stumble else "um",
                            "s": round(s, 3),
                            "e": e,
                            "filler": True,
                            **({"stumble": True} if stumble else {}),
                        }
                    )
        words.sort(key=lambda w: w["s"])
    keep = proposal["proposedCut"]
    proposed_cut = [
        i
        for i, w in enumerate(words)
        if not w.get("filler") and not any(a <= (w["s"] + w["e"]) / 2 <= b for a, b in keep)
    ]
    # Added by By Mel Ross (0.26.0): false starts (doubled words, restarted phrases, broken-off words, a sentence said twice)
    # are added to the proposed cut and labelled on the page. The person unticks any they want to keep.
    import false_starts

    false = false_starts.find(words, proposed_cut)
    proposed_cut = sorted(set(proposed_cut) | {i for f in false for i in f["w"]})
    json.dump(
        [{**f, "text": " ".join(words[i]["text"] for i in f["w"]), "at": words[f["w"][0]]["s"]} for f in false],
        open(reel / "false_starts.json", "w"),
        indent=1,
    )
    # pauses Claude keeps on purpose: after a question or exclamation, or longer than 0.8 s after a sentence end
    keep_pauses = [
        i
        for i in range(len(words) - 1)
        if re.search(r"[?!]$", words[i]["text"])
        or (re.search(r"[.]$", words[i]["text"]) and words[i + 1]["s"] - words[i]["e"] > 0.8)
    ]
    acc = set(proposal.get("accentWords", []))
    mode = brand.get("captions", {}).get("mode", "phrase")
    caps, cur = [], []
    for i, w in enumerate(words):
        if w.get("filler"):
            continue
        cur.append(i)
        nxt = next((j for j in range(i + 1, len(words)) if not words[j].get("filler")), None)
        if (
            mode == "word"
            or len(cur) >= 3
            or re.search(r"[.,!?;:]$", w["text"])
            or (nxt and words[nxt]["s"] - w["e"] > 0.35)
        ):
            caps.append({"w": cur, "acc": [k for k in cur if norm(words[k]["text"]) in acc]})
            cur = []
    if cur:
        caps.append({"w": cur, "acc": [k for k in cur if norm(words[k]["text"]) in acc]})
    board = []
    ENTRANCE_SFX = {
        "title": ("snap", -11),
        "block": ("swish", -12),
        "card": ("swish", -13),
        "tag": ("pop", -14),
        "note": ("swish", -13),
        "cta": ("coin", -12),
        "shot": ("swish", -12),
        "image": ("swish", -13),
        "sticker": ("pop", -13),
        "popup": ("pop", -13),
        "orbit": ("whoosh", -15),
        "polaroids": ("swish", -13),
        # the first sound each card type plays in build_reel.py
        "xlist": ("swish", -13),
        "stat": ("pop", -13),
        "tiles": ("swish", -13),
        "page": ("swish", -12),
        "motion": ("swish", -12),
        "follow": ("sparkle", -12),
        # 0.31.0: the Roundup layout
        "chapter": ("swish", -13),
        "split": ("swish", -14),
        "inset": ("swish", -14),
    }
    for c in proposal["cards"]:
        hits = [i for i, w in enumerate(words) if norm(w["text"]) == norm(c["anchor"]) and w["s"] >= c.get("after", 0)]
        if not hits:
            print("warning: anchor not found:", c["id"], c["anchor"])
            continue
        g = {k: v for k, v in c.items() if k not in ("anchor", "after", "end_anchor")}
        # Added by By Mel Ross (0.16.0): the build gives each graphic an entrance sound by its type even when the plan names none,
        # but the review page only listed sounds the plan named, so its Sound effects list could be empty for a reel that has
        # sounds. The page now shows the sound the build will use (same name and level), so it can be heard and switched off.
        # listed even when sounds are off, so the page can show what switching them on gives
        if "sfx" not in g and g.get("type") in ENTRANCE_SFX:
            g["sfx"] = {"name": ENTRANCE_SFX[g["type"]][0], "db": ENTRANCE_SFX[g["type"]][1]}
        g["w0"] = hits[0]
        if c.get("end_anchor"):
            e = [i for i, w in enumerate(words) if norm(w["text"]) == norm(c["end_anchor"]) and i >= hits[0]]
            if e:
                g["w1"] = e[0]
        board.append(g)
    reel_json = {
        "title": proposal["title"],
        "srcDur": float(
            subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(raw_clip(reel))],
                capture_output=True,
                text=True,
            ).stdout
        ),
        "speed": pacing(brand)["speed"],
        "pacing": pacing(brand),
        "words": words,
        "proposedCut": proposed_cut,
        "keepPauses": keep_pauses,
        "captions": caps,
        "board": board,
        "falseStarts": false,
        "sfxOn": brand.get("sfx", "subtle") != "none",
        # 0.16.0: the color box starts from these
        "colors": {
            k: brand.get("colors", {}).get(k, d_)
            for k, d_ in (("main", "#141414"), ("pop", "#B9C8A5"), ("light", "#FFFFFF"))
        },
        "style": {
            "capSize": brand["captions"].get("size", 104),
            "capY": brand["captions"].get("y", 1250),
            "mode": mode,
            "editorial": brand["captions"].get("style") == "editorial",
            "cap": brand["colors"].get("caption", "#FFFFFF"),
            "acc": (brand.get("caption_highlight") or {}).get("text")
            or brand["colors"].get("caption_accent", "#FF7DB8"),
            "accBg": (brand.get("caption_highlight") or {}).get("bg") or "none",
            # 0.27.0: a box behind all the words   # 0.23.0: the box behind the highlighted word
            "capBox": brand["captions"].get("bg") or "none",
            "main": brand["colors"]["main"],
            "case": brand["captions"].get("case", "lower"),
            # 0.26.0: captions high or low, and the 3 zones a caption can be moved to (same numbers as build_reel.py)
            "layout": (json.load(open(reel / "edit.json")) if (reel / "edit.json").exists() else {}).get("layout")
            or brand.get("layout")
            or "captions-low",
            "zones": {
                "top": brand["captions"].get("y_high", 290),
                "middle": 900,
                "bottom": brand["captions"].get("y", 1250),
            },
        },
        "grade": brand.get("grade"),
        # Added by By Mel Ross (0.9.0): the themes this machine has, for the page's "Look for this reel" picker
        "themes": [
            {
                "id": n,
                "name": json.load(open(p / "theme.json")).get("name", n),
                "summary": json.load(open(p / "theme.json")).get("summary", ""),
            }
            for n, p in _theme.available(HOME).items()
        ],
        "theme": (brand.get("_theme") or {}).get("name", ""),
        # Added by By Mel Ross (0.10.1): the brand's graphics amount, for the dial on the Graphics tab
        "graphicsAmount": {"minimal": "few", "balanced": "some", "busy": "lots"}.get(
            brand.get("graphics", "balanced"), "some"
        ),
    }
    P = node(reel_json, {"cut": proposed_cut})
    if false:
        print(
            f'FALSE STARTS: {len(false)} found and added to the proposed cut (listed in false_starts.json). They show on the review page as "false start"; tell the person to untick any they want to keep.'
        )
    print(
        f"{len(words)} words ({sum(1 for w in words if w.get('filler'))} fillers), {len(caps)} captions, {len(board)} graphics, "
        f"proposed cut {P['cutDur']:.1f}s, {len(P['pauses'])} pauses ({len(keep_pauses)} kept on purpose)"
    )
    json.dump(reel_json, open(out / "reel.json", "w"))
    return reel_json


def do_import(reel, review):
    reel_json = json.load(open(reel / "review_reel.json"))
    d = json.load(open(review)) if Path(review).exists() else {}
    # same defaults as the page's blank() + decisions(), so the build's fingerprint matches what the page computes
    d = {"restoredFillers": [], "restoredPauses": [], "trimmedPauses": [], "board": {}, "sfxOff": {}, **d}
    # [] is a real decision ("cut nothing"), not "unset"
    if d.get("cut") is None:
        d["cut"] = reel_json["proposedCut"]
    if d.get("captions") is None:
        d["captions"] = reel_json["captions"]
    # Added by By Mel Ross (0.9.0): keep what was done on the touch-ups page (or by hand in edit.json) since the last import
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import touchups

    carry = touchups.collect(reel)
    also_cut = [i for i in touchups.cut_words(carry, reel_json["words"]) if i not in set(d["cut"])]
    # pieces dropped on the touch-ups page become cut words here
    if also_cut:
        d["cut"] = sorted(set(d["cut"]) | set(also_cut))
        if Path(review).exists():
            saved = json.load(open(review))
            saved["cut"] = d["cut"]
            saved["updatedAt"] = f"touch-ups-{len(d['cut'])}-{also_cut[0]}"
            json.dump(saved, open(review, "w"))
    P = node(reel_json, d)
    json.dump(
        {
            "source": raw_clip(reel).name,
            "audio": "voice.wav",
            "keep": [[round(a, 3), round(b, 3)] for a, b in P["spans"]],
        },
        open(reel / "edl.json", "w"),
    )
    caps = [
        {
            "start": round(c["start"], 3),
            "end": round(c["end"], 3),
            "words": [
                {"text": re.sub(r"[.,!?;:]+$", "", w["text"]), "t": round(w["t"], 3), "accent": w["accent"]}
                for w in c["words"]
            ],
            # 0.26.0: moved on the review page
            **({"pos": c["pos"]} if c.get("pos") in ("top", "middle", "bottom", "hide") else {}),
        }
        for c in P["captions"]
        if not c.get("gone")
    ]
    cards, changes, places = [], [], []
    WHERE = {
        "center": "the middle of the screen, even where it covers part of the face",
        "top-center": "the top, above the head",
        "top-left": "the top left",
        "top-right": "the top right",
        "middle-left": "left of the face",
        "middle-right": "right of the face",
        "lower": "the bottom, in the lower third (move the captions to the top for that moment if they would overlap)",
    }
    for g in P["graphics"]:
        if g.get("gone") or g["state"] == "d":
            continue
        note = ((d.get("board") or {}).get(g["id"]) or {}).get("note")
        # 0.10.2: their own pictures
        mine = [
            f
            for f in ((d.get("board") or {}).get(g["id"]) or {}).get("files") or []
            if isinstance(f, str) and re.fullmatch(r"popups/[\w.\- ]+", f)
        ]
        if g["state"] == "c":
            changes.append(
                f"{g['id']} @ cut {g['start']:.1f}s: {note or '(no note)'}"
                + (f". Use their own picture(s), already in the reel folder: {', '.join(mine)}" if mine else "")
            )
        spec = {
            k: v for k, v in g.items() if k not in ("id", "kind", "what", "w0", "w1", "state", "place", "moved", "gone")
        }
        spec.update(start=round(g["start"], 3), end=round(g["end"], 3), id=g["id"])
        if g["id"] in (d.get("sfxOff") or {}) and d["sfxOff"][g["id"]]:
            spec["sfx"] = False
        # Added by By Mel Ross (0.16.0): where they put it on the review page. A layer applies to any card; a place is written
        # straight onto a popup, and passed to you in words for the other kinds (their place is set by different fields).
        _b = (d.get("board") or {}).get(g["id"]) or {}
        _where, _layer = _b.get("where") if _b.get("where") in WHERE else None, (
            _b.get("layer") if _b.get("layer") in ("front", "behind") else None
        )
        if _layer == "behind":
            spec["layer"] = "behind"
        elif _layer == "front":
            spec.pop("layer", None)
            spec["layer"] = "front"
        # Added by By Mel Ross (0.28.0): words changed on the review page go straight into the card
        WORD_KEYS = {"text": 80, "title": 80, "sub": 30, "label": 60, "value": 16, "delta": 12}
        for k, v in (_b.get("set") or {}).items() if isinstance(_b.get("set"), dict) else []:
            if k in WORD_KEYS and isinstance(v, str) and (k in spec or k in ("sub", "delta")):
                v = re.sub(r"[\r\n\t]+", " ", v).strip()[: WORD_KEYS[k]]
                if v or k in ("sub", "delta"):
                    spec[k] = v
            elif k in ("rows", "items") and isinstance(v, list) and k in spec:
                rows = [re.sub(r"[\r\n\t]+", " ", str(x)).strip()[:40] for x in v if str(x).strip()][:6]
                if rows:
                    spec[k] = rows
        if _where and spec.get("type") == "popup" and _where != "lower":
            spec["pos"] = _where
            spec.pop("x", None)
            spec.pop("y", None)
        elif _where:
            places.append(f"{g['id']} ({spec.get('type', 'card')}) @ cut {g['start']:.1f}s: {WHERE[_where]}")
        cards.append(spec)
    punch, last = [], -9.0  # punch-ins on sentence starts in the cut, at most every ~6 s (emphasis, not every line)
    for c in caps:
        if c["start"] - last > 6:
            punch.append(c["start"])
            last = c["start"]
    out = {"captions": caps, "punch": punch, "cards": cards, "hash": P["hash"]}
    # picked on the review page ("" = my brand as it is)
    if d.get("theme") is not None:
        out["theme"] = d["theme"] or "none"
    # 0.19.0: the master switch on the review page
    if d.get("sfxAll") in ("on", "off"):
        out["sfx"] = "subtle" if d["sfxAll"] == "on" else "none"
    # 0.16.0: colors for this reel, picked on the review page
    if isinstance(d.get("colors"), dict):
        _col = {
            k: v
            for k, v in d["colors"].items()
            if k in ("main", "pop", "light") and isinstance(v, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", v)
        }
        if _col:
            out["colors"] = _col
    # 0.26.0: captions above the head or at the bottom
    if d.get("layout") in ("captions-high", "captions-low"):
        out["layout"] = d["layout"]
    # 0.23.0: caption colors picked on the review page
    if isinstance(d.get("highlight"), dict):
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import theme as _th

        _hl = _th._highlight(d["highlight"])
        if _hl:
            out["caption_highlight"] = _hl
    keep = [[round(a, 3), round(b, 3)] for a, b in P["spans"]]
    touchups.ensure_ids(out)
    # what this import wrote, before touch-ups: the next import compares with it
    touchups.save_base(reel, out, keep, reel_json.get("speed") or 1.0)
    kept, lost = touchups.apply(carry, out, keep, reel_json.get("speed") or 1.0)
    json.dump(out, open(reel / "edit.json", "w"), indent=1)
    print(
        f"cut {P['cutDur']:.1f}s from {len(P['spans'])} spans; {len(caps)} captions; {len(cards)} graphics; hash {P['hash']}"
    )
    if also_cut:
        print(
            f"TOUCH-UPS: {len(also_cut)} word(s) from pieces dropped on the touch-ups page are now cut in the review decisions (words {also_cut[0]}-{also_cut[-1]}). On the claude.ai review page, write the same cut list into review/current so the page matches."
        )
    for k in kept:
        print("TOUCH-UP KEPT:", k)
    for k in lost:
        print("TOUCH-UP NOT KEPT (tell them):", k)
    for c in changes:
        print("CHANGE REQUESTED:", c)
    for c in places:
        print("PLACE IT (set this card's position in edit.json before the render):", c)
    # Added by By Mel Ross (0.10.1): graphics asked for on the Graphics tab. The page can't build them; you do, in edit.json, before the render.
    AMT = {
        "few": "minimal (about 1 every 8-12 s)",
        "some": "balanced (about 1 every 4-6 s)",
        "lots": "busy (about 1 every 2-4 s)",
    }
    if d.get("amount") in AMT:
        print(
            f'GRAPHICS AMOUNT: {AMT[d["amount"]]} for this reel. Add or drop cards in edit.json to match, then export the review again so they can see the new plan.'
        )
    KIND = {
        "choose": "your choice of card",
        "title": "title card",
        "list": "card (rows)",
        "checks": "xlist",
        "label": "tag",
        "note": "note",
        "clip": 'popup whose src is their video clip (plays in a rounded window, no sound; "from" = seconds in, "loop")',
        "number": "stat",
        "photo": "image, shot or popup",
        "gif": "popup with a GIF (references/giphy.md)",
        "carousel": "motion carousel-*",
        "chart": "motion chart (references/motions.md)",
        "counter": "motion count-up",
        "follow": "follow card",
        "social": "motion comment / chat / notification",
        "orbit": "orbit",
    }
    for w in d.get("wanted") if isinstance(d.get("wanted"), list) else []:
        # audit 3: a damaged decisions file must not stop the import; 0.16.0: done = already in the plan
        if not isinstance(w, dict) or w.get("done"):
            continue
        print(
            f'GRAPHIC WANTED: {KIND.get(w.get("kind"), "your choice of card")} at the line "{w.get("line", "")}"'
            + (f': {w["note"]}' if w.get("note") else "")
            + (
                f' Use their own picture(s), already in the reel folder: {", ".join(f for f in w["files"] if isinstance(f, str) and re.fullmatch(r"popups/[\w.\- ]+", f))}'
                if w.get("files")
                else ""
            )
            + (f' Put it in {WHERE[w["where"]]}.' if w.get("where") in WHERE else "")
            + (
                f' Layer: {"behind the speaker" if w["layer"] == "behind" else "in front"}.'
                if w.get("layer") in ("front", "behind")
                else ""
            )
            + f". Add it to edit.json. If it needs pictures or numbers you don't have, ask them before the render. So the review page shows it: add the same card to proposal.json, run export again, then run `review_sync.py wanted-done <reel> {w.get('id', 'all')}`."
        )
    for k, n in (d.get("notes") or {}).items():
        if n.strip():
            print(f"NOTE ({k}):", n.strip())
    if (d.get("brandRequest") or "").strip():
        print("BRAND CHANGE REQUESTED (only apply if confirmed):", d["brandRequest"].strip())
    for r in d.get("revisions") or []:
        print(
            f"REVISION @ {'rough cut' if r.get('rough') else 'cut'} {r['t']:.1f}s"
            + (" (written before the build; act on it before rendering)" if r.get("rough") else "")
            + ":",
            r["text"],
        )


if __name__ == "__main__":
    cmd, reel = sys.argv[1], Path(sys.argv[2]).expanduser()
    if cmd == "export":
        r = export(reel, json.load(open(sys.argv[3])), Path(sys.argv[4]))
        json.dump(r, open(reel / "review_reel.json", "w"))
    elif cmd == "import":
        do_import(reel, sys.argv[3])
    elif cmd == "wanted-done":
        # Added by By Mel Ross (0.16.0): mark graphics they asked for as added to the plan, so the page stops listing them as
        # "You asked for" and the next import does not ask for them again. usage: wanted-done <reel> <id>|all
        f = reel / "review_db" / "review" / "current.json"
        d = json.load(open(f))
        which = sys.argv[3] if len(sys.argv) > 3 else "all"
        n = 0
        for w in d.get("wanted") if isinstance(d.get("wanted"), list) else []:
            if isinstance(w, dict) and not w.get("done") and which in ("all", str(w.get("id"))):
                w["done"] = True
                n += 1
        d["updatedAt"] = f"wanted-done-{n}-{which}"
        json.dump(d, open(f, "w"))
        print(f"{n} asked-for graphic(s) marked as added to the plan")
    else:
        sys.exit(__doc__)
