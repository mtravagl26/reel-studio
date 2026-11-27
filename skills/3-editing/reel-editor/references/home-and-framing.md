# Home page: framing check and kind of reel

Added by By Mel Ross (0.12.0). The first link a person gets, before any reel exists.

## Start it

```bash
node review/home-server.mjs            # prints http://127.0.0.1:4790/
```

Give them that link when they say "open Unmess Reels", when they are new, or when they ask whether a clip is filmed well. It runs with no reel folder and answers only the browser on this computer. Leave it running; it is separate from the per-reel link (`studio-server.mjs`, port 4792).

## What the page does

1. **Check your clip.** They drop a video in. It is saved to `~/reels/inbox/` and checked by `scripts/framing_check.py`. The page shows a frame with Instagram's covered areas shaded, a line for where the top of the head should stay below, and 7 checks.
2. **What kind of reel?** The formats in `assets/formats.json` with `"status": "ready"`. A format that is not built is not shown. Today: Talking head, as **Simple** or **With graphics**.
3. **Hand it to Claude.** One line to copy, naming the saved clip and the kind of reel.

## When they paste the request

`Edit the clip ~/reels/inbox/<name> as a simple talking head ...` or `... as a talking head with graphics ...`:

- The clip is already on disk at that path. Make the reel folder and edit as usual (SKILL.md, "The edit, in order").
- **Simple:** treat graphics as `minimal` for this reel: the hook title, captions, and at most 2 or 3 cards. Don't send them to the looks page.
- **With graphics:** treat graphics as `busy` for this reel, and give them the looks page link (`/styles`) along with the review link.
- Either way: review link first, wait for their yes, style card before the first render.

## The 7 checks

`python3 scripts/framing_check.py <clip>` prints them; `--json` for the page. Each is pass, note, retake or skipped.

| Check | Retake when | Note when |
|---|---|---|
| Upright, frame rate | wider than tall | 4K, over 30 frames a second, or HDR |
| Length | under 3 seconds | past the brand's `max_seconds` target |
| Movement | never | the edges of the picture keep changing (camera moving) |
| Light | the face is very dark | a little dark, or blown out |
| Space above your head | head starts in the top 14% of the frame | head starts in the top 22% |
| Safe zones | the face reaches Instagram's caption, buttons or header | never |
| Not cut off | head touches an edge, or fills most of the width | far away, or off to one side |

**Run it yourself on every new clip, before transcribing,** even when they did not use the page. If the verdict is retake, say why in one line and ask whether to edit anyway or wait for a new take. Their call: a retake verdict never blocks an edit they ask for.

**The 3 head checks need to know where the head is.** On a Mac that comes from Apple Vision, through the same tool the cutout uses. Elsewhere OpenCV's face finder is used when it is installed with its data files (`pip install "opencv-python-headless<5"`). With neither, the 3 checks say "skipped" and the page tells the person to check headroom by eye. Never report a skipped check as passed.

The Instagram cover areas (top 220 px, bottom 420 px, right 150 px of 1080 x 1920) are approximate. Instagram moves them. They live in `ZONES` at the top of `framing_check.py`.

## Adding a kind of reel

Build the format first. Then set its `"status"` to `"ready"` in `assets/formats.json` and give it `styles`, each with the words the request should carry in `ask`. Add how to carry it out to this file. No "coming soon" tiles.

## Pick a look (0.26.0)

After the kind of reel, the home page shows **Pick a look (optional)**: the themes, the arched title with a sparkle wave (H20), and **See all the looks**, which opens the Style Menu gallery at `/looks` on the home page server. Picks are kept in `~/reels/.home-picks.json` and written into the request ("Use H3 (...) and the Bold theme."). Read the IDs as Style Menu looks (`references/style-menu.md`).
