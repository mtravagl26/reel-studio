#!/usr/bin/env python3
"""Added by By Mel Ross (0.10.0). Write the Style Menu page as ONE stand-alone HTML file (no server, nothing from the internet).

Usage: python3 style_menu_page.py [--out looks.html]      default: ~/reels/looks.html

The page shows every usable look in assets/style-menu.json as a sketch with an Add button, plus the themes, and a
"Copy the request" button that writes the line to hand to the assistant ("Edit my clip with H3, C2, L8 ..."). The same page
is served for a reel at <reel link>/styles, where the picks are also saved in the reel folder (style-picks.json)."""
import argparse, json, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent)); import theme as _theme

SKILL = Path(__file__).resolve().parent.parent

def page(home):
    looks = json.load(open(SKILL / "assets" / "style-menu.json"))["looks"]
    data = {"reel": None, "canSave": False, "picks": {"ids": [], "extras": [], "theme": ""},
            "extras": json.load(open(SKILL / "assets" / "style-extras.json"))["extras"],
            "looks": [{"id": i, "name": l["name"], "group": l["group"], "status": l["status"], "missing": l.get("missing"), "needs": l.get("needs"), "does": l.get("does"), "recipe": l.get("recipe")} for i, l in looks.items()],
            "themes": [{"id": n, "name": t.get("name", n), "summary": t.get("summary", "")}
                       for n, t in ((n, json.load(open(d / "theme.json"))) for n, d in sorted(_theme.available(home).items()))]}
    html = (SKILL / "review" / "style-menu.html").read_text()
    assert "/*MENU*/null" in html, "style-menu.html lost its data slot"
    return html.replace("/*MENU*/null", json.dumps(data).replace("<", "\\u003c"))

if __name__ == "__main__":
    home = Path(os.environ.get("REELS_HOME", "~/reels")).expanduser()
    ap = argparse.ArgumentParser(); ap.add_argument("--out", default=str(home / "looks.html")); a = ap.parse_args()
    out = Path(a.out).expanduser(); out.parent.mkdir(parents=True, exist_ok=True); out.write_text(page(home)); print(out)
