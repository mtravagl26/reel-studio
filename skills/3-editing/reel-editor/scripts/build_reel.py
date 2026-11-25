#!/usr/bin/env python3
"""Turn edit.json + brand.json into a HyperFrames project (one fixed template, no per-reel installs), ready to render.
Usage: python3 build_reel.py <reel-folder> [--capcut]
  --capcut  leave captions and sound effects out of the render and write captions.json + sfx.json for CapCut instead.

edit.json (written by auto_edit.py, then Claude marks accents and adds cards):
  captions: [{start, end, words: [{text, t, accent}], plain?, y?}]   plain = basic white sans (a "before" look), not brand; y = this caption's height in px (0.22.0, e.g. above the head when no graphic is up), default brand captions.y
  punch:    [seconds | [seconds, scale]]    quick zoom-ins on the camera (alternate in/out; [t, 1.25] forces a level)
  cards:    [{type, start, end, ...}]       types:
     title  {text: "line one / line two"}            big headline in the space above the head (hook)
                                                     optional: overline: "small line above" (overline_font: hand | accent | head, overline_size, overline_color), align: left | center | right
                                                     (Style Menu H3 handwritten overline + caps headline, L7 step label); color: "#fff" for a white headline.
     arctitle {text: "Demystifying AI", sub: "part one", trail: true}   (0.23.0) a headline arched over the head with stars and a heavy line under it; trail lays gold sparkles along the tracked hand as it wipes in
     block  {top: "don't", bottom: "worry"}          full brand-colour screen with the clip framed in it (reveal)
     card   {title: "my stack", rows: ["a","b"]}     white UI card, rows appear one by one (lists, steps, tools); dot: false hides the dot in its header (0.22.0; brand.json "list_dot": false for every list)
     tag    {text: "open source", y: 300}            small pill label that pops on (name drops); text_color: "#fff" sets the words' colour, also on a theme's pill graphic (0.22.0)
     (every card: leave out "end" and it clears when the phrase it starts in finishes)
     cta    {text: "comment EDIT", y?: 1360}         call-to-action pill (kept above the bottom ~420 px IG covers); CAPS word = pop color
     shot   {src: "shots/tool.png", label: "heyclicky.com", y?: 130}   website screenshot in a browser window (make it with screenshot.sh);
                                                     set y lower (e.g. 1000) when the face sits high in frame
     image  {src: ["a.png", "b.jpg"]}               1-3 images fanned out above the head (their own photos, screenshots, stock)
     sticker {src: "sticker.png", x: 760, y: 420, size: 260}  transparent PNG that bounces on (brand stickers, emoji, logos)
     page   {bg: "image.jpg" or "#hex", title: "how it works"}   full-screen background with the clip framed below it
                                                     (the fast green-screen look: no cut-out, renders in seconds)
     motion {name: "carousel-vision-1", vars: {...}, box: [x, y, w, h]}   any HyperFrames catalog motion cached in
                                                     engine/hf (see references/motions.md for names + vars). Carousels take
                                                     images: {"images": ["a.png", ...]} and the slots are filled for you.
     follow {words: [{text, accent}], framing: "wide"}   caption-camera-follow in brand colors/font: one sentence
                                                     written word by word across a camera that pulls back (hook moments)
     popup  {src: "popups/hello.gif", pos: "top-right", size: 360, rotate: 0, frame?: true}   (Added by By Mel Ross, reel editor page) a picture, graphic
                                                     or animated GIF that pops up. pos: top-left | top-center | top-right | middle-left | middle-right |
                                                     center | side-left | side-right | custom (then "x", "y" = centre in px). (0.16.0) No pos = center, and 2 pictures on screen together sit side by side. size = width in px. GIFs are converted to a looped
                                                     transparent video so they animate in the render. "frame": true = white photo border (default for jpg).
                                                     (0.13.0) src may be a video clip (.mp4 .mov .m4v .webm): it plays in a rounded window, no sound.
                                                     "from": seconds into the clip to start at; "loop": true starts it again if it is shorter than its time on screen.
     polaroids {src: ["a.jpg","b.jpg","c.jpg"], label: "Amazon storefront", side: "left", y: 120, size: 260}   (Style Menu L2, Added by By Mel Ross) 1-4 tilted
                                                     white photo cards that fan in, with a handwritten label on a torn paper strip. side: left | right | center (or x).
     popup also takes caption: "how is this real?!" (Style Menu L9): a handwritten label on a torn strip under the photo; add "exit": true for a soft shrink-out.
     xlist  {items: ["no coach", "no paid ads"], mark: "check" | "x", y: 1050, font: "hand" | "body"}   (Style Menu L6) a paper card; each row gets a hand-drawn sage check (default) or red X,
                                                     drawn on one by one. row_times: [seconds...] to land each row on its spoken word; "color" overrides the mark color.
                                                     The hand font draws a capital I like a 1, so set "font": "body" for text with "AI".
     stat   {label: "Employees", value: "12,000", delta: "+12%", spark: [3,4,6,5,9], y: 1080}   (Style Menu L8) a white dashboard card that pops over the lower half.
     tiles  {label: "Acme products", tiles: [{label: "Billing", icon: "dollar"}, ...], y: 1050}   (Style Menu L4) a torn paper label above a grid of soft icon tiles.
                                                     icon = built-in name (dollar target map chart people check star chat doc mic heart spark mail), a picture path, or a short glyph.
     orbit  {src: ["a.jpg","b.jpg","c.jpg"], size: 170, level: "crown" | "chest", period: 4}   (Added by By Mel Ross, 0.7.0) 1-6 photos, graphics or GIFs that
                                                     circle the speaker's head: behind it on the far side of the ring, in front on the near side. Needs the speaker
                                                     cutout (macOS); without it, or where the cutout fails its check, the photos show on the near side only and the
                                                     build says so. The ring is placed from the cutout: "crown" (default) rings the top of the head and stays above the
                                                     eyes, "chest" rings below the chin. Override with center: [x, y], rx, ry. period = seconds per lap, dir: -1 reverses,
                                                     frame: false drops the white border. See references/look-and-layers.md.
     (0.19.0, Added by By Mel Ross, Style Menu H6-L23)
     title also takes  *word* = highlighted word, font: "serif" | "body" | "accent" | "hand", italic: true, sub: "small line under", labels: ["before", "after"]
     quote   {text: "line one / line two", y?, size?, marks?: false}   a sentence in a white rounded box above the head
     columns {cols: [{title: "keep", items: ["a", "b"]}, ...], y?}     2 or 3 hand-lettered columns on a paper card, written in one after another
     chips   {title: "5 things to fix", n: 5, chip_times?: [...]}      a caps title and a row of numbered chips; each lights up at its moment
     page also takes bg: "blur" (the clip as a card over a blurred copy of itself) and label: "small caps label";  card takes y
     polaroids layout: "cloud" (up to 8 in an arc);  tiles layout: "column", side: "left" | "right" (up to 5 down one side)
     brand.json captions: bg: "#FFFFFF" | "rgba(0,0,0,.62)" (words on a box or bar), accent_font: "head", accent_italic: true
     brand.json or edit.json caption_highlight: {words: "#FFFFFF", text: "#141414", bg: "#B9C8A5" | "none"} (the other words, the highlighted word, the box behind it)
  Any card: "glass": true gives the frosted liquid-glass look (card, tag).
  Any card or sfx_event: "off": true leaves it out of the render (the editor page's on/off switch).
  Text cards (title, tag, card, cta) with no "layer" take brand.json "text_default": {"layer": "front" | "behind" | "both", "position": "above"}
     ("above" = the top area above the head, y 130, for a tag with no "y").
  sfx_events: [{name, t, db?}]   (Added by By Mel Ross) extra sound effects from the library (assets/sfx-manifest.json), e.g.
                                 {"name": "rise", "t": 12.4, "db": -9}  (db = peak level in dBFS, default -10). These always play; automatic entrance sounds follow brand.json "sfx".
  Any card: "sfx": false mutes its entrance sound; "sfx": {"name": "ding", "db": -10} swaps it for another library effect.
  brand.json "sfx_volume": {"pop": -3, "whoosh": 2}   per-effect level change in dB, on top of each effect's default level.
  brand.json "sfx_never": ["pop", "pop-soft"]   (Added by By Mel Ross, 0.24.0) sounds that never play, automatic, swapped-in or placed by hand.
  Any card: "layer": "behind" | "front" | "both"   (Added by By Mel Ross) where it sits relative to the speaker. "behind" puts it between the
     background and the speaker's cutout, so they stand in front of it (big type, shapes); "front" is the normal overlay; "both" keeps
     the card behind and also shows a copy in front inside "front_part" ("bottom" | "top" | [x, y, w, h], default "bottom"), so it weaves
     around them. Uses cutout.py (Apple Vision, macOS). A shot whose cutout edges fail the check is drawn as a plain overlay and the build says so.
     edit.json "cutout": {"include_dark": [[x,y,w,h]], "include": [...], "exclude": [...], "matte": "my-matte.mp4"} fixes a matte for this footage
     (include_dark adds only the dark pixels in a box, e.g. a microphone in front of the speaker) or brings your own white-on-black matte video
     (any segmentation tool, same length as master.mp4). See references/look-and-layers.md.
  {type:"note", text:"line / line", y?, rotate?, size?}   (Added by By Mel Ross, 0.11.0) a handwritten note on a taped scrap of paper
  Material kits (kit.py): with "kit" set, card / tag / note are built from the kit's paper, tape, label and stickers. "kit": false on a card keeps it plain.
  Image paths: relative to the reel folder, or to ~/reels/assets/, or absolute.
"""
import html, json, os, re, shutil, subprocess, sys
from pathlib import Path

def _contrast(a, b):
    """WCAG contrast ratio of two #rrggbb colors (1 = same, 21 = black on white). Anything unreadable as a color counts as fine."""
    def lum(h):
        h = h.lstrip("#"); h = "".join(c * 2 for c in h) if len(h) == 3 else h
        ch = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
        r, g, bl = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in ch]
        return 0.2126 * r + 0.7152 * g + 0.0722 * bl
    try: x, y = sorted((lum(a), lum(b)), reverse=True); return (x + 0.05) / (y + 0.05)
    except (ValueError, IndexError, AttributeError): return 21.0

reel = Path(sys.argv[1]).expanduser()
CAPCUT = "--capcut" in sys.argv
HOME = Path(os.environ.get("REELS_HOME", "~/reels")).expanduser()
ENGINE = Path(os.environ.get("REEL_ENGINE") or Path(__file__).resolve().parent.parent / "engine")   # REEL_ENGINE: Added by By Mel Ross, for tests
sys.path.insert(0, str(Path(__file__).resolve().parent))
import theme as _theme                           # Added by By Mel Ross (themes): the look is laid over brand.json, see theme.py
brand = _theme.load_brand(HOME, reel, sys.argv[sys.argv.index("--theme") + 1] if "--theme" in sys.argv[:-1] else None)
if brand.get("_theme"): print(f'theme: {brand["_theme"]["name"]}')
import kit as _kit                               # Added by By Mel Ross (material kits, 0.11.0): what cards are made of, see kit.py
KIT = _kit.load(HOME, reel, brand, sys.argv[sys.argv.index("--kit") + 1] if "--kit" in sys.argv[:-1] else None)
if KIT: print(f'kit: {KIT["id"]}')
edit = json.load(open(reel / "edit.json"))
# Added by By Mel Ross (editor page): "off" switches a card or effect off without deleting it; brand.json "text_default" gives text cards their layer
edit["cards"] = [c for c in edit.get("cards", []) if not c.get("off")]
edit["sfx_events"] = [e for e in edit.get("sfx_events", []) if not e.get("off")]
_theme.apply_card_defaults(brand, edit["cards"])
TEXT_DEFAULT = brand.get("text_default") or {}
TEXT_TYPES = ("title", "tag", "card", "cta", "note")
for _c in edit["cards"]:
    if _c.get("type") in TEXT_TYPES and not _c.get("layer") and TEXT_DEFAULT.get("layer") in ("behind", "both"):
        _c["layer"] = TEXT_DEFAULT["layer"]
    if _c.get("type") == "tag" and "y" not in _c and TEXT_DEFAULT.get("position") == "above":
        _c["y"] = 130

# Added by By Mel Ross: sound-effects library + stem mix. Effects are listed in assets/sfx-manifest.json (default level per
# effect, source, license). By default they are not baked into the HyperFrames render: build_reel.py writes sfx_events.json and
# mix_audio.py mixes voice, music and effects as three separate levels. brand.json "mix": {"legacy": true} keeps the old way
# (effects as <audio> tags inside the composition, no music ducking).
_mf = Path(__file__).resolve().parent.parent / "assets" / "sfx-manifest.json"
SFX_LEVEL = {e["name"]: e.get("gain_db", 0) for e in json.load(open(_mf))["effects"]} if _mf.exists() else {}
_sn = brand.get("sfx_never") or []
SFX_NEVER = {_sn} if isinstance(_sn, str) else {str(x) for x in _sn if isinstance(x, str)}   # a single name written without brackets still counts            # 0.24.0: sounds the person never wants, e.g. ["pop", "pop-soft"]
SFX_COUNT = {"auto": 0, "placed": 0, "banned": 0}
SFX_VOL = brand.get("sfx_volume", {})                 # per-effect dB change, e.g. {"pop": -3}
STEMS = not brand.get("mix", {}).get("legacy", False)

C = brand["colors"]
MAIN, POP, LIGHT = C["main"], C["pop"], C.get("light", "#FFFFFF")
CAP, CAP_ACC = C.get("caption", "#FFFFFF"), C.get("caption_accent", POP)
# Added by By Mel Ross (0.23.0): the highlighted caption word has its own text color and an optional box behind it.
# brand.json or edit.json "caption_highlight": {"text": "#141414", "bg": "#B9C8A5" | "none"}; set on the pages.
_HL = brand.get("caption_highlight") or {}
CAP_ACC = _HL.get("text", CAP_ACC)
CAP_ACC_BG = _HL.get("bg") if _HL.get("bg") not in (None, "none") else None
CAPS = brand.get("captions", {})
CASE = CAPS.get("case", "lower")
CAP_PX, CAP_Y = CAPS.get("size", 96), CAPS.get("y", 1250)
# Added by By Mel Ross (0.26.0): where captions and graphics sit. brand.json or edit.json "layout": "captions-high" puts the
# captions above the head (under Instagram's top bar) and moves the text graphics that normally sit at the top down to the lower
# third, above Instagram's buttons. Each caption can also say where it goes: "pos": "top" | "middle" | "bottom" | "hide"
# (set on the review page for part of a reel). When a graphic covers the captions they move to the other zone for that stretch.
CAP_ZONES = {"top": 290, "middle": 900, "bottom": 1250}
LAYOUT = edit.get("layout") or brand.get("layout") or "captions-low"
if LAYOUT == "captions-high": CAP_Y = CAPS.get("y_high", CAP_ZONES["top"])
else: CAP_ZONES["bottom"] = CAP_Y
CAP_H = 230                                   # room a caption takes up, 2 lines
covers = []                                   # (start, end, top, bottom): graphics that sit where captions are; captions move aside
def cover(a, b, top, bottom): covers.append((a, b, top, bottom))
if LAYOUT == "captions-high":                 # text graphics with no height of their own go to the lower third
    _LOW = {"tag": 1180, "quote": 1060, "chips": 1200, "note": 1080, "columns": 1000, "shot": 760}
    for _c in edit["cards"]:
        _t = _c.get("type")
        if "y" in _c or _c.get("layer") == "behind": continue
        if _t in _LOW: _c["y"] = _LOW[_t]
        elif _t == "card": _c["y"] = max(760, 1580 - 110 * (len(_c.get("rows", [])) + 1) - 60)
LIST_DOT = brand.get("list_dot", True)        # 0.22.0: the little dot in a list card's header; "list_dot": false in brand.json (or a theme) turns it off, a card's own "dot" wins
W, H, FPS = 1080, 1920, 30                     # authored at 1080x1920; 4K brands render with --resolution portrait-4k
SAFE = 900                                     # guardrail: no text line may be wider than this (90 px margin each side)
EM = 0.66                                      # conservative average glyph width (bold display fonts run ~0.6-0.66 em)
def fit(text, want, extra=0):
    """Largest size <= want at which `text` stays inside the safe area (extra = outline px on each side)."""
    return max(24, min(int(want), int((SAFE - 2 * extra) / (max(len(text), 1) * EM))))

def dur_of(p):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                                capture_output=True, text=True, check=True).stdout)
DUR = round(dur_of(reel / "master.mp4") - 0.02, 2)
q = lambda t: round(round(max(t, 0) * FPS) / FPS, 4)
esc = lambda s: html.escape(s, quote=False)
case = lambda s: s.lower() if CASE == "lower" else s

# ---- project folder: template files are copied, never installed -------------------------------------------------
proj = reel / "proj"
# Added by By Mel Ross (0.17.0, live preview): the touch-ups page builds the page it shows into its own folder, so a preview never
# touches the folder a render reads. Converted GIFs and video clips are kept in <reel>/.asset-cache, so the next preview takes seconds.
if os.environ.get("REEL_PROJ_DIR"): proj = Path(os.environ["REEL_PROJ_DIR"])
ASSET_CACHE = reel / ".asset-cache"
def _cached(cand, ext, *key):
    """(cache file, True if it is already there) for a converted copy of `cand` made with these settings."""
    import hashlib
    st = cand.stat()
    h = hashlib.sha1(json.dumps([str(cand), st.st_mtime_ns, st.st_size, *key]).encode()).hexdigest()[:20]
    f = ASSET_CACHE / f"{h}{ext}"
    return f, f.exists() and f.stat().st_size > 0
def _keep(dst, cache):
    try:
        ASSET_CACHE.mkdir(exist_ok=True); shutil.copyfile(dst, cache)
        old = sorted(ASSET_CACHE.iterdir(), key=lambda x: x.stat().st_mtime)
        for x in old[:-80]: x.unlink()                    # keep the 80 newest
    except OSError: pass
if proj.exists(): shutil.rmtree(proj)
(proj / "fonts").mkdir(parents=True); (proj / "sfx").mkdir(); (proj / "vendor").mkdir()
def mat(key, sticker=None):
    """Added by By Mel Ross (0.11.0). A kit material copied into the project: its path there, or "" when there is no kit or the kit lacks it."""
    if not KIT: return ""
    src = KIT["stickers"].get(str(sticker)) if sticker is not None else (KIT["materials"].get(key) or {}).get("path")
    if not src: return ""
    (proj / "kit").mkdir(exist_ok=True); dst = proj / "kit" / Path(src).name
    if not dst.exists(): shutil.copy(src, dst)
    return f"kit/{dst.name}"
INK = (KIT or {}).get("ink") or None             # text color on kit paper; None = the brand's main color
shutil.copy(ENGINE / "gsap.min.js", proj / "vendor/gsap.min.js")
try: os.link(reel / "master.mp4", proj / "master.mp4")
except OSError: shutil.copy(reel / "master.mp4", proj / "master.mp4")
if not STEMS:
    for f in (ENGINE / "sfx").glob("*.wav"): shutil.copy(f, proj / "sfx" / f.name)
(proj / "img").mkdir()
HF = ENGINE / "hf"
if any(k["type"] in ("motion", "follow") for k in edit.get("cards", [])):
    (proj / "compositions/components").mkdir(parents=True); shutil.copytree(HF / "assets", proj / "assets", dirs_exist_ok=True)
def mount(src):
    """Copy one cached motion into the reel, minus any audio it ships with (our own sound effects do that job)."""
    rel = src.relative_to(HF).as_posix()
    (proj / rel).write_text(re.sub(r"<audio[^>]*>(</audio>)?", "", src.read_text()))
    return rel
def img(src):
    """Copy an image into the project and return its path there. Looks in the reel folder, ~/reels/assets/, then as given."""
    for cand in (reel / src, HOME / "assets" / src, Path(src).expanduser()):
        if cand.exists():
            if cand.suffix.lower() == ".svg":   # Added by By Mel Ross (0.15.0): an SVG is copied as it is, so it stays sharp at any size
                dst = proj / "img" / f"{len(list((proj / 'img').iterdir()))}_{cand.stem}.svg"
                shutil.copyfile(cand, dst); return f"img/{dst.name}"
            dst = proj / "img" / f"{len(list((proj / 'img').iterdir()))}_{cand.stem}.png"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(cand), "-vf", "scale='min(1280,iw)':-2", str(dst)], check=True)
            return f"img/{dst.name}"
    print(f"warning: image not found: {src}"); return ""

def numf(v, dflt):
    """A number from edit.json, or the default when it is missing, null or not a number (audit 3: 'from': null crashed the build)."""
    try: return float(v) if v is not None and not isinstance(v, bool) else float(dflt)
    except (TypeError, ValueError): return float(dflt)

def svg_size(path):
    """Width and height of an SVG in pixels, from its width/height or its viewBox. None when the file is not an SVG."""
    try: text = re.sub(r"<!--.*?-->", "", Path(path).read_text(errors="replace"), flags=re.S)
    except OSError: return None
    m = re.search(r"<svg\b[^>]*>", text, re.I)
    if not m: return None
    def at(n):
        k = re.search(rf"""\s{n}\s*=\s*["']([^"']*)["']""", m.group(0), re.I); return k.group(1) if k else ""
    def px(v):
        k = re.match(r"^\s*([\d.]+)\s*(px)?\s*$", v or "", re.I)
        try: return float(k.group(1)) if k else 0.0
        except ValueError: return 0.0
    w, h = px(at("width")), px(at("height"))
    try: vb = [float(x) for x in re.split(r"[\s,]+", at("viewBox").strip())]
    except ValueError: vb = []
    if len(vb) == 4 and vb[2] > 0 and vb[3] > 0:
        if not w and not h: w, h = vb[2], vb[3]
        elif not w: w = h * vb[2] / vb[3]
        elif not h: h = w * vb[3] / vb[2]
    if w <= 0 or h <= 0: w = h = 512.0
    return max(int(round(w)), 1), max(int(round(h)), 1)

VIDEO_EXT = (".mp4", ".mov", ".m4v", ".webm")      # Added by By Mel Ross (0.13.0): a popup can be a video clip (a screen recording, b-roll)

def popup_asset(src, secs, start=0.0, loop=False):
    """Added by By Mel Ross (editor page). Copy a popup picture into the project: returns (kind, project path, width, height).
    Pictures become PNG like img(). An animated GIF becomes a looped transparent video (VP9 with alpha, 30 fps, long enough for
    `secs`) because the render draws the page frame by frame and a plain <img> GIF would sit on its first frame."""
    for cand in (reel / src, HOME / "assets" / src, Path(src).expanduser()):
        if cand.exists(): break
    else:
        print(f"warning: popup file not found: {src}"); return None
    n = len(list((proj / "img").iterdir()))
    if cand.suffix.lower() == ".svg":   # 0.15.0: ffprobe can't always read an SVG; its size comes from the file
        wh = svg_size(cand)
        if not wh: print(f"warning: popup {src} is not an SVG picture: skipped"); return None
        return "img", img(src), wh[0], wh[1]
    _chk = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", str(cand)], capture_output=True, text=True)
    try: _cw, _ch = [int(x) for x in _chk.stdout.strip().split(",")[:2]]
    except ValueError: _cw = _ch = 0
    if _chk.returncode != 0 or _cw <= 0 or _ch <= 0:   # a damaged file (ffprobe reports 0x0); looping one would make ffmpeg spin forever, so look first
        print(f"warning: popup {src} is not a picture or video this machine can read: skipped"); return None
    if cand.suffix.lower() in VIDEO_EXT:
        # Added by By Mel Ross (0.13.0). A video clip: cut to the part that shows (from `start`, for `secs`), 30 fps, no sound, a keyframe
        # every half second so the render can seek it frame by frame. A clip shorter than its time on screen holds its last frame,
        # or starts again with "loop": true. Phone clips filmed sideways are turned upright (ffmpeg reads the rotation flag).
        dst = proj / "img" / f"{n}_{cand.stem}.mp4"
        _cf, _hit = _cached(cand, ".mp4", "clip", round(float(secs), 2), numf(start, 0), bool(loop))
        if _hit:
            shutil.copyfile(_cf, dst)
            wh = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", str(dst)], capture_output=True, text=True).stdout.strip().split(",")
            if len(wh) >= 2 and wh[0].isdigit() and wh[1].isdigit(): return "clip", f"img/{dst.name}", int(wh[0]), int(wh[1])
        try:   # audit 3: a start point past the end of the clip made an empty file and crashed the build; start inside the clip instead
            clip_len = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(cand)], capture_output=True, text=True).stdout.strip() or 0)
        except ValueError: clip_len = 0.0
        start = numf(start, 0)
        if clip_len and start > clip_len - 0.5:
            print(f"note: video clip {src} is {clip_len:.1f}s long, so it can't start {start:.1f}s in: starting it at 0"); start = 0.0
        try:
            r = subprocess.run(["ffmpeg", "-v", "error", "-y", *(["-stream_loop", "-1"] if loop else []), "-ss", f"{max(float(start), 0):.2f}", "-i", str(cand), "-t", f"{secs + 0.5:.2f}",
                                "-vf", f"fps=30,scale='min(720,iw)':-2:flags=lanczos,tpad=stop_mode=clone:stop_duration={secs + 1:.2f},format=yuv420p", "-t", f"{secs + 0.5:.2f}",
                                "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-g", "15", "-an", "-movflags", "+faststart", str(dst)], capture_output=True, text=True, timeout=300)
        except subprocess.TimeoutExpired:
            r = subprocess.CompletedProcess([], 1, "", "took too long")
        if r.returncode != 0 or not dst.exists():
            print(f"warning: video clip {src} could not be prepared ({r.stderr.strip()[:200]}): left out"); return None
        wh = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", str(dst)],
                            capture_output=True, text=True).stdout.strip().split(",")
        if len(wh) < 2 or not wh[0].isdigit() or not wh[1].isdigit():
            print(f"warning: video clip {src} has no picture in it: left out"); return None
        _keep(dst, _cf)
        return "clip", f"img/{dst.name}", int(wh[0]), int(wh[1])
    if cand.suffix.lower() == ".gif":
        dst = proj / "img" / f"{n}_{cand.stem}.webm"
        _cf, _hit = _cached(cand, ".webm", "gif", round(float(secs), 2))
        if _hit:
            shutil.copyfile(_cf, dst)
            wh = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", str(dst)], capture_output=True, text=True).stdout.strip().split(",")
            if len(wh) >= 2 and wh[0].isdigit() and wh[1].isdigit(): return "video", f"img/{dst.name}", int(wh[0]), int(wh[1])
        # looping: the loop filter repeats the first N decoded frames (N = the GIF's frame count, at most 900), which cycles at the GIF's own
        # speed. ffmpeg's -stream_loop is not used: on a GIF whose container has no duration it never advances time and runs forever.
        try:
            nf = subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", str(cand)],
                                capture_output=True, text=True, timeout=60).stdout.strip().split(",")[0]
            nf = min(max(int(nf), 1), 900)
            r = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(cand), "-t", f"{secs + 0.5:.2f}",
                                "-vf", f"scale='min(720,iw)':-2:flags=lanczos,format=yuva420p,loop=loop=-1:size={nf}:start=0,fps=30", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p",
                                "-b:v", "0", "-crf", "30", "-auto-alt-ref", "0", "-an", str(dst)], capture_output=True, text=True, timeout=120)
        except (subprocess.TimeoutExpired, ValueError):   # a damaged GIF: give up rather than hang the render
            r = subprocess.CompletedProcess([], 1, "", "timed out or unreadable")
        if r.returncode != 0:
            print(f"warning: GIF {src} could not be converted ({r.stderr.strip()[:200]}): drawn as a still picture")
        else:
            wh = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", str(dst)],
                                capture_output=True, text=True).stdout.strip().split(",")
            _keep(dst, _cf)
            return "video", f"img/{dst.name}", int(wh[0]), int(wh[1])
    try:
        path = img(src)
        if not path: return None
        wh = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", str(proj / path)],
                            capture_output=True, text=True, check=True).stdout.strip().split(",")
        return "img", path, int(wh[0]), int(wh[1])
    except (subprocess.CalledProcessError, ValueError, IndexError):
        print(f"warning: popup {src} is not a picture or video this machine can read: skipped"); return None

# fonts: brand.json "fonts": {"head": {...}, "body": {...}, "accent": {...}}, each {family, file?, weight?, style?}
FALLBACK = "'Helvetica Neue', Helvetica, Arial, sans-serif"   # single quotes: these go inside style="..." attributes
font_css, FAM = [], {}
for role, default in (("head", {"family": "Helvetica Neue", "weight": 700}), ("body", {"family": "Helvetica Neue", "weight": 500}),
                      ("accent", {"family": "Georgia", "weight": 400, "style": "italic"}),
                      ("hand", {"family": "Caveat", "weight": 700, "file": str(Path(__file__).resolve().parent.parent / "assets/fonts/Caveat-700-latin.woff2")})):
    f = {**default, **brand.get("fonts", {}).get(role, {})}
    if f.get("file"):
        src = Path(f["file"]).expanduser()
        if src.exists():
            shutil.copy(src, proj / "fonts" / src.name)
            fmt = {"otf": "opentype", "ttf": "truetype", "woff2": "woff2", "woff": "woff"}.get(src.suffix[1:].lower(), "opentype")
            font_css.append(f'@font-face {{ font-family: "{f["family"]}-{role}"; src: url("fonts/{src.name}") format("{fmt}"); font-display: block; }}')
            f["family"] = f'{f["family"]}-{role}'
        else:
            print(f"warning: font file not found, using fallback: {src}")
    FAM[role] = (f"'{f['family']}', {FALLBACK}", f.get("weight", 400), f.get("style", "normal"))
# Added by By Mel Ross (0.19.0): "serif" for title cards that ask for one. brand.json "fonts": {"serif": {...}} sets it; without
# that it is the accent font upright when the brand has one, else a system serif.
_sf = brand.get("fonts", {}).get("serif")
if _sf and _sf.get("family"): FAM["serif"] = (f"'{_sf['family']}', Georgia, 'Times New Roman', serif", _sf.get("weight", 500), _sf.get("style", "normal"))
else: FAM["serif"] = ("Georgia, 'Times New Roman', serif", 500, "normal")
def font(role, px):
    fam, wt, st = FAM[role]
    return f"font-family:{fam};font-weight:{wt};font-style:{st};font-size:{px}px"

# ---- Style Menu helpers (Added by By Mel Ross, 0.5.0): torn paper strips, hand-drawn marks, line icons -------------------
import random
def torn_clip(w, h, seed, amp=5, step=18):
    """clip-path polygon: straight sides, a ragged torn top and bottom edge (deterministic for a seed)."""
    rnd = random.Random(seed); xs = list(range(0, w, step)) + [w]
    pts = [(x, round(rnd.uniform(0, amp), 1)) for x in xs] + [(x, round(h - rnd.uniform(0, amp), 1)) for x in reversed(xs)]
    return "polygon(" + ",".join(f"{x}px {y}px" for x, y in pts) + ")"
def tape(text, px, bg, fg, seed=1, rot=-2, maxw=860):
    """A handwritten label on a torn paper strip. Returns (html, w, h); position it with a wrapper."""
    px = int(min(px, max(28, (maxw - 70) / (max(len(text), 1) * 0.46))))
    w, h = int(len(text) * px * 0.46) + 70, int(px * 1.18) + 22
    return (f'<div class="tp" style="width:{w}px;height:{h}px;transform:rotate({rot}deg)"><div class="tpi" style="clip-path:{torn_clip(w, h, seed)};'
            f'background:{bg};{font("hand", px)};color:{fg};line-height:{h}px">{esc(text)}</div></div>'), w, h
def mix_hex(a, b, t):
    """Blend two #hex colors: t=0 is a, t=1 is b."""
    A, B = [tuple(int(x.lstrip("#")[k:k + 2], 16) for k in (0, 2, 4)) for x in (a, b)]
    return "#" + "".join(f"{round(p + (q_ - p) * t):02x}" for p, q_ in zip(A, B))
SAGE_DEEP = mix_hex(POP, MAIN, 0.42)          # a readable sage for marks drawn on cream paper (POP itself is too light there)
ICONS = {
    "dollar": '<path d="M12 3v18M16.5 7.5C15.5 6.2 13.9 5.5 12 5.5c-2.4 0-4 1.2-4 3s1.6 2.6 4 3 4 1.2 4 3-1.6 3-4 3c-2 0-3.7-.8-4.7-2.2"/>',
    "target": '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
    "map": '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    "chart": '<path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-8"/>',
    "people": '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2c3 .2 5 2.2 5 5.2"/>',
    "check": '<path d="M4 12.5l5 5L20 6.5"/>',
    "star": '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    "chat": '<path d="M4 5h16v11H9l-5 4z"/>',
    "doc": '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
    "mic": '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    "heart": '<path d="M12 20s-8-4.8-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.2 12 20 12 20z"/>',
    "spark": '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
    "mail": '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
}
RED_X = "#D64545"

back, mid, front, audio, js = [], [], [], [], []
behind = []                                   # cards behind the speaker's cutout (layer: behind / both)
_marks = []                                   # list lengths at the start of each card, to find the pieces a card added
n_sfx = 0
CAPCUT_NAME = {"swish": "whoosh-short", "whoosh": "whoosh-short", "pop": "pop", "snap": "snap", "typing": "typing",
               "chime": "chime", "sparkle": "sparkle", "coin": "coin"}   # local file -> CapCut library sound (capcut_draft.py)
def sfx(name, t, db=-12, level="subtle", dur=None, manual=False):
    """Subtle, ASMR-clean accents: every effect sits 10-15 dB under the voice (db = level relative to full scale).
    level = lowest brand sfx setting that still plays it. CapCut route: recorded for CapCut's real library sounds.
    Modified by By Mel Ross: the sound library, a level per effect (manifest default + brand.json "sfx_volume"), and the stem mix."""
    global n_sfx
    global CARD_SFX
    if CARD_MUTE and not manual: return                   # this graphic's sound was switched off in the review
    if CARD_SFX and level == "subtle" and not manual:     # the sound approved in the review replaces the entrance sound
        name, db = CARD_SFX["name"], CARD_SFX.get("db", db)
        CARD_SFX = None
    if not manual and (brand.get("sfx", "subtle") == "none" or (level == "lots" and brand.get("sfx") != "lots")): return
    if t >= DUR: return
    if name in SFX_NEVER: SFX_COUNT["banned"] += 1; return    # 0.24.0: banned in brand.json "sfx_never" (counted only when it would have played)
    # automatic sounds: +8 dB makes them clearly audible under a voice with no music bed; an effect you place yourself (sfx_events)
    # uses "db" as its peak level in dBFS, so -9 means a peak 9 dB under full scale.
    gain = db + (0 if manual else brand.get("sfx_gain_db", 8)) + SFX_LEVEL.get(name, 0) + SFX_VOL.get(name, 0)
    gain = min(0.0, gain)                                  # the files are already at -1 dBFS; never push past full scale
    vol = round(min(1.0, 10 ** (gain / 20)), 3)
    if CAPCUT:
        SFX_OUT.append({"name": CAPCUT_NAME.get(name, name), "t": round(max(t, 0), 2), "vol": vol, **({"dur": dur} if dur else {})}); return
    p = ENGINE / "sfx" / f"{name}.wav"
    if not p.exists():
        print(f"warning: sound effect {name!r} is not in engine/sfx (run scripts/setup_engine.sh) - skipped"); return
    n_sfx += 1; SFX_COUNT["placed" if manual else "auto"] += 1
    d = min(dur or dur_of(p), dur_of(p), DUR - t)
    if STEMS:
        SFX_EVENTS.append({"name": name, "t": round(max(t, 0), 3), "db": round(gain, 2), **({"dur": round(d, 3)} if dur else {})}); return
    audio.append(f'<audio id="sx{n_sfx}" src="sfx/{name}.wav" data-start="{q(t)}" data-duration="{q(d)}" '
                 f'data-track-index="{20 + n_sfx}" data-volume="{vol}"></audio>')
SFX_EVENTS = []
SFX_OUT = []
CARD_MUTE = False
CARD_SFX = None
def show(sel, a, b, fade=0.18):
    b = max(b, a + 0.12); fade = min(fade, (b - a) / 2)              # very short words: keep the fade after the reveal
    js.append(f'tl.set("{sel}",{{autoAlpha:1}},{q(a)});tl.to("{sel}",{{autoAlpha:0,duration:{fade}}},{q(b - fade)});')

# ---- camera punch-ins ---------------------------------------------------------------------------------------------
# Modified by By Mel Ross: zooms come from brand.json "zoom". The default is a slow, gentle push (1.04x over 2.5 s,
# eased in and out). For the original quick punch-in use "zoom": {"scale": 1.07, "seconds": 0.22, "ease": "power3.out"}.
ZOOM = {"scale": 1.04, "seconds": 2.5, "ease": "sine.inOut", **brand.get("zoom", {})}
for k, t in enumerate(edit.get("punch", [])):   # [t, scale] forces a zoom level (e.g. a spoken "zoom in")
    t, z = t if isinstance(t, list) else (t, 1.0 if k % 2 else ZOOM["scale"])
    js.append(f'tl.to("#cam,#trail",{{scale:{z},duration:{ZOOM["seconds"]},ease:"{ZOOM["ease"]}",overwrite:"auto"}},{q(t)});')

# ---- cards --------------------------------------------------------------------------------------------------------
# Phrases from the cut's transcript: a phrase ends at punctuation or a gap over 0.35 s. A card with no "end" clears
# when the phrase it starts in finishes (min 1 s on screen), so overlays leave with their line.
_tw = json.load(open(reel / "master_transcript.json")) if (reel / "master_transcript.json").exists() else []
PHRASE_ENDS = [w["end"] for k, w in enumerate(_tw) if re.search(r"[.,!?;:]$", w["text"]) or k + 1 == len(_tw)
               or _tw[k + 1]["start"] - w["end"] > 0.35]
def phrase_end(t):
    return next((e + 0.15 for e in PHRASE_ENDS if e > t + 1.0), min(t + 2.5, DUR))

POPUP_POS = {"top-left": ("top", "left"), "top-center": ("top", "center"), "top-right": ("top", "right"), "middle-left": ("middle", "left"),
             "middle-right": ("middle", "right"), "center": ("center", "center")}
# Added by By Mel Ross (0.16.0): a picture popup with no place set goes in the middle of the screen. Two of them on screen at the
# same time sit side by side ("side-left" / "side-right", each at most 500 px wide). Video clips follow the same rule.
def _plain_pic(c):
    return isinstance(c, dict) and c.get("type") == "popup" and not c.get("off") and not c.get("pos") and not ("x" in c and "y" in c)
def _span(c):
    a_ = numf(c.get("start"), 0); return a_, numf(c.get("end"), a_ + 3)
_pics = sorted((c for c in edit.get("cards", []) if _plain_pic(c)), key=lambda c: _span(c)[0])
for _k, _c in enumerate(_pics):
    if _c.get("pos"): continue
    for _d in _pics[_k + 1:]:
        if not _d.get("pos") and _span(_d)[0] < _span(_c)[1] and _span(_d)[1] > _span(_c)[0]:
            _c["pos"], _d["pos"] = "side-left", "side-right"; break
quiet = []                                      # spans where a card carries its own words, so captions step aside
ORBITS = []                                     # orbit cards (i, card, start, end), drawn once the speaker's cutout is known
TRAIL_REQ = []                                  # 0.23.0: hand trails that cards ask for ("trail": true on an arctitle)
for i, c in enumerate(edit.get("cards", [])):
    _marks.append((len(back), len(mid), len(front), len(js)))
    CARD_MUTE = c.get("sfx") is False
    CARD_SFX = c.get("sfx") if isinstance(c.get("sfx"), dict) else None
    a, b, cid = c["start"], c.get("end") or phrase_end(c["start"]), f"k{i}"
    b = min(b, DUR)
    kind = c["type"]
    if kind == "title":
        lines = [case(x.strip()) for x in c["text"].split("/")]
        if c.get("quiet", True): quiet.append((a, b))                    # the hook says it: captions step aside ("quiet": false keeps them)
        # Added by By Mel Ross (0.19.0, Style Menu H6-H19, L22, L23): *word* = that word in the highlight color; "font": head | body |
        # accent | hand | serif; "italic": true; "sub": a small line under the headline; "labels": ["before", "after"] = 2 small
        # labels under it with a mark between them.
        tfont = c.get("font", "head"); tfont = tfont if tfont in FAM else "head"
        ital = ";font-style:italic" if c.get("italic") else ""
        hi_col = c.get("accent_color", POP)
        # a soft highlight color on a white headline can't be read (sage on white): then the word gets the color as a marker behind it
        hi_css = f"color:{hi_col}" if _contrast(hi_col, c.get("color", MAIN)) >= 2.2 else f"background:{hi_col};color:{MAIN};padding:0 .14em;border-radius:.14em;-webkit-text-stroke:0;text-shadow:none"
        mark = lambda t: re.sub(r"\*([^*]+)\*", lambda m_: f'<span style="{hi_css}">{m_.group(1)}</span>', esc(t))
        plain_of = lambda t: t.replace("*", "")
        sizes = [c.get("size") or fit(plain_of(x), 230, 230 // 16) for x in lines]   # each line fitted on its own, outline included; "size" overrides (tight-tracked fonts fit bigger)
        ol = brand.get("title_outline", "#FFFFFF")                     # outline is for the hook title only, never captions
        olw = brand.get("title_outline_px")                            # fixed outline width (e.g. 2 for a faint hairline); default scales with size
        st = lambda px: f";-webkit-text-stroke:{olw or max(6, px // 16)}px {ol};paint-order:stroke fill" if ol and tfont == "head" and px >= 90 else ""   # 0.19.0: the outline is for big headline type; serif, body and small lines stay clean
        extra = ""
        if c.get("sub"): extra += f'<div class="tl tsub" style="{font("body", int(numf(c.get("sub_size"), 44)))};color:{c.get("sub_color", c.get("color", MAIN))};letter-spacing:0;text-align:{c.get("align", "center")};padding-top:18px;-webkit-text-stroke:0">{esc(c["sub"])}</div>'
        if isinstance(c.get("labels"), list) and len(c["labels"]) >= 2:
            l1, l2 = [esc(case(str(x))) for x in c["labels"][:2]]
            extra += (f'<div class="tl tlab" style="{font("body", 46)};letter-spacing:0;text-align:{c.get("align", "center")};padding-top:26px;-webkit-text-stroke:0">'
                      f'<span style="background:{LIGHT};color:{MAIN};padding:8px 26px;border-radius:40px">{l1}</span><span style="color:{c.get("color", MAIN)};padding:0 18px">|</span>'
                      f'<span style="background:{POP};color:{MAIN};padding:8px 26px;border-radius:40px">{l2}</span></div>')
        _ty = int(numf(c.get("y"), brand.get("title_y", 360)))   # 0.27.0: captions in the same spot move aside for the title (when it doesn't hide them)
        cover(a, b, _ty, _ty + int(sum(sizes) * 1.0) + (90 if c.get("overline") else 0) + (90 if c.get("sub") or c.get("labels") else 0))
        back.append(f'<div id="{cid}" class="title" style="{font(tfont, sizes[0])}{ital};top:{c.get("y", brand.get("title_y", 360))}px;color:{c.get("color", MAIN)};letter-spacing:{brand.get("title_tracking", -0.045) if tfont == "head" else -0.01}em;line-height:{.88 if tfont == "head" else 1.04}">'
                    + (f'<div class="tl ol" style="{font(c.get("overline_font", "hand"), c.get("overline_size", 78))};color:{c.get("overline_color", LIGHT)};letter-spacing:0;text-align:{c.get("align", "left")};padding-bottom:6px">{esc(c["overline"])}</div>' if c.get("overline") else "")   # Style Menu H3/L7: a small handwritten (or italic serif) line above the headline
                    + "".join(f'<div class="tl" style="font-size:{px}px;text-align:{c.get("align") or (("left", "right")[j % 2] if len(lines) > 1 else "center")}{st(px)}">{mark(x)}</div>' for j, (x, px) in enumerate(zip(lines, sizes))) + extra + "</div>")
        show(f"#{cid}", a, b)
        js.append(f'tl.fromTo("#{cid} .tl",{{clipPath:"inset(-40% 100% -40% 0%)",x:-30}},{{clipPath:"inset(-40% 0% -40% 0%)",x:0,duration:0.34,ease:"power3.out",stagger:0.25}},{q(a)});')
        sfx("snap", a + 0.03, -11)
    elif kind == "arctitle":
        # Added by By Mel Ross (0.23.0): a headline arched over the head with a few stars, and a heavy line under it.
        # {type:"arctitle", text:"Demystifying AI", sub:"part one", y?: 150, size?, sub_size?, sub_y?: 1180, color?, shadow?, trail?: true | {seconds, joint, side}}
        # The words wipe in from the left; "trail": true also lays a gold sparkle trail along the tracked hand while they arrive.
        if c.get("quiet", True): quiet.append((a, b))
        line = case(str(c.get("text", "")).strip()); subt = case(str(c.get("sub", "")).strip())
        col, shd = c.get("color", LIGHT), c.get("shadow", MAIN)
        ay = int(numf(c.get("y"), 150)); px = max(70, int(numf(c.get("size"), 128)))
        pid = f"{cid}p"
        px = min(px, int(px * 1160 / max(1, len(line) * px * 0.56)))   # the arc is about 1160 px long: a long line gets smaller, never cut off
        _off = 'transform="translate(8 12)"'
        def _arc(fill, extra=""):
            return (f'<text {extra} style="{font("head", px)};letter-spacing:-.02em" fill="{fill}" text-anchor="middle">'
                    f'<textPath href="#{pid}" startOffset="50%">{esc(line)}</textPath></text>')
        svg = (f'<svg class="arcs" viewBox="0 0 1080 700" width="1080" height="700" style="position:absolute;left:0;top:{ay}px;overflow:visible">'
               f'<defs><path id="{pid}" d="M 40 560 Q 540 -60 1040 560" fill="none"/></defs>'
               f'{_arc(shd, _off)}{_arc(col)}</svg>')
        star_d = "M12 0C12.7 7.4 16.6 11.3 24 12C16.6 12.7 12.7 16.6 12 24C11.3 16.6 7.4 12.7 0 12C7.4 11.3 11.3 7.4 12 0Z"
        stars = "".join(f'<svg class="ast" viewBox="0 0 24 24" style="position:absolute;left:{sx}px;top:{ay + sy}px;width:{sw}px;height:{sw}px;overflow:visible">'
                        f'<path d="{star_d}" fill="{col}"/></svg>' for sx, sy, sw in [(150, 190, 60), (500, 70, 56), (880, 150, 50), (100, 700, 46), (940, 740, 52)])
        sub_html = ""
        if subt:
            sp_ = int(numf(c.get("sub_size"), min(190, fit(subt, 190))))
            sub_html = (f'<div class="asub" style="position:absolute;left:0;width:1080px;top:{int(numf(c.get("sub_y"), 1180))}px;text-align:center;{font("head", sp_)};'
                        f'color:{col};letter-spacing:-.02em;text-shadow:6px 9px 0 {shd}">{esc(subt)}</div>')
        front.append(f'<div id="{cid}" style="position:absolute;inset:0">{svg}{stars}{sub_html}</div>')
        show(f"#{cid}", a, b)
        js.append(f'tl.fromTo("#{cid} .arcs",{{clipPath:"inset(0% 100% 0% 0%)"}},{{clipPath:"inset(0% 0% 0% 0%)",duration:0.9,ease:"power2.out"}},{q(a)});')
        for k_ in range(5):
            js.append(f'tl.fromTo("#{cid} .ast:nth-of-type({k_ + 2})",{{scale:0,rotation:-40}},{{scale:1,rotation:0,duration:0.35,ease:"back.out(2.4)"}},{q(a + 0.45 + 0.12 * k_)});')
            js.append(f'tl.to("#{cid} .ast:nth-of-type({k_ + 2})",{{scale:0.6,duration:0.5,ease:"sine.inOut",yoyo:true,repeat:3}},{q(a + 0.9 + 0.12 * k_)});')
        if subt: js.append(f'tl.fromTo("#{cid} .asub",{{scale:0.7,opacity:0,y:30}},{{scale:1,opacity:1,y:0,duration:0.4,ease:"back.out(2)"}},{q(a + 0.8)});')
        if c.get("trail"):
            tr = c["trail"] if isinstance(c["trail"], dict) else {}
            TRAIL_REQ.append({**tr, "start": a, "end": a + float(tr.get("seconds", 1.8))})
        sfx("swoosh-soft", a, -16)
    elif kind == "block":
        quiet.append((a, b))
        mid.append(f'<div id="{cid}" class="block" style="opacity:0;visibility:hidden;background:{c.get("color", MAIN)}">'
                   f'<div class="frame"><video id="{cid}v" src="master.mp4" muted playsinline data-start="{q(a)}" data-duration="{q(b - a)}" data-media-start="{q(a)}" data-track-index="{9 + i}"></video></div>'
                   f'<div class="bl" style="{font("head", fit(c.get("top", ""), 210))};top:230px;text-align:left;color:{LIGHT}">{esc(case(c.get("top", "")))}</div>'
                   f'<div class="bl" style="{font("head", fit(c.get("bottom", ""), 210))};top:1500px;text-align:right;color:#fff">{esc(case(c.get("bottom", "")))}</div></div>')
        js.append(f'tl.set("#{cid}",{{autoAlpha:1}},{q(a)});tl.fromTo("#{cid}",{{clipPath:"inset(0% 0% 0% 100%)"}},{{clipPath:"inset(0% 0% 0% 0%)",duration:0.22,ease:"power3.out"}},{q(a)});'
                  f'tl.fromTo("#{cid} .frame",{{scale:0.82}},{{scale:1,duration:0.5,ease:"back.out(1.6)"}},{q(a + 0.05)});'
                  f'tl.fromTo("#{cid} .bl",{{clipPath:"inset(0% 100% 0% 0%)"}},{{clipPath:"inset(0% 0% 0% 0%)",duration:0.34,ease:"power3.out",stagger:0.3}},{q(a + 0.12)});'
                  f'tl.to("#{cid}",{{clipPath:"inset(0% 100% 0% 0%)",duration:0.2,ease:"power3.in"}},{q(b - 0.2)});tl.set("#{cid}",{{autoAlpha:0}},{q(b)});')
        sfx("swish", a - 0.08, -12)
    elif kind == "card":
        rows = c.get("rows", [])
        rt = c.get("row_times") or [a + 0.45 + 0.35 * j for j in range(len(rows))]
        _top = numf(c.get("y"), 150); cover(a, b, _top, _top + 110 * (len(rows) + 1) + 40)   # 0.26.0: captions under it move to the other zone
        paper = mat("paper")
        if paper and not c.get("glass") and c.get("kit", True):
            # Added by By Mel Ross (0.11.0): with a kit, the list is a sheet of real paper, taped at the top, rows numbered with stickers
            tape = mat("tape"); tw = (KIT["materials"].get("tape") or {}).get("width") or 260
            front.append(f'<div id="{cid}" class="card kcard" style="background-image:url({paper}){f";top:{int(numf(c["y"], 150))}px" if "y" in c else ""}">'
                         + (f'<img class="ktape" src="{tape}" style="width:{tw}px;margin-left:{-tw // 2}px" />' if tape else "")
                         + f'<div class="kh" style="{font("hand", fit(c.get("title", ""), 76))};color:{INK or MAIN}">{esc(case(c.get("title", "")))}</div>'
                         + "".join(f'<div class="cr" id="{cid}r{j}" style="{font("body", 50)};color:{INK or MAIN}">'
                                   + (f'<img class="kst" src="{mat("stickers", j + 1)}" />' if mat("stickers", j + 1) else f'<b style="background:{POP}"></b>') + f'{esc(case(r))}</div>' for j, r in enumerate(rows)) + "</div>")
        else:
            front.append(f'<div id="{cid}" class="card{" glass" if c.get("glass") else ""}"{f' style="top:{int(numf(c["y"], 150))}px"' if "y" in c else ""}><div class="ch" style="background:{MAIN};{font("head", 40)}">{"<i></i>" if c.get("dot", LIST_DOT) else ""}{esc(case(c.get("title", "")))}</div>'
                         + "".join(f'<div class="cr" id="{cid}r{j}" style="{font("body", 50)};color:{MAIN}"><b style="background:{POP}"></b>{esc(case(r))}</div>' for j, r in enumerate(rows)) + "</div>")
        show(f"#{cid}", a, b)
        js.append(f'tl.fromTo("#{cid}",{{y:-160,scale:0.85,rotation:-3}},{{y:0,scale:1,rotation:-1.5,duration:0.5,ease:"back.out(1.6)"}},{q(a)});')
        for j, t in enumerate(rt):
            js.append(f'tl.fromTo("#{cid}r{j}",{{autoAlpha:0,x:-60}},{{autoAlpha:1,x:0,duration:0.3,ease:"back.out(2)"}},{q(t)});')
            sfx("pop", t, -16, "lots")
        sfx("swish", a - 0.05, -13)
    elif kind == "tag":
        cover(a, b, c.get("y", 300), c.get("y", 300) + 140)   # 0.26.0: captions under it move to the other zone
        lab = mat("label") if not c.get("glass") and c.get("kit", True) else ""     # a theme's tag color does not block the kit; "kit": false does
        if lab:   # Added by By Mel Ross (0.11.0): with a kit, the label is a real tag or sticker shape with the words on it
            front.append(f'<div id="{cid}" class="tagw" style="top:{c.get("y", 300)}px"><span class="tag ktag" style="background-image:url({lab});color:{c.get("text_color") or INK or MAIN};{font("head", 58)}">{esc(case(c["text"]))}</span></div>')
        else:
            front.append(f'<div id="{cid}" class="tagw" style="top:{c.get("y", 300)}px"><span class="tag{" glass" if c.get("glass") else ""}" style="background:{c.get("color", POP)};{f'color:{c["text_color"]};' if c.get("text_color") else ""}{font("head", 58)}">{esc(case(c["text"]))}</span></div>')
        show(f"#{cid}", a, b)
        js.append(f'tl.fromTo("#{cid} .tag",{{scale:0.4,y:30,opacity:0}},{{scale:1,y:0,opacity:1,duration:0.42,ease:"back.out(3)"}},{q(a)});')
        sfx("pop", a, -14)
    elif kind == "quote":
        # Added by By Mel Ross (0.19.0, Style Menu H12, H13): a sentence in a white rounded box above the head.
        # {type:"quote", text:"line one / line two", y?, size?, color?, marks?: false}. Captions keep running under it.
        lines = [l.strip() for l in str(c.get("text", "")).split("/") if l.strip()][:4] or [""]
        px = min(max(int(numf(c.get("size"), 64)), 30), fit(max(lines, key=len), 64, 80))
        if c.get("marks", True): lines[0] = "\u201c" + lines[0]; lines[-1] = lines[-1] + "\u201d"
        cover(a, b, int(numf(c.get("y"), 150)), int(numf(c.get("y"), 150)) + 380)
        front.append(f'<div id="{cid}" class="quotew" style="top:{int(numf(c.get("y"), 150))}px"><div class="quote" style="{font("head", px)};color:{c.get("color", MAIN)}">' + "".join(f"<div>{esc(l)}</div>" for l in lines) + "</div></div>")
        show(f"#{cid}", a, b)
        js.append(f'tl.fromTo("#{cid} .quote",{{scale:0.9,y:-24,opacity:0}},{{scale:1,y:0,opacity:1,duration:0.36,ease:"back.out(1.6)"}},{q(a)});')
        sfx("pop", a, -15)
    elif kind == "columns":
        # Added by By Mel Ross (0.19.0, Style Menu L15): 2 or 3 hand-lettered columns on a paper card above the head.
        # {type:"columns", cols:[{title:"keep", items:["a","b"], color?: "#hex"}, ...], y?}. Columns are written in one after another.
        cols_ = [x for x in (c.get("cols") or []) if isinstance(x, dict)][:3] or [{"title": "", "items": []}]
        inks = [SAGE_DEEP, MAIN, "#B4543C"]; cw_ = int(900 / len(cols_))
        ct = c.get("col_times") or [a + 0.3 + 0.5 * j for j in range(len(cols_))]
        cells = ""
        for j, col in enumerate(cols_):
            ink = col.get("color") or inks[j % 3]; items = [str(x) for x in (col.get("items") or [])][:4]
            hp = min(64, int(cw_ / (max(len(str(col.get("title", ""))), 1) * 0.5))); ip = min(48, int(cw_ / (max([len(x) for x in items] + [1]) * 0.46)))
            cells += (f'<div id="{cid}c{j}" class="colc" style="width:{cw_}px;color:{ink}"><div style="{font("hand", hp)};border-bottom:4px solid {ink};margin:0 18px 10px;padding-bottom:4px">{esc(str(col.get("title", "")))}</div>'
                      + "".join(f'<div style="{font("hand", ip)};line-height:1.25">{esc(x)}</div>' for x in items) + "</div>")
        cover(a, b, int(numf(c.get("y"), 110)), int(numf(c.get("y"), 110)) + 420)   # 0.26.0: captions under it move to the other zone
        front.append(f'<div id="{cid}" class="colw" style="top:{int(numf(c.get("y"), 110))}px;background:{LIGHT}">{cells}</div>')
        show(f"#{cid}", a, b)
        js.append(f'tl.fromTo("#{cid}",{{y:-120,opacity:0}},{{y:0,opacity:1,duration:0.4,ease:"power3.out"}},{q(a)});')
        for j, t in enumerate(ct[:len(cols_)]):
            js.append(f'tl.fromTo("#{cid}c{j}",{{clipPath:"inset(0% 100% 0% 0%)"}},{{clipPath:"inset(0% 0% 0% 0%)",duration:0.45,ease:"power2.out"}},{q(t)});'); sfx("pop", t, -17, "lots")
        sfx("swish", a - 0.05, -13)
    elif kind == "chips":
        # Added by By Mel Ross (0.19.0, Style Menu L17): a caps title with a row of numbered chips; each chip lights up at its moment.
        # {type:"chips", title:"5 things to fix", n: 5, chip_times?: [seconds...], y?}
        n_ = max(2, min(int(numf(c.get("n"), 5)), 7)); ttl = case(str(c.get("title", ""))).upper()
        px = fit(ttl, 88, 60) if ttl else 0; cs = int(min(120, (900 - 22 * (n_ - 1)) / n_))
        ct = c.get("chip_times") or [a + 0.5 + (max(b - a - 1.0, 0.6) / n_) * j for j in range(n_)]
        cover(a, b, int(numf(c.get("y"), 130)), int(numf(c.get("y"), 130)) + 200)   # 0.26.0: captions under it move to the other zone
        front.append(f'<div id="{cid}" class="chipw" style="top:{int(numf(c.get("y"), 130))}px">'
                     + (f'<div class="chipt" style="{font("head", px)};color:{c.get("color", "#FFFFFF")}">{esc(ttl)}</div>' if ttl else "")
                     + '<div class="chiprow">' + "".join(f'<span id="{cid}n{j}" class="chip" style="width:{cs}px;height:{cs}px;{font("head", int(cs * 0.5))};background:{LIGHT};color:{MAIN}">{j + 1}</span>' for j in range(n_)) + "</div></div>")
        show(f"#{cid}", a, b)
        js.append(f'tl.fromTo("#{cid} .chipt",{{y:-30,opacity:0}},{{y:0,opacity:1,duration:0.3,ease:"power3.out"}},{q(a)});tl.fromTo("#{cid} .chip",{{scale:0.4,opacity:0}},{{scale:1,opacity:1,duration:0.3,ease:"back.out(2.4)",stagger:0.06}},{q(a + 0.12)});')
        for j, t in enumerate(ct[:n_]):
            js.append(f'tl.to("#{cid}n{j}",{{backgroundColor:"{POP}",scale:1.14,duration:0.2,ease:"back.out(3)"}},{q(t)});tl.to("#{cid}n{j}",{{scale:1,duration:0.2}},{q(t + 0.25)});'); sfx("pop", t, -17, "lots")
        sfx("swish", a - 0.05, -13)
    elif kind == "note":
        # Added by By Mel Ross (0.11.0): a short handwritten note on a scrap of paper, taped up above the head.
        # {type:"note", text:"line one / line two", y?, rotate?, size?, start, end}. With a kit: its paper and tape. Without: a plain sheet.
        lines = [l.strip() for l in str(c.get("text", "")).split("/") if l.strip()][:4] or [""]
        px = min(max(int(numf(c.get("size"), 96)), 30), fit(max(lines, key=len), 96, 70)); rot = numf(c.get("rotate"), -3)
        paper = mat("paper") if c.get("kit", True) else ""; tape = mat("tape") if c.get("kit", True) else ""
        tw = (((KIT or {}).get("materials") or {}).get("tape") or {}).get("width") or 260
        cover(a, b, int(numf(c.get("y"), 210)), int(numf(c.get("y"), 210)) + 300)   # 0.26.0: captions under it move to the other zone
        front.append(f'<div id="{cid}" class="notew" style="top:{int(numf(c.get("y"), 210))}px"><div class="note{" knote" if paper else ""}" style="{f"background-image:url({paper});" if paper else f"background:{LIGHT};"}color:{(INK if paper else None) or MAIN};{font("hand", px)}">'
                     + (f'<img class="ktape" src="{tape}" style="width:{tw}px;margin-left:{-tw // 2}px" />' if tape else '<i class="ptape"></i>')
                     + "".join(f"<div>{esc(case(l))}</div>" for l in lines) + "</div></div>")
        show(f"#{cid}", a, b)
        js.append(f'tl.fromTo("#{cid} .note",{{y:-140,rotation:{rot - 9},scale:0.9}},{{y:0,rotation:{rot},scale:1,duration:0.5,ease:"back.out(1.7)"}},{q(a)});')
        sfx("swish", a - 0.05, -13); sfx("pop", a + 0.3, -16, "lots")
    elif kind == "cta":
        quiet.append((a, b))
        words = c["text"].split()
        # Modified by By Mel Ross (0.10.1): a soft highlight color on a light pill (sage on cream) was unreadable. When the two are
        # too close, the CAPS word gets the highlight as a marker behind it and keeps the main text color.
        hi = f"color:{POP}" if _contrast(POP, LIGHT) >= 3 else f"background:{POP};color:{MAIN};padding:0 .22em;border-radius:.2em"
        inner = " ".join(f'<span style="{hi}">{esc(w)}</span>' if w.isupper() and len(w) > 1 else esc(case(w)) for w in words)
        cover(a, b, c.get("y", 1360), c.get("y", 1360) + 150)   # 0.26.0: captions under it move to the other zone
        front.append(f'<div id="{cid}" class="ctaw" style="top:{c.get("y", 1360)}px"><span class="cta" style="{font("head", 78)};color:{MAIN};background:{LIGHT}">{inner}</span></div>')
        show(f"#{cid}", a, b)
        js.append(f'tl.fromTo("#{cid} .cta",{{scale:0.5,y:60,opacity:0}},{{scale:1,y:0,opacity:1,duration:0.5,ease:"back.out(2.4)"}},{q(a)});')
        sfx("coin", a + 0.1, -12)
    elif kind == "shot":
        cover(a, b, c.get("y", 130), c.get("y", 130) + 700)            # 0.26.0: a screenshot over the captions moves them aside
        front.append(f'<div id="{cid}" class="shot" style="top:{c.get("y", 130)}px"><div class="bar"><i style="background:#FF5F57"></i><i style="background:#FEBC2E"></i><i style="background:#28C840"></i>'
                     f'<span style="{font("body", 30)}">{esc(c.get("label", ""))}</span></div><div class="vp"><img src="{img(c["src"])}" /></div></div>')
        show(f"#{cid}", a, b)
        js.append(f'tl.fromTo("#{cid}",{{y:-200,scale:0.8,rotation:3}},{{y:0,scale:1,rotation:1.5,duration:0.55,ease:"back.out(1.5)"}},{q(a)});'
                  f'tl.fromTo("#{cid} img",{{y:0}},{{y:-120,duration:{max(b - a - 0.8, 0.5):.2f},ease:"sine.inOut"}},{q(a + 0.6)});')
        sfx("swish", a - 0.05, -12); sfx("typing", a + 0.5, -17, dur=0.8)
    elif kind == "image":
        srcs = c["src"] if isinstance(c["src"], list) else [c["src"]]
        spots = {1: [(540, 0)], 2: [(380, -6), (700, 7)], 3: [(300, -8), (540, 3), (780, 9)]}[min(len(srcs), 3)]
        front.append(f'<div id="{cid}" class="imgs">' + "".join(
            f'<img class="ph" src="{img(s)}" style="left:{x - 210}px;transform:rotate({r}deg)" />' for s, (x, r) in zip(srcs, spots)) + "</div>")
        show(f"#{cid}", a, b)
        js.append(f'tl.fromTo("#{cid} .ph",{{y:-260,opacity:0,scale:0.7}},{{y:0,opacity:1,scale:1,duration:0.5,ease:"back.out(1.7)",stagger:0.18}},{q(a)});')
        sfx("swish", a, -13)
    elif kind == "sticker":
        sz = c.get("size", 260)
        front.append(f'<div id="{cid}" class="stk" style="left:{c.get("x", 760) - sz // 2}px;top:{c.get("y", 420) - sz // 2}px;width:{sz}px"><img src="{img(c["src"])}" /></div>')
        show(f"#{cid}", a, b, 0.15)
        js.append(f'tl.fromTo("#{cid}",{{scale:0,rotation:-25}},{{scale:1,rotation:{c.get("rotate", 6)},duration:0.5,ease:"back.out(3)"}},{q(a)});')
        sfx("pop", a, -13)
    elif kind == "popup":
        # Added by By Mel Ross (editor page): a picture, graphic or animated GIF that pops up in a corner (default top right, clear of the face)
        asset = popup_asset(c["src"], max(b - a, 0.5), c.get("from", 0), bool(c.get("loop")))
        if not asset: continue
        mkind, ppath, iw, ih = asset
        is_clip = mkind == "clip"; mkind = "video" if is_clip else mkind
        pw = max(int(numf(c.get("size"), 440 if is_clip else 360)), 40)
        if c.get("pos") in ("side-left", "side-right"): pw = min(pw, 500)
        ph = max(int(round(pw * ih / max(iw, 1))), 1)
        framed = c.get("frame", Path(str(c["src"])).suffix.lower() in (".jpg", ".jpeg", ".heic", ".heif"))
        pos = c.get("pos") or "center"; top0 = 110 if c.get("caption") else 150; mx = 60
        if pos in ("side-left", "side-right"):
            left, top = (W // 2 - 12 - pw if pos == "side-left" else W // 2 + 12), (H - ph) // 2
        elif pos == "custom" or ("x" in c and "y" in c and pos not in POPUP_POS):
            left, top = int(c.get("x", W / 2) - pw / 2), int(c.get("y", 400) - ph / 2)
        else:
            left = {"left": mx, "center": (W - pw) // 2, "right": W - mx - pw}[POPUP_POS.get(pos, ("center", "center"))[1]]
            top = {"top": top0, "middle": (H - ph) // 2 - 260, "center": (H - ph) // 2}[POPUP_POS.get(pos, ("center", "center"))[0]]
        rot = c.get("rotate", 0)
        media = (f'<video id="{cid}v" src="{ppath}" muted playsinline data-start="{q(a)}" data-duration="{q(b - a)}" data-track-index="{60 + i}"></video>'
                 if mkind == "video" else f'<img src="{ppath}" />')
        cap_html = ""
        if c.get("caption"):                                          # Style Menu L9: a handwritten label on a torn strip across the photo's lower edge
            cap_html, tw_, th_ = tape(c["caption"], c.get("caption_size", 56), c.get("caption_bg", POP), c.get("caption_color", MAIN), seed=i + 3, rot=c.get("caption_rotate", -3), maxw=max(pw + 80, 320))
            cap_html = f'<div style="position:absolute;left:{(pw - tw_) // 2}px;top:{ph - 22}px;width:{tw_}px;height:{th_}px">{cap_html}</div>'
        front.append(f'<div id="{cid}" class="pop{" framed" if framed else ""}{" vclip" if is_clip else ""}" style="left:{left}px;top:{top}px;width:{pw}px;height:{ph}px">{media}{cap_html}</div>')
        show(f"#{cid}", a, b, 0.15)
        if is_clip:   # a window of video slides up into place; it does not spin in like a sticker
            js.append(f'tl.fromTo("#{cid}",{{scale:0.82,y:60,rotation:{rot}}},{{scale:1,y:0,rotation:{rot},duration:0.4,ease:"back.out(1.6)"}},{q(a)});')
        else:
            js.append(f'tl.fromTo("#{cid}",{{scale:0,rotation:{rot - 20}}},{{scale:1,rotation:{rot},duration:0.5,ease:"back.out(2.4)"}},{q(a)});')
        if c.get("exit") or c.get("caption"):
            js.append(f'tl.to("#{cid}",{{scale:0.86,rotation:{rot + 4},duration:0.2,ease:"power2.in"}},{q(max(b - 0.2, a + 0.6))});')
        if cap_html: js.append(f'tl.fromTo("#{cid} .tp",{{opacity:0,y:14}},{{opacity:1,y:0,duration:0.3,ease:"power2.out"}},{q(a + 0.35)});')
        sfx("pop", a, -13)
    elif kind == "orbit":
        ORBITS.append((i, c, a, b))                                   # built with the layers below: the ring is placed from the speaker's cutout
        sfx("whoosh", a, -15)
    elif kind == "polaroids":
        # Style Menu L2: 1-4 tilted white photo cards fan in with a handwritten label on a torn strip. Sized for face-filling footage:
        # a small stack in a top corner (side left/right) so it stays off the eyes; "size" and "y" move it.
        cloud = c.get("layout") == "cloud"   # Added by By Mel Ross (0.19.0, Style Menu L12): up to 8 smaller cards in an arc above the head
        srcs = (c["src"] if isinstance(c["src"], list) else [c["src"]])[:8 if cloud else 4]; n = len(srcs)
        sz = int(c.get("size", 170 if cloud else 240)); pad = 12; chin = 46
        if cloud: pad, chin = 8, 22
        spread = int((W - 120 - sz) / max(n - 1, 1)) if cloud else int(sz * 0.36); cw = sz + (n - 1) * spread
        side = "center" if cloud else c.get("side", "left")
        cx = c["x"] if "x" in c else {"left": 50 + cw // 2 + 18, "right": W - 50 - cw // 2 - 18}.get(side, W // 2)
        top = int(c.get("y", 100))
        rots = c.get("rotate") or ([(-11, 7, -5, 9, -8, 5, -9, 10)[j] for j in range(n)] if cloud else {1: [-4], 2: [-7, 6], 3: [-8, 2, 8], 4: [-9, -2, 4, 9]}[n])
        dys = [int(150 * abs((j - (n - 1) / 2) / max((n - 1) / 2, 1)) ** 1.6) + (0, 16, -6, 10)[j % 4] for j in range(n)] if cloud else [0, 12, -4, 14]   # cloud: the ends hang lower, like an arc
        parts = []
        for j, sj in enumerate(srcs):
            left = int(cx - sz / 2 + (j - (n - 1) / 2) * spread)
            parts.append(f'<div id="{cid}p{j}" class="pl" style="left:{left}px;top:{top + dys[j]}px;width:{sz - 2 * pad}px;padding:{pad}px {pad}px {chin}px">'
                         f'<img src="{img(sj)}" style="width:{sz - 2 * pad}px;height:{sz - 2 * pad}px" /></div>')
        if top + sz + 34 + (60 if c.get("label") else 0) > 470: print(f"note: card {i} (polaroids) reaches y {top + sz + 34 + (60 if c.get('label') else 0)}: the speaker's eyes are usually near y 500-560, check the frames")
        lab = ""
        if c.get("label"):
            lab_html, lw_, lh_ = tape(c["label"], c.get("label_size", 66), c.get("label_bg", POP), c.get("label_color", MAIN), seed=i + 7, rot=c.get("label_rotate", -3), maxw=min(W - 100, cw + 160))
            lab = f'<div id="{cid}l" style="position:absolute;left:{int(cx - lw_ / 2)}px;top:{top + sz - 2 + max(dys[:n])}px;width:{lw_}px;height:{lh_}px">{lab_html}</div>'
        front.append(f'<div id="{cid}" class="pls">' + "".join(parts) + lab + "</div>")
        show(f"#{cid}", a, b)
        for j in range(n):
            js.append(f'tl.fromTo("#{cid}p{j}",{{y:-260,opacity:0,scale:0.65,rotation:{rots[j] - 14}}},{{y:0,opacity:1,scale:1,rotation:{rots[j]},duration:0.5,ease:"back.out(1.7)"}},{q(a + 0.16 * j)});')
        if lab: js.append(f'tl.fromTo("#{cid}l",{{opacity:0,y:16}},{{opacity:1,y:0,duration:0.3,ease:"power2.out"}},{q(a + 0.16 * n + 0.2)});')
        sfx("swish", a, -13)
    elif kind == "xlist":
        # Style Menu L6: a paper card, a hand-drawn mark drawn on beside each short phrase, one by one. Default mark is a sage check; "mark": "x" gives red X marks.
        items = [x if isinstance(x, dict) else {"text": x} for x in c["items"]]
        mark = c.get("mark", "check"); y0 = int(c.get("y", 1050)); rh = 116
        if c.get("quiet", True): quiet.append((a, b))
        rt = c.get("row_times") or [a + 0.5 + 0.9 * j for j in range(len(items))]
        rows = []
        for j, it in enumerate(items):
            mk = it.get("mark", mark)
            col = it.get("color") or c.get("color") or (RED_X if mk == "x" else SAGE_DEEP)
            paths = ('<path d="M12 14C22 24 38 40 52 54" /><path d="M52 12C42 24 26 40 12 52" />' if mk == "x"
                     else '<path d="M8 34C15 40 22 48 27 55C34 38 44 22 58 9" />')
            px = int(min(c.get("size", 80), 690 / (max(len(it["text"]), 1) * 0.46)))
            rows.append(f'<div class="xr" id="{cid}r{j}" style="height:{rh}px"><svg class="xm" viewBox="0 0 64 64" width="74" height="74" fill="none" stroke="{col}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">'
                        + paths.replace("<path ", '<path pathLength="1" style="stroke-dasharray:1" ') + f'</svg><span class="xt" style="{font(c.get("font", "hand"), px)};color:{MAIN}">{esc(it["text"])}</span></div>')
        front.append(f'<div id="{cid}" class="xl" style="left:90px;top:{y0}px;width:900px;padding:24px 44px">' + "".join(rows) + "</div>")
        show(f"#{cid}", a, b)
        js.append(f'tl.fromTo("#{cid}",{{y:90,scale:0.92,rotation:-3}},{{y:0,scale:1,rotation:-1.2,duration:0.5,ease:"back.out(1.6)"}},{q(a)});')
        for j, t in enumerate(rt):
            js.append(f'tl.fromTo("#{cid}r{j} .xt",{{clipPath:"inset(-20% 100% -20% 0%)",x:-24}},{{clipPath:"inset(-20% 0% -20% 0%)",x:0,duration:0.32,ease:"power3.out"}},{q(t)});'
                      f'tl.fromTo("#{cid}r{j} path",{{strokeDashoffset:1}},{{strokeDashoffset:0,duration:0.3,ease:"power2.out",stagger:0.14}},{q(t + 0.12)});')
            sfx("pop", t, -16, "lots")
        sfx("swish", a - 0.05, -13)
    elif kind == "stat":
        # Style Menu L8: a white dashboard card with the real number pops in over the lower half while the speaker talks.
        sw = int(c.get("w", 720)); y0 = int(c.get("y", 1080))
        if c.get("quiet", True): quiet.append((a, b))
        vpx = int(min(c.get("size", 170), (sw - 80) / (max(len(str(c["value"])), 1) * 0.6)))
        delta = f'<span class="sd" style="background:{POP};color:{MAIN};{font("body", 34)}">{esc(c["delta"])}</span>' if c.get("delta") else ""
        spark = ""
        if c.get("spark"):
            vs = [float(v) for v in c["spark"]]; lo, hi = min(vs), max(vs); span_ = (hi - lo) or 1
            pts = " ".join(f"{round(8 + k * (284 / max(len(vs) - 1, 1)), 1)},{round(76 - (v - lo) / span_ * 64, 1)}" for k, v in enumerate(vs))
            spark = (f'<svg class="ss" viewBox="0 0 300 90" width="300" height="90" fill="none" stroke="{SAGE_DEEP}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">'
                     f'<polyline pathLength="1" style="stroke-dasharray:1" points="{pts}"/></svg>')
        front.append(f'<div id="{cid}" class="stat" style="left:{(W - sw) // 2}px;top:{y0}px;width:{sw}px"><div class="sl" style="{font("body", 36)};color:{MAIN}">{esc(c.get("label", ""))}</div>'
                     f'<div class="sr"><span class="sv" style="{font("head", vpx)};color:{MAIN}">{esc(str(c["value"]))}</span>{delta}</div>{spark}</div>')
        show(f"#{cid}", a, b)
        js.append(f'tl.fromTo("#{cid}",{{scale:0.55,y:70,rotation:-3}},{{scale:1,y:0,rotation:-1.5,duration:0.55,ease:"back.out(2)"}},{q(a)});')
        if spark: js.append(f'tl.fromTo("#{cid} polyline",{{strokeDashoffset:1}},{{strokeDashoffset:0,duration:0.7,ease:"power2.out"}},{q(a + 0.35)});')
        sfx("pop", a, -13)
    elif kind == "tiles":
        # Style Menu L4: a torn paper label above a grid of soft icon tiles; each tile pops on in turn.
        tl_ = [x if isinstance(x, dict) else {"label": x} for x in c["tiles"]]; n = len(tl_)
        column = c.get("layout") == "column"   # Added by By Mel Ross (0.19.0, Style Menu L14): one column of small tiles down one side
        cols = 1 if column else n if n <= 4 else 3 if n <= 6 else 4
        gap = 26; ts = int(min(230, (900 - gap * (cols - 1)) / cols)); th = int(ts * 1.08)
        if column: n = min(n, 5); tl_ = tl_[:5]; gap = 18; ts = 170; th = 170
        y0 = int(c.get("y", 560 if column else 1050))
        if c.get("quiet", not column): quiet.append((a, b))
        rt = c.get("tile_times") or [a + 0.45 + 0.28 * j for j in range(n)]
        lab_html, lw_, lh_ = tape(c.get("label", ""), c.get("label_size", 76), c.get("label_bg", LIGHT), c.get("label_color", MAIN), seed=i + 5, rot=-2, maxw=W - 140) if c.get("label") else ("", 0, 0)
        gy = y0 + (lh_ + 26 if lab_html else 0)
        cells = []
        for j, t_ in enumerate(tl_):
            r_, k_ = divmod(j, cols); in_row = min(cols, n - r_ * cols)
            left = int((W - (in_row * ts + (in_row - 1) * gap)) / 2 + k_ * (ts + gap)); top = gy + r_ * (th + gap)
            if column: left = 50 if c.get("side", "left") == "left" else W - 50 - ts
            ic = t_.get("icon", "")
            if ic in ICONS: glyph = f'<svg viewBox="0 0 24 24" width="{int(ts * 0.36)}" height="{int(ts * 0.36)}" fill="none" stroke="{MAIN}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">{ICONS[ic]}</svg>'
            elif ic and Path(str(ic)).suffix.lower() in (".png", ".jpg", ".jpeg", ".webp") and img(ic): glyph = f'<img src="{img(ic)}" style="width:{int(ts * 0.4)}px;height:{int(ts * 0.4)}px;object-fit:contain" />'
            else: glyph = f'<span style="{font("head", int(ts * 0.3))};color:{MAIN}">{esc(ic or t_.get("label", "?")[:1].upper())}</span>'
            lpx = int(min(30, ts * 0.9 / max(len(t_.get("label", "")) * 0.52, 1) * 1.6)) if len(t_.get("label", "")) > 10 else 30
            cells.append(f'<div id="{cid}t{j}" class="tile" style="left:{left}px;top:{top}px;width:{ts}px;height:{th}px"><div class="ti" style="background:{mix_hex(POP, "#ffffff", 0.55)}">{glyph}</div>'
                         f'<div class="tt" style="{font("body", max(lpx, 22))};color:{MAIN}">{esc(t_.get("label", ""))}</div></div>')
        labdiv = (f'<div id="{cid}l" style="position:absolute;left:{(W - lw_) // 2}px;top:{y0}px;width:{lw_}px;height:{lh_}px">{lab_html}</div>' if lab_html else "")
        front.append(f'<div id="{cid}" class="tg">{labdiv}' + "".join(cells) + "</div>")
        show(f"#{cid}", a, b)
        if lab_html: js.append(f'tl.fromTo("#{cid}l",{{clipPath:"inset(0% 100% 0% 0%)",y:-24}},{{clipPath:"inset(0% 0% 0% 0%)",y:0,duration:0.4,ease:"power3.out"}},{q(a)});')
        for j, t in enumerate(rt):
            js.append(f'tl.fromTo("#{cid}t{j}",{{scale:0.5,y:44,opacity:0}},{{scale:1,y:0,opacity:1,duration:0.42,ease:"back.out(2.2)"}},{q(t)});')
            sfx("pop", t, -16, "lots")
        sfx("swish", a - 0.05, -13)
    elif kind == "page":
        bg = c.get("bg", LIGHT)
        rgb = tuple(int(LIGHT.lstrip("#")[k:k + 2], 16) for k in (0, 2, 4))
        fade = f"linear-gradient(rgba({rgb[0]},{rgb[1]},{rgb[2]},.92) 0%, rgba({rgb[0]},{rgb[1]},{rgb[2]},.55) 28%, rgba({rgb[0]},{rgb[1]},{rgb[2]},.15) 60%)"
        blur = bg == "blur"   # Added by By Mel Ross (0.19.0, Style Menu L10): the background is the same clip, enlarged and blurred; the clip sits in the middle as a card
        bgcss = "background:#000" if blur else f"background:{bg}" if bg.startswith("#") else f"background:{fade}, url('{img(bg)}') center/cover"   # fade keeps the title readable
        if blur: quiet.append((a, b)) if c.get("quiet") else None
        mid.append(f'<div id="{cid}" class="page{" pblur" if blur else ""}" style="opacity:0;visibility:hidden;{bgcss}">'
                   + (f'<video class="pbg" id="{cid}b" src="master.mp4" muted playsinline data-start="{q(a)}" data-duration="{q(b - a)}" data-media-start="{q(a)}" data-track-index="{40 + i}"></video>' if blur else "")
                   + (f'<div class="plabel" style="{font("body", 34)};color:{MAIN}">{esc(str(c["label"]).upper())}</div>' if c.get("label") else "")
                   + (f'<div class="pt" style="{font("head", 92)};color:{c.get("color", MAIN)}">{esc(case(c["title"]))}</div>' if c.get("title") else "")
                   + f'<div class="pf"><video id="{cid}v" src="master.mp4" muted playsinline data-start="{q(a)}" data-duration="{q(b - a)}" data-media-start="{q(a)}" data-track-index="{9 + i}"></video></div></div>')
        js.append(f'tl.set("#{cid}",{{autoAlpha:1}},{q(a)});tl.fromTo("#{cid}",{{clipPath:"inset(100% 0% 0% 0%)"}},{{clipPath:"inset(0% 0% 0% 0%)",duration:0.3,ease:"power3.out"}},{q(a)});'
                  f'tl.fromTo("#{cid} .pf",{{y:300}},{{y:0,duration:0.5,ease:"back.out(1.4)"}},{q(a + 0.08)});'
                  f'tl.to("#{cid}",{{clipPath:"inset(0% 0% 100% 0%)",duration:0.25,ease:"power3.in"}},{q(b - 0.25)});tl.set("#{cid}",{{autoAlpha:0}},{q(b)});')
        sfx("swish", a - 0.08, -12)
    elif kind == "motion":
        src = next((f for f in (HF / "compositions").rglob(f"{c['name']}.html")), None)
        if not src:
            print(f"warning: motion {c['name']!r} not cached - add it: cd {HF} && npx hyperframes add {c['name']}"); continue
        rel = mount(src); txt = src.read_text()
        comp_id = re.search(r'data-composition-id="([^"]+)"', txt).group(1)
        nw, nh = (int(re.search(r'data-width="(\d+)"', txt).group(1)), int(re.search(r'data-height="(\d+)"', txt).group(1))) \
            if re.search(r'data-width="(\d+)"', txt) else (1080, 1080)
        vars_ = dict(c.get("vars", {}))
        if c.get("images"):                              # carousels: fill every image slot, cycling the supplied images
            slots = sorted({int(m) for m in re.findall(r'"id":\s*"image(\d+)"', txt)})
            ims = [img(x) for x in c["images"]]
            for k, sl in enumerate(slots): vars_[f"image{sl}"] = ims[k % len(ims)]
            vars_.setdefault("background", "transparent")
        x, y, bw, bh = c.get("box", [0, 160, W, int(W * nh / nw)])
        sc = bw / nw
        cover(a, b, y, y + bh * 0.7)                      # 0.26.0: motion over the captions moves them aside
        vals = html.escape(json.dumps(vars_), quote=True)
        mid.append(f'<div id="{cid}" class="clip" data-composition-id="{comp_id}" data-composition-src="{rel}" data-variable-values="{vals}" '
                   f'data-start="{q(a)}" data-duration="{q(b - a)}" data-track-index="{40 + i}" data-width="{nw}" data-height="{nh}" '
                   f'style="position:absolute;left:{x}px;top:{y}px;width:{nw}px;height:{nh}px;transform:scale({sc:.4f});transform-origin:0 0;'
                   f'--brand:{MAIN};--accent:{POP};--accent-2:{C.get("soft", POP)};--surface:{LIGHT};--fg:{MAIN};--muted:{C.get("soft", POP)}"></div>')
        sfx("swish", a - 0.05, -12)
    elif kind == "follow":
        src = HF / "compositions/components/caption-camera-follow.html"
        t = src.read_text()
        words = [{"text": case(w["text"]), **({"accent": True} if w.get("accent") else {})} for w in c["words"]]
        n = max(len(words), 1); dur = b - a
        t = re.sub(r"var WORDS = \[.*?\];", "var WORDS = " + json.dumps(words) + ";", t, flags=re.S)
        t = t.replace("var DUR = 9;", f"var DUR = {dur:.2f};").replace("var STEP = 0.52;", f"var STEP = {max(0.22, (dur - 1.2) / n):.3f};")
        t = t.replace('var ACCENT = ACCENTS[pick(ACCENTS, vars.accent, "gold")];', f'var ACCENT = "{CAP_ACC}";')
        t = t.replace('data-duration="9"', f'data-duration="{dur:.2f}"')
        fam = FAM["head"][0].replace("'", '"')
        t = t.replace('font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;', f"font-family: {fam};")
        t = t.replace("'font-family:\"Helvetica Neue\",Helvetica,Arial,sans-serif;font-weight:700;'", "'font-family:" + fam.replace('"', '\\"') + ";font-weight:700;'")
        if CASE == "lower": t = t.replace("text-transform: uppercase;", "text-transform: none;").replace('"text-transform:uppercase;', '"text-transform:none;')
        t = t.replace("<style>", "<style>\n" + "\n".join(font_css), 1)   # sub-compositions need their own @font-face
        out = proj / "compositions" / f"follow-{i}.html"; out.write_text(t)
        vals = html.escape(json.dumps({"framing": c.get("framing", "wide"), "smear": c.get("smear", "subtle")}), quote=True)
        front.append(f'<div id="{cid}" class="clip" data-composition-id="caption-camera-follow" data-composition-src="compositions/follow-{i}.html" '
                     f'data-variable-values="{vals}" data-start="{q(a)}" data-duration="{q(dur)}" data-track-index="{40 + i}" '
                     f'style="position:absolute;inset:0;width:{W}px;height:{H}px"></div>')
        quiet.append((a, b)); sfx("sparkle", a, -12)
    else:
        print(f"warning: unknown card type {kind!r} - skipped")

_marks.append((len(back), len(mid), len(front), len(js)))
CARD_MUTE = False
CARD_SFX = None
# ---- layers: cards that sit behind the speaker (Added by By Mel Ross) ------------------------------------------------
LAYERED = False
if ORBITS or any(c.get("layer") in ("behind", "both") for c in edit.get("cards", [])):
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import cutout, draft
    _src = reel / "master_sharp.mp4" if (reel / "master_sharp.mp4").exists() else reel / "master.mp4"
    _boxes = edit.get("cutout") if isinstance(edit.get("cutout"), dict) else None
    _m = None
    try:
        _own = (_boxes or {}).get("matte")                      # a white-on-black matte video of your own, instead of Apple Vision
        _m = cutout.build_matte(reel, _src, "balanced" if draft.is_draft() else "accurate", str(reel / _own) if _own else None, _boxes)
    except Exception as ex:
        print(f"warning: cutout failed ({ex})")
    if not _m:
        print("note: no speaker cutout on this machine (needs macOS with the Swift compiler): layered graphics are drawn as plain overlays in front")
    for i, c in enumerate(edit.get("cards", [])):
        lay = c.get("layer")
        if lay not in ("behind", "both"): continue
        if c["type"] in ("block", "page", "motion", "follow"):
            print(f"note: card {i} ({c['type']}) fills the frame, so it can't sit behind the speaker: left in front"); continue
        a_, b_ = c["start"], min(c.get("end") or phrase_end(c["start"]), DUR)
        ok, why = cutout.check(reel, a_, b_) if _m else (False, "no cutout available")
        if not ok:
            print(f"note: card {i} at {a_:.1f}s ({c['type']}): not layered behind the speaker ({why}); drawn as a plain overlay in front"); continue
        (_b0, _m0, _f0, _j0), (_b1, _m1, _f1, _j1) = _marks[i], _marks[i + 1]
        pieces = [("back", k) for k in range(_b0, _b1)] + [("front", k) for k in range(_f0, _f1)]
        for where, k in pieces:
            lst = back if where == "back" else front
            html_item, lst[k] = lst[k], ""
            behind.append(html_item)
            if lay == "both":                                   # a clipped copy in front: the card weaves around the speaker
                fp = c.get("front_part", "bottom")
                inset = ("inset(1100px 0 0 0)" if fp == "bottom" else "inset(0 0 820px 0)" if fp == "top"
                         else f"inset({fp[1]}px {W - fp[0] - fp[2]}px {H - fp[1] - fp[3]}px {fp[0]}px)")
                cp = re.sub(rf'id="k{i}(?!\d)', f'id="k{i}f', html_item)
                front.append(f'<div class="lp" style="visibility:visible;opacity:1;clip-path:{inset}">{cp}</div>')
        if lay == "both":
            js.extend(re.sub(rf'#k{i}(?!\d)', f'#k{i}f', line) for line in js[_j0:_j1])
        LAYERED = True
    import math
    for i, c, a_, b_ in ORBITS:
        # Added by By Mel Ross: photos on a ring around the head. Each photo is drawn twice, once under the speaker's cutout and once
        # above it, on the same path; only one copy shows at a time, and they swap at the far left and right of the ring, where the
        # photo is beside the head. The path is plain tweens with a cosine/sine ease, so it renders the same frame by frame.
        ok, why = cutout.check(reel, a_, b_) if _m else (False, "no cutout available")
        head = cutout.head_box(reel, a_, b_, W, H) if ok else None
        if ok and not head: ok, why = False, "the head was not found in the cutout"
        srcs = c.get("src") if isinstance(c.get("src"), list) else [c.get("src")]
        assets = [x for x in (popup_asset(s_, max(b_ - a_, 0.5)) for s_ in srcs[:6] if s_) if x]
        assets = [x for x in assets if x[0] != "clip"]                   # the ring takes pictures and GIFs; a video clip is left out
        if not assets: print(f"warning: orbit card {i} has no pictures this machine can read: skipped"); continue
        hd = head or {"cx": W // 2, "top": 330, "w": 420, "h": 546}
        size = int(c.get("size") or min(max(hd["w"] * 0.4, 120), 200)); depth = float(c.get("depth", 0.16))
        level = c.get("level", "crown")
        ry0 = int(c.get("ry", 50 if level == "crown" else 70))
        tall = max(size * ih_ / max(iw_, 1) for _, _, iw_, ih_ in assets)
        cx, cy = hd["cx"], hd["top"] + int(hd["h"] * (1.28 if level == "chest" else 0.12))
        if level != "chest":                                           # keep the near side of the ring above the eyes (about 42% down the head)
            cy = min(cy, int(hd["top"] + hd["h"] * 0.42 - ry0 - tall * (1 + depth) / 2))
        if c.get("center"): cx, cy = c["center"]
        rx = int(c.get("rx") or min(hd["w"] * (0.78 if level == "chest" else 0.5) + size * 0.5 + 40, max(min(cx, W - cx) - size * 0.6, size)))
        ry = ry0
        period = max(float(c.get("period", 4)), 0.5); turn = (1 if c.get("dir", 1) >= 0 else -1) * 2 * math.pi * (b_ - a_) / period
        cid = f"k{i}"
        under, over = [], []
        for k, (mkind, ppath, iw, ih) in enumerate(assets):
            pw = size; ph = max(int(round(pw * ih / max(iw, 1))), 1)
            framed = c.get("frame", True)
            th0 = -math.pi / 2 + 2 * math.pi * k / len(assets)             # the first photo starts at the back of the ring, behind the head
            near = lambda p_: math.sin(th0 + turn * p_) > 0                # near side of the ring = lower half of the oval = in front
            n0, n1 = math.ceil((min(th0, th0 + turn)) / math.pi - 1e-9), math.floor((max(th0, th0 + turn)) / math.pi + 1e-9)
            swaps = sorted(p_ for p_ in ((n * math.pi - th0) / turn for n in range(n0, n1 + 1)) if 1e-6 < p_ < 1 - 1e-6)
            start_near = near(1e-4)
            for copy, lst in (("b", under), ("f", over)):
                if copy == "b" and not ok: continue
                shown = start_near if copy == "f" else not start_near
                media = (f'<video id="{cid}{copy}{k}v" src="{ppath}" muted playsinline data-start="{q(a_)}" data-duration="{q(b_ - a_)}" data-track-index="{200 + i * 16 + k * 2 + (copy == "f")}"></video>'
                         if mkind == "video" else f'<img src="{ppath}" />')
                lst.append(f'<div id="{cid}{copy}{k}" class="pop{" framed" if framed else ""}" style="left:{int(cx - pw / 2)}px;top:{int(cy - ph / 2)}px;width:{pw}px;height:{ph}px;'
                           f'{"" if shown else ("visibility:hidden" if ok else "opacity:0")}">{media}</div>')
            sel = f"#{cid}f{k}" + (f",#{cid}b{k}" if ok else "")
            dur_ = q(b_ - a_)
            js.append(f'tl.fromTo("{sel}",{{x:0}},{{x:{rx},duration:{dur_},ease:function(p){{return Math.cos({th0:.5f}+{turn:.5f}*p)}}}},{q(a_)});')
            js.append(f'tl.fromTo("{sel}",{{y:0}},{{y:{ry},duration:{dur_},ease:function(p){{return Math.sin({th0:.5f}+{turn:.5f}*p)}}}},{q(a_)});')
            js.append(f'tl.fromTo("{sel}",{{scale:1}},{{scale:{1 + depth},duration:{dur_},ease:function(p){{return Math.sin({th0:.5f}+{turn:.5f}*p)}}}},{q(a_)});')
            for p_ in swaps:
                t_, to_near = a_ + p_ * (b_ - a_), near(p_ + 1e-4)
                if ok:
                    js.append(f'tl.set("#{cid}f{k}",{{visibility:"{"inherit" if to_near else "hidden"}"}},{q(t_)});tl.set("#{cid}b{k}",{{visibility:"{"hidden" if to_near else "inherit"}"}},{q(t_)});')
                else:                                                       # no cutout: the far side of the ring is not drawn, so fade at the sides
                    js.append(f'tl.to("#{cid}f{k}",{{opacity:{1 if to_near else 0},duration:0.16}},{q(max(t_ - 0.08, a_))});')
        if ok:
            behind.append(f'<div id="{cid}b" class="orb">{"".join(under)}</div>'); show(f"#{cid}b", a_, b_, 0.25)
            LAYERED = True
        else:
            print(f"note: card {i} at {a_:.1f}s (orbit): not layered around the speaker ({why}); the photos show on the near side of the ring only")
        back.append(f'<div id="{cid}" class="orb">{"".join(over)}</div>'); show(f"#{cid}", a_, b_, 0.25)
        ring = f'#{cid}' + (f',#{cid}b' if ok else '')
        js.append(f'tl.fromTo("{ring}",{{scale:0.7}},{{scale:1,duration:0.45,ease:"back.out(1.6)"}},{q(a_)});')
        print(f"orbit card {i}: ring centre ({int(cx)}, {int(cy)}), {rx} x {ry} px, {len(assets)} photo(s)" + ("" if head else " (default position: no cutout to place it from)"))
    if LAYERED:
        _p = cutout.build_person(reel, reel / "master.mp4", _m)
        (proj / "cutout").mkdir(exist_ok=True); shutil.copy(_p, proj / "cutout" / "person.webm")
for e in edit.get("sfx_events", []):                  # extra effects chosen from the library (Added by By Mel Ross)
    sfx(e["name"], float(e["t"]), e.get("db", -10), manual=True)
# ---- brand rule: every edit has a carousel (unless the person said no for this reel) --------------------------------
if brand.get("require_carousel") and not edit.get("no_carousel_ok") and not any(
        k["type"] == "motion" and "carousel" in k.get("name", "") for k in edit.get("cards", [])):
    sys.exit("brand rule: add a carousel motion card (or ask them; if they say no, set \"no_carousel_ok\": true in edit.json)")

# ---- captions -----------------------------------------------------------------------------------------------------
cap_json = []
# Added by By Mel Ross (0.29.0): "caption_lead" (seconds, 0 to 0.5) shows every caption and every highlighted word that much
# earlier, for word times that run late. edit.json wins over brand.json. Captions only; graphics keep their times.
LEAD = min(0.5, max(0.0, numf(edit["caption_lead"] if "caption_lead" in edit else brand.get("caption_lead"), 0.0)))
if LEAD:
    for c in edit.get("captions", []):
        c["start"], c["end"] = max(0.0, c["start"] - LEAD), max(0.05, c["end"] - LEAD)
        for w in c["words"]: w["t"] = max(c["start"], w["t"] - LEAD)
def cap_y(c):
    """Where this caption goes (0.26.0): its own "pos" or "y", else the layout's zone; moved to the other zone when a graphic
    covers it for that stretch, and hidden when both zones are covered. None = hidden."""
    if c.get("pos") == "hide": return None
    y = int(numf(c.get("y"), CAP_ZONES.get(c.get("pos"), CAP_Y)))
    hit = lambda yy: any(a + 0.05 < c["end"] and c["start"] < b - 0.05 and top < yy + CAP_H and yy < bot for a, b, top, bot in covers)
    if not hit(y): return y
    for alt in (CAP_ZONES["top"], CAP_ZONES["bottom"], CAP_ZONES["middle"]):
        if alt != y and not hit(alt): return alt
    return None
for i, c in enumerate(edit.get("captions", [])):
    if any(a - 0.05 <= c["start"] < b for a, b in quiet): continue
    c["y"] = cap_y(c)
    if c["y"] is None: continue
    ws = c["words"]
    plain = c.get("plain")                                             # "before" captions: basic white sans, no brand styling
    cap_json.append({"start": c["start"], "end": c["end"], "over_light": False,
                     "lines": [[{"text": w["text"] if plain else case(w["text"]), "kind": "sm" if plain else "acc" if w.get("accent") else "big", "t": w["t"]} for w in ws]]})
    if CAPCUT: continue
    if plain:
        front.append(f'<div id="c{i}" class="cap" style="top:{int(numf(c.get("y"), CAP_Y))}px;font-family:-apple-system,Helvetica,Arial,sans-serif;font-weight:500;font-size:46px;letter-spacing:0;color:#fff">{esc(" ".join(w["text"] for w in ws))}</div>')
        show(f"#c{i}", c["start"], c["end"], 0.04); continue
    chars = sum(len(w["text"]) + 1 for w in ws)
    px = fit(" ".join(w["text"] for w in ws), CAP_PX * (1.35 if len(ws) == 1 else 1))
    big = 1.7 if CAPS.get("style") == "editorial" else 1.12          # editorial = dramatic size contrast on the emphasis word
    big = min(big, min((fit(w["text"], px * big) / px) for w in ws if w.get("accent")) if any(w.get("accent") for w in ws) else big)
    blk = "display:block;line-height:.95;" if CAPS.get("style") == "editorial" and len(ws) > 1 else ""
    acc_role = CAPS.get("accent_font", "accent") if CAPS.get("accent_font") in FAM else "accent"   # 0.19.0 (Style Menu C9): captions "accent_font": "head", "accent_italic": true
    acc_it = ";font-style:italic" if CAPS.get("accent_italic") else ""
    acc_box = (f";background:{CAP_ACC_BG};padding:.02em .2em .08em;border-radius:.16em;text-shadow:none;-webkit-box-decoration-break:clone;box-decoration-break:clone"
               + (";width:fit-content;margin:.06em auto" if blk else "")) if CAP_ACC_BG else ""
    spans = "".join(f'<span class="acc{" accbox" if CAP_ACC_BG else ""}" style="{blk}{font(acc_role, int(px * big))}{acc_it};color:{CAP_ACC}{acc_box}">{esc(case(w["text"]))}</span> ' if w.get("accent")
                    else f'<span>{esc(case(w["text"]))}</span> ' for w in ws)
    if CAPS.get("bg"):   # Added by By Mel Ross (0.19.0, Style Menu C6, C10): the words sit on a box or a bar. brand.json captions "bg": "#FFFFFF" | "rgba(0,0,0,.6)"
        spans = f'<span class="cb" style="background:{CAPS["bg"]};line-height:1.5">{spans.strip()}</span>'
    front.append(f'<div id="c{i}" class="cap{" capbg" if CAPS.get("bg") else ""}" style="top:{int(numf(c.get("y"), CAP_Y))}px;{font("body", int(px))};color:{CAP};letter-spacing:{CAPS.get("tracking", -0.02)}em">{spans.strip()}</div>')
    show(f"#c{i}", c["start"], c["end"], 0.06)
    js.append(f'tl.fromTo("#c{i}",{{scale:0.86,y:14}},{{scale:1,y:0,duration:0.16,ease:"back.out(2)"}},{q(c["start"])});')

# ---- hand trail (added by By Mel Ross, 0.23.0) -------------------------------------------------------------------------
# edit.json "hand_trail": [{"word": "highly", "seconds": 1.4}] or [{"start": 42.1, "end": 43.6}]; optional "joint": "palm" | "wrist" | "index",
# "side": "left" | "right", "lead": seconds before the word, "occurrence": 2, "density": 2, "sound": dB, "off": true. A card can ask for one too
# (arctitle "trail": true). Gold stars are laid along the tracked hand (Apple Vision, scripts/hand_track.py) and fade behind it. Colour and size:
# a "sparkle" block ({"color": "#F2C14E", "core": "#FFF6CF", "size": 1.2}) in brand.json or edit.json. Only what asks for a trail gets one.
TR = {"color": "#F2C14E", "core": "#FFF6CF", "size": 1.2, **(brand.get("sparkle") or {}), **(edit.get("sparkle") or {})}
STAR_PATH = "M12 0C12.7 7.4 16.6 11.3 24 12C16.6 12.7 12.7 16.6 12 24C11.3 16.6 7.4 12.7 0 12C7.4 11.3 11.3 7.4 12 0Z"
trail = []
HT = [{**(brand.get("hand_trail_defaults") or {}), **h} for h in edit.get("hand_trail", []) if not h.get("off")] + [{**(brand.get("hand_trail_defaults") or {}), **h} for h in TRAIL_REQ]
if HT and not CAPCUT:
    import hand_track as _ht
    _hd = _ht.load(reel)                        # None when hands can't be tracked on this computer: the reel still builds, with no trail
    if _hd is None: HT = []
    _sx, _sy = (W / _hd["w"], H / _hd["h"]) if _hd and _hd.get("w") and _hd.get("h") else (1, 1)   # the tracker's points are in the clip's own pixels
    _norm = lambda w: re.sub(r"[^a-z0-9']", "", w.lower())
    for e_, h in enumerate(HT):
        if "word" in h:
            hits = [w["t"] + LEAD for c in edit.get("captions", []) for w in c["words"] if _norm(w["text"]) == _norm(h["word"])]   # the spoken time, not the early caption
            occ = int(h.get("occurrence", 1)) - 1
            if occ >= len(hits): print(f"hand trail: the word {h['word']!r} is not in the captions - skipped"); continue
            t0 = hits[occ] - float(h.get("lead", 0.0)); t1 = hits[occ] + float(h.get("seconds", 1.4))
        else: t0, t1 = float(h["start"]), float(h["end"])
        pts = [(p_[0], None, None) if p_[1] is None else (p_[0], p_[1] * _sx, p_[2] * _sy) for p_ in _ht.path(_hd, t0, t1, h.get("joint", "palm"), h.get("side"))]
        if sum(1 for p_ in pts if p_[1] is not None) < 4: print(f"hand trail {t0:.2f}-{t1:.2f}: no hand found there - skipped"); continue
        rng = random.Random(900 + e_); sz = float(TR["size"]); col, core = TR["color"], TR["core"]; k_ = 0
        for p0, p1 in zip(pts, pts[1:]):
            if p0[1] is None or p1[1] is None: continue
            for sub in range(int(h.get("density", 2))):
                u = sub / int(h.get("density", 2)); ts = p0[0] + u * (p1[0] - p0[0])
                x = p0[1] + u * (p1[1] - p0[1]) + rng.uniform(-16, 16); y = p0[2] + u * (p1[2] - p0[2]) + rng.uniform(-16, 16)
                dot = rng.random() < 0.35
                sp_ = round((rng.uniform(5, 9) if dot else rng.uniform(15, 36)) * sz, 1); life = rng.uniform(0.55, 0.9)
                peak = rng.uniform(0.75, 1.15); rot = rng.uniform(-60, 60); sid = f"ht{e_}s{k_}"; k_ += 1
                shape = (f'<circle cx="12" cy="12" r="9" fill="{col}"/><circle cx="12" cy="12" r="4.5" fill="{core}"/>' if dot else
                         f'<path d="{STAR_PATH}" fill="{col}"/><path d="{STAR_PATH}" transform="translate(12 12) scale(.42) translate(-12 -12)" fill="{core}"/>')
                trail.append(f'<svg id="{sid}" class="spk" viewBox="0 0 24 24" style="left:{x:.1f}px;top:{y:.1f}px;width:{sp_}px;height:{sp_}px;margin:-{sp_ / 2}px 0 0 -{sp_ / 2}px">{shape}</svg>')
                js.append(f'tl.fromTo("#{sid}",{{scale:0,rotation:{rot - 40:.0f},opacity:0}},{{scale:{peak:.2f},rotation:{rot:.0f},opacity:1,duration:0.09,ease:"back.out(2)"}},{q(ts)});'
                          f'tl.to("#{sid}",{{scale:0,opacity:0,y:14,rotation:{rot + 50:.0f},duration:{life:.2f},ease:"power1.in"}},{q(ts + 0.09)});')
        if h.get("sound") is not None: sfx("sparkle", t0, float(h["sound"]), "subtle", manual=True)
        print(f"hand trail {t0:.2f}-{t1:.2f}: {k_} stars")

# ---- assemble -----------------------------------------------------------------------------------------------------
doc = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<style>
{chr(10).join(font_css)}
#trail {{ position: absolute; inset: 0; pointer-events: none; transform-origin: 50% 38%; }}   /* same origin as #cam: it zooms with the video, in front of the cards */
.spk {{ position: absolute; overflow: visible; opacity: 0; filter: drop-shadow(0 0 5px rgba(255,196,60,.95)) drop-shadow(0 0 14px rgba(255,170,30,.55)); }}
html, body {{ margin: 0; background: #000; overflow: hidden; }}
#stage {{ position: relative; width: {W}px; height: {H}px; overflow: hidden; }}
#cam {{ position: absolute; inset: 0; transform-origin: 50% 38%; }}
#cam > video {{ position: absolute; left: 0; top: 0; width: {W}px; height: {H}px; object-fit: cover; }}
#back, #mid, #front, #behind {{ position: absolute; inset: 0; }}
#back > :not(.clip), #mid > :not(.clip), #front > :not(.clip), #behind > :not(.clip) {{ visibility: hidden; opacity: 0; }}
.lp {{ position: absolute; inset: 0; }}
.lp > :not(.clip) {{ visibility: hidden; opacity: 0; }}   /* .clip = HyperFrames motions, timed by the runtime */
.title {{ position: absolute; left: 0; top: 170px; width: {W}px; padding: 0 90px; box-sizing: border-box; line-height: .88; letter-spacing: -.045em; text-shadow: 0 0 3px rgba(0,0,0,.18), 0 6px 34px rgba(0,0,0,.4); }}
.tl {{ white-space: nowrap; }}
.block {{ position: absolute; inset: 0; }}
.frame {{ position: absolute; left: 250px; top: 470px; width: 580px; height: 1030px; overflow: hidden; border: 10px solid #fff; border-radius: 8px; box-shadow: 0 24px 60px rgba(0,0,0,.22); }}
.frame video {{ width: 100%; height: 100%; object-fit: cover; display: block; }}
.bl {{ position: absolute; left: 0; width: {W}px; padding: 0 90px; box-sizing: border-box; line-height: .82; letter-spacing: -.05em; white-space: nowrap; }}
.card {{ position: absolute; left: 90px; top: 150px; width: 900px; background: #fff; border-radius: 40px; overflow: hidden; padding-bottom: 22px; box-shadow: 0 30px 70px rgba(0,0,0,.25); }}
.kcard {{ background-color: transparent; background-size: 100% 100%; background-repeat: no-repeat; border-radius: 0; overflow: visible; box-shadow: none; padding: 70px 30px 60px; filter: drop-shadow(0 18px 28px rgba(0,0,0,.28)); }}
.kcard .cr {{ border-bottom: 3px dashed rgba(0,0,0,.14); margin: 0 60px; }}
.kh {{ padding: 6px 60px 18px; line-height: 1.05; }}
.ktape {{ position: absolute; left: 50%; top: -34px; height: auto; transform: rotate(-2deg); }}
.kst {{ width: 78px; height: 78px; flex: none; object-fit: contain; }}
.ktag {{ background-color: transparent !important; background-size: 100% 100%; background-repeat: no-repeat; border-radius: 0 !important; box-shadow: none !important; padding: 34px 70px !important; filter: drop-shadow(0 12px 18px rgba(0,0,0,.26)); }}
.notew {{ position: absolute; left: 0; width: 1080px; text-align: center; }}
.note {{ position: relative; display: inline-block; max-width: 880px; padding: 54px 64px 44px; line-height: 1.08; border-radius: 6px; box-shadow: 0 20px 44px rgba(0,0,0,.28); }}
.knote {{ background-size: 100% 100%; background-repeat: no-repeat; border-radius: 0; box-shadow: none; padding: 84px 96px 74px; filter: drop-shadow(0 18px 28px rgba(0,0,0,.28)); }}
.ptape {{ position: absolute; left: 50%; top: -22px; width: 200px; height: 52px; margin-left: -100px; background: rgba(255,255,255,.55); box-shadow: 0 2px 6px rgba(0,0,0,.12); transform: rotate(-2deg); }}
.ch {{ color: #fff; padding: 24px 36px; display: flex; align-items: center; gap: 18px; letter-spacing: -.02em; }}
.ch i {{ width: 22px; height: 22px; border-radius: 50%; background: rgba(255,255,255,.7); display: inline-block; }}
.cr {{ display: flex; align-items: center; gap: 24px; height: 110px; margin: 0 36px; border-bottom: 3px solid rgba(0,0,0,.06); letter-spacing: -.02em; }}
.cr b {{ width: 26px; height: 26px; border-radius: 50%; flex: none; }}
.tagw, .ctaw {{ position: absolute; left: 0; right: 0; text-align: center; }}
.quotew {{ position: absolute; left: 70px; right: 70px; text-align: center; }}
.quote {{ display: inline-block; background: #fff; border-radius: 34px; padding: 30px 44px; line-height: 1.08; letter-spacing: -.02em; text-align: left; box-shadow: 0 24px 60px rgba(0,0,0,.25); }}
.colw {{ position: absolute; left: 90px; width: 900px; display: flex; border-radius: 26px; padding: 26px 0 30px; box-shadow: 0 30px 70px rgba(0,0,0,.25); text-align: center; }}
.colc {{ box-sizing: border-box; }}
.chipw {{ position: absolute; left: 60px; right: 60px; text-align: center; }}
.chipt {{ letter-spacing: -.03em; line-height: 1; text-shadow: 0 4px 24px rgba(0,0,0,.45); margin-bottom: 26px; white-space: nowrap; }}
.chiprow {{ display: flex; justify-content: center; gap: 22px; }}
.chip {{ display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; box-shadow: 0 10px 26px rgba(0,0,0,.28); }}
.cap.capbg span.cb {{ padding: .08em .3em; border-radius: .16em; -webkit-box-decoration-break: clone; box-decoration-break: clone; text-shadow: none; }}
.ctaw {{ top: 1360px; }}   /* above Instagram's caption + buttons zone (bottom ~420 px) */
.tag, .cta {{ display: inline-block; color: #fff; padding: 18px 42px; border-radius: 80px; letter-spacing: -.02em; box-shadow: 0 14px 34px rgba(0,0,0,.2); }}
.shot {{ position: absolute; left: 70px; top: 130px; width: 940px; border-radius: 26px; overflow: hidden; background: #fff; box-shadow: 0 34px 80px rgba(0,0,0,.3); }}
.bar {{ height: 64px; display: flex; align-items: center; gap: 12px; padding: 0 24px; background: #F2F2F4; color: #555; }}
.bar i {{ width: 18px; height: 18px; border-radius: 50%; display: inline-block; }}
.bar span {{ margin-left: 18px; background: #fff; border-radius: 14px; padding: 6px 22px; }}
.vp {{ height: 620px; overflow: hidden; }}
.vp img {{ width: 100%; display: block; }}
.imgs {{ position: absolute; left: 0; top: 140px; width: {W}px; height: 560px; }}
.ph {{ position: absolute; top: 0; width: 420px; height: 520px; object-fit: cover; border: 12px solid #fff; border-radius: 18px; box-shadow: 0 26px 60px rgba(0,0,0,.28); }}
.stk {{ position: absolute; }}
.stk img {{ width: 100%; display: block; filter: drop-shadow(0 14px 22px rgba(0,0,0,.25)); }}
.pop {{ position: absolute; }}
.orb {{ position: absolute; inset: 0; transform-origin: 50% 30%; }}
.pop.vclip {{ border-radius: 28px; overflow: hidden; box-shadow: 0 18px 44px rgba(0,0,0,.34); background: #000; }}
.pop.vclip video {{ object-fit: cover; filter: none; }}
.pop img, .pop video {{ width: 100%; height: 100%; object-fit: contain; display: block; filter: drop-shadow(0 12px 20px rgba(0,0,0,.28)); }}
.pop.framed {{ box-sizing: border-box; border: 12px solid #fff; border-radius: 18px; background: #fff; box-shadow: 0 26px 60px rgba(0,0,0,.28); }}
.pop.framed img, .pop.framed video {{ object-fit: cover; filter: none; border-radius: 6px; }}
.tp {{ position: absolute; left: 0; top: 0; filter: drop-shadow(0 8px 14px rgba(0,0,0,.28)); }}
.tpi {{ width: 100%; height: 100%; text-align: center; white-space: nowrap; box-sizing: border-box; }}
.pls, .tg {{ position: absolute; inset: 0; }}
.pl {{ position: absolute; box-sizing: content-box; background: #fff; border-radius: 6px; box-shadow: 0 22px 46px rgba(0,0,0,.3); }}
.pl img {{ display: block; object-fit: cover; border-radius: 2px; }}
.xl {{ position: absolute; box-sizing: content-box; background: {LIGHT}; border-radius: 34px; box-shadow: 0 30px 70px rgba(0,0,0,.25); }}
.xr {{ display: flex; align-items: center; gap: 28px; border-bottom: 3px solid rgba(13,43,45,.07); }}
.xr:last-child {{ border-bottom: 0; }}
.xm {{ flex: none; overflow: visible; }}
.xt {{ white-space: nowrap; line-height: 1; padding: 0 16px 0 4px; }}
.stat {{ position: absolute; box-sizing: border-box; background: #fff; border-radius: 38px; padding: 30px 40px 28px; box-shadow: 0 30px 70px rgba(0,0,0,.25); }}
.sl {{ opacity: .72; letter-spacing: -.01em; }}
.sr {{ display: flex; align-items: center; gap: 24px; margin-top: 6px; }}
.sv {{ letter-spacing: -.03em; line-height: 1.05; }}
.sd {{ padding: 8px 22px; border-radius: 40px; }}
.ss {{ display: block; margin-top: 6px; overflow: visible; }}
.tile {{ position: absolute; box-sizing: border-box; background: linear-gradient(150deg, #fff, #f1f4ec); border-radius: 46px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 12px; text-align: center; box-shadow: 0 18px 44px rgba(0,0,0,.24); }}
.ti {{ width: 44%; aspect-ratio: 1; border-radius: 30%; display: flex; align-items: center; justify-content: center; box-sizing: border-box; }}
.tt {{ line-height: 1.08; letter-spacing: -.01em; }}
.page {{ position: absolute; inset: 0; }}
.pt {{ position: absolute; left: 0; right: 0; top: 150px; text-align: center; line-height: .9; letter-spacing: -.04em; padding: 0 60px; }}
.pf {{ position: absolute; left: 190px; top: 560px; width: 700px; height: 1240px; overflow: hidden; border: 12px solid #fff; border-radius: 34px; box-shadow: 0 30px 70px rgba(0,0,0,.28); }}
.pf video {{ width: 100%; height: 100%; object-fit: cover; display: block; }}
.pbg {{ position: absolute; inset: -6%; width: 112%; height: 112%; object-fit: cover; filter: blur(34px) brightness(.82); }}
.pblur .pf {{ left: 150px; top: 250px; width: 780px; height: 1080px; border: 0; border-radius: 54px; }}
.plabel {{ position: absolute; left: 70px; top: 70px; letter-spacing: .14em; }}
.glass {{ background: rgba(28,22,34,.34) !important; backdrop-filter: blur(22px) saturate(1.4); -webkit-backdrop-filter: blur(22px) saturate(1.4); border: 1.5px solid rgba(255,255,255,.55); box-shadow: 0 20px 60px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.6); }}
.card.glass .cr {{ color: #fff !important; border-bottom-color: rgba(255,255,255,.25); }}
.cap {{ position: absolute; left: 60px; right: 60px; text-align: center; line-height: 1.02; letter-spacing: -.02em; text-shadow: 0 2px 14px rgba(0,0,0,.3); }}
.cap .acc {{ text-shadow: {brand.get("caption_accent_shadow", "0 0 2px rgba(0,0,0,.25), 0 3px 22px rgba(0,0,0,.5)")}; }}   /* accent color stays readable over white screens, no outline; brand.json "caption_accent_shadow" overrides (Modified by By Mel Ross) */
{_theme.css_for(brand, {r: FAM[r][0] for r in FAM})}
</style></head>
<body>
<div id="stage" data-composition-id="main" data-start="0" data-duration="{DUR}" data-fps="{FPS}" data-width="{W}" data-height="{H}">
  <div id="cam"><video id="bg" class="clip" src="master.mp4" playsinline data-has-audio="true" data-start="0" data-duration="{DUR}" data-track-index="1"></video>
    <div id="behind">{"".join(behind)}</div>
    {'<video id="person" class="clip" src="cutout/person.webm" muted playsinline data-start="0" data-duration="' + str(DUR) + '" data-track-index="3"></video>' if LAYERED else ""}
    <div id="back">{"".join(back)}</div></div>
  <div id="mid">{"".join(mid)}</div>
  <div id="front">{"".join(front)}</div>
  <div id="trail">{"".join(trail)}</div>
  {"".join(audio)}
  <script src="vendor/gsap.min.js"></script>
  <script>(function () {{ window.__timelines = window.__timelines || {{}};
    const tl = window.gsap.timeline({{ paused: true }});
    {chr(10).join(js)}
    window.__timelines["main"] = tl; }})();</script>
</div></body></html>"""
(proj / "index.html").write_text(doc)
(proj / "package.json").write_text('{"name":"reel","private":true,"type":"module"}')
if CAPCUT: (reel / "sfx_events.json").unlink(missing_ok=True)
if not CAPCUT and STEMS:
    if SFX_COUNT["banned"]: print(f"sounds: {SFX_COUNT['banned']} left out (brand.json sfx_never: {', '.join(sorted(SFX_NEVER))})")
    if SFX_COUNT["auto"] and SFX_COUNT["placed"]: print(f"sounds: {SFX_COUNT['auto']} automatic sounds are playing on top of {SFX_COUNT['placed']} you placed; set \"sfx\": \"none\" (edit.json or brand.json) to hear only the placed ones")
    json.dump(SFX_EVENTS, open(reel / "sfx_events.json", "w"), indent=1)      # mix_audio.py mixes these in (render.sh)
if CAPCUT:
    json.dump(cap_json, open(reel / "captions.json", "w"), indent=1)
    json.dump(SFX_OUT, open(reel / "sfx.json", "w"), indent=1)
print(f"built {proj/'index.html'}: {DUR}s, {len(edit.get('cards', []))} cards, {len(cap_json)} captions, {n_sfx} sounds"
      + (" (capcut: captions.json + sfx.json written)" if CAPCUT else ""))
