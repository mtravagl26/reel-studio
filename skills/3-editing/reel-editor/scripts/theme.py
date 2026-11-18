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
    for d in reversed(theme_dirs(home)):                       # your own folder wins over the built-in one
        if d.is_dir():
            for p in sorted(d.iterdir()):
                if (p / "theme.json").exists() and NAME_OK.match(p.name): out[p.name] = p
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
    if isinstance(value, dict): return {k: _tokens(v, colors) for k, v in value.items()}
    if isinstance(value, list): return [_tokens(v, colors) for v in value]
    return value


def _font_file(name, folder, home):
    p = Path(name).expanduser()
    if p.is_absolute(): return str(p)
    for d in (folder, folder.parent / "_fonts", SKILL / "themes" / "_fonts", SKILL / "assets" / "fonts", Path(home) / "fonts"):
        if (d / name).exists(): return str(d / name)
    return str(Path(home) / "fonts" / name)                    # not found: the build warns and falls back, as for any missing font


def load_brand(home=None, reel=None, name=None, quiet=False):
    """brand.json with the chosen theme laid over it. Adds "_theme": {"name", "css", "cards", "dir"} when a theme applies."""
    home = Path(home or home_dir())
    brand = json.load(open(home / "brand.json"))
    if name is None and reel is not None:
        try: name = json.load(open(Path(reel) / "edit.json")).get("theme")
        except (OSError, ValueError): name = None
    name = name or brand.get("theme")
    if not name or name == "none": return brand
    folder = available(home).get(name) if NAME_OK.match(str(name)) else None
    if not folder:
        if not quiet: print(f"warning: theme {name!r} not found (have: {', '.join(available(home)) or 'none'}); using brand.json as it is")
        return brand
    theme = json.load(open(folder / "theme.json"))
    colors = brand.get("colors", {})
    out = merge(brand, _tokens(theme.get("brand", {}), colors))
    out = merge(out, _tokens(brand.get("theme_overrides", {}), colors))
    for role, f in (out.get("fonts") or {}).items():
        if isinstance(f, dict) and f.get("file"): f["file"] = _font_file(f["file"], folder, home)
    out["_theme"] = {"name": name, "dir": str(folder), "css": theme.get("css", []), "cards": _tokens(theme.get("cards", {}), colors)}
    return out


def css_for(brand, families):
    """The theme's extra CSS with color and font names filled in. `families`: {"head": "'Lora-head', ...", ...}."""
    t = brand.get("_theme")
    if not t: return ""
    c = brand.get("colors", {})
    rep = {"@main": c.get("main", "#141414"), "@pop": c.get("pop", "#B9C8A5"), "@light": c.get("light", "#FFFFFF"),
           **{f"@{r}": fam for r, fam in families.items()}}
    css = "\n".join(t["css"]) if isinstance(t["css"], list) else str(t["css"])
    css = re.sub(r"</?style[^>]*>|<[^>]*>", "", css)             # a theme is styling only: no tags can ride along
    return re.sub(r"@(main|pop|light|head|body|accent|hand)\b", lambda m: rep.get(m.group(0), m.group(0)), css)


def apply_card_defaults(brand, cards):
    t = brand.get("_theme")
    if not t: return
    for c in cards:
        for k, v in (t["cards"].get(c.get("type"), {}) or {}).items(): c.setdefault(k, v)


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["list"]:
        for n, p in available().items():
            t = json.load(open(p / "theme.json")); print(f"{n:14} {t.get('name', n)}: {t.get('summary', '')}")
    elif a[:1] == ["show"] and len(a) > 1:
        print(json.dumps(load_brand(name=a[1]), indent=1))
    else:
        sys.exit(__doc__)
