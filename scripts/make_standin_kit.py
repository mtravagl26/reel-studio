#!/usr/bin/env python3
"""Added by By Mel Ross (0.11.0). Draws the stand-in material kit: skills/3-editing/reel-editor/kits/standin/.

These are placeholders drawn by this script so the kit system has something to show and test. They are plain on purpose and
every picture carries the words "stand-in". They are not anybody's design. Replace them with pictures of real materials.
Same output every run (fixed seed). Needs Pillow.  Usage: python3 scripts/make_standin_kit.py"""
import json, random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent / "skills/3-editing/reel-editor"
OUT = ROOT / "kits/standin"; FONTS = ROOT / "themes/_fonts"
R = random.Random(7)
small = lambda px: ImageFont.truetype(str(FONTS / "Inter.ttf"), px)
big = lambda px: ImageFont.truetype(str(FONTS / "Anton-Regular.ttf"), px)

def grain(im, amount, seed):
    """A little paper grain: random light and dark specks, only where the picture is not see-through."""
    r = random.Random(seed); px = im.load(); w, h = im.size
    for _ in range(int(w * h * 0.06)):
        x, y = r.randrange(w), r.randrange(h); c = px[x, y]
        if c[3] > 40:
            d = r.randint(-amount, amount); px[x, y] = (max(0, min(255, c[0] + d)), max(0, min(255, c[1] + d)), max(0, min(255, c[2] + d)), c[3])
    return im

def wobbly(w, h, inset, jitter, step):
    """A rectangle whose edges wander a little, like a sheet cut by hand."""
    pts = []
    for x in range(inset, w - inset, step): pts.append((x, inset + R.randint(-jitter, jitter)))
    for y in range(inset, h - inset, step): pts.append((w - inset + R.randint(-jitter, jitter), y))
    for x in range(w - inset, inset, -step): pts.append((x, h - inset + R.randint(-jitter, jitter)))
    for y in range(h - inset, inset, -step): pts.append((inset + R.randint(-jitter, jitter), y))
    return pts

def paper():
    w, h = 1200, 900; im = Image.new("RGBA", (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.polygon(wobbly(w, h, 26, 5, 60), fill=(247, 243, 234, 255))
    d.text((w - 250, h - 74), "stand-in paper", font=small(26), fill=(120, 112, 98, 150))
    return grain(im, 7, 1)

def tape():
    w, h = 520, 130; im = Image.new("RGBA", (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    teeth = 9; th = h / teeth
    left = [(14 if i % 2 else 0, i * th / 2) for i in range(teeth * 2 + 1)]
    right = [(w - (14 if i % 2 else 0), h - i * th / 2) for i in range(teeth * 2 + 1)]
    d.polygon(left + right, fill=(222, 205, 160, 205))
    for x in range(30, w - 30, 46): d.line([(x, 6), (x, h - 6)], fill=(205, 186, 138, 120), width=3)
    d.text((w / 2, h / 2), "stand-in tape", font=small(24), fill=(110, 96, 62, 170), anchor="mm")
    return grain(im, 6, 2)

def label():
    w, h = 700, 220; im = Image.new("RGBA", (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([10, 10, w - 10, h - 10], radius=34, fill=(216, 186, 138, 255))
    d.rounded_rectangle([26, 26, w - 26, h - 26], radius=22, outline=(150, 118, 70, 200), width=3)
    d.text((w - 44, h - 36), "stand-in", font=small(18), fill=(110, 84, 46, 170), anchor="rm")
    return grain(im, 8, 3)

def sticker(n):
    s = 300; im = Image.new("RGBA", (s, s), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.ellipse([10, 10, s - 10, s - 10], fill=(255, 255, 255, 255)); d.ellipse([26, 26, s - 26, s - 26], outline=(40, 44, 46, 255), width=10)
    d.text((s / 2, s / 2 - 12), str(n), font=big(150), fill=(40, 44, 46, 255), anchor="mm")
    d.text((s / 2, s - 58), "stand-in", font=small(20), fill=(110, 110, 110, 200), anchor="mm")
    return im.rotate(R.choice([-7, -4, 4, 6, -5]), resample=Image.BICUBIC)

if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    paper().save(OUT / "paper.png"); tape().save(OUT / "tape.png"); label().save(OUT / "label.png")
    for n in range(1, 6): sticker(n).save(OUT / f"n{n}.png")
    (OUT / "kit.json").write_text(json.dumps({
        "name": "Stand-in paper",
        "summary": "Placeholder paper, tape, label and number stickers. Swap in your own materials.",
        "placeholder": True,
        "materials": {"paper": {"file": "paper.png"}, "tape": {"file": "tape.png", "width": 260}, "label": {"file": "label.png"},
                      "stickers": {str(n): f"n{n}.png" for n in range(1, 6)}},
        "ink": "#2b2b2b"}, indent=2) + "\n")
    print("wrote", OUT)
