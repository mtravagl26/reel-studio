# GIPHY search on the touch-ups page

Added by By Mel Ross (0.9.0).

The Popups section of the touch-ups page can search GIPHY and drop a GIF or sticker into the reel. It is off until the person adds their own GIPHY key. Nothing about it runs unless they press Search.

## Setting it up

1. They make a free account at developers.giphy.com and create an API key (choose "API", not "SDK"). A new key is a beta key: free, and limited to 100 searches an hour.
2. The key goes in `~/.config/reels/.env`, the same file as the optional ElevenLabs key, as one line: `GIPHY_API_KEY=...`. Have them put it there themselves (`open -e ~/.config/reels/.env`, after `mkdir -p ~/.config/reels`); don't ask them to paste a key into chat.
3. Restart the Reel Studio link. The Popups section now shows "Search GIPHY".

Each person needs their own key. Never put a key in this repository or in a brand file.

## What happens when they use it

- The search goes from the page in their browser straight to `api.giphy.com`, with their key. GIPHY sees the search words.
- Results show with "Powered by GIPHY". Tapping one makes the page's server download that one GIF into `<reel>/popups/` and adds it as a popup at the current moment. From there it is an ordinary popup: place it, size it, time it, re-render.
- `<reel>/popups/sources.json` records where each GIPHY file came from (id, GIPHY page, title, uploader).
- Results are limited to GIPHY's "g" rating. "Stickers" are the see-through ones, which sit better over a face-to-camera reel.

## Say this before the first one goes in a reel

Many GIFs on GIPHY are clips from films, TV and sport. GIPHY's API lets an app show and share them; it does not give the person the right to use a clip in content for their business. Stickers made by independent artists and the person's own uploads are the safer picks. This is the person's call, and Claude is not a lawyer: say it once, plainly, and move on.

## Limits

- The beta key allows 100 calls an hour. A production key needs GIPHY's approval and may cost money.
- GIPHY asks apps to show its attribution wherever its content is searched. The page does that in text; an app that applies for a production key should use GIPHY's official logo files.
- A GIF over 20 MB is refused. A GIF becomes a looped video in the render, like any other GIF popup.
- Not tried against the live GIPHY service when this was written: the first real search is the test.

## On the review page too (0.10.2)

Before the build, the review page's Graphics tab offers **Search GIPHY** next to "Use my own picture or GIF": on any graphic set to Change, and on any graphic they asked for with "Add a graphic". The picked GIF is downloaded into `popups/` and named in the import output (`Use their own picture(s) ...`). Same key, same rules as on the touch-ups page. With no key, the page tells them to ask you to set GIPHY up.
