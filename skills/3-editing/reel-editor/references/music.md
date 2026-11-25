# Background music

Added by By Mel Ross (0.28.0). Soft music under the voice, picked before the first edit or on the Touch-ups page.

## Where the music comes from

Reel Studio ships no music. The free libraries let people use their tracks in videos, not hand the files out, so each person keeps their own tracks in `~/reels/music`. Subfolders are moods: `~/reels/music/calm/soft piano.mp3`. The pages group tracks by folder.

Sources that allow use in social videos (check each license; this is not legal advice):

| Source | Credit needed | Notes |
|---|---|---|
| Pixabay Music (pixabay.com/music) | No | Large library. Some tracks are labelled CC0. Can't redistribute the files on their own. |
| Mixkit (mixkit.co/free-stock-music) | No | Small library, simple license. Not for TV, radio, games or discs. |
| Incompetech, Kevin MacLeod (incompetech.com) | Yes, CC BY 4.0 | Credit line: `Track title Kevin MacLeod (incompetech.com) Licensed under Creative Commons: By Attribution 4.0`. Put it in the post caption. |
| Free Music Archive (freemusicarchive.org) | Depends on the track | Filter by license. CC0 needs no credit; CC BY needs one; avoid NC (non-commercial) tracks for business posts. |

Instagram's in-app music library is cleared for personal posts. Meta's music guidelines say commercial use needs your own license, so for posts that promote a business, a track from the list above, baked into the reel, is the safer pick.

## First-time setup (ask during the setup interview)

"Do you want soft background music under some reels?" If yes:

1. Ask which moods fit their account. Offer: calm, upbeat, focused, warm. Pick 2 or 3.
2. Make the folders: `mkdir -p ~/reels/music/<mood>` for each.
3. Send them to Pixabay Music or Mixkit with a search for each mood ("calm piano", "upbeat corporate", "lofi focus"). Ask them to download 2 or 3 instrumental tracks per mood, no vocals, into the matching folder. Instrumentals sit under speech; vocals fight it.
4. If a track needs credit, write its credit line in `~/reels/music/CREDITS.txt` so the caption step can use it.
5. Ask whether one track should play under every reel (a series sound). If yes, set `brand.json` `"music"` to its path.

Nothing is downloaded for them: the shell here can't reach those sites, and they should pick what they like.

## How it's set

- Home page: step 4, **Background music**: No music, or one of their tracks (tap to hear it), or add a track from the computer. The pick goes into the request: `Play my track "calm/soft piano.mp3" softly in the background.` Set `edit.json` `"music": "~/reels/music/calm/soft piano.mp3"`.
- Touch-ups page, Sound section: the track for this reel (or No music, stored as `"music": "none"` so an every-reel track is skipped), how loud (softer -20, normal -14, louder -10: `mix.music`, the level in the gaps relative to the voice), where the track starts (`"music_start"` seconds, to skip a slow intro), and **Use this track for every reel** (`brand.json` `"music"`). **Update the sound on my finished reel** remixes in about 20 seconds.

## How it's mixed (scripts/mix_audio.py)

The music sits 14 dB under the voice in the gaps and dips another 10 dB while the voice speaks, so speech is about 24 dB over it: past the 20 dB gap the WCAG accessibility guidance gives for speech over background sound. It also dips under each sound effect, fades in and out, and loops when the track is shorter than the reel.
