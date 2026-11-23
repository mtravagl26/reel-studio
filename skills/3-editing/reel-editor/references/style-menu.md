# Style Menu (Melissa's looks by ID)

Added by By Mel Ross, 2026-11-13. Melissa picked 19 looks from five reels she liked (Style Menu v0). Each has an ID: **H** = hook, **C** = captions, **L** = layout. When she says "do H3 with C2 and L8", use the table below. The machine-readable version is `assets/style-menu.json` (what `scripts/storyboard.py` reads).

Defaults for every look: sage palette (`#B9C8A5` highlight, a deeper sage `SAGE_DEEP` blended from it and the brand teal wherever a mark sits on cream paper), her fonts (Inter, Lora, plus Caveat handwriting from `assets/fonts/`, OFL licence), no music, gentle zooms. Her face fills the frame in the CALMA and Salesforce footage: eyes sit near y 500-560 of 1920, so graphics go in the top corners (above y ~450) or the lower third (y 1050-1500, above the bottom 420 px Instagram covers), never on the eyes.

**Status** = measured, not assumed: *built* means the look was rendered on her footage (Salesforce offer reel v2) and the frame was viewed; *partial* means the closest thing we have, with the difference named; *cut-choice* is an edit decision with no setting; *not built* means nothing yet.

**What to offer.** Offer and show only the looks in the first table. The second table is a to-do list: never suggest those IDs, and never put them in a storyboard. If the person asks for one by ID, say it is not built yet and offer the nearest look that is (named in its row). For a *partial* look, say what is missing before using it.

### Looks you can use

| ID | Look | Status | What produces it |
|---|---|---|---|
| H1 | Logo-swap title | not built | needs two logo images (not supplied) |
| H2 | Cold open + big number | partial | `title` card, one huge white number: `{"type":"title","text":"80,000","color":"#FFFFFF","size":240,"y":90,"align":"left"}` (size ~ 900 / (characters x 0.6)). Missing: cold open on b-roll, the sparkle |
| H3 | Handwritten overline + bold caps headline | built | `title` card with `overline`: `{"type":"title","text":"SALESFORCE / OFFER","overline":"big news this week","align":"left","y":95,"size":150,"color":"#FFFFFF"}` |
| H4 | Series title, phone-in-frame | not built | needs a logo and a phone-card layout |
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
| L24 | Taped note (was L10 before the 58-look menu) | built | card `note`; uses the material kit's paper and tape when one is on (`references/material-kits.md`) |

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

**L9 photo sticker**: the existing `popup` card (the CALMA corner stickers) now takes `"caption"`: `{"type":"popup","start":6.1,"end":9.2,"src":"shots/calma-space.jpg","pos":"top-left","size":330,"rotate":-5,"caption":"how is this real?!"}`. The caption sits on a torn strip across the photo's lower edge; with a caption or `"exit": true` the photo shrinks out instead of only fading. `pos` and `size` as before; keep the photo + caption above y ~450.

**L6 list with hand-drawn marks**: `{"type":"xlist","start":50.7,"end":56,"mark":"check","items":["Speaking engagements","Working with clients","Helping everyday people"],"row_times":[51.1,52.3,53.7]}`. Cream paper card in the lower third (`y` default 1050), one row per item, the mark is drawn on stroke by stroke. `mark` "check" (sage, default) or "x" (red `#D64545`); one item can override with `{"text":"...","mark":"x"}`. Land each row on its spoken word with `row_times`. Caveat draws a capital I like a 1: for text with "AI" set `"font": "body"`.

**L8 stat card**: `{"type":"stat","start":33.8,"end":36.7,"label":"Employees at Salesforce","value":"80,000"}`. White card pops over the lower half (`y` default 1080, `w` 720). Optional `delta` ("+12%" in a sage pill) and `spark` (a list of numbers drawn as a sparkline): use them only when there is real data, never invented.

**L4 icon-tile grid**: `{"type":"tiles","start":9.5,"end":15.2,"label":"SPM products","tiles":[{"label":"Spiff","icon":"dollar"},{"label":"Territory Enterprise Management","icon":"target"},{"label":"Salesforce Maps","icon":"map"}],"tile_times":[9.75,10.55,13.45]}`. Torn cream label, then 1-8 tiles that pop on in turn (`tile_times` to land each on its word). `icon`: built-in line icon (dollar target map chart people check star chat doc mic heart spark mail), a picture path (her own logo or app icon), or a short glyph. Real app logos are not bundled; supply them as images.

**Top captions vs top titles:** C1 puts captions at y 150, the same place as the H2/H3/L7 title cards. Start the title on a caption boundary (a title card hides captions that start while it shows, but one already on screen stays), or pair those titles with C2/C3 instead.

## Storyboard first

Before building a reel with new looks, show her stills of 2-3 options, not videos: `scripts/storyboard.py` (see "Storyboard" in SKILL.md).

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

## Style Menu v1 (planned looks, 2026-11-16)

Added from a trend pass over Instagram niche feeds (women business owners, AI and systems for small business). **All status `planned`**: no recipe yet, so `storyboard.py` skips them and says so. `build` says how they would be made: `now` = current cards/captions config, `small` = small engine change, `assets` = she supplies images, `cut` = edit choice, `no` = skip (poor fit). Full table with evidence: `projects/style-menu-v1/STYLE-MENU-v1.md` in the Control Room workspace; visual menu `~/Movies/Video Studio/style-menu/Style Menu v1.html`.

| ID | Look | Status | Build | Fit | How |
|---|---|---|---|---|---|
| H6 | Time-stamped number opener | planned | now | 4/5 | `title` card with `overline` ("X days ago") and the number as headline, left-aligned; same family as H2/H3. |
| H7 | Ranked serif headline + context line | planned | now | 5/5 | `title` card, Lora headline in `#F4EFE0`, `overline`/second line for the parenthetical. |
| H8 | Built-it lockup: I BUILT MY OWN ___ IN [logo] | planned | assets | 4/5 | `title` card + `sticker` for the logo (she supplies the image). Close to H1 but one-logo. |
| H9 | Contrarian count line | planned | cut | 5/5 | Cut choice: start on that sentence with no wind-up (like H5, but no reaction). |
| H10 | Two-label contrast title (messy | mapped) | planned | now | 4/5 | `title` card + two `tag` cards; or `tiles` with two tiles. |
| H11 | Community prompt: "tell me what you're building" | planned | now | 5/5 | `title` card, centred, Lora, two lines; add to the first 3 s or as an end card. |
| H12 | Quote-in-a-box hook | planned | small | 5/5 | Needs a `quote` card (white box, bold coloured text, held 3 s); closest now is a `card` with one row. |
| H13 | POV / relatable line + reaction GIF | planned | now | 3/5 | `title`/`tag` for the line + `popup` with a GIF (already supported, GIFs loop). |
| H14 | Day-N series label (quiet version) | planned | now | 4/5 | `title` with `overline` "day 12:" in the accent font (same as L7). |
| H15 | Quoted myth on screen | planned | now | 4/5 | `title`, small, with quote marks; hold 3 s; captions below. |
| H16 | Time or money handed back | planned | now | 4/5 | `title` card; or `stat` (L8) for the number. |
| H17 | List promise with the number in colour | planned | now | 5/5 | `title` card with the number coloured; list as L6/L16/L4. |
| H18 | Hype claim hook ("X just killed Y") | planned | no | 1/5 | Do not build. |
| H19 | Question label above the head | planned | now | 3/5 | `title` card, small, left-aligned; or a `tag`. |
| C6 | White label-box single word | planned | small | 4/5 | Caption style `box` (background on the word). Closest now: C3 with `colors.caption` black on a card. |
| C7 | Quiet mid-lower white phrase | planned | now | 5/5 | brand.json `captions` `{"size":54,"y":1130,"case":"sentence","mode":"phrase"}`, no accent. |
| C8 | Bold word with soft shadow | planned | now | 3/5 | C3 with `colors.caption` `#FFFFFF` and size 120; shadow already in the build. |
| C9 | Highlighter italic punch (sage version) | planned | now | 3/5 | C2 accent colour sage, `"accent": true` on the whole first phrase. |
| C10 | Dark translucent phrase bar | planned | small | 3/5 | Caption style `bar` (background behind the phrase). |
| C11 | Keyword colour highlight | planned | now | 5/5 | C2 recipe, `"accent": true` on one word per caption. |
| C12 | Tiny centred serif over b-roll | planned | now | 5/5 | C1 centred: captions `{"size":44,"y":900}` with Lora body font. |
| C13 | Pinned topic label + quiet captions | planned | now | 5/5 | `title` card held with `end`, small, + C7 captions. |
| C14 | Chunky playful stacked type | planned | no | 1/5 | Do not build. |
| C15 | One bold white word, no highlight | planned | now | 4/5 | C3 with white caption colour, size ~96, y 1180. |
| C16 | Caption doubles as counter | planned | now | 4/5 | Write the count into `edit.json` captions text at each item; plain C7 styling. |
| L10 | Inset card over a blurred, enlarged self | planned | small | 4/5 | `page` card has the clip framed with a background; needs a `bg: "blur"` option (blurred copy of the same clip). |
| L11 | Top asset panel + face below | planned | assets | 4/5 | `page` card (bg image + clip framed) with her screenshot or logo; small mono label added. |
| L12 | Photo-card cloud above the head | planned | small | 4/5 | `polaroids` allows 4 cards; raise to 8 with a cloud placement. |
| L13 | Logo chips either side of the face | planned | assets | 3/5 | Two `sticker` cards per pair (logos supplied). |
| L14 | Vertical icon list beside the face | planned | small | 3/5 | `tiles` laid out in one column at the left. |
| L15 | Whiteboard columns above the head | planned | small | 5/5 | New card `columns` (like `xlist`, 2-3 columns of items drawn in turn). Hand font already bundled. |
| L16 | Numbered steps card | planned | now | 4/5 | `card` with `rows` (1. 2. 3.) in the lower third; quiet, not a pop-up. |
| L17 | Number chips 1-5 under a caps title | planned | small | 3/5 | New `chips` card (sage numbers) or `tiles` with number glyphs. |
| L18 | Two-person split (Paid vs Free) | planned | no | 2/5 | Skip unless she films with a second person. |
| L19 | Reaction GIF at chest height | planned | now | 3/5 | `popup` with a GIF (already works; her Giphy backups exist). |
| L20 | Carousel slide as opening or closing frame | planned | now | 4/5 | `page` or full-frame `image` card with her carousel slide PNG for 1.5-3 s. |
| L21 | Comment-keyword end line | planned | now | 5/5 | `cta` card (CAPS word pops) or `title` card at the end; the keyword matches the comment-DM rule. |
| L22 | Small top-left statement block | planned | now | 4/5 | `title` card, left-aligned, small, long `end`. |
| L23 | Two-line caps title, second line in accent | planned | small | 4/5 | `title` with a second-line colour option (today one colour per card). |
