"""Added by By Mel Ross (0.31.0): the Roundup layout. A reel in chapters, one item per chapter, that cuts between 3 looks:

  full   the presenter talking to camera (the plain reel)
  split  a split screen: a picture, GIF or screen recording fills the top panel, the presenter fills the bottom half
  slide  a full-screen slide (a picture, a recording, or a plain colour with a line of text) with the presenter in a small inset

Each chapter opens on a full-frame, plain-colour chapter card with the item's name in a serif font and no footage.

In edit.json, one "roundup" card holds the chapters:

  {"type": "roundup", "card_seconds": 1.4, "color": "#1F1A17", "text_color": "#F4EAD8",
   "chapters": [
     {"start": 0.0,  "look": "full", "card": false},
     {"start": 6.2,  "title": "Skills",     "look": "split", "src": "shots/skills.mp4"},
     {"start": 21.0, "title": "Claude Code", "look": "slide", "src": "slides/code.png",
      "then": [{"start": 29.5, "look": "full"}]}
   ]}

expand() turns it into "chapter", "split" and "inset" cards, which build_reel.py draws with the functions below. Those 3 card
types also work on their own in any reel."""

LOOKS = ("full", "split", "slide")


def _num(v, d):
    try:
        return float(v) if v is not None and not isinstance(v, bool) else float(d)
    except (TypeError, ValueError):
        return float(d)


def expand(cards):
    """Swap each "roundup" card for the chapter, split and inset cards it describes. Other cards pass through untouched."""
    out = []
    for c in cards:
        if not isinstance(c, dict) or c.get("type") != "roundup":
            out.append(c)
            continue
        chs = sorted(
            (ch for ch in c.get("chapters") or [] if isinstance(ch, dict) and not ch.get("off")),
            key=lambda ch: _num(ch.get("start"), 0),
        )
        card_s = max(0.4, min(4.0, _num(c.get("card_seconds"), 1.4)))
        last = _num(c.get("end"), 1e9)
        for k, ch in enumerate(chs):
            a = _num(ch.get("start"), 0)
            b = _num(chs[k + 1].get("start"), last) if k + 1 < len(chs) else last
            if b <= a:
                continue
            t = a
            if ch.get("card", True) and ch.get("title"):
                out.append(
                    {
                        "type": "chapter",
                        "text": ch["title"],
                        "sub": ch.get("sub") or (f"{k:02d}" if c.get("numbers") else None),
                        "start": a,
                        "end": min(a + card_s, b),
                        "color": ch.get("color") or c.get("color"),
                        "text_color": ch.get("text_color") or c.get("text_color"),
                        "sfx": c.get("sfx", ch.get("sfx")),
                    }
                )
                t = min(a + card_s, b)
            # the chapter's own look, then any switches inside it ("then")
            parts = [{**ch, "start": t}] + sorted(
                (p for p in ch.get("then") or [] if isinstance(p, dict) and a < _num(p.get("start"), -1) < b),
                key=lambda p: _num(p.get("start"), 0),
            )
            for j, p in enumerate(parts):
                pa = _num(p.get("start"), t)
                pb = _num(parts[j + 1].get("start"), b) if j + 1 < len(parts) else b
                look = p.get("look", "full")
                if pb - pa < 0.2 or look not in LOOKS or look == "full":
                    continue
                keep = {
                    k_: p[k_]
                    for k_ in ("src", "from", "loop", "fit", "bg", "face_y", "corner", "size", "quiet")
                    if k_ in p
                }
                # a slide's own line of text is "slide_title" ("title" is the chapter's name, on its chapter card)
                if look == "slide" and p.get("slide_title"):
                    keep["title"] = p["slide_title"]
                out.append({"type": "split" if look == "split" else "inset", "start": pa, "end": pb, **keep})
    return out


# ---- drawing: each returns (html for the "mid" layer, gsap timeline js) ------------------------------------------------


def face_video(cid, i, a, b, q, box_w, box_h, face_y=520, scale=1.0):
    """The presenter's clip (master.mp4) inside a box, sized and placed so the face sits in its upper part."""
    vw, vh = int(1080 * scale), int(1920 * scale)
    left = (box_w - vw) // 2
    top = int(min(0, max(box_h - vh, box_h * 0.38 - face_y * scale)))
    return (
        f'<video id="{cid}v" src="master.mp4" muted playsinline data-start="{q(a)}" data-duration="{q(b - a)}" '
        f'data-media-start="{q(a)}" data-track-index="{9 + i}" style="position:absolute;left:{left}px;top:{top}px;width:{vw}px;height:{vh}px;object-fit:cover"></video>'
    )


def media(cid, i, a, b, q, asset, fit="contain"):
    """A picture, a GIF made into video, or a screen recording, filling its panel."""
    kind, path, _, _ = asset
    style = f"position:absolute;inset:0;width:100%;height:100%;object-fit:{'cover' if fit == 'cover' else 'contain'}"
    if kind in ("video", "clip"):
        return f'<video id="{cid}m" src="{path}" muted playsinline data-start="{q(a)}" data-duration="{q(b - a)}" data-track-index="{60 + i}" style="{style}"></video>'
    return f'<img src="{path}" style="{style}" />'


def chapter(cid, a, b, q, title_css, sub_css, text, sub, bg, color, esc):
    """A full-frame plain-colour card with the item's name. No footage."""
    html = (
        f'<div id="{cid}" class="chap" style="opacity:0;visibility:hidden;background:{bg}">'
        + (f'<div class="chs" style="{sub_css};color:{color}">{esc(sub)}</div>' if sub else "")
        + f'<div class="cht" style="{title_css};color:{color}">{esc(text)}</div></div>'
    )
    js = (
        f'tl.set("#{cid}",{{autoAlpha:1}},{q(a)});'
        f'tl.fromTo("#{cid} .cht, #{cid} .chs",{{y:26,autoAlpha:0}},{{y:0,autoAlpha:1,duration:0.42,ease:"power2.out",stagger:0.06}},{q(a + 0.04)});'
        f'tl.to("#{cid}",{{autoAlpha:0,duration:0.16}},{q(b - 0.16)});'
    )
    return html, js


def split(cid, i, a, b, q, asset, bg="#000", fit="contain", face_y=520):
    """Split screen: the picture or recording fills the top panel (1080x960), the presenter fills the bottom half."""
    top = media(cid, i, a, b, q, asset, fit) if asset else ""
    html = (
        f'<div id="{cid}" class="split" style="opacity:0;visibility:hidden;background:{bg}">'
        f'<div class="spt">{top}</div><div class="spb">{face_video(cid, i, a, b, q, 1080, 960, face_y)}</div></div>'
    )
    js = (
        f'tl.set("#{cid}",{{autoAlpha:1}},{q(a)});'
        f'tl.fromTo("#{cid} .spt",{{yPercent:-100}},{{yPercent:0,duration:0.38,ease:"power3.out"}},{q(a)});'
        f'tl.fromTo("#{cid} .spb",{{yPercent:100}},{{yPercent:0,duration:0.38,ease:"power3.out"}},{q(a)});'
        f'tl.set("#{cid}",{{autoAlpha:0}},{q(b)});'
    )
    return html, js


INSET = {"w": 300, "h": 400, "m": 56}


def inset(cid, i, a, b, q, asset, bg, title_html="", corner="bottom-right", size=300, fit="cover", face_y=520):
    """A full-screen slide with the presenter in a small rounded inset in a corner."""
    w = max(180, min(int(size), 520))
    h = int(w * 4 / 3)
    m = INSET["m"]
    x = m if "left" in corner else 1080 - m - w
    y = 150 if "top" in corner else 1920 - 380 - h  # clear of the ~380 px Instagram covers at the bottom
    slide = media(cid, i, a, b, q, asset, fit) if asset else ""
    html = (
        f'<div id="{cid}" class="inset" style="opacity:0;visibility:hidden;background:{bg}">{slide}{title_html}'
        f'<div class="inf" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px">'
        f"{face_video(cid, i, a, b, q, w, h, face_y, scale=w / 520)}</div></div>"
    )
    js = (
        f'tl.set("#{cid}",{{autoAlpha:1}},{q(a)});'
        f'tl.fromTo("#{cid}",{{clipPath:"inset(0% 0% 100% 0%)"}},{{clipPath:"inset(0% 0% 0% 0%)",duration:0.3,ease:"power3.out"}},{q(a)});'
        f'tl.fromTo("#{cid} .inf",{{scale:0.6,autoAlpha:0}},{{scale:1,autoAlpha:1,duration:0.4,ease:"back.out(1.6)"}},{q(a + 0.12)});'
        f'tl.set("#{cid}",{{autoAlpha:0}},{q(b)});'
    )
    return html, js


CSS = """
.chap, .split, .inset { position: absolute; inset: 0; overflow: hidden; }
.chap { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 90px; text-align: center; }
.cht { line-height: 1.04; max-width: 900px; }
.chs { letter-spacing: .3em; text-transform: uppercase; margin-bottom: 26px; opacity: .8; }
.spt, .spb { position: absolute; left: 0; width: 1080px; height: 960px; overflow: hidden; }
.spt { top: 0; } .spb { top: 960px; }
.inf { position: absolute; overflow: hidden; border-radius: 28px; border: 6px solid #fff; box-shadow: 0 18px 44px rgba(0,0,0,.35); background: #000; }
.ints { position: absolute; left: 90px; right: 90px; top: 200px; text-align: center; line-height: 1.06; text-shadow: 0 2px 18px rgba(0,0,0,.35); }
"""
