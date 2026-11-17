# The reel editor page

Added by By Mel Ross. A phone-friendly page for editing a reel that was already built (it has `edit.json`, `edl.json` and a rendered `final.mp4`). You tap, it saves, **Re-render** rebuilds the video. Everything stays on this computer; nothing is uploaded, no telemetry.

## Start it

```bash
cd <the folder that holds brand.json and the reels>      # e.g. ~/Movies/Video Studio, with REELS_HOME set to its reels/ folder
export HYPERFRAMES_NO_TELEMETRY=1 DO_NOT_TRACK=1
node <skill>/review/editor-server.mjs <reel folder> --lan --port 4792
```

The three pages (review, cover, touch-ups) share one step bar. To make its links work from this page, add `--review-url <review page link>` and `--cover-url <thumbnail studio link>` when you start it; without them those steps show greyed out. The cover link is only shown on this computer, because the thumbnail studio does not answer over Wi-Fi.

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

Upload from the phone (gif, png, jpg, webp; HEIC from an iPhone is converted to JPG with macOS `sips`, the original is kept in `popups/originals/`). Choose start, end, where (top left / top right / top, above the head / left / right / centre, or tap the video for an exact spot), size and tilt. Default: top right, 360 px wide, 3 s, clear of the face. Photos get a white border (switchable). `build_reel.py` makes an animated GIF into a looped transparent video (`ffmpeg`, VP9 with alpha) because the render draws the page frame by frame and a plain GIF would freeze on its first frame.

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
- Not built: dragging on a timeline, brand-new cards of other types, restoring cuts removed before this page, music, colour/look settings.
- HEIC conversion needs macOS (`sips`). EXIF-rotated phone JPGs are untested.
