# GIPHY search on the touch-ups page

Added by By Mel Ross (0.9.0).

The Popups section of the touch-ups page can search GIPHY and drop a GIF or sticker into the reel. It is **off unless the person turns it on**: they read a warning, tick "I have read the warning and want GIPHY search on", and add their own GIPHY key. Nothing about it runs unless they press Search.

## The warning (license review, 2026-11-17)

Before the key box, both pages show this, and the key is not saved unless the box under it is ticked:

> Before you turn GIPHY on: GIPHY's rules say apps should not store copies of GIPHY content. To build your video, Unmess Reels has to keep a copy of each GIF you pick in your reel folder, so a reel you post with one may go against GIPHY's rules. Many GIFs are also clips from films, TV or sport that you may not have the right to use in a reel for your business. GIPHY is off unless you turn it on, and you use it at your own risk.

Once it is on, a short version stays beside the results with the "Powered By GIPHY" mark. Ticking the box writes `GIPHY_OPT_IN=1` next to the key. A key saved before this change is ignored until they tick the box once (the page shows the key box again). Open question: GIPHY's API Terms page could not be fetched (HTTP 403) when this was written, so the storage and posting points come from GIPHY's developer docs, not the terms themselves.

## Setting it up (0.15.0: the page does it)

1. They open **Search GIPHY** on the review page (Graphics tab) or the touch-ups page (Popups). With no key yet, the page shows a box and a link to developers.giphy.com.
2. They make a free account there and create a key. When GIPHY asks, they choose **API**, not SDK. A new key is a beta key: free, and limited to 100 searches an hour.
3. They read the warning, tick the box, paste the key and press **Save key**. The page tries the key on one search, saves it, and says "GIPHY is connected." Search works right away. No restart.

The page writes the key to `~/.config/reels/.env` as `GIPHY_API_KEY=...`, keeps any other line in that file (the optional ElevenLabs key), and sets the file so only the person can read it. Never ask them to open that file, use Terminal, or paste a key into chat. If they ask you to "set up GIPHY", give them the Unmess Reels link and point at the box.

If GIPHY rejects the key, the page says so. The usual cause is an SDK key or a partial copy. If the computer is offline, the key is saved untested and the first search is the test.

Each person needs their own key. Never put a key in this repository or in a brand file.

## What happens when they use it

- The search goes from the page in their browser straight to `api.giphy.com`, with their key. GIPHY sees the search words.
- Results show with the "Powered By GIPHY" mark. Tapping one makes the page's server download that one GIF into `<reel>/popups/` and adds it as a popup at the current moment. From there it is an ordinary popup: place it, size it, time it, re-render.
- `<reel>/popups/sources.json` records where each GIPHY file came from (id, GIPHY page, title, uploader).
- Results are limited to GIPHY's "g" rating. "Stickers" are the see-through ones, which sit better over a face-to-camera reel.

## Say this before the first one goes in a reel

Many GIFs on GIPHY are clips from films, TV and sport. GIPHY's API lets an app show and share them; it does not give the person the right to use a clip in content for their business. Stickers made by independent artists and the person's own uploads are the safer picks. This is the person's call, and Claude is not a lawyer: say it once, plainly, and move on.

## Limits

- The beta key allows 100 calls an hour. A production key needs GIPHY's approval and may cost money.
- GIPHY asks apps to show its attribution wherever its content is searched. The page shows a "Powered By GIPHY" mark (drawn in text and CSS, because GIPHY's official logo files are not bundled here); an app that applies for a production key should swap in GIPHY's official attribution image.
- A GIF over 20 MB is refused. A GIF becomes a looped video in the render, like any other GIF popup.
- Not tried against the live GIPHY service when this was written: the first real search is the test.

## On the review page too (0.10.2)

Before the build, the review page's Graphics tab offers **Search GIPHY** next to "Use my own picture or GIF": on any graphic set to Change, and on any graphic they asked for with "Add a graphic". The picked GIF is downloaded into `popups/` and named in the import output (`Use their own picture(s) ...`). Same key, same rules as on the touch-ups page. With no key, the page asks for one in a box and saves it (see "Setting it up").
