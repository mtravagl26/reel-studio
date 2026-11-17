---
name: reel-editor
description: "Use when someone drops a raw talking-head video (phone clip, selfie video, webcam recording) and wants it edited into a short-form reel, TikTok or YouTube Short in their own brand style - 'edit this', 'make this a reel', 'cut this down', 'add captions and graphics', 'send it to CapCut'. Delivers the full-quality MP4, a phone-size copy and a Reel cover. Also use when they hand over one long recording and want short reels from it ('find my best clips', 'cut this into reels'), the first time someone installs this skill or says 'set up my brand', and when they want a cover or thumbnail for a reel ('open my thumbnail studio', 'make a cover')."
---

# Reel editor

Turns a raw talking-head clip into a finished, on-brand vertical reel. Every brand choice (colours, fonts, caption style, sounds, CTA) comes from the person's **brand file**, never from defaults baked into this skill. You do the editing; they only make the calls that are theirs.

> Based on [claude-reel-editor](https://github.com/nicolapocock/claude-reel-editor) by Nicola Pocock (MIT, see `LICENSE`). Modified by By Mel Ross: gentle eased zooms by default, a Reel cover and a phone-size copy with every delivery, delivery back to the footage folder, a local review page when Artifacts aren't available, a render option without `nice`, telemetry off, a studio-look step, graphics that can sit behind the speaker, a 40-effect sound library, and a three-level mix with music that dips under the voice. 0.5.0: a Style Menu (looks called by ID), a storyboard of stills before building, a permanent word list for names, and a true audio crossfade at cuts.

**Local only.** Everything runs on this computer. Never upload, publish or schedule a reel, and never post on their behalf; delivery means files in a folder. The scripts set `HYPERFRAMES_NO_TELEMETRY=1` and `DO_NOT_TRACK=1` unless the person has turned telemetry on themselves.

## Before anything else: is there a brand file?

The workspace is `~/reels/` unless `REELS_HOME` is set.

- **No `~/reels/brand.md`** → run the setup interview in `references/setup-interview.md` first. Do not edit a clip without a brand file, even if they say "just use whatever". The interview takes 5 minutes and it is the whole point of this skill.
- **Brand file exists** → read `brand.md` and `brand.json` in full, then continue.
- **They want to start from an example** → copy `brand/brand.example.json` + `brand/brand.example.md` from this repo to `~/reels/brand.json` + `brand.md`, then walk through the interview to make it theirs (name, colours, fonts, CTA).

## Check the tools (once per machine)

`bash scripts/doctor.sh` - checks ffmpeg, Node, the HyperFrames skills and (if the brand file says CapCut) the CapCut connector. Fix anything it flags before editing. Install steps are in the repo README.

## Starting from a long recording

If the footage is one long recording (a talk, an interview, a long ramble) and they want short reels from it, find the clips first: `references/find-clips.md`. It ranks 30-60 s moments from the transcript, you read them and propose 3-5, **they choose**, and `scripts/find_clips.py extract` sets up one reel folder per chosen clip with the span to keep. Then carry on with the edit below from step 2 (the transcript is already in the folder).

## The edit, in order

Each reel gets its own folder: `~/reels/<yyyy-mm-dd>-<short-name>/`. Copy the raw clip in as `raw.<ext>` (e.g. `raw.mov`), never edit the original (the thumbnail studio only finds footage named `raw.*`; iPhone HDR clips are converted to standard colour automatically at the cut, see `references/look-and-layers.md`, and the build tells you if that was not possible), and write the folder the clip came from into `source_dir.txt` in the reel folder (one line, absolute path): with `"deliver_dir": "footage"` the finished files go back there.

1. **Transcribe** - `python3 scripts/transcribe.py <clip> transcript.json`. Uses ElevenLabs Scribe when `ELEVENLABS_API_KEY` is in `~/.config/reels/.env` (tight word timing; captions land on the word), else local Whisper (free, timing can drift ~0.3 s).
2. **Clean the voice** - `bash scripts/clean_audio.sh <clip> voice.wav` (noise removal is on by default; add `--no-denoise` to skip it). A gentle chain: DeepFilterNet at 20 dB, no gate, no presence or air boost, light EQ, de-esser, a 11 kHz roll-off and 2:1 compression, then loudness to -16 LUFS with a true peak under -2 dBTP. Quiet phone recordings sounded distorted when a big gain went through a gate and boosts, so the default stays soft; `LUFS=-14 TRUEPEAK=-1.5` in the environment brings the old level back for a loud, music-led reel (details in `references/sound-and-mix.md`).
3. **Review (their call)** - propose: lines to cut (repeats, false starts, rambles), fillers to drop, CTA moved to the end, target under 60 s, and the graphics plan. **Wait for their yes before cutting.** This is the step people care most about.
   **Look at the start and end before proposing cuts:** grab a frame every 0.5 s for the first and last 4 s. Cut any camera setup (pointing at the floor/garden, flipping the camera, reaching for the phone) even if words are spoken over it. Start on the first frame where they're settled in shot, and on a word that works as an opener.
   - **Main path: the Reel Review page.** First check that the `Artifact` and `ArtifactData` tools exist in this session (load them through tool search if they're deferred). If they do, follow `references/review.md`: they tap words to cut, watch the live rough cut, check graphics, captions, sound and colour, then say "build preview". Its import step writes `edl.json` + `edit.json`, so skip to step 4's cut and step 5.4's render.
   - **No Artifact tools: the same page, served locally.** Follow `references/review-local.md` (a small local server, nothing uploaded; they can open it on their phone over the same Wi-Fi). It is one link for the whole reel: review first, and the same link opens touch-ups after the build.
   - **Fallback: review in chat** only if the local page can't run or they prefer chat. Show the transcript as numbered lines (format in `references/rough-cut.md`), then the card list in step 5.
4. **Tighten, then cut + speed** - write `edl.json` from the approved lines, then `python3 scripts/tighten.py <folder>`: it removes fillers and shortens pauses inside the kept lines, as hard as the brand's `"pacing"` says (`natural` default, `tight`, `fast`; presets in `scripts/pacing.py`). They never approve these one by one. Then `REEL_PREVIEW=1 python3 scripts/cut.py <folder>` (cuts at 1080p; a 4K brand's `--final` render re-cuts at 4K later). Speed comes from the same preset unless `brand.json` sets `"speed"`. Listen-check: re-transcribe `master.mp4` and confirm no clipped words at the joins. **Studio look:** `cut.py` also applies the gentle studio look (on by default; `brand.json` `"enhance"`) and a slight background blur behind the speaker, and writes `enhance_before_after.jpg`. Look at it with them before the review step; adjust or switch off parts per `references/look-and-layers.md`.
5. **Graphics + captions: fill the template, don't design.** You are the editor here, not the designer - the look is already built from the brand file.
   1. `python3 scripts/transcribe.py master.mp4 master_transcript.json`
   2. `python3 scripts/auto_edit.py <folder>` → drafts `edit.json` (captions in their caption mode, zoom points in `punch`). Zooms follow `brand.json` `"zoom"`; the default is a slow 1.04x push over 2.5 s that eases in and out, then eases back out at the next point, never a hard punch. Space them about every 6-7 s and start them on a sentence, not mid-word.
   3. Edit `edit.json` yourself, in one pass: set `"accent": true` on the one key word per sentence, and add cards at the density `brand.json` `"graphics"` asks for: `minimal` about one every 8-12 s, `balanced` (default) every 4-6 s, `busy` every 2-4 s. A line with nothing to show gets no card; don't chart every number or screenshot every tool just to fill the gap. Card types and fields are in the header of `scripts/build_reel.py`; any card can sit **behind** the speaker, in front, or both (`"layer"`, see `references/look-and-layers.md`), and an `orbit` card sends 1-6 photos round their head, behind it and in front (same file). The overall look is a **theme** (`editorial`, `bold`, `handwritten`, `whimsical`): `"theme"` in `brand.json` or `edit.json`, see `references/themes.md`, and extra sounds go in with `"sfx_events"` (40 effects, `references/sound-and-mix.md`); HyperFrames catalog motions (carousels, charts, counters, notifications, cursor, follow cards) are in `references/motions.md`. Every card must show what that exact line says.
      - **Hook title:** max ~10 characters per line, 2-3 lines (`"still / uploading / screenshots?"`), so it renders big. It's the only text with an outline.
      - **Carousel:** if `brand.json` has `"require_carousel": true`, every reel gets one (`motion` card, a `carousel-*` name, `images` from screenshots/their assets). If no line suits one, ask them; if they say no, set `"no_carousel_ok": true`.
      - **Screenshots:** for a tool or site they name that the line is about, run `bash scripts/screenshot.sh <url> shots/<name>.png`. Exit code 2 means the site blocked it: try the tool's marketing page, or ask them for a screenshot. Never use a blank one.
      - Mix the kinds: website shots, a colour block, a list card (`"glass": true` for liquid glass), a sticker from their assets, a `follow` card for the big moment, a counter or chart when they say a number.
   4. `REEL_PREVIEW=1 bash scripts/render.sh <folder>` → draft `final.mp4` + stage timings (1080x1920, low priority). At 1080p (the default) the approved draft is the final: render again only if `edit.json` changed, or with `--capcut` on the CapCut route. If `brand.json` asks for 4K, run `bash scripts/render.sh <folder> --final` after they approve (it re-cuts the master at 4K first; `--final --capcut` on the CapCut route). render.sh ends with `scripts/mix_audio.py`: voice, music bed (dips while they speak, rises in the gaps) and effects at three levels, normalised to -16 LUFS with a true peak under -2 dBTP (the same level as the voice chain; `brand.json` `"mix"` can ask for -14 / -1.5 instead) (`references/sound-and-mix.md`). If a layered card's cutout edges failed the check, the build said which shot was drawn as a plain overlay instead: tell them. If a render started in the background fails with `uv_os_setpriority EACCES`, use `scripts/render-nonice.sh` instead (same render, without `nice`; set `REEL_NO_NICE=1` for `cut.py` too).
   Do **not** hand-write composition HTML or use other HyperFrames workflows here: they are slower and ignore the brand template. Only if they explicitly ask for an effect the template lacks (e.g. text behind their head), say it's slower, then use the `hyperframes` skill for that one effect.
6. **QA** - write the approved script (the kept lines) to `<folder>/expected.txt` so the missing-words check runs, then `python3 scripts/qa.py <folder>` (on a 4K brand: `REEL_PREVIEW=1` for the draft, plain again after `--final`) (loudness, size, length, missing words). Then grab a frame at every card and look: text inside the frame, readable over the background, on brand. Fix `edit.json` and re-run render.sh until it passes.
7. **Cover (every reel, no exceptions)** - `python3 scripts/cover.py <folder> candidates` makes a sheet of stills from the first and last 4 s. Look at it and pick one where they're smiling, eyes open, not mid-word. Then `python3 scripts/cover.py <folder> --at <seconds> --title "short / topic title"` → `cover.jpg`, 1080x1920, a 2-3 line title of a few words in the brand's head font, inside the area the profile grid shows. Look at the cover before delivering.
8. **Deliver** - `bash scripts/deliver.sh <final.mp4> "<clear name>"` → three files in their delivery folder: `<name>.mp4` (full quality), `<name> (phone).mp4` (small copy for a phone) and `<name> cover.jpg`. `"deliver_dir": "footage"` sends them back to the folder the clip came from; `--to <folder>` overrides. Tell them where the files are; they post it themselves.
9. **CapCut (only if `brand.json` has `"capcut": true`)** - build the editable CapCut draft and give them the link. `references/capcut.md`.

Tell them what changed, and what to check by ear (cuts, names, brand words spelled right).

## Cover / thumbnail

The review page's **Cover** tab links to the thumbnail studio, a local page for picking the cover frame, adding a headline in their brand fonts and downloading 1080x1920, 1080x1440 and 1080x1080 PNGs. Start it with `python3 scripts/thumbnail_studio.py <reel>` in the background, check it answers, then send the link. When they say "open my thumbnail studio", start it the same way (safe if it's already running). Details: "Thumbnail studio" in `references/review.md`. No review page? Start it with `--open` and send the link in chat.

## Editing a finished reel by tapping (the editor page)

When the person wants to change a reel that is already built (fix a caption word, drop a piece of the cut, switch pills or sounds on and off, drop in a GIF, graphic or photo as a popup, put text in front of or behind themselves), start the editor page instead of rewriting `edit.json` by hand (if the review link from `references/review-local.md` is still running, it is the same server: send that link again): `node <skill>/review/studio-server.mjs <reel folder> --lan --port 4792` (with `REELS_HOME` set, as for the other scripts), check it answers, send them the `same Wi-Fi` link it prints, stop it when they are done. They tap; every change is saved to `edit.json`, `edl.json` or `brand.json` (with a timestamped backup and an Undo); **Re-render** runs the usual cut/render/QA as a background job and keeps the earlier renders (`renders/vNNN*.mp4`). It never delivers: delivery to the footage folder stays a separate step. Details, limits and how dropping a cut piece retimes everything: `references/editor-page.md`.

Text defaults to the area above the speaker's head, in front of them (`brand.json` `"text_default": {"layer": "front", "position": "above"}`); any single piece of text can be set to **behind me** (it needs headroom, and falls back to in front, with a note, when the cutout fails).

## Word list (permanent vocabulary)

`~/reels/brand.json` can carry a `"vocabulary"` block: `terms` (correct spellings of names and brand words), `prompt` (fed to Whisper as spelling hints) and `corrections` (what Whisper mishears -> the correct word, lowercase keys, one or more words, e.g. `"akme": "Acme"`, `"acme corp": "Acme Corp"`). `scripts/auto_edit.py` applies `corrections` to every caption it drafts; pass `vocabulary.prompt` as `--prompt` to `whisper-cli` when you transcribe yourself. Add a name the moment the person corrects one, and check every caption for mishears of names and brand terms before rendering. The example is in `brand/brand.example.json`.

## Cuts

Cut only at the end of a sentence or in the quietest part of a natural pause, on a frame boundary (1/30 s), with at least 60 ms of quiet after the out-point and 80 ms before the next word. `edl.json` may carry `"xfade": 0.035`: `scripts/cut.py` then crossfades the audio at each join (each piece carries 35 ms of the quiet after its cut, and the picture cuts at the same instant, so reel time stays frame-exact). Without `"xfade"` the older short dip-fade at each join is used. Never keep a piece shorter than about 1 s. A short list of every join (source in/out, reel time, the words on both sides of it, decoded from the cut master) helps the person check the cuts.

## Call a look by ID (Style Menu)

The person can pick looks by ID: H1-H5 hooks, C1-C5 captions, L1-L9 layouts ("H3, C2, L8"). Read `references/style-menu.md`: it says, per ID, which `edit.json` / `brand.json` setting or card type produces it (`assets/style-menu.json` has the same table for scripts) and which are only *partial* or *not built*. Built: H3, C1, C2, C3, L2 (`polaroids`), L4 (`tiles`), L6 (`xlist`), L7, L8 (`stat`), L9 (`popup` + `caption`); partial: H2, C5; not built: H1, H4, C4, L1, L3, L5; H5 is a cut choice. Say plainly when an ID is not built; never fake it. The eye rules apply to all of them: graphics go in the top corners or the lower third, never on the eyes, and captions step aside under lower-third cards.

## Storyboard first (before building new looks)

When the person wants to compare looks, or you are about to use a look they have not seen on this footage, show **stills, not videos**: `python3 scripts/storyboard.py <reel-folder> --out <NEW folder> --option "A=H3,C2,L8" --option "B=C1,L4,L6" [--option "C=..."] [--at 8,26,42,60] [--content content.json] [--photos a.jpg,b.jpg]`. It makes a throw-away copy of the reel per option (the real master, captions and brand; the reel folder is never written to, and `--out` must be a new folder), takes stills at 3-4 moments with `hyperframes snapshot` and tiles them into one `storyboard.jpg` labelled "Option A: H3 + C2 + L8". About 25 s for 4 options, no video render. Write `--content` from what the person actually says at those moments, otherwise the cards carry stand-in words (see `references/style-menu.md`). Look at the image before you send it, and send it with the question "which one?". The script clears `GEMINI_API_KEY` for the snapshot so no frame goes to an outside service.

## Their brand rules win

If the brand file and your taste disagree, the brand file wins. If they correct something during an edit ("no, never outline captions"), add it to `brand.md` under "Rules" straight away so the next edit gets it right.

## Common mistakes

| Mistake | Instead |
|---|---|
| Editing before a brand file exists | Run the setup interview |
| Cutting on Whisper word times blindly | Check the joins; nudge cuts into the quiet gap between words |
| Graphics that decorate instead of illustrate | Each card shows what this exact line says |
| Captions in a font the brand file bans | Re-read brand.md "Rules" before step 5 |
| Saying CapCut works everywhere | It doesn't (see capcut.md). The MP4 route always works |
| Fixing QA failures by lowering the bar | Fix the edit, re-run QA |
| Delivering without a cover, or with an eyes-closed / mid-word still | Make the cover from the candidates sheet and look at it |
| Fast snap zooms on a calm brand | Leave `"zoom"` at the gentle default unless the brand file asks for punch-ins |
| Uploading, posting or scheduling | Never: delivery is files in a folder |
| Layered graphics that never overlap the speaker | Behind-the-speaker cards must overlap them to read as depth; otherwise leave them in front |
| Silent fallback when a cutout fails | Tell them which shot was drawn as a plain overlay, and why |
| Piling on sound effects | Effects sit 10-15 dB under the voice and should be rare; one per beat at most |
| Music at one fixed level under the voice | Set `"music"` in `brand.json`; `mix_audio.py` ducks it by the voice |
