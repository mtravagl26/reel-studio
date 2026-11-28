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
   `node <this skill>/review/studio-server.mjs <reel> --lan` (default port 4792; `--port N` for another; without `--lan` it only answers on this computer). This is Unmess Reels on one link: it opens on the review page, and once the reel is built the same link opens the touch-ups page (`references/editor-page.md`), with a step bar to move between them. Add `--cover-url <thumbnail studio link>` to light up the Cover step. `review/serve.mjs <reel> --lan` (port 4790) still serves the review page on its own.
   It prints the links. With `--lan` each link carries a one-off key (`?k=...`): send them the full link so they can review on their phone over the same Wi-Fi; a link without the key gets "missing or wrong key".
4. When they say "build preview": `python3 scripts/review_sync.py import <reel> <reel>/review_db/review/current.json`, then review.md "When they say build preview" steps 3-4. For step 5 put the 540p proxy in the reel folder and write `review_db/builds/latest.json` = `{"url": "/files/preview_540.mp4", "hash", "at", "cutDur"}`; the open page picks it up within 2 s.
5. Stop the server when the reel is delivered.

## Asking for more graphics (0.10.1)

The Graphics tab has two ways to ask for more than the plan shows. Neither one draws anything on the page: they are requests, and the import prints them for you to act on **before the render**.

- **How many graphics?** (A few / Some / Lots). Starts at the brand's `"graphics"` setting. The import prints `GRAPHICS AMOUNT: ...`. Add or drop cards in `edit.json` to match for this reel, export the review again, and tell them the plan changed.
- **Add a graphic.** They pick the line, the kind (headline, list, number, photo, GIF, an animation, photos circling their head, or "you choose") and say what it should show. The import prints one `GRAPHIC WANTED: <card type> at the line "..."` per request. Build each as a card in `edit.json` at that line. If it needs pictures or numbers you don't have, ask before the render; never fill one with a placeholder.

The looks page (`/styles`) also lists animations and moving extras (`assets/style-extras.json`). Picks land in `style-picks.json` under `"extras"`.

**Since 0.43.0 the link opens the new Edit page (`/studio`)**, not the Reel Review page. It saves to the same `review_db/review/current.json`, so every step in this file works the same. The Reel Review page is still served at `/review`.

**These pages only exist at the Unmess Reels link** (`http://localhost:<port>/...` from `studio-server.mjs`). Never hand the person an HTML file to open from disk: a file has no looks page, no saving and no touch-ups.

## Moving a graphic on the review page (0.16.0)

Each planned graphic, and each graphic they asked for, has 2 menus on the Graphics tab: where on screen (middle, top, top left, top right, left or right of the face, lower) and in front of the face or behind the head. The import applies what it can: the layer goes on any card, and the place goes straight onto a popup. For other card types it prints `PLACE IT (set this card's position in edit.json before the render): <id> (<type>) @ cut <time>: <where>`. Set that card's position fields (`y`, `x`, `box`, see the card list in `scripts/build_reel.py`) before the render. `GRAPHIC WANTED:` lines carry the place and layer in words.

A caption word fixed on the touch-ups page stays on that word through a re-import. If the word at that moment is a different word now, the import leaves it alone and prints `TOUCH-UP NOT KEPT (tell them): the caption fix ...`. Read that caption against what was said before you render.

**After you add a graphic they asked for (0.16.0).** Add the card to `proposal.json` as well as `edit.json`, run `review_sync.py export` again, then `python3 scripts/review_sync.py wanted-done <reel> <id>` (or `all`). The page loads the new plan by itself, the graphic shows in the list with the others, and the next import does not ask for it again. Without this the Graphics tab keeps showing the old plan.

## The page builds the preview itself (0.18.0)

At the local link, **Build preview** starts the build from the page: the server runs `review_sync.py import` on their saved choices, then the same cut, render and checks as Re-render on the touch-ups page, and writes `review_db/builds/latest.json`. The page shows the step it is on and plays the preview when it is done. Nobody has to come back to chat for a plain build.

What this changes for you:

- **Requests only you can act on.** A graphic set to Change, a graphic they asked for, a new "How many graphics?", a moved graphic that is not a popup, typed notes, and notes on the draft are not applied by the page's build. The page says so before it starts and lists them again under the preview. When they then say "build preview" in chat, do the full flow from `references/review.md` ("When they say build preview"): import, act on every line, render, look at the frames.
- **You did not look at this preview.** The page's build runs the automatic checks (`qa.py`) only. Before delivery, look at the frames yourself as usual.
- **If the page says the build stopped**, read `<reel>/editor/render.log`, fix the cause, and tell them to press Build preview again.
- On the claude.ai review page (no local server) the button still saves a request and they tell you "build preview".
