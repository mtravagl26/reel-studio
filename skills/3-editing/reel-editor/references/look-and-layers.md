# Studio look and graphics behind the speaker

Added by By Mel Ross (see the repo NOTICE). Everything runs on this computer; nothing is uploaded.

## Studio look (natural by default)

`scripts/cut.py` applies it while it cuts, so it costs no extra video generation:

| Part | What it does | Setting (`brand.json` → `"enhance"`) |
|---|---|---|
| Exposure | nudges the picture toward a comfortable middle brightness, by a small bounded step, only as far as the clip needs | `"exposure": 1` |
| Colour | a touch of contrast and saturation, a hint of warmth; no hue shifts, so skin stays skin | `"color": 1`, `"warmth": 1` |
| Denoise | mild phone-grain cleanup (`hqdn3d`) | `"denoise": 1` |
| Sharpen | mild sharpening of brightness only | `"sharpen": 1` |
| Background | a slight blur behind the speaker, speaker stays sharp (needs the cutout below) | `"background": 1` |

It does not smooth skin: natural, not plastic. **Out of the box only the mild denoise and sharpen are on. The colour grade (exposure, colour, warmth) and the background blur are OFF**; turn one on by setting it to 1 (for example `"background": 1`). Every amount is a multiplier: 1 is standard strength, 0 is off, 2 is double; `"strength"` scales all of them; `"on": false` turns the whole look off. A reel can override with `"enhance"` in its `edl.json`.

**Review it:** `python3 scripts/enhance.py <reel> compare [--at <seconds>]` writes `enhance_before_after.jpg` (before on the left, after on the right); cut.py also writes one automatically. Look at it before the review step and say what to change ("less sharp", "no background blur").

## Colour: iPhone HDR clips and what the files are labelled

iPhone video is often HDR (HLG, BT.2020, sometimes Dolby Vision). ffmpeg without a tone-mapper only relabels those pixels as standard colour, so the picture comes out lighter, greyer and cooler than the real scene. So `cut.py` converts an HDR clip up front with **`avconvert`, the HDR to SDR converter built into macOS** (`scripts/hdr2sdr.py`; nothing to install, nothing leaves the computer), keeps the whole length, the sound and the upright orientation, checks the result with ffprobe, and cuts from the converted file (`source_sdr.mp4` in the reel folder, made once and reused; `source_color.json` records what happened). Standard (SDR) clips are not touched.

If the clip is HDR and the conversion is not possible (not a Mac, or `avconvert` failed its check), the clip is used as it is and the build says so: **"colour is only approximate"**, and `enhance.json` carries the same note. Tell the person plainly; the fix is to film in "Most Compatible" or run the cut on a Mac. `REEL_NO_AVCONVERT=1` forces that fallback (for comparing).

Handy by itself: `python3 scripts/hdr2sdr.py <clip> --check` says whether a clip is HDR; `python3 scripts/hdr2sdr.py <clip> <out.mp4> [--start S --duration D]` converts a clip or just a span of it (useful before a stabilise/crop step that decodes frames itself).

Every video this editor encodes is labelled BT.709 (`-colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv`): the cut, the background-softened master, the full-quality and phone copies. Unlabelled video is guessed differently by different players. If you ever pipe frames through RGB yourself (a Python step, or a `gbrp` filter chain), two ffmpeg defaults shift the colour, so say what you mean: encode with `-vf scale=in_range=full:out_range=tv:out_color_matrix=bt709` (the default matrix is the old BT.601), and convert with `scale=flags=accurate_rnd+full_chroma_int` (ffmpeg's default fast YUV to RGB conversion reads about 3 levels dark at HD size). `cutout.py` already does this. A JPG cover has no such label (it is plain sRGB). `enhance.json` in the reel folder records what was applied.

## The cutout

`scripts/cutout.py` makes a person matte with **Apple Vision** (built into macOS, runs on this computer) and cleans it with ffmpeg: edge tightened, 1 px feather, steady across 3 frames. It needs macOS and the Swift compiler (`xcode-select --install`). A 20 s clip takes about 30 s. On other systems (or with `REEL_NO_CUTOUT=1`) there is no cutout: the background blur is skipped and layered graphics fall back to plain overlays in front, and the build says so. Your own white-on-black matte video works too: `python3 scripts/cutout.py <reel> build --matte matte.mp4`.

`python3 scripts/cutout.py <reel> sheet` writes `cutout_check.jpg`: for three moments, the frame, the matte, and the speaker alone on magenta. Look at the edges before layering.

Fixing a matte for one set of footage, in `edit.json`:

```json
"cutout": {"include_dark": [[600, 1120, 480, 340]], "exclude": [[x, y, w, h]], "include": [[x, y, w, h]], "matte": "my-matte.mp4"}
```

(pixels on the 1080x1920 frame). A microphone, or anything dark, that sits in front of the speaker is usually missing from the matte, so a graphic behind them would show through it: `include_dark` adds only the dark pixels inside the box (the microphone and its boom, not the wall or chair around them); an optional fifth number is the darkness limit (default 100, higher takes in lighter objects). `include` adds the whole box, `exclude` removes it (an unwanted blob such as a chair arm), and `matte` brings your own white-on-black matte video instead of Apple Vision. Check the result with `cutout.py <reel> sheet`.

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
