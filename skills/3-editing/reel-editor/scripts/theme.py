#!/usr/bin/env python3
"""Added by By Mel Ross (themes, 0.8.0). A theme is the style of a reel, kept apart from the brand.

  brand.json   who you are: name, colors, call to action, word list, sound levels, where files go
  theme        how it looks: fonts, caption look, title look, how cards are shaped and move

Pick one with  "theme": "editorial"  in ~/reels/brand.json, per reel with "theme" in edit.json, or for one build with
`build_reel.py <reel> --theme bold`. No theme set = brand.json exactly as before.

A theme is a folder with theme.json, looked for in ~/reels/themes/<name>/ first (your own, or a pack you added) and then in this
skill's themes/<name>/. theme.json:

  "brand"  settings laid over brand.json (fonts, captions, zoom, title_outline, colors.caption ...). Your colors stay yours:
           a theme writes "@main", "@pop" or "@light" where it wants one of them.
  "cards"  defaults per card type, used when a card does not set that field itself: {"title": {"align": "center"}}
  "css"    extra style rules added after the built-in ones. "@main" "@pop" "@light" and "@head" "@body" "@accent" "@hand"
           (the font families) are filled in.
  "menu"   the Style Menu looks that suit the theme, for whoever plans the edit. Not used by the build.

brand.json "theme_overrides": {...} is laid over the theme last, for the one or two things you want to keep your own way.
A font "file" in a theme may be a bare file name: it is looked for in the theme folder, themes/_fonts/, this skill's
assets/fonts/, then ~/reels/fonts/.

  python3 theme.py list                      the themes this machine has
  python3 theme.py show <name>               the brand that results from laying <name> over ~/reels/brand.json
"""

import copy, json, os, re, sys
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
NAME_OK = re.compile(r"^[a-z0-9][a-z0-9_-]{0,40}$")


def home_dir():
    return Path(os.environ.get("REELS_HOME", "~/reels")).expanduser()


def theme_dirs(home=None):
    return [Path(home or home_dir()) / "themes", SKILL / "themes"]


def available(home=None):
    out = {}
    for d in reversed(theme_dirs(home)):  # your own folder wins over the built-in one
        if d.is_dir():
            for p in sorted(d.iterdir()):
                if (p / "theme.json").exists() and NAME_OK.match(p.name):
                    out[p.name] = p
    return out


def merge(base, over):
    """Lay `over` on `base`: dicts merge key by key, anything else (None included) replaces."""
    out = copy.deepcopy(base)
    for k, v in (over or {}).items():
        out[k] = merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else copy.deepcopy(v)
    return out


def _tokens(value, colors):
    if isinstance(value, str) and value in ("@main", "@pop", "@light"):
        return colors.get(value[1:], {"main": "#141414", "pop": "#B9C8A5", "light": "#FFFFFF"}[value[1:]])
    if isinstance(value, dict):
        return {k: _tokens(v, colors) for k, v in value.items()}
    if isinstance(value, list):
        return [_tokens(v, colors) for v in value]
    return value


def _font_file(name, folder, home):
    p = Path(name).expanduser()
    if p.is_absolute():
        return str(p)
    for d in (
        folder,
        folder.parent / "_fonts",
        SKILL / "themes" / "_fonts",
        SKILL / "assets" / "fonts",
        Path(home) / "fonts",
    ):
        if (d / name).exists():
            return str(d / name)
    # not found: the build warns and falls back, as for any missing font
    return str(Path(home) / "fonts" / name)


def _highlight(v):
    """The clean parts of a "caption_highlight" setting: words and text = a hex color, bg = a hex color or "none"."""
    if not isinstance(v, dict):
        return {}
    hexc = lambda x: isinstance(x, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", x)
    out = {}
    if hexc(v.get("words")):
        out["words"] = v["words"]
    # 0.27.0: a box behind all the caption words, and the caption size
    if (
        hexc(v.get("box"))
        or v.get("box") == "none"
        or (
            isinstance(v.get("box"), str)
            and re.fullmatch(r"rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(0|1|0?\.\d+)\s*\)", v["box"])
        )
    ):
        out["box"] = v["box"]
    if isinstance(v.get("size"), (int, float)) and not isinstance(v.get("size"), bool) and 60 <= v["size"] <= 160:
        out["size"] = int(v["size"])
    if hexc(v.get("text")):
        out["text"] = v["text"]
    if hexc(v.get("bg")) or v.get("bg") == "none":
        out["bg"] = v["bg"]
    return out


def _with_highlight(brand, hl):
    brand["caption_highlight"] = hl
    # 0.27.0: the caption box and size picked on the pages
    if "box" in hl or "size" in hl:
        caps = dict(brand.get("captions") or {})
        if hl.get("box") == "none":
            caps.pop("bg", None)
        elif hl.get("box"):
            caps["bg"] = hl["box"]
        if hl.get("size"):
            caps["size"] = hl["size"]
        brand["captions"] = caps
    # only from the older caption_style
    if hl.get("y"):
        brand["captions"] = {**(brand.get("captions") or {}), "y": hl["y"]}
    if hl.get("words"):
        brand["colors"] = {**(brand.get("colors") or {}), "caption": hl["words"]}
    return brand


def load_brand(home=None, reel=None, name=None, quiet=False):
    """brand.json with the chosen theme laid over it. Adds "_theme": {"name", "css", "cards", "dir"} when a theme applies."""
    home = Path(home or home_dir())
    brand = json.load(open(home / "brand.json"))
    _edit = {}
    if reel is not None:
        try:
            _edit = json.load(open(Path(reel) / "edit.json"))
        except (OSError, ValueError):
            _edit = {}
        if not isinstance(_edit, dict):
            _edit = {}
    # Added by By Mel Ross (0.16.0): colors for this reel only. edit.json "colors": {"main", "pop", "light"} is laid over the
    # brand's colors before the theme reads them, so every card, caption highlight and cover uses them. Set on the pages.
    mine = (
        {
            k: v
            for k, v in (_edit.get("colors") or {}).items()
            if k in ("main", "pop", "light") and isinstance(v, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", v)
        }
        if isinstance(_edit.get("colors"), dict)
        else {}
    )
    if mine:
        brand["colors"] = {**(brand.get("colors") or {}), **mine}
    # Added by By Mel Ross (0.19.0): sound effects are the person's choice, never a theme's. They are on unless brand.json says
    # "sfx": "none"; edit.json "sfx" ("none" | "subtle" | "lots") sets it for one reel. Both are set by switches on the pages.
    sfx_own = _edit.get("sfx") if _edit.get("sfx") in ("none", "subtle", "lots") else brand.get("sfx")
    if sfx_own is not None:
        brand["sfx"] = sfx_own
    # Added by By Mel Ross (0.23.0): caption colors the person picked. "caption_highlight": {"words": "#RRGGBB" (the other words),
    # "text": "#RRGGBB" (the highlighted word), "bg": "#RRGGBB" | "none" (a box behind it)} in brand.json (every reel) or edit.json
    # (this reel). Laid on after the theme, never under it, with or without a theme. edit.json "caption_colors": {"caption",
    # "caption_accent"} is the same thing written by hand before the pages had it; it is still read, under caption_highlight.
    _old = _edit.get("caption_colors") if isinstance(_edit.get("caption_colors"), dict) else {}
    # edit.json "caption_style": {"bg", "size", "y"} is an older hand-written form of the caption box and size (one reel); still read
    _cs = _edit.get("caption_style") if isinstance(_edit.get("caption_style"), dict) else {}
    _csy = (
        {"y": int(_cs["y"])}
        if isinstance(_cs.get("y"), (int, float)) and not isinstance(_cs.get("y"), bool) and 100 <= _cs["y"] <= 1800
        else {}
    )
    hl = {
        **_highlight(brand.get("caption_highlight")),
        **_highlight({"words": _old.get("caption"), "text": _old.get("caption_accent")}),
        **_highlight({"box": _cs.get("bg"), "size": _cs.get("size")}),
        **_csy,
        **_highlight(_edit.get("caption_highlight")),
    }
    if name is None and reel is not None:
        name = _edit.get("theme")
    name = name or brand.get("theme")
    if not name or name == "none":
        return _with_highlight(brand, hl)
    folder = available(home).get(name) if NAME_OK.match(str(name)) else None
    if not folder:
        if not quiet:
            print(
                f"warning: theme {name!r} not found (have: {', '.join(available(home)) or 'none'}); using brand.json as it is"
            )
        return _with_highlight(brand, hl)
    theme = json.load(open(folder / "theme.json"))
    colors = brand.get("colors", {})
    out = merge(brand, _tokens(theme.get("brand", {}), colors))
    out = merge(out, _tokens(brand.get("theme_overrides", {}), colors))
    for role, f in (out.get("fonts") or {}).items():
        if isinstance(f, dict) and f.get("file"):
            f["file"] = _font_file(f["file"], folder, home)
    if sfx_own is not None:
        out["sfx"] = sfx_own
    else:
        out.pop("sfx", None)
    out["_theme"] = {
        "name": name,
        "dir": str(folder),
        "css": theme.get("css", []),
        "cards": _tokens(theme.get("cards", {}), colors),
    }
    return _with_highlight(out, hl)


def css_for(brand, families):
    """The theme's extra CSS with color and font names filled in. `families`: {"head": "'Lora-head', ...", ...}."""
    t = brand.get("_theme")
    if not t:
        return ""
    c = brand.get("colors", {})
    rep = {
        "@main": c.get("main", "#141414"),
        "@pop": c.get("pop", "#B9C8A5"),
        "@light": c.get("light", "#FFFFFF"),
        **{f"@{r}": fam for r, fam in families.items()},
    }
    css = "\n".join(t["css"]) if isinstance(t["css"], list) else str(t["css"])
    css = re.sub(r"</?style[^>]*>|<[^>]*>", "", css)  # a theme is styling only: no tags can ride along
    return re.sub(r"@(main|pop|light|head|body|accent|hand)\b", lambda m: rep.get(m.group(0), m.group(0)), css)


def apply_card_defaults(brand, cards):
    t = brand.get("_theme")
    if not t:
        return
    for c in cards:
        for k, v in (t["cards"].get(c.get("type"), {}) or {}).items():
            c.setdefault(k, v)


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["list"]:
        for n, p in available().items():
            t = json.load(open(p / "theme.json"))
            print(f"{n:14} {t.get('name', n)}: {t.get('summary', '')}")
    elif a[:1] == ["show"] and len(a) > 1:
        print(json.dumps(load_brand(name=a[1]), indent=1))
    else:
        sys.exit(__doc__)
