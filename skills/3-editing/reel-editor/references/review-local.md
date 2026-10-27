# Reel Review page, served locally

Added by By Mel Ross. Same page as `review.md`, but without claude.ai Artifacts: `review/serve.mjs` serves `review/reel-review.html` and answers its `window.claude.use("db")` calls from JSON files in the reel folder. Use this route whenever the `Artifact`/`ArtifactData` tools aren't in the session. Nothing is uploaded anywhere.

| Artifact route (review.md) | Local route |
|---|---|
| `ArtifactData set reel/current` | write `<reel>/review_db/reel/current.json` |
| `ArtifactData get review/current` | read `<reel>/review_db/review/current.json` (the page writes it as they tap; missing = "use the proposal") |
| `ArtifactData set builds/latest` | write `<reel>/review_db/builds/latest.json` |
| uploaded asset URLs | files in the reel folder, referenced as `/files/<name>` (e.g. `"srcUrl": "/files/proxy.mp4"`, `"thumbUrl": "/files/thumb_g1.jpg"`) |
| publish the page | nothing to publish |

## Per reel

1. Do review.md "One time per reel" steps 1-3, writing the assets straight into the reel folder (proxy as `proxy.mp4`). Skip steps 4-5 (publish/upload).
2. Write `review_db/reel/current.json` = `review_reel.json` plus `srcUrl`, per-graphic `thumbUrl`/`imgUrl`, `assets`, `fonts`, all as `/files/...` URLs. Move an old `review_db/review/current.json` / `builds/latest.json` aside (ask first if it holds notes).
3. Start the server in the background and keep it running until they're done:
   `node <this skill>/review/serve.mjs <reel> --lan` (default port 4790; `--port N` for another; without `--lan` it only answers on this computer).
   It prints the links. With `--lan` each link carries a one-off key (`?k=...`): send them the full link so they can review on their phone over the same Wi-Fi; a link without the key gets "missing or wrong key".
4. When they say "build preview": `python3 scripts/review_sync.py import <reel> <reel>/review_db/review/current.json`, then review.md "When they say build preview" steps 3-4. For step 5 put the 540p proxy in the reel folder and write `review_db/builds/latest.json` = `{"url": "/files/preview_540.mp4", "hash", "at", "cutDur"}`; the open page picks it up within 2 s.
5. Stop the server when the reel is delivered.
