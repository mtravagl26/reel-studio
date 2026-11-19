# Material kits

Added by By Mel Ross (0.11.0). A theme sets fonts and motion. A material kit sets what cards are made of: a real sheet of paper, a strip of tape, a label, numbered stickers. With a kit on, cards stop looking drawn by a computer.

## What a kit changes today

| Card | Without a kit | With a kit |
|---|---|---|
| List (`card`) | white rounded box, colored header bar, dots | a sheet of the kit's paper, taped at the top, handwritten heading, a numbered sticker on each row |
| Step label (`tag`) | colored pill | the words on the kit's label shape |
| Note (`note`, new) | plain light sheet with a drawn tape strip | the kit's paper and tape |

Every other card is drawn as before. A card with `"kit": false` stays plain even when a kit is on. A kit that lacks a material falls back to the plain drawing for that part only.

The note card: `{ "type": "note", "text": "line one / line two", "start": 7.0, "end": 10.5 }`. Up to 4 short lines, handwritten font, sits above the head. Optional `y`, `rotate`, `size`.

## Turning one on

- Every reel: `"kit": "<name>"` in `~/reels/brand.json`
- One reel: `"kit": "<name>"` in its `edit.json`
- With a theme: `"kit"` inside the theme's `"brand"` block
- One build: `build_reel.py <reel> --kit <name>`
- Off: `"kit": "none"`

`python3 scripts/kit.py list` shows the kits on this machine. `python3 scripts/kit.py check <name>` shows what a kit has and what is missing.

## The stand-in kit is a placeholder

`kits/standin/` ships with the editor so the system can be seen and tested. A script drew it (`scripts/make_standin_kit.py` at the repo root), every picture in it carries the words "stand-in", and the build prints `NOTE (tell them): ... is stand-in art` every time it is used. **Never deliver a reel built with it without saying so.** It exists to judge layout. The person's own materials are the point.

## Making your own kit

1. Make a folder: `~/reels/kits/<your-kit-name>/` (lower-case letters, numbers, dashes).
2. Put your pictures in it. PNG or WebP, see-through background, about 1200 px on the long side.
   - `paper`: one sheet. It gets stretched to fit the card, so keep it plain: no writing, soft or torn edges are fine.
   - `tape`: one strip, wider than tall.
   - `label`: a tag, sticker or scrap that a few words sit on. It gets stretched to fit the words.
   - `stickers`: numbers 1 to 5 (or as many as you have), each a square picture.
3. Write `kit.json` next to them:

```json
{
  "name": "Desk paper",
  "summary": "Graph paper, washi tape and round number stickers from my desk.",
  "materials": {
    "paper": { "file": "paper.png" },
    "tape": { "file": "tape.png", "width": 260 },
    "label": { "file": "label.png" },
    "stickers": { "1": "n1.png", "2": "n2.png", "3": "n3.png" }
  },
  "ink": "#2b2b2b"
}
```

`ink` is the text color on the paper and label. Leave it out to use the brand's main color.

4. Run `python3 scripts/kit.py check <your-kit-name>`, then build a reel with it.

**How to get the pictures.** Photograph real paper, tape and stickers flat on a plain surface in even light. Cut out the background (Preview on a Mac: Tools > Remove Background; or any photo app). Save as PNG.

**Whose pictures.** Use materials you photographed or drew, or ones whose license lets you use them this way. Stock and design-app elements often can't be passed on to other people inside a product, so check the license before a kit leaves your computer. Don't present generated art as hand-made.

## For whoever plans the edit

- When a kit is on, prefer `note` for a short aside or a named idea, `card` for 2 to 4 steps, `tag` for "step 1" style labels.
- Keep notes short: 2 to 5 words a line. The paper stretches, the handwriting shrinks to fit.
- If the kit is a placeholder, say so when you show the preview and again at delivery.
