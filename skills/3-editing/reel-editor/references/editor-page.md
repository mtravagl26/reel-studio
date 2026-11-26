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
| When captions appear (on the word, or 0.1 to 0.3 s early; 0.29.0) | `edit.json` `"caption_lead"`, or `brand.json` for every reel. `build_reel.py` shows every caption and highlighted word that much earlier; graphics keep their times. `/api/caption-lead` |
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

- **Where a picture goes by default.** A picture, GIF or SVG popup with no place set sits in the middle of the screen, even where it covers part of the face. Two of them on screen at the same time sit side by side (`"pos": "side-left"` and `"side-right"`, each at most 500 px wide). The page pairs them when the second one is added; the build pairs any two in `edit.json` that have no `pos`. A place that was chosen is never moved. Video clips follow the same rule (440 px wide by default).
- **In front or behind.** Every popup has "In front of my face" and "Behind my head" (`"layer": "behind"`). Behind needs the speaker cutout, so it is Mac only; without a clean cutout the build draws it in front and says so.
- **Handwritten label.** A popup's `caption` can be typed, changed or cleared on the page.
- **Lists.** A list card's title and rows can be edited (one row per line, up to 6), and "+ Add a list at this point in the video" adds a new one.
- **A render made outside the page.** When `final.mp4` is newer than the last render the page knows (Claude or the command line rendered it), the page makes a phone copy and shows it as the latest version. The player no longer stays empty.
- **Colors.** Settings has a color box: 3 colors (main, pop, light), saved for this reel (`edit.json` `"colors"`) or for every reel (`brand.json` `"colors"`). Every theme takes its colors from these 3, so this is how a look's colors change. The review page has the same box for this reel only; its choice comes back in the decisions and the import writes it to `edit.json`. A color change shows after the next render or preview build.
- **Caption colors (0.23.0).** Settings has a second box for captions: the color of the words, the color of a highlighted word, and a box behind the highlighted word that can be switched on and given a color. Saved for this reel (`edit.json` `"caption_highlight": {"words": "#FFFFFF", "text": "#141414", "bg": "#B9C8A5"}`, `"bg": "none"` for no box) or for every reel (the same key in `brand.json`). It is the person's pick, so `theme.py` lays it on after the theme, with or without a theme. The review page has the same box on its Captions tab for this reel only, and its player shows the change right away. On the touch-ups page it shows in the live preview. Both pages warn when the highlighted word and its box are too close to read. `edit.json` `"caption_colors": {"caption", "caption_accent"}` is an older hand-written form of the same thing: it is still read, and a save from the page replaces it. The Bold theme draws its own box behind the highlighted word; the box color can be changed, the switch does not remove it.

## Live preview (0.17.0)

The touch-ups page shows changes without a render. After each change the server runs `build_reel.py` into `<reel>/proj_live` (a few seconds; under 1 second once GIFs and clips are converted, they are kept in `<reel>/.asset-cache`) and the page lays that built page over its player, in step with it. The person sees the real graphic, fonts, colors, theme and motion right away. The player underneath keeps the time and the sound.

- It shows: every card and popup, captions, zooms, colors, the theme, the layer order where the speaker cutout exists.
- It does not show: sound effects (they are mixed in at the render), HyperFrames catalog motions (carousels, charts), and the final encode. Say so if they ask why a sound or a carousel is missing in the preview.
- It is off while a render runs and when the cuts changed since the last cut video (dropping a piece): one Re-render brings it back.
- A switch above the timeline turns it off; the player then shows the last render.
- `proj_live` and `.asset-cache` are working folders. Never deliver from them. A render still uses `proj`.
- Re-render is still the last step before delivery. The live preview is not the finished video.


## Sound effects are on by default (0.19.0)

Every graphic plays a short sound as it comes on unless the person switched sounds off. No theme changes this (Editorial used to). The switches: on the review page, "Sound effects on / off" for this reel (Sound & color tab); on the touch-ups page, under Sound effects, On / Off for this reel and "always on" / "always off" for every reel. They write `edit.json` `"sfx"` (`"subtle"` or `"none"`) and `brand.json` `"sfx"`. A brand file made from the old example has `"sfx": "none"`: if someone says their reels have no sounds, check that line and tell them about the "always on" button. Sounds placed by hand always play.

- **Sound effects under the voice (0.25.0).** `mix_audio.py` measures the voice in each reel and moves every effect by the difference from -16 LUFS, so a quietly recorded voice gets quieter effects. Effects dip 6 dB while the voice speaks and no effect peaks higher than the voice's own peaks minus 3 dB. `"mix": {"effects_follow_voice": false}` turns this off; `effects_duck`, `effects_under_peak` and `effects_ref` tune it. The build prints a note when the voice track is quieter than -22 LUFS. The Sound effects section has **How loud the sounds are** (quieter -6 dB, normal, louder +4 dB, stored as `mix.effects` in edit.json or brand.json) and **Update the sound on my finished reel**, which rebuilds the sound list and remixes from `master.mp4` onto the existing picture in about 20 seconds, saved as a new version. Use a full Re-render for anything that changes the picture.

- **Where captions sit (0.26.0).** Settings has **Where captions sit**: at the bottom, or above the head. Stored as `"layout": "captions-low" | "captions-high"` in edit.json (this reel) or brand.json (every reel). Above the head puts captions at y 290 (`captions.y_high` overrides), below Instagram's top bar, and moves text graphics with no height of their own (tags, lists, notes, quotes, chips, columns, screenshots) to the lower third. On the review page's Captions tab the same switch sits for this reel, plus **Move some captions**: tap the first and last caption, then Top, Middle, Bottom or Hide them. Each caption carries `"pos": "top" | "middle" | "bottom" | "hide"`. Whole captions move, never part of a line. When a graphic covers the captions, `build_reel.py` moves them for that stretch. Since 0.34.7 captions stay steady: they move to one other spot, the same one all reel (the one graphics cover least), and a stretch back home shorter than 1.5 s between two moves stays moved, so captions don't bounce. They hide only when that spot is covered too. The build prints `captions: steady at y 1250; moved to y 290 for 2 stretch(es), from 4.1 s, 9.8 s`. Read it: many stretches means cards sit in the caption spot, so move the cards. `"caption_moves": "free"` (edit.json or brand.json) brings back the old choice per caption. A card that says the same words still hides the captions (`"quiet"`). Both players have **Show what Instagram covers**: the top 14%, the bottom 20% and the like buttons, shaded.

- **How captions highlight (0.34.8).** The review page's Captions tab starts with three choices: **Only words I mark** (`"phrase"`, the words tapped below get the highlight), **Each word as I say it** (`"spoken"`, every word lights up while it's said) and **One word at a time** (`"word"`). The player under it shows the choice right away. The import writes `"caption_mode"` into edit.json, splits captions into single words for `"word"`, and groups single words back into short phrases when the brand was one word at a time. `brand.json` `captions.mode` sets it for every reel.
- **Line up a title hook (0.34.9).** A title card's Edit panel on Touch-ups has **Line up**: Left, Centred or Right, saved as `"align"` on the card. It starts on the card's own `align`, else the theme's (`cards.title.align` in theme.json). The hook looks H2, H3, H6, H14 and L22 sit top-left by design; one tap centres them. When the person asks for a centred hook, set `"align": "center"` on the card.
- **Caption box and size (0.27.0).** The Caption colors box is now **Caption colors and size**: a box behind all the words (on or off, and its color) and a caption size from 60 to 160. Stored in the same `caption_highlight` as `"box": "#FFFFFF" | "none"` and `"size": 120`, for this reel or every reel, laid on after the theme. Turning the box on with white words makes the words your main color. The warning covers every word and box pair. `edit.json` `"caption_style": {"bg", "size", "y"}` is an older hand-written form for one reel: still read (`y` from 100 to 1800 too), and a save from the page replaces it.

- **One Edit page (0.28.0).** The reel link opens `/edit` (`review/edit.html`): **The cut** (the review page) and **Touch-ups** as 2 tabs, opening on Touch-ups once the reel is built. Inside it the pages hide their own step bar (`?embed=1`). The step bar on every page is now 1 Edit, 2 Cover, 3 Caption. `/review` and `/touchups` still open on their own.
- **Quick wins from the UX audit (0.38.2).**
  - **Delete without a dialog.** Delete and delete-sound go straight through; the message under the page carries an **Undo** button for 6 s. No page uses confirm, alert or prompt (some browsers, the one inside the Claude app among them, block them without a word).
  - **Saved at.** Both pages show `Saved 2:48 PM` beside Undo after every change.
  - **Bigger targets.** Timeline marks keep their drawn size and get a 44 px tall tap area; the rows sit 44 px apart so areas don't overlap. Caption time buttons are 44 px tall, and the 20 px info dots have a 44 px tap area.
  - **Render banner.** Elapsed time, `step 2 of 4: building the video`, and "Keep your Mac awake". On a Mac the server runs `caffeinate -i` while a render runs. A render refuses to start under 2 GB free and warns under 5 GB.
  - **2 Cover opens by itself.** The step links to `/cover`, which starts the thumbnail studio (ports 4848 to 4852) and sends the browser there. On a phone it says to open it on the Mac. You no longer need to start the studio for the person.
  - **Greyed steps explain themselves.** Tapping one opens a card with the words to send Claude and a Copy button (`review/steps.js`).
- **Redo, and Undo that survives a reload (0.38.3).** The review page has **Redo** beside Undo (Cmd+Shift+Z or Cmd+Y; Undo is Cmd+Z), 60 steps each way. Both are kept in the browser with the decisions they belong to, so a reload keeps them. When the saved decisions changed elsewhere (Claude, another tab), the history is dropped instead of jumping to a state that no longer follows. Touch-ups keeps its own Undo on disk, one change per tap.
- **Timeline zoom and snapping (0.38.4).** Above the Touch-ups timeline: **Whole reel**, **10 s** (the start) and **3 s** across the box. Two fingers pinch on a phone; a trackpad pinch works on a Mac. Ruler ticks space themselves to the zoom. A graphic dragged in time snaps to a word start, a caption, another graphic's edge, a cut or the playhead when it comes within 10 px; the mark gets an orange outline and the clock says "snapped". The server still draws the film strip at 56 px a second; the page stretches it.
- **Format check on drop (0.38.5).** The home page's clip check (`scripts/framing_check.py`) has a **Format** line before the edit starts. No sound track says retake (captions and cuts need the voice). HDR says it's converted to standard color at the cut (on a Mac). A frame rate that changes during the clip says the cut evens it to 30 frames a second. An unusual codec says the cut converts it, and a turned phone says the picture is shown upright. A normal clip passes with its codec named.
- **Try another look (0.38.6).** A words, list or number graphic's Edit panel on Touch-ups has **Show me 3 other looks**. `review/try-again.mjs` picks 3 built looks of the same family (words: title, pill, quote, note, arched title, chips; list: list card, x-list; number: stat), mixing the kinds so they differ. It carries the graphic's own words into each and drops each look's sample words (an overline like "my news this week" is never shown). `scripts/storyboard.py` makes stills of all 3 at that moment, in one picture under `~/reels/.try-again/`. **Use A/B/C** swaps the graphic, keeping its id, times, layer and on/off. Undo takes it back, and **3 more** shows the next 3. Nothing goes to Claude. A caption line has no Try again: its words are what was said, so it gets edit, merge and ±0.1 instead.
- **Format check on drop (0.37.2).** The home page's clip check (`scripts/framing_check.py`) has a **Format** line before the edit starts. No sound track says retake (captions and cuts need the voice). HDR says it's converted to standard color at the cut (on a Mac). A frame rate that changes during the clip says the cut evens it to 30 frames a second. An unusual codec says the cut converts it, and a turned phone says the picture is shown upright. A normal clip passes with its codec named.
- **Timeline zoom and snapping (0.37.1).** Above the Touch-ups timeline: **Whole reel**, **10 s** (the start) and **3 s** across the box. Two fingers pinch on a phone; a trackpad pinch works on a Mac. Ruler ticks space themselves to the zoom. A graphic dragged in time snaps to a word start, a caption, another graphic's edge, a cut or the playhead when it comes within 10 px; the mark gets an orange outline and the clock says "snapped". The server still draws the film strip at 56 px a second; the page stretches it.
- **Redo, and Undo that survives a reload (0.37.0).** The review page has **Redo** beside Undo (Cmd+Shift+Z or Cmd+Y; Undo is Cmd+Z), 60 steps each way. Both are kept in the browser with the decisions they belong to, so a reload keeps them. When the saved decisions changed elsewhere (Claude, another tab), the history is dropped instead of jumping to a state that no longer follows. Touch-ups keeps its own Undo on disk, one change per tap.
- **Storyboard (0.36.0).** A third tab on the Edit page, between The cut and Touch-ups: `/storyboard` (`review/storyboard.html`, server side in `review/storyboard.mjs`). After a render, the Edit page opens on it until the notes are sent, then on Touch-ups. `scripts/scenes.py` splits the newest render into scenes and writes `editor/storyboard/vNNN/` with `scenes.json`, `scene-01.jpg` and so on, and `sheet.jpg`. The server runs it after each render and when the tab finds the newest render without one. Notes per scene save to `notes.json` in the same folder (`note`, `ok`, and the scene's times, words and graphics); **Send my notes to Claude** sets `"done": true`. A new note sets it back to false. `/api/stage` reports `storyboardDone`.
- **Add a look (0.28.0).** Touch-ups has **Add a look at this point in the video**: a built hook or layout look from the Style Menu (not ones that need photos) goes in at the playhead from its recipe, with sample words, and is marked `"look": "L8"`. Number cards, check lists, pages and tiles now have their words editable here too.
- **Dragging (0.28.0).** Drag a graphic on the timeline to move when it shows (its length stays; 0.1 s steps). Open a graphic and drag it on the video: text moves up or down (`y`), a popup moves anywhere (`pos: "custom"`, `x`, `y`).
- **Words on the review page (0.28.0).** Each graphic on the review page has its words (title, rows, number, label) as fields. Changes go in `board[id].set` and the import writes them into the card; no note to Claude needed.
- **Background music (0.28.0).** See `references/music.md`.
