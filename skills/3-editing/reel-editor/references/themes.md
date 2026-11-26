# Themes

Added by By Mel Ross (0.8.0).

A theme is the look of a reel. It is kept apart from the brand.

| | Holds | Lives in |
|---|---|---|
| Brand | Name, colors, call to action, word list, sound levels, where files go | `~/reels/brand.json` |
| Theme | Fonts, caption look, title look, card shapes, how the camera moves | a theme folder |

Pick a theme and the person's colors fill it in. Switching theme never changes their colors or name.

## The 5 themes that ship

| Theme | What it looks like | Style Menu looks that suit it |
|---|---|---|
| `editorial` | Cream serif headlines, small white captions, one word in italic. Nothing bounces. | C2, L7, L8 |
| `bold` | Heavy caps titles, captions in white label boxes, the last title line and the key word in the accent color. | H2, C3, L4, L6, L8 |
| `handwritten` | A handwritten line over heavy caps, torn-paper labels, photos framed like prints. | H3, C1, L2, L6, L9 |
| `whimsical` | Round letters, one script word, small stars round the title, labels and photos that tilt. | H5, L2, L9, the `orbit` card |
| `minimal` (0.32.0) | Big stacked caps in a warm cream serif (Instrument Serif) over the torso, small one-word lowercase captions low on the left, a hand-drawn emphasis word now and then. Nothing bounces. | L6, L9 |

### Using `minimal`

- **Titles** show in caps over the torso. Type them in caps, one short line per slash (`"LEAVE IT / FOR 24 / HOURS"`), so each line is sized for its capitals.
- **The hook** is a title with a `sub` line. It moves to the top by itself, and the sub becomes the small, widely spaced handwritten line under it.
- **Captions** are one word at a time, lowercase, low on the left (y 1180), clear of most hair. If yours still reaches them, set `captions.y` in `theme_overrides`. Mark a word `"accent": true` now and then and it turns into the hand-drawn emphasis word in caps.
- **Screenshots and charts**: a `popup` with `"frame": true` gets a white rounded border.
- **The red X**: a `sticker` whose `src` is the full path to `themes/minimal/red-x.svg`, next to a "DO NOT / DO THIS" title and clear of the face (for example x 820, y 1500).
- **The end line**: a `cta` with a short line and an emoji. It shows in white with no pill.

Cream on a white or very bright top is hard to read even with the soft shadow. Check titles over the shirt on real footage, and pick `editorial` or `bold` for a white top.

`python3 scripts/theme.py list` shows what this machine has. Each `theme.json` also lists `menu` (the looks above).

## Choosing one

- **For every reel:** `"theme": "editorial"` in `~/reels/brand.json`.
- **For one reel:** `"theme": "bold"` in that reel's `edit.json`.
- **For one build:** `python3 scripts/build_reel.py <reel> --theme whimsical`.
- **No theme:** leave it out. `brand.json` is used exactly as before.

Ask which theme they want in the setup interview, and show them before they choose:

```bash
python3 scripts/storyboard.py <reel> --out <new folder> --option "A=theme:editorial" --option "B=theme:bold" --option "C=theme:handwritten" --option "D=theme:whimsical" --option "E=theme:minimal"
```

That makes one image with the same moments of their reel in each theme. Stills only, no render.

A theme does not pick the cards. Plan the edit as usual, and lean on the looks in the table: a `handwritten` reel wants polaroids and a hand-drawn list, a `bold` reel wants a stat card.

## Keeping one thing your own way

`brand.json` `"theme_overrides"` is laid over the theme last:

```json
{"theme": "bold", "theme_overrides": {"captions": {"size": 70}, "fonts": {"head": {"family": "Lora", "file": "~/reels/fonts/Lora.ttf", "weight": 700}}}}
```

## Making or adding a theme

A theme is a folder with `theme.json`. Put it in `~/reels/themes/<name>/` (a folder there wins over a built-in theme of the same name). This is also how a theme pack is added: copy its folders in.

```json
{
  "name": "My theme",
  "summary": "One line on what it looks like.",
  "brand": {"fonts": {"head": {"family": "Anton", "file": "Anton-Regular.ttf", "weight": 400}}, "captions": {"size": 62}, "colors": {"caption": "@light"}},
  "cards": {"title": {"align": "left", "color": "#FFFFFF"}},
  "css": [".tag { border-radius: 10px; }", ".cap .acc { background: @pop; }"]
}
```

- `brand`: anything `brand.json` takes that is about style (`fonts`, `captions`, `zoom`, `title_outline`, `title_tracking`, `caption_accent_shadow`, `colors.caption`, `colors.caption_accent`). Leave `name`, `colors.main` / `pop` / `light`, `vocabulary`, `mix` and `enhance` alone: those are the person's.
- `cards`: defaults per card type, used only when a card does not set that field.
- `css`: extra rules added after the built-in ones. Classes are in `scripts/build_reel.py` (`.title`, `.tl`, `.ol`, `.cap`, `.acc`, `.tag`, `.cta`, `.card`, `.stat`, `.pop`, `.tile`).
- `@main`, `@pop`, `@light` stand for the brand's colors anywhere in the file. In `css`, `@head`, `@body`, `@accent`, `@hand` stand for the font families.
- A font `file` can be a bare file name. It is looked for in the theme folder, `themes/_fonts/`, the skill's `assets/fonts/`, then `~/reels/fonts/`. Ship the font's licence next to it.

## What a theme reaches

The build (`build_reel.py`), captions (`auto_edit.py`), the review page data (`review_sync.py`), the cover (`cover.py`) and the thumbnail studio all read the brand with the theme laid over it. The cut, the sound mix and the picture clean-up do not change with the theme.

Check a new theme on real footage before giving it to anyone: titles over a face, captions over a bright shirt, a long word in the head font.
