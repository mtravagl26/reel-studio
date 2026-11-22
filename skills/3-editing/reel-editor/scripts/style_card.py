#!/usr/bin/env python3
"""Added by By Mel Ross (0.10.0). The style card: 6 plain lines that say how this reel will look and sound, BEFORE it is built.

Usage: python3 style_card.py <reel-folder> [--looks H3,C2,L8] [--theme bold]

Reads what is already decided, in this order: --looks / --theme, the reel's style-picks.json (picked on the looks page),
edit.json (when it exists), then brand.json with its theme laid over it. Prints:

  Hook      ...
  Captions  ...
  Layout    ...
  Motion    ...
  Sound     ...
  Color    ...

Show the 6 lines to the person and wait for a yes before the first render. Nothing here is a guess about footage:
a line says "not decided yet" when nothing sets it."""
import argparse, json, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent)); import theme as _theme, pacing as _pacing

SKILL = Path(__file__).resolve().parent.parent
USABLE = {"built", "partial", "cut-choice"}

def _load(p):
    try: return json.load(open(p))
    except (OSError, ValueError): return None

def card(reel, home, looks=None, theme=None):
    reel = Path(reel); menu = json.load(open(SKILL / "assets" / "style-menu.json"))["looks"]
    picks = _load(reel / "style-picks.json")
    if not isinstance(picks, dict): picks = {}
    if not isinstance(picks.get("ids"), list): picks["ids"] = []
    if not isinstance(picks.get("extras"), list): picks["extras"] = []
    if not isinstance(picks.get("theme"), str): picks["theme"] = None
    ids = [str(i).strip().upper() for i in (looks.split(",") if looks else picks["ids"]) if str(i).strip()]
    theme = theme or picks.get("theme") or None
    notes = [f"{i} is not in the Style Menu" for i in ids if i not in menu] + \
            [f"{i} ({menu[i]['name']}) is not built yet" for i in ids if i in menu and menu[i]["status"] not in USABLE]
    ids = [i for i in ids if i in menu and menu[i]["status"] in USABLE]
    brand = _theme.load_brand(home, reel, theme, quiet=True) if theme else _theme.load_brand(home, reel, quiet=True)
    for i in ids:                                                  # a captions look carries its own brand settings
        over = (menu[i].get("recipe") or {}).get("brand")
        if over: brand = _theme.merge(brand, over)
    edit = _load(reel / "edit.json")
    if not isinstance(edit, dict): edit = {}
    cards = [c for c in (edit.get("cards") if isinstance(edit.get("cards"), list) else []) if isinstance(c, dict) and not c.get("off")]
    if not isinstance(edit.get("sfx_events"), list): edit["sfx_events"] = []
    by = lambda g: [f"{i} {menu[i]['name']}" for i in ids if menu[i]["group"].lower().startswith(g)]
    named = lambda c: " ".join((c.get("text") or c.get("label") or c.get("name") or "").replace("/", " ").split())

    hook = by("hook"); first = next((c for c in cards if c.get("type") == "title"), None)
    if not hook and first: hook = [f'title card "{named(first)}"']
    cap = brand.get("captions") or {}; fonts = brand.get("fonts") or {}
    caps = by("caption") or []
    caps.append(f'{"one word at a time" if cap.get("mode") == "word" else "a phrase at a time"}, {(fonts.get("body") or {}).get("family", "brand font")}, size {cap.get("size", 92)}')
    layout = by("layout")
    kinds = {}
    for c in cards:
        if c is not first: kinds[c.get("type", "card")] = kinds.get(c.get("type", "card"), 0) + 1
    extras = {x["id"]: x for x in json.load(open(SKILL / "assets" / "style-extras.json"))["extras"]}
    layout += [f'{i} {extras[i]["name"]}' + (f' (needs {extras[i]["needs"]})' if extras[i].get("needs") else "") for i in picks["extras"] if isinstance(i, str) and i in extras]
    if kinds: layout.append("in the edit now: " + ", ".join(f"{n} {k}" for k, n in sorted(kinds.items())))
    zoom = brand.get("zoom") or {}; pace = _pacing.pacing(brand)
    motion = [f'zoom to {zoom.get("scale", 1.04)}x over {zoom.get("seconds", 2.5)} s, about every {zoom.get("every", 6.0):g} s',
              f'{brand.get("pacing", "natural")} pacing' + (f', {pace["speed"]:g}x speed' if pace["speed"] != 1 else "")]
    music = edit.get("music") or brand.get("music"); sfx = [e for e in edit["sfx_events"] if isinstance(e, dict) and not e.get("off")]
    sound = [f"music: {Path(str(music)).name}" if music else "no music bed",
             ("no sound effects" if brand.get("sfx") in (False, "off", "none") else "a sound as each card comes on") + (f", plus {len(sfx)} placed by hand" if sfx else "")]
    col = brand.get("colors") or {}; tname = (brand.get("_theme") or {}).get("name") if isinstance(brand.get("_theme"), dict) else brand.get("_theme")
    color = [f"{tname} theme" if tname else "your brand as it is", f'main {col.get("main", "?")}, highlight {col.get("pop", "?")}', f'grade: {brand.get("grade") or "none"}']
    import kit as _kit
    k = _kit.load(home, reel, brand, quiet=True)                # 0.11.0: what the cards are made of
    if k: color.append(f'materials: {k["name"]}' + (" (stand-in art, swap before posting)" if k["placeholder"] else ""))
    rows = [("Hook", hook or ["not decided yet: opens on the first line, no title card"]), ("Captions", caps),
            ("Layout", layout or ["not decided yet: no cards picked"]), ("Motion", motion), ("Sound", sound), ("Color", color)]
    return [f"{k:<9} {'; '.join(v)}" for k, v in rows], notes

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("reel"); ap.add_argument("--looks"); ap.add_argument("--theme"); a = ap.parse_args()
    home = Path(os.environ.get("REELS_HOME", "~/reels")).expanduser()
    if not (home / "brand.json").exists():
        sys.exit(f"No brand yet: {home / 'brand.json'} is missing. Run the brand setup first (references/setup-interview.md), then the style card.")
    lines, notes = card(Path(a.reel).expanduser(), home, a.looks, a.theme)
    print("\n".join(lines))
    for n in notes: print("NOTE (tell them):", n)
