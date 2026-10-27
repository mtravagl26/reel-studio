# Reel Review page

> Modified by By Mel Ross (see the repo NOTICE).

A private page on the person's claude.ai account where they approve the edit before anything renders: cuts, graphics, captions, sound and colour, then a draft preview with timestamped notes. It needs Claude Code with Artifacts (the `Artifact` and `ArtifactData` tools) and the `db` + `assets` capabilities. If those aren't available, review in chat instead (rough-cut lines, then a card list) and skip this file.

## One time per reel

1. After transcribing and cleaning audio, run `python3 scripts/tighten.py <reel> --detect` so the "um"s are found (it writes `fillers.json`; without it the page shows no grey "um"s and none get cut). If it installs local Whisper first, that's normal. If it prints `FILLERS NOT DETECTED` (exit code 3), tell them the "um"s won't be cut automatically and that they can tap them out on the page. Then write `proposal.json` in the reel folder (format in the header of `scripts/review_sync.py`): the kept lines, accent words, and every graphic anchored to a spoken word with its `place` box and sound.
2. `python3 scripts/review_sync.py export <reel> proposal.json <out>` → `<out>/reel.json` (also saved as `<reel>/review_reel.json`).
3. Make the assets (keep them light, `nice -n 15`):
   - a 540x960 source proxy of `raw.mov` with the **cleaned** `voice.wav` as its audio (h264, ~900 kbps). The raw phone audio is ~20 dB quieter, so a proxy with it makes the voice sound broken
   - per graphic: `thumb_<id>.jpg` (180x320 frame at its anchor word) and `img_<id>.jpg` (its screenshot/image, 480 wide)
   - `audio_original.mp4` / `audio_cleaned.mp4` (same 10 s), `colour_before.jpg` / `colour_after.jpg` (same frame, grade applied), `sfx_<name>.mp4` for each sound
   - the brand's caption fonts (.otf/.ttf/.woff2) **only if the person owns them and the page stays private**
   Asset uploads accept mp4 (audio too), jpg/png, fonts; not m4a or wav.
4. First time only: publish `review/reel-review.html` with `files: {"core.js": "review/core.js"}`, `capabilities: {"db": {"rules": [{"path": "reel", "write": "admin"}, {"path": "builds", "write": "admin"}]}, "assets": {}}` (only editors can change the reel data and the preview; anyone you share it with at Contributor level can still record review decisions), `icon: "video"`. Later reels reuse the same page URL.
5. Upload the assets to the page (`asset: true`, up to 25 per call), then write `reel/current` = `reel.json` plus `srcUrl`, per-graphic `thumbUrl`/`imgUrl`, `assets` {audioOriginal, audioCleaned, colourBefore, colourAfter, sfx{name:url}}, `fonts` {body, accent}. Delete `review/current` and `builds/latest` from the previous reel (ask first if they hold notes).
6. Send the link. Tell them: tap words to cut, tap ⏸ / grey "um"s to keep them, Play rough cut to watch the live cut, then Build preview.

## When they say "build preview"

1. `ArtifactData get review/current` (save to a file). Missing is fine: it means "use the proposal".
2. `python3 scripts/review_sync.py import <reel> <review.json>` → `edl.json` + `edit.json`. Act on every `CHANGE REQUESTED`, `NOTE` and `REVISION` line it prints before rendering; `BRAND CHANGE REQUESTED` only touches brand.json after they confirm.
3. `REEL_PREVIEW=1 python3 scripts/cut.py <reel>` then `REEL_PREVIEW=1 bash scripts/render.sh <reel>` (1080p, 2 workers, low priority).
4. Grab frames at every graphic and the longest caption words; fix anything out of frame before sending.
5. 540p proxy of `final.mp4` → upload → `ArtifactData set builds/latest` {url, hash (from edit.json), at, cutDur}. The page compares that hash with the live decisions and marks the preview outdated when they change.

## Final

After they approve the draft: `bash scripts/render.sh <reel> --final` (the brand resolution; it re-cuts the 1080p preview master first), QA, cover, deliver, and on the CapCut route `--capcut` plus `capcut_draft.py`.
