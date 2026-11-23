# The reel editor page

Added by By Mel Ross. A phone-friendly page for editing a reel that was already built (it has `edit.json`, `edl.json` and a rendered `final.mp4`). You tap, it saves, **Re-render** rebuilds the video. Everything stays on this computer; nothing is uploaded, no telemetry.

## Start it

```bash
cd <the folder that holds brand.json and the reels>      # e.g. ~/Movies/Video Studio, with REELS_HOME set to its reels/ folder
export HYPERFRAMES_NO_TELEMETRY=1 DO_NOT_TRACK=1
node <skill>/review/editor-server.mjs <reel folder> --lan --port 4792
```

The three per-reel pages share one step bar, in this order: 1 Review, 2 Touch-ups, 3 Cover (0.15.0: the cover is last, so it is picked from the finished reel). The home page (`references/home-and-framing.md`) and the looks page (`/styles`) sit outside it. Review and Touch-ups link to each other on their own. Add `--cover-url <thumbnail studio link>` for the Cover step (greyed out without it), and `--review-url <link>` only when the review page lives on claude.ai instead of this server. The cover link is only shown on this computer, because the thumbnail studio does not answer over Wi-Fi.

`review/studio-server.mjs` is the same server under the name the other docs use: one link for the whole reel. Before the reel is built (no `edit.json` / `edl.json`) the link opens the review page (`/review`, same data files as `references/review-local.md`) and the touch-ups page says the reel is not built yet; once it is built the link opens touch-ups (`/touchups`), and the review page shows a note that the reel is already built.

**Rebuilding from the review page keeps touch-ups** (`scripts/touchups.py`, run by `review_sync.py import`). Each import remembers what it wrote (`editor/import-base.json`); the next one compares that with `edit.json` as it stands, so added text, popups and sounds, fixed caption words, changes to a review graphic and anything set by hand in `edit.json` are laid over the new edit at the same moment of the raw clip. Pieces dropped on this page become cut words in the review decisions. The import prints `TOUCH-UP KEPT:` and `TOUCH-UP NOT KEPT (tell them):` lines: read the second kind out to the person (a touch-up is left out when the moment it started on is cut now). The edit as it was is in `editor/pre-import/`. A reel imported before 0.9.0 has no `import-base.json`, so its first rebuild carries nothing.

It prints `http://127.0.0.1:4792/?k=<key>` (this computer) and `same Wi-Fi: http://<ip>:4792/?k=<key>` (a phone on the same Wi-Fi). The key changes every run; a link without it gets 403. Without `--lan` it only answers on this computer. Run it as a long-lived background process (an agent: `exec` with `background: true`, no `&`/`nohup`), check it answers, send the link, stop it when they are done. `REELS_HOME` defaults to the folder that holds the reel folder (it must contain `brand.json`).

This is separate from the Reel Review page (`serve.mjs`, the "which words to cut" proposal). Use the review page before the first cut, the editor page after.

## What it edits (all in files the pipeline already reads)

| On the page | Written to |
|---|---|
| Fix a caption word (optional: "always fix this word") | `edit.json` captions; the checkbox also adds a `vocabulary.corrections` entry (and the term) to `brand.json` |
| Keep / drop a piece of the cut | `edl.json` `keep` + everything in `edit.json` moves to match; `editor/state.json` keeps what was removed so it can come back |
| Pills, titles, stickers on/off, text, start/end, height | `edit.json` cards (`"off": true` leaves a card out of the render) |
| Layer of any text: in front of me / behind me | the card's `"layer"` (`front` / `behind` / `both`) |
| Popups: GIFs, graphics, photos | new `popup` cards; files copied into `<reel>/popups/` |
| Sound effects on/off, which sound, time, level | `edit.json` `sfx_events` |
| Default layer for text | `brand.json` `"text_default"` |

## Popups

Upload from the phone (gif, png, jpg, webp, svg; an SVG stays an SVG so it is sharp at any size, and anything in it that could run a script or load from the internet is removed when it is uploaded (0.15.0); HEIC from an iPhone is converted to JPG with macOS `sips`, the original is kept in `popups/originals/`). Choose start, end, where (top left / top right / top, above the head / left / right / centre, or tap the video for an exact spot), size and tilt. Default: top right, 360 px wide, 3 s, clear of the face. Photos get a white border (switchable). `build_reel.py` makes an animated GIF into a looped transparent video (`ffmpeg`, VP9 with alpha) because the render draws the page frame by frame and a plain GIF would freeze on its first frame.

## Text above or behind the speaker

`brand.json` `"text_default": {"layer": "front", "position": "above"}`: text sits in the area above the head (a pill with no `y` goes to y 130) in front of the speaker. Any single card can be switched to **behind me** (`"layer": "behind"`): between the background and the speaker's cutout (`cutout.py`, Apple Vision). Behind-text only shows where it overlaps the speaker or the background, so it needs headroom; if the face fills the frame it is hidden. If the cutout fails the edge check for that stretch, the card is drawn in front instead; the render report on the page lists it (`note: card N ... not layered behind the speaker`).

## Cuts: how dropping a piece retimes everything

A reel is the kept pieces of `edl.json`, joined at frame boundaries; with `"xfade"` each join's audio crossfade is already inside the piece lengths, so a piece that starts at reel time `s` and lasts `d` moves everything after it by exactly `d` seconds. Dropping removes what starts inside the piece (words, cards, sounds, zoom points) and pulls the rest earlier by `d`; bringing it back reverses that. Items that straddle a join are split or clipped and the page says which. Gaps that were cut out earlier (the pause trims and removed fillers between pieces) are shown but are not switchable; bringing back an old gap is not in this version.

After a cut change the next Re-render runs `cut.py` again (it rebuilds `master.mp4`), then the usual `render.sh`. When it finishes, the page compares the caption times to a fresh Whisper transcript of the new video and shows the median and worst offset (Whisper's own timing is only good to about 0.3 s, so read it as a sanity check, not a proof).

## Re-render

Runs `cut.py` (only when the cuts changed), `render.sh` (preview quality, same as a draft: build, HyperFrames render, `mix_audio.py`, -16 LUFS), `qa.py`, then makes `renders/vNNN.mp4` (a clone of `final.mp4`) and `renders/vNNN-phone.mp4` (H.264 CRF 26, same as `deliver.sh`'s phone copy). Previous renders stay; the page has a version picker to compare. The page shows queued / cutting / rendering / checks / done or failed with the reason (full log: `editor/render.log`). One render at a time; edits are paused while it runs. It never delivers: copying to the delivery folder stays a separate step (`deliver.sh`, and archive older versions into `Archive`, never delete).

## Safety

Every change first copies `edit.json`, `edl.json`, `master_transcript.json`, `expected.txt` and `editor/state.json` (and `brand.json` when it is about to change) to `editor/history/<timestamp>-<what>/`. **Undo** restores the newest snapshot and moves it to `editor/history/undone/`. Quick repeated tweaks of the same field within 30 s share one snapshot. The first time the page opens a reel it adds a short `id` to each card and sound in `edit.json` (the build ignores it) and keeps the file as it was in `editor/edit.json.before-editor`.

## Limits (version 1)

- The video shown is the last render, not a live preview. The dashed box on the video shows where a popup or pill will land; the real look comes from re-rendering.
- Only pills and popups can be added; stickers, titles, list cards and the other card types can be switched on/off, retimed and given a layer, not created.
- Not built: dragging on a timeline, brand-new cards of other types, restoring cuts removed before this page, music, color/look settings.
- HEIC conversion needs macOS (`sips`). EXIF-rotated phone JPGs are untested.

## Video clips that pop in (0.13.0)

A popup can be a video clip: a screen recording, or b-roll from their phone. It plays in a rounded window, in front of the speaker or behind them (`"layer": "behind"`, Mac only), **without sound**.

- **Where they add it.** Before the build: review page > Graphics > Add a graphic > "My video clip or screen recording", then the upload button on that request (or on any graphic set to Change). After the build: touch-ups page > Popups > "+ Upload a picture, GIF, SVG or video clip".
- **What the upload does.** `.mp4 .mov .m4v .webm` are accepted. The server keeps a small upright copy (`popups/<id>.clip.mp4`: 30 fps, at most 1080 px wide, no sound, at most 3 minutes) and moves the original to `popups/originals/`.
- **The card.** `{ "type": "popup", "src": "popups/<id>.clip.mp4", "pos": "top-left", "size": 440, "start": 36.0, "end": 40.0, "from": 1.0, "loop": false }`. `from` = seconds into the clip to start at. A clip shorter than its time on screen holds its last frame, or starts again with `"loop": true`.
- **Placement.** Defaults to top left at 440 px wide, a window beside the face. A tall phone recording at that size is about 950 px high, so check a frame: it must not cover the eyes or the captions. Use `size`, `pos` or `x`/`y` to move it.
- **Not for:** the ring of pictures around the head (pictures and GIFs only), or anything that needs the clip's sound.

## The timeline and the receipt (0.14.0)

**Timeline.** Under the video, a strip that scrolls sideways at 56 px a second. Top to bottom: seconds, frames from the render, its waveform, the caption lines, the graphics (a second row when two overlap), and a dot for each sound effect. A dashed red line marks each cut. Tapping anywhere jumps the video there, and the red playhead follows while it plays. The frames and waveform are drawn once per render by the page server (`/api/strip.jpg`, `/api/wave.png`) and kept in `editor/timeline/`. After an edit that changes the cuts, the frames still show the old render until Re-render; the page says so.

**Receipt.** "What was done to this reel", under the timeline: stretches cut and seconds removed, the speed, caption words and lines, each kind of graphic, sound effects, zooms, and the theme. It is counted from `edl.json`, `edit.json` and the page's own state by `receipt()` in `editor-core.mjs`, and updates with every edit. `node review/receipt.mjs <reel>` prints the same lines for the chat.

## Placement, layers, lists and labels (0.16.0)

- **Where a picture goes by default.** A picture, GIF or SVG popup with no place set sits in the middle of the screen, even where it covers part of the face. Two of them on screen at the same time sit side by side (`"pos": "side-left"` and `"side-right"`, each at most 500 px wide). The page pairs them when the second one is added; the build pairs any two in `edit.json` that have no `pos`. A place that was chosen is never moved. Video clips keep their own default (top left, 440 px).
- **In front or behind.** Every popup has "In front of my face" and "Behind my head" (`"layer": "behind"`). Behind needs the speaker cutout, so it is Mac only; without a clean cutout the build draws it in front and says so.
- **Handwritten label.** A popup's `caption` can be typed, changed or cleared on the page.
- **Lists.** A list card's title and rows can be edited (one row per line, up to 6), and "+ Add a list at this point in the video" adds a new one.
- **A render made outside the page.** When `final.mp4` is newer than the last render the page knows (Claude or the command line rendered it), the page makes a phone copy and shows it as the latest version. The player no longer stays empty.
