# Studio look and graphics behind the speaker

Added by By Mel Ross (see the repo NOTICE). Everything runs on this computer; nothing is uploaded.

## Studio look (on by default)

`scripts/cut.py` applies it while it cuts, so it costs no extra video generation:

| Part | What it does | Setting (`brand.json` → `"enhance"`) |
|---|---|---|
| Exposure | nudges the picture toward a comfortable middle brightness, by a small bounded step, only as far as the clip needs | `"exposure": 1` |
| Colour | a touch of contrast and saturation, a hint of warmth; no hue shifts, so skin stays skin | `"color": 1`, `"warmth": 1` |
| Denoise | mild phone-grain cleanup (`hqdn3d`) | `"denoise": 1` |
| Sharpen | mild sharpening of brightness only | `"sharpen": 1` |
| Background | a slight blur behind the speaker, speaker stays sharp (needs the cutout below) | `"background": 1` |

It does not smooth skin: natural, not plastic. Every amount is a multiplier: 1 is the default, 0 is off, 2 is double; `"strength"` scales all of them; `"on": false` turns the whole look off. A reel can override with `"enhance"` in its `edl.json`.

**Review it:** `python3 scripts/enhance.py <reel> compare [--at <seconds>]` writes `enhance_before_after.jpg` (before on the left, after on the right); cut.py also writes one automatically. Look at it before the review step and say what to change ("less sharp", "no background blur").

HDR (HLG) iPhone clips are only approximately converted to standard colour (ffmpeg here has no HDR tone-mapper); for exact colour film in SDR / "Most Compatible". `enhance.json` in the reel folder records what was applied.

## The cutout

`scripts/cutout.py` makes a person matte with **Apple Vision** (built into macOS, runs on this computer) and cleans it with ffmpeg: edge tightened, 1 px feather, steady across 3 frames. It needs macOS and the Swift compiler (`xcode-select --install`). A 20 s clip takes about 30 s. On other systems (or with `REEL_NO_CUTOUT=1`) there is no cutout: the background blur is skipped and layered graphics fall back to plain overlays in front, and the build says so. Your own white-on-black matte video works too: `python3 scripts/cutout.py <reel> build --matte matte.mp4`.

`python3 scripts/cutout.py <reel> sheet` writes `cutout_check.jpg`: for three moments, the frame, the matte, and the speaker alone on magenta. Look at the edges before layering.

Fixing a matte for one set of footage: `edit.json` → `"cutout": {"include": [[x, y, w, h]], "exclude": [[x, y, w, h]]}` (pixels on the 1080x1920 frame). A microphone in front of the speaker is usually missing from the matte; `include` a box around it. An unwanted blob (a chair arm) goes in `exclude`.

## Layers: behind, in front, or both

Any card in `edit.json` can say where it sits:

```json
{"type": "title", "start": 7.1, "end": 11.6, "text": "six / weeks", "y": 470, "size": 330, "layer": "behind"}
```

- `"layer": "front"` (default): the usual overlay above everything.
- `"layer": "behind"`: between the background and the speaker's cutout. They stand in front of it: big type and shapes behind a head look like part of the scene. Put the card where it overlaps the speaker, or it looks like a normal card.
- `"layer": "both"`: the card sits behind, and a copy also shows in front inside `"front_part"` (`"bottom"` default, `"top"`, or `[x, y, w, h]`), so it weaves around them. Use it for a banner or swoosh that passes behind the head and across the body.

Works for title, tag, card, shot, image, sticker and cta cards; full-frame ones (block, page, motion, follow) stay in front, and the build says so. Behind-the-speaker cards zoom with the camera so they stay anchored to the scene.

**Edge check, shot by shot.** Before a card is layered, `cutout.py check` looks at the matte for that stretch: the speaker must fill a plausible share of the frame, the matte must not jump or flicker, and its edges must be clean rather than mushy. If a shot fails, that card is drawn as a plain overlay in front, and the build prints which shot and why (`note: card 1 at 13.0s (tag): not layered behind the speaker (...)`). Tell them when that happens.

Render time: the speaker layer is a transparent WebM (`cutout/person.webm`, VP9 with alpha) that HyperFrames draws above the behind graphics; a 20 s reel renders in about a minute.
