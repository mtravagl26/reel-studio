#!/usr/bin/env python3
"""Added by By Mel Ross (material kits, 0.11.0). A material kit is a folder of real pictures that cards are built from:
a sheet of paper, a strip of tape, a label, numbered stickers. With a kit on, a list card is a taped sheet of paper instead
of a drawn white box. A theme sets fonts and motion; a kit sets what things are made of. They work together or alone.

Pick one with  "kit": "<name>"  in ~/reels/brand.json, per reel with "kit" in edit.json, in a theme's "brand" block, or for one
build with `build_reel.py <reel> --kit <name>`. "kit": "none" switches it off. No kit set = every card drawn as before.

A kit is a folder with kit.json, looked for in ~/reels/kits/<name>/ first (your own) and then in this skill's kits/<name>/:

  { "name": "Desk paper", "summary": "one line",
    "placeholder": false,                 true only for stand-in art; the build then says so every time
    "materials": {
      "paper":    {"file": "paper.png"},                    a sheet. Stretched to the card, so keep edges soft, no writing on it
      "tape":     {"file": "tape.png", "width": 260},       a strip, wider than tall. width = how wide to draw it, in reel px
      "label":    {"file": "label.png"},                    a small tag or sticker shape, stretched behind a step label
      "stickers": {"1": "n1.png", "2": "n2.png", ...}       numbered stickers for list rows (square pictures)
    },
    "ink": "#2b2b2b"                      text color on the paper and the label (default: the brand's main color)
  }

Every material is optional: a card uses what the kit has and draws the rest the plain way. Pictures are PNG or WebP with a
see-through background, about 1200 px on the long side. Make them yourself: photograph real paper and tape on a plain
surface, cut out the background, save as PNG. Use only pictures you made or have the right to ship. references/material-kits.md

  python3 kit.py list                 the kits this machine has
  python3 kit.py check <name>         which materials a kit has and which files are missing
"""
import json, os, re, sys
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
NAME_OK = re.compile(r"^[a-z0-9][a-z0-9_-]{0,40}$")
FILE_OK = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 ._-]{0,80}\.(png|webp)$")      # a bare file name inside the kit folder, nothing else
MATERIALS = ("paper", "tape", "label")


def home_dir():
    return Path(os.environ.get("REELS_HOME", "~/reels")).expanduser()


def available(home=None):
    out = {}
    for d in (SKILL / "kits", Path(home or home_dir()) / "kits"):            # your own folder wins over the built-in one
        if d.is_dir():
            for p in sorted(d.iterdir()):
                if (p / "kit.json").exists() and NAME_OK.match(p.name): out[p.name] = p
    return out


def _file(folder, name, problems, what):
    if not isinstance(name, str) or not FILE_OK.match(name):
        problems.append(f"{what}: {name!r} must be a .png or .webp file name inside the kit folder"); return None
    p = folder / name
    if not p.is_file(): problems.append(f"{what}: {name} is missing from the kit folder"); return None
    return p


def read(folder):
    """kit.json with every material resolved to a real file. Returns (kit, problems); a material with a problem is left out."""
    raw = json.load(open(folder / "kit.json")); problems = []; mats = raw.get("materials") or {}
    kit = {"id": folder.name, "name": raw.get("name", folder.name), "summary": raw.get("summary", ""), "dir": str(folder),
           "placeholder": bool(raw.get("placeholder")), "ink": raw.get("ink") if re.match(r"^#[0-9a-fA-F]{3,8}$", str(raw.get("ink", ""))) else None,
           "materials": {}, "stickers": {}}
    for key in MATERIALS:
        m = mats.get(key)
        if not m: continue
        m = {"file": m} if isinstance(m, str) else m
        p = _file(folder, m.get("file"), problems, key)
        if p: kit["materials"][key] = {"path": str(p), "width": int(m["width"]) if str(m.get("width", "")).isdigit() else None}
    for n, name in (mats.get("stickers") or {}).items():
        p = _file(folder, name, problems, f"sticker {n}")
        if p: kit["stickers"][str(n)] = str(p)
    return kit, problems


def load(home=None, reel=None, brand=None, name=None, quiet=False):
    """The kit to build with, or None. Order: `name` (--kit), the reel's edit.json "kit", then brand["kit"] (brand.json or its theme)."""
    home = Path(home or home_dir())
    if name is None and reel is not None:
        try: name = json.load(open(Path(reel) / "edit.json")).get("kit")
        except (OSError, ValueError): name = None
    name = name or (brand or {}).get("kit")
    if not name or name == "none": return None
    folder = available(home).get(name) if NAME_OK.match(str(name)) else None
    if not folder:
        if not quiet: print(f"warning: material kit {name!r} not found (have: {', '.join(available(home)) or 'none'}); cards are drawn the plain way")
        return None
    kit, problems = read(folder)
    if not quiet:
        for p in problems: print(f"warning: kit {name}: {p}")
        if kit["placeholder"]:
            print(f"NOTE (tell them): the kit \"{kit['name']}\" is stand-in art, there so the layout can be judged. Swap in their own paper, tape and stickers before posting (references/material-kits.md).")
    return kit


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["list"]:
        for n, p in available().items():
            k, _ = read(p); print(f"{n:14} {k['name']}: {k['summary']}" + ("  [stand-in art]" if k["placeholder"] else ""))
    elif a[:1] == ["check"] and len(a) > 1:
        folder = available().get(a[1]) or sys.exit(f"no kit called {a[1]} (have: {', '.join(available()) or 'none'})")
        k, problems = read(folder)
        print(f"{k['name']} ({folder})"); print("  has:", ", ".join(list(k["materials"]) + [f"sticker {n}" for n in k["stickers"]]) or "nothing usable")
        print("  not in this kit:", ", ".join(m for m in MATERIALS if m not in k["materials"]) or "nothing")
        for p in problems: print("  PROBLEM:", p)
        sys.exit(1 if problems else 0)
    else:
        sys.exit(__doc__)
