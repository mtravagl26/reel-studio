"""Is this run a quick draft? Only when REEL_PREVIEW is set AND the brand is above 1080p.
At a 1080p brand the preview already is the final resolution, so it must not use the fast, lower-quality
cutout and encode (that left soft edges and extra compression on the delivered reel)."""

import json, os
from pathlib import Path


def is_draft():
    if not os.environ.get("REEL_PREVIEW"):
        return False
    try:
        brand = json.load(open(Path(os.environ.get("REELS_HOME") or Path.home() / "reels").expanduser() / "brand.json"))
        return int(brand.get("resolution", [1080, 1920])[1]) > 1920
    except Exception:
        return True
