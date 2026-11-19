# Style Menu (looks by ID)

Added by By Mel Ross (0.5.0). A menu of 20 looks seen in popular short-form reels (14 usable today, 6 not built yet), each with an ID: **H** = hook, **C** = captions, **L** = layout. When the person says "do H3 with C2 and L8", use the table below. The machine-readable version is `assets/style-menu.json` (what `scripts/storyboard.py` reads).

Defaults for every look: the brand file's colors (`colors.pop` is the highlight; `SAGE_DEEP` in `build_reel.py` is a deeper tone blended from `colors.pop` and `colors.main`, used wherever a mark sits on cream paper), the brand fonts (`head`, `body`, `accent`) plus Caveat handwriting from `assets/fonts/` (SIL Open Font License 1.1, text in `assets/fonts/OFL-Caveat.txt`), no music, gentle zooms. When the speaker's face fills the frame their eyes sit near y 500-560 of 1920, so graphics go in the top corners (above y ~450) or the lower third (y 1050-1500, above the bottom 420 px Instagram covers), never on the eyes.

**Status** = measured, not assumed: *built* means the look was rendered on talking-head footage and the frame was viewed; *partial* means the closest thing we have, with the difference named; *cut-choice* is an edit decision with no setting; *not built* means nothing yet.

**What to offer.** Offer and show only the looks in the first table. The second table is a to-do list: never suggest those IDs, and never put them in a storyboard. If the person asks for one by ID, say it is not built yet and offer the nearest look that is (named in its row). For a *partial* look, say what is missing before using it.

### Looks you can use

| ID | Look | Status | What produces it |
|---|---|---|---|
| H2 | Cold open + big number | partial | `title` card, one huge white number: `{"type":"title","text":"12,000","color":"#FFFFFF","size":240,"y":90,"align":"left"}` (size ~ 900 / (characters x 0.6)). Missing: cold open on b-roll, the sparkle |
| H3 | Handwritten overline + bold caps headline | built | `title` card with `overline`: `{"type":"title","text":"ACME / OFFER","overline":"big news this week","align":"left","y":95,"size":150,"color":"#FFFFFF"}` |
| H5 | Reaction cold open | cut-choice | no graphic: put a 1-2 s reaction span first in `edl.json` `keep`, then the story |
| C1 | Small serif, one script word | built | brand.json `captions` `{"size":56,"y":150,"case":"lower","tracking":0}`, `fonts.body` = Lora, `fonts.accent` = Caveat; `"accent": true` on one word per caption. y 150 only works where there is headroom |
| C2 | Bold sans + italic serif accent | built | the current default (Inter 600, accent Lora italic in sage): `captions` `{"size":92,"y":1250}`; accent one word per caption. Missing: the thin script CTA line (use a `cta` card) |
| C3 | One word at a time | built | brand.json `captions` `{"mode":"word","size":120}`, `colors.caption` = `#B9C8A5`; `auto_edit.py` writes one caption per word |
| C5 | Tiny thin caption under a big label | partial | `captions` `{"size":44,"y":1440,"case":"lower"}` plus a `title` card for the label. Missing: bottom-left alignment, a thin weight |
| L2 | Tilted polaroid stack | built | card `polaroids` (below) |
| L4 | Icon tile grid on a torn label | built | card `tiles` (below) |
| L6 | Red X list | built | card `xlist` (below): sage check by default, `"mark": "x"` for red X marks |
| L7 | Step label top-center | built | `title` card with `overline_font` accent: `{"type":"title","text":"the offer","overline":"step #2:","overline_font":"accent","align":"center","y":95,"size":150,"color":"#FFFFFF"}` |
| L8 | Stat card pop | built | card `stat` (below) |
| L9 | Photo sticker beside your face | built | card `popup` with `caption` (below) |
| L10 | Taped note | built | card `note`; uses the material kit's paper and tape when one is on (`references/material-kits.md`) |

### Not built yet (do not offer)

| ID | Look | Status | What produces it |
|---|---|---|---|
| H1 | Logo-swap title | not built | needs two logo images (not supplied) |
| H4 | Series title, phone-in-frame | not built | needs a logo and a phone-card layout |
| C4 | Black on white for screen recordings | not built | needs screen-recording footage |
| L1 | Screen recording + small face cam | not built | needs screen-recording footage |
| L3 | Beige dotted paper card, one word | not built | nearest is the paper-grid skill (edit-video pipeline), not this editor |
| L5 | Caps label + parenthetical + big number | not built | nearest is the `count-up` motion card |

## The new cards (all in `edit.json` `cards`; fields also in the header of `scripts/build_reel.py`)

Examples are the ones that were rendered. Every card takes `start`, optional `end` (clears with its phrase), `layer`, `"off": true`, and `"sfx"` like the others. Cards that sit over the lower third set captions aside while they show (`"quiet": false` keeps captions).

**L2 polaroids**: `{"type":"polaroids","start":3,"end":8,"src":["shots/a.jpg","shots/b.jpg","shots/c.jpg"],"label":"my space","side":"left"}`. 1-4 photos, white frames, tilted, fan in one by one, handwritten label on a torn sage strip (`label_bg`, `label_color`, `label_size`). `side` left | right | center (or `x`), `y` (default 100), `size` (default 240 px per photo). The build prints a note when the stack plus label reaches y 470.

**L9 photo sticker**: the existing `popup` card (corner stickers) now takes `"caption"`: `{"type":"popup","start":6.1,"end":9.2,"src":"shots/space.jpg","pos":"top-left","size":330,"rotate":-5,"caption":"how is this real?!"}`. The caption sits on a torn strip across the photo's lower edge; with a caption or `"exit": true` the photo shrinks out instead of only fading. `pos` and `size` as before; keep the photo + caption above y ~450.

**L6 list with hand-drawn marks**: `{"type":"xlist","start":50.7,"end":56,"mark":"check","items":["Workshops","Client work","One-to-one coaching"],"row_times":[51.1,52.3,53.7]}`. Cream paper card in the lower third (`y` default 1050), one row per item, the mark is drawn on stroke by stroke. `mark` "check" (sage, default) or "x" (red `#D64545`); one item can override with `{"text":"...","mark":"x"}`. Land each row on its spoken word with `row_times`. Caveat draws a capital I like a 1: for text with "AI" set `"font": "body"`.

**L8 stat card**: `{"type":"stat","start":33.8,"end":36.7,"label":"Employees at Acme","value":"12,000"}`. White card pops over the lower half (`y` default 1080, `w` 720). Optional `delta` ("+12%" in a sage pill) and `spark` (a list of numbers drawn as a sparkline): use them only when there is real data, never invented.

**L4 icon-tile grid**: `{"type":"tiles","start":9.5,"end":15.2,"label":"Acme products","tiles":[{"label":"Billing","icon":"dollar"},{"label":"Territory Planning","icon":"target"},{"label":"Maps","icon":"map"}],"tile_times":[9.75,10.55,13.45]}`. Torn cream label, then 1-8 tiles that pop on in turn (`tile_times` to land each on its word). `icon`: built-in line icon (dollar target map chart people check star chat doc mic heart spark mail), a picture path (the brand's own logo or app icon), or a short glyph. Real app logos are not bundled; supply them as images.

**Top captions vs top titles:** C1 puts captions at y 150, the same place as the H2/H3/L7 title cards. Start the title on a caption boundary (a title card hides captions that start while it shows, but one already on screen stays), or pair those titles with C2/C3 instead.

## Storyboard first

Before building a reel with new looks, show the person stills of 2-3 options, not videos: `scripts/storyboard.py` (see "Storyboard" in SKILL.md).

```
python3 scripts/storyboard.py <reel-folder> --out <NEW folder> \
  --option "A=H3,C2,L8" --option "B=C1,L4,L6" --option "C=C3,L7,L2" \
  --content content.json --photos a.jpg,b.jpg,c.jpg --at 8,26,42,60
```

It builds a throw-away copy of the reel per option, takes stills with `hyperframes snapshot` at 3-4 moments (about 25 s for 4 options), and tiles them in `storyboard.jpg`, a row per option labelled "Option A: H3 + C2 + L8". Nothing is rendered as video, and the reel folder is never written to. The stand-in content (words, numbers) comes from `assets/style-menu.json` unless `--content` supplies the real words, so write content from what she actually says at those moments.

## Checks before delivering a look

1. Build the reel and grab a frame at every card (`hyperframes snapshot proj --at ... --describe false`, or the frames the render produces); look at the eyes and mouth. Nothing may cover them.
2. The text must be inside the frame and readable over the footage.
3. Say plainly what you looked at and what you did not listen to.
