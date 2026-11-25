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

## The looks built in 0.19.0 (H6-H19, C6-C16, L10-L23)

Each was built from its recipe on real footage and the frame was looked at. The recipe below is stand-in content: put the person's own words, numbers and pictures in. `planned` rows (H18, C14, L18) are not recommended and are never offered.

What the engine gained for these (all in `scripts/build_reel.py`):

- `title`: `*word*` marks the highlighted word (the highlight color, or a marker behind the word when that color is too light to read on the headline); `"font": "serif" | "body" | "accent" | "hand"`; `"italic": true`; `"sub": "small line under"`; `"labels": ["before", "after"]`. brand.json `fonts.serif` sets the serif.
- New cards: `quote` (a sentence in a white box), `columns` (2 or 3 hand-lettered columns on paper), `chips` (a caps title with numbered chips that light up at `chip_times`).
- brand.json `captions`: `"bg": "#FFFFFF"` or `"rgba(0,0,0,.62)"` puts the words on a box or a bar; `"accent_font": "head"` and `"accent_italic": true` restyle the highlighted words.
- `page`: `"bg": "blur"` shows the clip as a card over a blurred copy of itself; `"label"` adds a small caps label.
- `polaroids`: `"layout": "cloud"` takes up to 8 pictures in an arc. `tiles`: `"layout": "column"` stacks up to 5 small tiles down one side. `card`: `"y"` moves a list.
- A recipe can hold more than one card (`"cards": [...]`).

| ID | Look | Status | Recipe (stand-in content) |
|---|---|---|---|
| H6 | Time-stamped number opener | built | `{"type": "title", "text": "*161* days ago / I started this", "align": "left", "y": 95, "size": 130, "color": "#FFFFFF"}` |
| H7 | Ranked serif headline + context line | built | `{"type": "title", "text": "my 10 best tools / this year", "font": "serif", "sub": "(as a solo business owner)", "align": "center", "y": 110, "size": 120, "color": "#FFFFFF"}` |
| H8 | Built-it lockup: I BUILT MY OWN ___ IN [logo] | built | `{"type": "title", "overline": "I BUILT MY OWN", "overline_font": "body", "overline_size": 40, "text": "reel editor", "font": "serif", "italic": true, "align": "center", "y": 95, "size": 130, "color": "#FFFFFF"}` + `{"type": "sticker", "x": 540, "y": 400, "size": 150}` + needs 1 picture(s) from them |
| H9 | Contrarian count line | cut-choice | The spoken hook is the whole graphic: a line that swaps a big number for a small one, such as "You don't need [big number] [things]. You need [small number]." Plain shot, no title card. |
| H10 | Two-label contrast title | built | `{"type": "title", "text": "my week", "font": "serif", "labels": ["messy", "mapped"], "align": "center", "y": 110, "size": 130, "color": "#FFFFFF"}` |
| H11 | Community prompt | built | `{"type": "title", "text": "tell me what / you're building", "font": "serif", "align": "center", "y": 110, "size": 110, "color": "#FFFFFF"}` |
| H12 | Quote-in-a-box hook | built | `{"type": "quote", "text": "I want to post more / but it eats my week"}` |
| H13 | POV / relatable line + reaction GIF | built | `{"type": "quote", "text": "how I expect clients / to react", "marks": false, "size": 54}` + `{"type": "popup", "pos": "middle-right", "size": 300}` + needs 1 picture(s) from them |
| H14 | Day-N series label (quiet version) | built | `{"type": "title", "overline": "day 12:", "overline_font": "accent", "text": "building my / reel editor", "align": "left", "y": 95, "size": 130, "color": "#FFFFFF"}` |
| H15 | Quoted myth on screen | built | `{"type": "title", "text": "“I'll get organised / when things slow down”", "font": "serif", "italic": true, "align": "center", "y": 110, "size": 84, "color": "#FFFFFF"}` |
| H16 | Time or money handed back | built | `{"type": "title", "text": "I save *10 hours* / a week", "font": "serif", "align": "center", "y": 110, "size": 110, "color": "#FFFFFF"}` |
| H17 | List promise with the number in colour | built | `{"type": "title", "text": "the *5* tools / I'd give anyone", "align": "center", "y": 95, "size": 130, "color": "#FFFFFF"}` |
| H18 | Hype claim hook | planned | A claim that one thing has ended another, in a white box. Common, and it draws comments by overstating. |
| H19 | Question label above the head | built | `{"type": "tag", "text": "what most people do", "y": 130}` |
| H20 | Arched title with a sparkle wave (0.26.0) | built | `{"type": "arctitle", "text": "Series name", "sub": "part one", "trail": true}`. The sparkles need a Mac; see `references/hand-trail.md`. |
| C6 | White label-box single word | built | brand: `{"colors": {"caption": "#000000"}, "captions": {"size": 96, "y": 1250, "case": "sentence", "mode": "word", "bg": "#FFFFFF"}}` |
| C7 | Quiet mid-lower white phrase | built | brand: `{"captions": {"size": 54, "y": 1130, "case": "sentence", "mode": "phrase"}}` |
| C8 | Bold word with soft shadow | built | brand: `{"colors": {"caption": "#FFFFFF"}, "captions": {"size": 120, "y": 1250, "case": "sentence", "mode": "word"}}` |
| C9 | Highlighter italic punch | built | brand: `{"captions": {"size": 92, "y": 1250, "case": "sentence", "mode": "phrase", "accent_font": "head", "accent_italic": true}}` + accent: the whole first phrase |
| C10 | Dark translucent phrase bar | built | brand: `{"captions": {"size": 60, "y": 1240, "case": "sentence", "mode": "phrase", "bg": "rgba(0,0,0,.62)"}}` |
| C11 | Keyword colour highlight | built | brand: `{"captions": {"size": 72, "y": 1250, "case": "sentence", "mode": "phrase"}}` + accent: one word per caption |
| C12 | Tiny centred serif over b-roll | built | brand: `{"captions": {"size": 44, "y": 900, "case": "lower", "mode": "phrase"}, "fonts": {"body": {"family": "Lora", "file": "{reels}/fonts/Lora.ttf", "weight": 500}}}` |
| C13 | Pinned topic label + quiet captions | built | `{"type": "tag", "text": "operations", "y": 120, "glass": true}` + brand: `{"captions": {"size": 54, "y": 1130, "case": "sentence", "mode": "phrase"}}` |
| C14 | Chunky playful stacked type | planned | Rounded chunky words of mixed sizes stacked down the frame. |
| C15 | One bold white word, no highlight | built | brand: `{"colors": {"caption": "#FFFFFF"}, "captions": {"size": 96, "y": 1180, "case": "sentence", "mode": "word"}}` |
| C16 | Caption doubles as counter | cut-choice | The running caption carries the count, such as "1 of 5", so the rhythm of a list is built into the words. A writing choice: the count is typed into the captions. |
| L10 | Inset card over a blurred, enlarged self | built | `{"type": "page", "bg": "blur"}` |
| L11 | Top asset panel + face below | partial | `{"type": "page", "label": "app name"}` + needs 1 picture(s) from them Not included: the picture fills the whole background behind the title area; a separate top panel with your face filling the bottom half is not built |
| L12 | Photo-card cloud above the head | built | `{"type": "polaroids", "layout": "cloud", "y": 60}` + needs 6 picture(s) from them |
| L13 | Logo chips either side of the face | built | `{"type": "popup", "pos": "middle-left", "size": 170, "frame": false, "caption": "writing"}` + `{"type": "popup", "pos": "middle-right", "size": 170, "frame": false, "caption": "images"}` + needs 2 picture(s) from them |
| L14 | Vertical icon list beside the face | built | `{"type": "tiles", "layout": "column", "tiles": [{"label": "one", "icon": "star"}, {"label": "two", "icon": "chart"}, {"label": "three", "icon": "people"}, {"label": "four", "icon": "doc"}]}` |
| L15 | Whiteboard columns above the head | built | `{"type": "columns", "cols": [{"title": "keep", "items": ["this", "that"]}, {"title": "drop", "items": ["this", "that"]}, {"title": "fix", "items": ["this", "that"]}]}` |
| L16 | Numbered steps card | built | `{"type": "card", "title": "how I do it", "rows": ["1. first step", "2. second step", "3. third step"], "y": 1000}` |
| L17 | Number chips 1-5 under a caps title | built | `{"type": "chips", "title": "5 things to fix", "n": 5}` |
| L18 | Two-person split | planned | Two people side by side with a logo and price between them; labels top-left and top-right. |
| L19 | Reaction GIF at chest height | built | `{"type": "popup", "pos": "custom", "x": 540, "y": 1230, "size": 320}` + needs 1 picture(s) from them |
| L20 | Carousel slide as opening or closing frame | built | `{"type": "popup", "pos": "center", "size": 1080, "frame": false}` + needs 1 picture(s) from them |
| L21 | Comment-keyword end line | built | `{"type": "cta", "text": "comment GUIDE and I'll send it"}` |
| L22 | Small top-left statement block | built | `{"type": "title", "text": "one idea / that stays up / the whole reel", "font": "body", "align": "left", "y": 100, "size": 54, "color": "#FFFFFF", "quiet": false}` |
| L23 | Two-line caps title, second line in accent | built | `{"type": "title", "text": "before you grow / *fix the basics*", "align": "center", "y": 95, "size": 120, "color": "#FFFFFF"}` |

## Show me on my clip, and Put it here (0.27.0)

The looks gallery (the reel link's `/styles`, and `/looks` on the home page) has **Show me on my clip**. It runs `scripts/look_preview.py`, which makes storyboard stills of the picks on the person's own footage in about 30 seconds: a cut reel as it is; a reel not cut yet, or the last clip checked on the home page, as a throw-away reel-sized copy of its first stretch with stand-in captions (from `transcript.json` when there is one). With no `brand.json` yet, the example brand stands in and the page says so. Nothing in the reel or the clip is written; previews go to `~/reels/.look-previews/` (the last 6 are kept).

On the reel link, a picked layout look also gets **Where**: Claude picks the moment, or one of the reel's lines. Picks are saved in `style-picks.json` as `"at": {"L8": 31.2}` and the request says `Put L8 at the line "..." (0:31)`; before the first cut the time is in the raw clip and the request says so. Put the card on that line in `edit.json`.
