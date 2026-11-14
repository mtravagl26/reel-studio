#!/usr/bin/env python3
"""Added by By Mel Ross (Style Menu, 0.5.0). Storyboard first: preview 2-3 options of a reel as STILL FRAMES only (no video render).

Usage:
  python3 storyboard.py <reel-folder> --out <new-folder> --option "A=H3,C2,L8" --option "B=C3,L4" [--option "C=..."]
         [--at 1.5,31,50] [--content content.json] [--photos a.jpg,b.jpg,c.jpg] [--title "text"]

Each option is a set of Style Menu IDs (assets/style-menu.json). For every option the script builds a throw-away copy of the reel
(the reel's own master.mp4, captions and brand, plus that option's captions look and cards), takes a still at each chosen moment
with `hyperframes snapshot`, and tiles them into ONE image, storyboard.jpg: a row per option, labelled "Option A" with the IDs used.

  --at          3-4 moments in seconds (of the cut master). Default: four caption mid-points at 12 / 38 / 62 / 88 % of the reel.
  --content     JSON: {"L8": {"label": "Employees", "value": "12,000"}, "L6": {"items": [...], "mark": "check"}, "at": {"L8": 31}}
                Per-ID card fields override the stand-in content; "at" pins an ID to a moment (seconds, one of the --at times).
                Without it a hook (H*, L7) goes on the first moment and layouts (L*) on the next ones in order.
  --photos      pictures for L2 / L9 (comma separated; L2 uses up to 3, L9 the first). IDs that need photos are skipped, with a note, if none are given.

Read-only on the reel: everything is written under --out, which must be a NEW folder outside the reel folder (the script refuses
to touch an existing non-empty folder). Stills only: no cut, no render, no audio. Looks that are "not-built" are listed in the label
and skipped. Needs ffmpeg, Node (npx hyperframes) and Chrome (for the tile sheet), the same as the rest of the editor.
GEMINI_API_KEY is removed from the environment for the snapshot step so no frame is ever sent to an outside service.
"""
import argparse, copy, html, json, os, re, shutil, subprocess, sys
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
HOME = Path(os.environ.get("REELS_HOME", "~/reels")).expanduser()
MENU = json.load(open(SKILL / "assets/style-menu.json"))["looks"]

ap = argparse.ArgumentParser()
ap.add_argument("reel"); ap.add_argument("--out", required=True)
ap.add_argument("--option", action="append", default=[]); ap.add_argument("--at"); ap.add_argument("--content"); ap.add_argument("--photos"); ap.add_argument("--title")
a = ap.parse_args()

reel = Path(a.reel).expanduser().resolve(); out = Path(a.out).expanduser().resolve()
if not (reel / "master.mp4").exists() or not (reel / "edit.json").exists():
    sys.exit(f"{reel} needs master.mp4 and edit.json (a reel that has been cut and has an edit)")
if out == reel or reel in out.parents or out in reel.parents:
    sys.exit("--out must be a new folder outside the reel folder (the reel is never written to)")
if out.exists() and any(out.iterdir()):
    sys.exit(f"{out} already has files: pick a new folder (nothing is overwritten)")
if not 1 <= len(a.option) <= 4:
    sys.exit('give 2-3 options, e.g. --option "A=H3,C2,L8" --option "B=C3,L4"')

options = []
for spec in a.option:
    m = re.match(r"^\s*([A-Za-z0-9]+)\s*=\s*(.+)$", spec)
    if not m: sys.exit(f"bad option {spec!r}: use NAME=ID,ID,...")
    ids = [x.strip().upper() for x in m.group(2).split(",") if x.strip()]
    for i in ids:
        if i not in MENU: sys.exit(f"unknown Style Menu ID {i!r} in option {m.group(1)}")
    options.append((m.group(1).upper(), ids))

content = json.load(open(a.content)) if a.content else {}
photos = [str(Path(p).expanduser().resolve()) for p in (a.photos or "").split(",") if p.strip()]
edit0 = json.load(open(reel / "edit.json"))
brand0 = json.load(open(HOME / "brand.json"))
dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(reel / "master.mp4")], capture_output=True, text=True, check=True).stdout) - 0.02

# ---- moments -------------------------------------------------------------------------------------------------------------
caps0 = edit0.get("captions", [])
if a.at:
    moments = [float(x) for x in a.at.split(",")]
else:
    mids = [(c["start"] + c["end"]) / 2 for c in caps0] or [dur * f for f in (.12, .38, .62, .88)]
    moments = [min(mids, key=lambda m: abs(m - dur * f)) for f in (.12, .38, .62, .88)]
moments = sorted({round(m, 2) for m in moments})
if not 2 <= len(moments) <= 5: sys.exit("use 2-5 moments")

def deep(dst, patch):
    for k, v in patch.items():
        if isinstance(v, dict) and isinstance(dst.get(k), dict): deep(dst[k], v)
        else: dst[k] = copy.deepcopy(v)
def subst(o):
    if isinstance(o, str): return o.replace("{skill}", str(SKILL)).replace("{reels}", str(HOME))
    if isinstance(o, dict): return {k: subst(v) for k, v in o.items()}
    if isinstance(o, list): return [subst(v) for v in o]
    return o

def capy_of(b):
    return b.get("captions", {}).get("y", 1250)

def rechunk_words(caps):
    """One caption per word, timed from the reel's own caption words (each word lasts until the next one starts)."""
    out_ = []
    for c in caps:
        ws = c["words"]
        for k, w in enumerate(ws):
            nxt = ws[k + 1]["t"] if k + 1 < len(ws) else c["end"]
            out_.append({"start": round(w["t"], 2), "end": round(max(nxt, w["t"] + 0.2), 2), "words": [{**w, "accent": False}]})
    return out_
def auto_accent(caps):
    """Demo accent: the longest word (5+ letters) of each caption. Keeps the reel's own accents if it has any."""
    if any(w.get("accent") for c in caps for w in c["words"]): return caps
    for c in caps:
        ws = c["words"]; best = max(range(len(ws)), key=lambda k: len(re.sub(r"\W", "", ws[k]["text"])))
        if len(re.sub(r"\W", "", ws[best]["text"])) >= 5: ws[best]["accent"] = True
    return caps

env = {**os.environ, "HYPERFRAMES_NO_TELEMETRY": "1", "DO_NOT_TRACK": "1"}
env.pop("GEMINI_API_KEY", None)                     # snapshot would otherwise describe frames with an outside vision service
out.mkdir(parents=True)
notes, rows = [], []
for name, ids in options:
    work = out / "work" / name; (work / "home").mkdir(parents=True)
    brand = copy.deepcopy(brand0); caps = copy.deepcopy(caps0); cards = []; used, skipped = [], []
    slot_hook = 0; slot_lay = 1 if len(moments) > 1 else 0; accent = False; word_mode = False
    styled = [i for i in ids if MENU[i].get("recipe") and (MENU[i]["recipe"].get("brand"))]
    if len(styled) > 1: notes.append(f"Option {name}: {', '.join(styled)} all set the caption look; the last one wins")
    for i in ids:
        L = MENU[i]; r = L.get("recipe")
        if not r or L["status"] in ("not-built", "cut-choice"):
            skipped.append(i); notes.append(f"Option {name}: {i} ({L['name']}) is {L['status']}: {L.get('needs') or L.get('does', '')}"); continue
        if r.get("brand"): deep(brand, subst(r["brand"]))
        if r.get("accent"): accent = True
        if r.get("mode") == "word": word_mode = True
        if r.get("card"):
            card = copy.deepcopy(subst(r["card"])); card.update({k: v for k, v in content.get(i, {}).items()})
            if r.get("needs_photos"):
                if not photos: skipped.append(i); notes.append(f"Option {name}: {i} needs photos (--photos) and none were given: skipped"); continue
                srcs = [photos[k % len(photos)] for k in range(r["needs_photos"])]
                if card["type"] == "polaroids": card["src"] = srcs
                else: card["src"] = srcs[0]
            slot = r.get("slot", "layout")
            if "at" in content and i in content["at"]: t = float(content["at"][i])
            elif slot == "hook": t = moments[slot_hook]
            else:
                t = moments[min(slot_lay, len(moments) - 1)]; slot_lay += 1
            card["start"], card["end"] = round(max(t - 1.6, 0), 2), round(min(t + 2.4, dur), 2)
            if card["type"] == "xlist" and "row_times" not in card: card["row_times"] = [round(card["start"] + 0.3 + 0.22 * j, 2) for j in range(len(card["items"]))]
            if card["type"] == "tiles" and "tile_times" not in card: card["tile_times"] = [round(card["start"] + 0.3 + 0.18 * j, 2) for j in range(len(card["tiles"]))]
            if card["type"] == "title": card["start"] = round(max(t - 1.2, 0), 2); card["quiet"] = capy_of(brand) < 600   # a top caption (C1, y 150) would sit on the title: captions step aside like in a real build
            cards.append(card)
        used.append(i)
    if word_mode: caps = rechunk_words(caps)
    if accent and not word_mode: caps = auto_accent(caps)
    json.dump(brand, open(work / "home/brand.json", "w"), indent=1)
    for sub in ("fonts", "assets"):
        if (HOME / sub).exists(): os.symlink(HOME / sub, work / "home" / sub)
    for f in ("master.mp4",):
        subprocess.run(["cp", "-c", str(reel / f), str(work / f)], check=True)
    for f in ("master_transcript.json",):
        if (reel / f).exists(): shutil.copy(reel / f, work / f)
    for sub in ("shots", "popups"):
        if (reel / sub).exists(): subprocess.run(["cp", "-Rc", str(reel / sub), str(work / sub)], check=False)
    edit = {k: v for k, v in edit0.items() if k not in ("cards", "sfx_events")}
    edit["captions"], edit["cards"] = caps, cards
    json.dump(edit, open(work / "edit.json", "w"), indent=1)
    e2 = {**env, "REELS_HOME": str(work / "home")}
    b = subprocess.run([sys.executable, str(SKILL / "scripts/build_reel.py"), str(work)], capture_output=True, text=True, env=e2)
    if b.returncode: sys.exit(f"build failed for option {name}:\n{b.stdout[-800:]}{b.stderr[-1500:]}")
    for line in b.stdout.splitlines():
        if line.startswith(("note:", "warning:")): notes.append(f"Option {name}: {line}")
    shots = out / f"stills_{name}"
    s = subprocess.run(["npx", "-y", "hyperframes@0.8.145", "snapshot", str(work / "proj"), "--at", ",".join(str(m) for m in moments), "--no-end", "--describe", "false", "-o", str(shots)],
                       capture_output=True, text=True, env=e2)
    pngs = sorted(shots.glob("frame-*.png"))
    if s.returncode or len(pngs) != len(moments): sys.exit(f"snapshot failed for option {name}:\n{(s.stdout + s.stderr)[-1500:]}")
    rows.append({"name": name, "ids": ids, "used": used, "skipped": skipped, "frames": [p.name for p in pngs], "dir": shots.name})
    print(f"option {name}: {', '.join(used) or 'no looks'} -> {len(pngs)} stills")

# ---- tile sheet ----------------------------------------------------------------------------------------------------------
CW = 300; CH = 533; GAP = 10; LAB = 62
cols = len(moments)
cells = []
for r_i, row in enumerate(rows):
    ids_txt = " + ".join(row["used"]) if row["used"] else "plain"
    names = ", ".join(MENU[i]["name"] for i in row["used"]) + (f' | skipped: {", ".join(row["skipped"])}' if row["skipped"] else "")
    lab = f'Option {row["name"]}: {ids_txt}<small>{html.escape(names)}</small>'
    cells.append(f'<div class="lab" style="grid-column:1/{cols + 1}">{lab}</div>')
    for k, f in enumerate(row["frames"]):
        cells.append(f'<div class="c"><img src="{row["dir"]}/{f}"/><span>{moments[k]:g}s</span></div>')
W = cols * CW + (cols + 1) * GAP; Hh = GAP + (len(rows) * (LAB + CH + GAP)) + (44 if a.title else 0)
sheet = (f'<!doctype html><meta charset="utf-8"><style>body{{margin:0;background:#f5f2ec;font:600 24px -apple-system,Helvetica,sans-serif;color:#0d2b2d}}'
         f'.g{{display:grid;grid-template-columns:repeat({cols},{CW}px);gap:{GAP}px;padding:{GAP}px}}.lab{{height:{LAB}px;line-height:30px;white-space:nowrap;overflow:hidden}}.lab small{{display:block;font:500 15px/18px -apple-system,sans-serif;opacity:.7;white-space:normal;height:32px;overflow:hidden}}'
         f'.c{{position:relative;width:{CW}px;height:{CH}px;overflow:hidden;border-radius:8px;background:#000}}.c img{{width:{CW}px;height:{CH}px;object-fit:cover;display:block}}'
         f'.c span{{position:absolute;right:8px;bottom:6px;font:600 16px -apple-system,sans-serif;color:#fff;background:rgba(0,0,0,.5);padding:2px 8px;border-radius:10px}}</style>'
         + (f'<div style="padding:10px 14px 0;font-size:22px">{html.escape(a.title)}</div>' if a.title else "") + f'<div class="g">{"".join(cells)}</div>')
(out / "sheet.html").write_text(sheet)
chrome = next((c for c in ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium",
                           "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", shutil.which("google-chrome") or "", shutil.which("chromium") or ""] if c and os.access(c, os.X_OK)), None)
if not chrome: sys.exit("no Chrome/Chromium/Edge found: the stills are in the stills_* folders, only the tiled sheet is missing")
subprocess.run([chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", f"--window-size={W},{Hh}", f"--screenshot={out / 'storyboard.png'}", (out / "sheet.html").as_uri()],
               capture_output=True, check=True)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(out / "storyboard.png"), "-q:v", "2", str(out / "storyboard.jpg")], check=True)
json.dump({"reel": str(reel), "moments": moments, "options": rows, "notes": notes}, open(out / "storyboard.json", "w"), indent=1)
for n in notes: print("note:", n)
print(f"storyboard: {out / 'storyboard.jpg'}  (stills only; nothing was rendered or written to {reel.name})")
