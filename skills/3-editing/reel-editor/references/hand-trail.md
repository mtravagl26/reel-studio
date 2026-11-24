# Arched title and hand trail

Added by By Mel Ross (0.23.0). Two things a reel can ask for in `edit.json`. Neither is on unless asked for.

## Arched title

A headline curved over the speaker's head, with 5 small stars and an optional heavy line under it. The words wipe in from the left.

```json
{ "type": "arctitle", "text": "Series name", "sub": "part one", "start": 0.4, "end": 3.2 }
```

- `text`: the arched words. A long line gets smaller so it stays on the arc.
- `sub`: the line under it. Leave it out for none.
- Optional: `y` (default 150), `size` (default 128), `sub_y` (default 1180), `sub_size`, `color` (default the brand's light color), `shadow` (default the brand's main color), `quiet: false` to keep captions on under it.
- `trail: true` adds a hand trail while the words arrive. `trail: {"seconds": 1.8, "joint": "palm", "side": "right"}` sets how long it runs and which hand.
- On the touch-ups page the words and the line under it can be changed. Everything else is set here.

## Hand trail

Gold stars laid along the path of a moving hand. They fade behind it.

```json
"hand_trail": [ { "word": "highly", "seconds": 1.4 }, { "start": 42.1, "end": 43.6 } ]
```

- `word`: starts at that caption word. `occurrence: 2` picks the second time it is said, `lead` starts earlier by that many seconds.
- `start` / `end`: exact times in the cut clip, instead of a word.
- Optional: `joint` (`palm`, `wrist` or `index`), `side` (`left` or `right`), `density` (stars per frame, default 2), `sound` (level in dB for a sparkle sound, off unless set), `off: true`.
- Color and size: a `sparkle` block in `brand.json` or `edit.json`, `{"color": "#F2C14E", "core": "#FFF6CF", "size": 1.2}`.
- `python3 scripts/hand_track.py <reel> spans` lists the stretches where a hand is visible and moving. Use it to pick a moment.

## What it needs, and what happens without it

- Hand tracking uses Apple Vision. It runs on the Mac, and nothing is downloaded or sent. It needs the Swift compiler (`xcode-select --install`).
- The first build tracks the whole clip, about 15 seconds per minute of video. The result is kept in `<reel>/hands/hands.json` and reused until the clip changes.
- On a computer that can't track hands (Windows, Linux, or a Mac without the Swift compiler) the reel still builds. The trail is left out and the build says so. The arched title is unaffected.
- When no hand is found in the stretch asked for, that trail is skipped and the build says so.
- `side` is Apple Vision's guess at left or right. On a mirrored selfie clip it can be the opposite hand. If the trail follows the wrong hand, switch `side`.
- The stars draw in front of everything and zoom with the video, so they stay on the hand.
