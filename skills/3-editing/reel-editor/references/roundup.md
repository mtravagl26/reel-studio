# The Roundup layout

Added by By Mel Ross (0.31.0). Style Menu L25, with L1 (slide with a face inset) and L11 (split screen) as its parts.

A roundup is a reel in chapters, one item per chapter: "what we released this month", "5 tools I use", "3 settings to change". Each chapter opens on a plain chapter card with the item's name, then cuts to one of 3 looks:

| Look | What's on screen |
|---|---|
| `full` | You, talking to camera. The plain reel. |
| `split` | Your picture, GIF or screen recording fills the top half. You fill the bottom half. |
| `slide` | A full-screen slide (a picture, a recording, or a plain colour with a line of text). You sit in a small rounded inset in a corner. |

The chapter card is a full frame of one plain colour with the item's name in a serif font. Your footage isn't on it, but your voice keeps playing, and captions step aside while it's up.

## In edit.json

One `roundup` card holds the whole structure:

```json
{"type": "roundup", "start": 0, "card_seconds": 1.4, "color": "#1F1A17", "text_color": "#F4EAD8",
 "chapters": [
   {"start": 0,    "look": "full", "card": false},
   {"start": 6.2,  "title": "Skills",      "look": "split", "src": "shots/skills.mp4"},
   {"start": 21.0, "title": "Claude Code", "look": "slide", "src": "slides/code.png", "slide_title": "Runs from your phone",
    "then": [{"start": 29.5, "look": "full"}]},
   {"start": 40.0, "title": "Memory",      "look": "full"}
 ]}
```

- `start`: where the chapter begins, in seconds of the cut. It runs until the next chapter starts (the last one runs to the end of the reel, or to the roundup's `end`).
- `title`: the item's name, shown as written on the chapter card. `"card": false` skips the card (use it for the intro).
- `look`: `full`, `split` or `slide`. `then` switches look inside a chapter: a list of `{start, look, src}`.
- `src`: the picture, GIF or recording for `split` and `slide`. It's looked for in the reel folder, then `~/reels/assets/`.
- `slide_title`: a line of text on the slide. Without a `src`, the slide is the plain colour `bg` with that line.
- `card_seconds` (default 1.4), `color` and `text_color` (default: your brand's main and light colours) set the chapter cards. Any chapter can set its own `color` and `text_color`. `"numbers": true` puts 01, 02 above each name.
- For `split` and `slide`, the build finds your head in that stretch (the Mac's outline of the person, else OpenCV face finding) and crops so there's a little room above your hair. If it can't find you, it uses `face_y` (default 520): where your eyes sit in the original frame. Set `face_y` yourself to override the finding. `zoom` (split only, 0.6 to 1, default 0.86) shrinks your half so more of you shows, with a blurred copy of the clip filling the sides. `fit` is `contain` (default for split; the whole recording shows, with bars) or `cover` (fills the panel, edges cut). For slides: `corner` (`bottom-right` default, `bottom-left`, `top-left`, `top-right`) and `size` (inset width, 180 to 520 px, default 300).

The build swaps the roundup card for `chapter`, `split` and `inset` cards (`scripts/roundup.py`). Those 3 cards also work on their own in any reel.

## What carries over

Captions, the name tag, popups, title cards and the "comment ___" end line all work as usual on top. During a split, captions sit on the seam between the panels, off your face. During a split or a slide they get a dark box, so they stay readable over a white screen, and a slide's own line of text gets the same box when it sits over a picture. Plan the chapters from the transcript: a chapter starts on the word that names the item.

## Check before sharing

Look at a still of each look on your own footage: your face in the split's bottom half, the inset not covering anything on the slide, and the chapter names fitting on 2 or 3 lines.
